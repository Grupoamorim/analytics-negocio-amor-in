// Content script do web.whatsapp.com.
//  - injeta a wa-js + wa-inject.js no contexto da página
//  - mostra um cartão flutuante ("Amor In") com a turma vinculada à conversa aberta
//    e um seletor pra vincular/trocar (DM pelo telefone, grupo pelo nome)
//  - orquestra a varredura: manda as mensagens novas da conversa vinculada.
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
      window.__amorinDebounce = setTimeout(() => { atualizarChat(); }, 1200);
    }
    if (ev.data.__amorin === 'evt' && ev.data.evt === 'pronto') paginaPronta = true;
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

  // ---- cache de turmas ----
  let turmasCache = null;
  async function getTurmas() {
    if (turmasCache) return turmasCache;
    const r = await bg('wa_turmas');
    turmasCache = (r && r.turmas) || [];
    return turmasCache;
  }

  // =========================================================================
  //  WIDGET  (cartão flutuante no canto)
  // =========================================================================
  const host = document.createElement('div');
  host.id = 'amorin-wa-widget';
  host.style.cssText = 'position:fixed;top:12px;right:16px;z-index:2147483000;';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      *{box-sizing:border-box;font-family:-apple-system,"Segoe UI",Roboto,sans-serif}
      .card{width:280px;background:#0f1115;color:#f4f4f5;border:1px solid #2a2d33;border-radius:12px;
        box-shadow:0 8px 28px rgba(0,0,0,.4);overflow:hidden;font-size:12px}
      .top{display:flex;align-items:center;gap:6px;background:#f97316;color:#fff;padding:7px 10px;font-weight:700}
      .top .min{margin-left:auto;cursor:pointer;opacity:.9}
      .body{padding:10px;display:flex;flex-direction:column;gap:8px}
      .chat{font-weight:600;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .tag{font-size:10px;color:#a1a1aa}
      .link{display:flex;align-items:center;gap:6px;padding:6px 8px;border-radius:8px;border:1px solid #2a2d33}
      .link.ok{border-color:#34d39955;background:#34d39914}
      .link.no{border-color:#f59e0b55;background:#f59e0b14}
      .dot{width:8px;height:8px;border-radius:50%;flex:none}
      .ok .dot{background:#34d399}.no .dot{background:#f59e0b}
      .link span{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      button{border:0;border-radius:7px;cursor:pointer;font-weight:600;font-size:11px;padding:6px 8px}
      .b{background:#f97316;color:#fff;width:100%}
      .g{background:#23262d;color:#e4e4e7}
      input{width:100%;padding:6px 8px;border-radius:7px;border:1px solid #2a2d33;background:#1a1a1c;color:#fff}
      .lista{max-height:220px;overflow-y:auto;display:flex;flex-direction:column;gap:2px}
      .item{padding:6px 8px;border-radius:6px;cursor:pointer;color:#d4d4d8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .item:hover{background:#23262d;color:#fff}
      .row{display:flex;gap:6px}
      .muted{color:#71717a;font-size:10px}
      .aba{background:#f97316;color:#fff;font-weight:700;font-size:11px;padding:6px 9px;border-radius:9px;
        cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.35)}
      [hidden]{display:none!important}
    </style>
    <div class="aba" id="aba" hidden>🪶 Amor In</div>
    <div class="card" id="card">
      <div class="top">🪶 Amor In <span class="min" id="min">—</span></div>
      <div class="body" id="body"><span class="muted">Abrindo…</span></div>
    </div>
  `;
  const $ = (id) => root.getElementById(id);
  let minimizado = false;
  $('min').onclick = () => { minimizado = true; $('card').hidden = true; $('aba').hidden = false; };
  $('aba').onclick = () => { minimizado = false; $('card').hidden = false; $('aba').hidden = true; render(); };

  let chatAtual = null;   // { id, isGroup, nome, telefone }
  let vinculoAtual = null; // resposta do resolver
  let modoSeletor = false;
  let filtro = '';

  function render() {
    if (minimizado) return;
    const b = $('body');
    if (!chatAtual) {
      b.innerHTML = `<span class="muted">Abra uma conversa pra vincular a uma turma.</span>`;
      return;
    }
    const nome = (chatAtual.nome || 'Conversa').replace(/</g, '&lt;');
    const tipo = chatAtual.isGroup ? 'Grupo' : 'Pessoa';
    const via = chatAtual.isGroup ? 'pelo nome do grupo' : 'pelo telefone';

    if (modoSeletor) {
      const turmas = (turmasCache || []).filter((t) =>
        !filtro || t.nome.toLowerCase().includes(filtro.toLowerCase()),
      );
      b.innerHTML = `
        <div class="chat">${nome}</div>
        <div class="tag">${tipo} · vínculo ${via}</div>
        <input id="busca" placeholder="Buscar turma…" value="${filtro.replace(/"/g, '&quot;')}" />
        <div class="lista" id="lista">
          ${turmas.slice(0, 60).map((t) => `<div class="item" data-id="${t.id}">${t.nome.replace(/</g, '&lt;')}</div>`).join('') || '<span class="muted">Nenhuma turma.</span>'}
        </div>
        <div class="row">
          <button class="g" id="cancelar" style="flex:1">Cancelar</button>
          <button class="g" id="naoturma" style="flex:1">Não é de turma</button>
        </div>
      `;
      const busca = $('busca');
      busca.oninput = () => { filtro = busca.value; render(); busca.focus(); busca.setSelectionRange(filtro.length, filtro.length); };
      $('lista').querySelectorAll('.item').forEach((el) => {
        el.onclick = () => vincular(el.getAttribute('data-id'));
      });
      $('cancelar').onclick = () => { modoSeletor = false; render(); };
      $('naoturma').onclick = () => vincular(null, true);
      return;
    }

    const v = vinculoAtual;
    const temTurma = v && v.turma_id && !v.vincular;
    const nomeTurma = temTurma ? (turmaNomePorId(v.turma_id) || 'turma vinculada') : null;
    b.innerHTML = `
      <div class="chat">${nome}</div>
      <div class="tag">${tipo} · vínculo ${via}</div>
      <div class="link ${temTurma ? 'ok' : 'no'}">
        <span class="dot"></span>
        <span>${temTurma ? nomeTurma.replace(/</g, '&lt;') : (v && v.ignorar ? 'Marcada como "não é de turma"' : 'Não vinculada')}</span>
      </div>
      <button class="b" id="vincular">${temTurma ? 'Trocar turma' : 'Vincular a uma turma'}</button>
      ${temTurma ? '' : '<span class="muted">Enquanto não vincular, nada dessa conversa é salvo.</span>'}
    `;
    $('vincular').onclick = async () => { await getTurmas(); modoSeletor = true; filtro = ''; render(); };
  }

  function turmaNomePorId(id) {
    const t = (turmasCache || []).find((x) => x.id === id);
    return t ? t.nome : null;
  }

  async function vincular(turmaId, ignorar) {
    if (!chatAtual) return;
    const payload = chatAtual.isGroup
      ? { tipo: 'grupo', grupo_wa_id: chatAtual.id, grupo_nome: chatAtual.nome, turma_id: turmaId, ignorar: !!ignorar }
      : { tipo: 'dm', telefone: chatAtual.telefone, chat_wa_id: chatAtual.id, nome: chatAtual.nome, turma_id: turmaId, ignorar: !!ignorar };
    $('body').innerHTML = '<span class="muted">Salvando…</span>';
    const r = await bg('wa_vincular', { payload });
    modoSeletor = false;
    if (r && r.ok) {
      vinculoAtual = ignorar
        ? { ignorar: true }
        : { turma_id: turmaId, origem: chatAtual.isGroup ? 'grupo' : 'dm' };
      render();
      if (turmaId) setTimeout(varrer, 500); // já arquiva o histórico recente
    } else {
      vinculoAtual = null;
      render();
      log('vincular erro', r && r.erro);
    }
  }

  // resolve a conversa aberta e atualiza o widget
  async function atualizarChat() {
    try {
      const ativo = await pedir('ativo').catch(() => null);
      chatAtual = ativo && ativo.id ? ativo : null;
      if (!chatAtual) { render(); return; }
      const resolver = chatAtual.isGroup
        ? { grupo_wa_id: chatAtual.id, grupo_nome: chatAtual.nome }
        : { telefone: chatAtual.telefone };
      const r = await bg('resolver', { payload: resolver });
      vinculoAtual = r && !r.erro ? r : null;
      if (vinculoAtual && vinculoAtual.turma_id) getTurmas(); // pré-carrega nomes
      render();
    } catch (e) {
      log('atualizarChat', e);
    }
  }

  // =========================================================================
  //  VARREDURA
  // =========================================================================
  let varrendo = false;
  async function varrer() {
    if (varrendo) return;
    varrendo = true;
    try {
      try {
        const st = await pedir('status');
        const e0 = await getEstado();
        e0.waPronto = !!(st && st.pronto);
        e0.waAutenticado = !!(st && st.autenticado);
        e0.waVistoEm = new Date().toISOString();
        await setEstado(e0);
      } catch (_) {}

      const cfg = await bg('config', {});
      if (!cfg || !cfg.temSessao) return;
      if (cfg.autoSync === false) return;

      const ativo = chatAtual || (await pedir('ativo').catch(() => null));
      if (!ativo || !ativo.id) return;

      let r = vinculoAtual;
      if (!r || (chatAtual && r && r.__paraChat && r.__paraChat !== ativo.id)) {
        const resolver = ativo.isGroup
          ? { grupo_wa_id: ativo.id, grupo_nome: ativo.nome }
          : { telefone: ativo.telefone };
        r = await bg('resolver', { payload: resolver });
      }
      if (!r || r.erro || r.ignorar) return;
      if (r.vincular || !r.turma_id) return; // aguardando vínculo manual no widget

      const estado = await getEstado();
      const desde = estado.sincronizadoAte[ativo.id] || 0;
      const msgs = await pedir('mensagens', {
        chatId: ativo.id, count: CFG.MAX_MSGS_POR_SYNC, desde, comAudio: true,
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
    const montar = () => {
      if (!document.body) return setTimeout(montar, 500);
      document.body.appendChild(host);
      render();
      atualizarChat();
    };
    montar();
    setInterval(varrer, CFG.INTERVALO_SYNC_MS);
    setInterval(atualizarChat, 20000);
    setTimeout(varrer, 15000);
  })();

  chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
    if (msg && msg.cmd === 'varrer_agora') { varrer().then(() => sendResponse({ ok: true })); return true; }
  });
})();
