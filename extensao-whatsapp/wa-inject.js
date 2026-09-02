// Roda no CONTEXTO DA PÁGINA do web.whatsapp.com (não no content script).
// Usa a wa-js (window.WPP) pra ler a conversa aberta e as mensagens.
// Conversa com o content.js só por window.postMessage.
(function () {
  'use strict';
  const TAG = '[AmorIn/WA]';
  let pronto = false;

  function log(...a) { console.log(TAG, ...a); }

  function esperarWPP() {
    return new Promise((resolve) => {
      const tenta = () => {
        if (window.WPP && window.WPP.isReady) return resolve();
        if (window.WPP && window.WPP.webpack && !window.WPP.webpack.isInjected) {
          try { window.WPP.webpack.injectLoader(); } catch (_) {}
        }
        setTimeout(tenta, 800);
      };
      if (window.WPP && typeof window.WPP.on === 'function') {
        window.WPP.on('ready', () => resolve());
      }
      tenta();
    });
  }

  const soDigitos = (s) => String(s || '').replace(/\D/g, '');

  function idSerial(x) {
    if (!x) return null;
    if (typeof x === 'string') return x;
    return x._serialized || (x.user ? `${x.user}@${x.server || x._server || 'c.us'}` : null);
  }

  function tipoMsg(m) {
    const t = m.type || '';
    if (t === 'ptt' || t === 'audio') return 'audio';
    if (t === 'chat' || t === '') return 'texto';
    if (t === 'image') return 'imagem';
    if (t === 'video') return 'video';
    if (t === 'document') return 'documento';
    if (t === 'sticker') return 'figurinha';
    return t;
  }

  async function chatAtivo() {
    let chat = null;
    try { chat = await window.WPP.chat.getActiveChat(); } catch (_) {}
    if (!chat) return null;
    const id = idSerial(chat.id);
    const isGroup = !!(chat.isGroup || (id && id.endsWith('@g.us')));
    let nome = chat.formattedTitle || chat.name || '';
    let telefone = null;
    if (!isGroup) {
      telefone = soDigitos(id && id.split('@')[0]);
      try {
        const c = chat.contact || (await window.WPP.contact.get(chat.id));
        if (c) nome = c.name || c.pushname || c.formattedName || nome;
      } catch (_) {}
    }
    return { id, isGroup, nome, telefone };
  }

  async function baixarAudio(m) {
    try {
      const blob = await window.WPP.chat.downloadMedia(m);
      if (!blob) return null;
      if (blob.size > 8 * 1024 * 1024) return null;
      const buf = await blob.arrayBuffer();
      let bin = '';
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      return { base64: btoa(bin), mime: blob.type || 'audio/ogg' };
    } catch (e) {
      log('falha ao baixar áudio', e);
      return null;
    }
  }

  async function mensagens(chatId, opts) {
    const count = (opts && opts.count) || 80;
    const desde = (opts && opts.desde) || 0; // ms
    let lista = [];
    try {
      lista = await window.WPP.chat.getMessages(chatId, { count });
    } catch (e) {
      log('getMessages falhou', e);
      return [];
    }
    const out = [];
    for (const m of lista) {
      const tms = (m.t || 0) * 1000;
      if (desde && tms <= desde) continue;
      const tipo = tipoMsg(m);
      const autorId = idSerial(m.author || m.from);
      const linha = {
        wa_msg_id: idSerial(m.id) || (m.id && m.id.id) || null,
        de_mim: !!m.fromMe,
        autor_nome: m.senderObj ? (m.senderObj.pushname || m.senderObj.name || null) : null,
        autor_telefone: soDigitos(autorId && autorId.split('@')[0]) || null,
        tipo,
        texto: m.body || m.caption || '',
        enviada_em: tms ? new Date(tms).toISOString() : new Date().toISOString(),
        raw: { type: m.type, t: m.t, mimetype: m.mimetype || null },
      };
      if (tipo === 'audio' && (opts && opts.comAudio)) {
        const a = await baixarAudio(m);
        if (a) { linha.midia_base64 = a.base64; linha.midia_mime = a.mime; }
      }
      out.push(linha);
    }
    return out;
  }

  window.addEventListener('message', async (ev) => {
    if (ev.source !== window || !ev.data || ev.data.__amorin !== 'req') return;
    const { reqId, req, params } = ev.data;
    const responder = (payload, erro) =>
      window.postMessage({ __amorin: 'res', reqId, payload, erro: erro ? String(erro) : null }, '*');
    try {
      if (req === 'ping') return responder({ pronto });
      if (req === 'ativo') return responder(await chatAtivo());
      if (req === 'mensagens') return responder(await mensagens(params.chatId, params));
      responder(null, 'req desconhecido: ' + req);
    } catch (e) {
      responder(null, e);
    }
  });

  esperarWPP().then(() => {
    pronto = true;
    log('WPP pronto');
    window.postMessage({ __amorin: 'evt', evt: 'pronto' }, '*');
    try {
      window.WPP.on('chat.active_chat', () => {
        window.postMessage({ __amorin: 'evt', evt: 'chat_mudou' }, '*');
      });
    } catch (_) {}
  });
})();
