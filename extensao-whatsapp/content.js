// Content script do web.whatsapp.com.
//  - injeta a wa-js + wa-inject.js no contexto da página
//  - faz a ponte página <-> background
//  - orquestra a varredura: descobre a conversa aberta, pergunta ao CRM de qual
//    turma é (resolver) e manda as mensagens novas (salvar).
(function () {
  'use strict';
  const CFG = window.AMORIN_CONFIG;
  const TAG = '[AmorIn]';
  const log = (...a) => console.log(TAG, ...a);

  // ---- injeta scripts no contexto da página ----
  function injetar(arquivo) {
    return new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = chrome.runtime.getURL(arquivo);
      s.onload = () => { s.remove(); resolve(); };
      (document.head || document.documentElement).appendChild(s);
    });
  }

  // ---- ponte com a página ----
  const pendentes = new Map();
  let seq = 0;
  window.addEventListener('message', (ev) => {
    if (ev.source !== window || !ev.data) return;
    if (ev.data.__amorin === 'res') {
      const p = pendentes.get(ev.data.reqId);
      if (p) {
        pendentes.delete(ev.data.reqId);
        ev.data.erro ? p.reject(new Error(ev.data.erro)) : p.resolve(ev.data.payload);
      }
    }
    if (ev.data.__amorin === 'evt' && ev.data.evt === 'chat_mudou') {
      clearTimeout(window.__amorinDebounce);
      window.__amorinDebounce = setTimeout(varrer, 2500);
    }
    if (ev.data.__amorin === 'evt' && ev.data.evt === 'pronto') {
      paginaPronta = true;
    }
  });
  let paginaPronta = false;
  function pedir(req, params) {
    return new Promise((resolve, reject) => {
      const reqId = `${Date.now()}-${seq++}`;
      pendentes.set(reqId, { resolve, reject });
      window.postMessage({ __amorin: 'req', reqId, req, params }, '*');
      setTimeout(() => {
        if (pendentes.has(reqId)) { pendentes.delete(reqId); reject(new Error('timeout ' + req)); }
      }, 60000);
    });
  }

  const bg = (cmd, dados) =>
    new Promise((resolve) => chrome.runtime.sendMessage({ cmd, ...dados }, resolve));

  // ---- estado local ----
  async function getEstado() {
    const { amorin_estado } = await chrome.storage.local.get('amorin_estado');
    return amorin_estado || { sincronizadoAte: {}, salvasHoje: 0, dia: '', ultimaSync: null };
  }
  async function setEstado(e) { await chrome.storage.local.set({ amorin_estado: e }); }

  // ---- varredura ----
  let varrendo = false;
  async function varrer() {
    if (varrendo) return;
    varrendo = true;
    try {
      // registra o estado da conexão do WhatsApp pro painel do CRM mostrar
      // (roda sempre, mesmo sem sessão do CRM ainda)
      try {
        const st = await pedir('status')
        const e0 = await getEstado()
        e0.waPronto = !!(st && st.pronto)
        e0.waAutenticado = !!(st && st.autenticado)
        e0.waVistoEm = new Date().toISOString()
        await setEstado(e0)
      } catch (_) {}

      const cfg = await bg('config', {});
      if (!cfg || !cfg.temSessao) return;          // sem login no CRM
      if (cfg.autoSync === false) return;           // desligado no painel

      const ativo = await pedir('ativo').catch(() => null);
      if (!ativo || !ativo.id) return;

      const resolver = ativo.isGroup
        ? { grupo_wa_id: ativo.id, grupo_nome: ativo.nome }
        : { telefone: ativo.telefone };
      const r = await bg('resolver', { payload: resolver });
      if (!r || r.erro) { log('resolver erro', r && r.erro); return; }
      if (r.ignorar) return;
      if (r.vincular || !r.turma_id) {
        log('conversa sem turma vinculada:', ativo.nome, r.motivo || '');
        return; // fica pendente pro alinhamento manual no CRM
      }

      const estado = await getEstado();
      const desde = estado.sincronizadoAte[ativo.id] || 0;
      const msgs = await pedir('mensagens', {
        chatId: ativo.id,
        count: CFG.MAX_MSGS_POR_SYNC,
        desde,
        comAudio: true,
      });
      if (!msgs || !msgs.length) return;

      const mensagens = msgs
        .filter((m) => m.wa_msg_id)
        .map((m) => ({
          ...m,
          turma_id: r.turma_id,
          contato_id: r.contato_id || null,
          origem: ativo.isGroup ? 'grupo' : 'dm',
          chat_wa_id: ativo.id,
          grupo_nome: ativo.isGroup ? ativo.nome : null,
        }));

      const resp = await bg('salvar', {
        payload: { acao: 'salvar', chat_wa_id: ativo.id, mensagens },
      });
      if (resp && resp.ok) {
        const maxT = msgs.reduce((mx, m) => Math.max(mx, Date.parse(m.enviada_em) || 0), desde);
        estado.sincronizadoAte[ativo.id] = maxT;
        const hoje = new Date().toISOString().slice(0, 10);
        if (estado.dia !== hoje) { estado.dia = hoje; estado.salvasHoje = 0; }
        estado.salvasHoje += resp.salvas || 0;
        estado.ultimaSync = new Date().toISOString();
        await setEstado(estado);
        if (resp.salvas) log(`+${resp.salvas} mensagens arquivadas (${ativo.nome})`);
      } else {
        log('salvar erro', resp && resp.erro);
      }
    } catch (e) {
      log('varrer falhou', e);
    } finally {
      varrendo = false;
    }
  }

  // ---- bootstrap ----
  (async () => {
    await injetar('vendor/wppconnect-wa.js');
    await injetar('wa-inject.js');
    log('injetado; aguardando WhatsApp Web…');
    setInterval(varrer, CFG.INTERVALO_SYNC_MS);
    setTimeout(varrer, 15000);
  })();

  chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
    if (msg && msg.cmd === 'varrer_agora') { varrer().then(() => sendResponse({ ok: true })); return true; }
  });
})();
