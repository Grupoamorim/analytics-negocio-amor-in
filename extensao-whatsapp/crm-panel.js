// Painel lateral injetado DENTRO da tela do CRM (grupoamorin.com.br / pages.dev /
// localhost). Mostra o estado da conexão do WhatsApp, deixa abrir o WhatsApp Web
// e acompanha a sincronização. Usa a sessão que o vendedor já tem no CRM —
// não pede login de novo.
(function () {
  'use strict';
  const CFG = window.AMORIN_CONFIG;
  const bg = (cmd, dados) =>
    new Promise((resolve) => chrome.runtime.sendMessage({ cmd, ...dados }, resolve));

  // ---- lê a sessão do Supabase do localStorage do CRM ----
  function lerSessaoCRM() {
    try {
      let raw = localStorage.getItem(CFG.SB_STORAGE_KEY);
      if (!raw) {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith('sb-') && k.endsWith('-auth-token')) {
            raw = localStorage.getItem(k);
            break;
          }
        }
      }
      if (!raw) return null;
      if (raw.startsWith('base64-')) raw = atob(raw.slice(7));
      const s = JSON.parse(raw);
      const sess = s.currentSession || s;
      if (!sess || !sess.access_token) return null;
      return {
        access_token: sess.access_token,
        refresh_token: sess.refresh_token,
        expira_em: (sess.expires_at ? sess.expires_at * 1000 : Date.now() + 3000 * 1000),
        email: (sess.user && sess.user.email) || null,
      };
    } catch (_) {
      return null;
    }
  }

  // ---- UI (shadow DOM, isolada do CSS do CRM) ----
  if (document.getElementById('amorin-wa-host')) return; // já injetado
  const host = document.createElement('div');
  host.id = 'amorin-wa-host';
  const anexar = () => {
    const alvo = document.body || document.documentElement;
    if (!host.isConnected) alvo.appendChild(host);
  };
  anexar();
  setInterval(anexar, 4000); // reanexa se a SPA remover
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      * { box-sizing: border-box; font-family: -apple-system, "Segoe UI", Roboto, sans-serif; }
      .aba { position: fixed; top: 45%; right: 0; transform: translateY(-50%);
        writing-mode: vertical-rl; text-orientation: mixed; background: #f97316; color: #fff;
        padding: 16px 8px; border-radius: 10px 0 0 10px; font-size: 13px; font-weight: 800;
        cursor: pointer; letter-spacing: 1px; box-shadow: -3px 0 14px rgba(0,0,0,.35);
        border: 1px solid rgba(255,255,255,.25); }
      .aba:hover { padding-right: 12px; }
      .painel { position: fixed; top: 0; right: -360px; width: 340px; height: 100vh;
        background: #0f1115; color: #f4f4f5; box-shadow: -4px 0 20px rgba(0,0,0,.35);
        transition: right .22s ease; display: flex; flex-direction: column; }
      .painel.aberto { right: 0; }
      header { background: #f97316; color: #fff; padding: 12px 14px; display: flex;
        align-items: center; gap: 8px; font-weight: 700; }
      header .x { margin-left: auto; cursor: pointer; font-size: 18px; line-height: 1; }
      .corpo { padding: 14px; overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 12px; }
      .status { display: flex; align-items: center; gap: 8px; font-size: 13px; padding: 8px 10px;
        border-radius: 8px; border: 1px solid #2a2d33; }
      .dot { width: 9px; height: 9px; border-radius: 50%; flex: none; }
      .on .dot { background: #34d399; } .off .dot { background: #f59e0b; } .idle .dot { background: #71717a; }
      button.b { width: 100%; padding: 9px; border: 0; border-radius: 8px; cursor: pointer;
        font-weight: 600; font-size: 13px; background: #f97316; color: #fff; }
      button.b.sec { background: #23262d; color: #e4e4e7; font-weight: 500; }
      .linha { display: flex; justify-content: space-between; font-size: 12px; color: #a1a1aa;
        padding: 3px 0; border-bottom: 1px solid #1c1f24; }
      .linha b { color: #f4f4f5; }
      .toggle { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #d4d4d8; }
      .muted { color: #8a8a93; font-size: 11px; line-height: 1.5; }
      ul { margin: 4px 0 0; padding-left: 16px; font-size: 12px; color: #d4d4d8; }
      a { color: #fb923c; }
    </style>
    <div class="aba" id="aba">WHATSAPP</div>
    <div class="painel" id="painel">
      <header>🪶 Conversas do WhatsApp <span class="x" id="fechar">&times;</span></header>
      <div class="corpo" id="corpo">carregando…</div>
    </div>
  `;

  const $ = (id) => root.getElementById(id);
  const painel = $('painel');
  const LARGURA_PAINEL = 340; // igual ao .painel width

  // empurra o conteúdo do CRM pra nada ficar escondido atrás do painel
  function empurrarCRM(aberto) {
    const push = aberto && window.innerWidth >= 768 ? LARGURA_PAINEL + 'px' : '0px';
    document.documentElement.style.setProperty('--amorin-wa-push', push);
  }
  function abrir() { painel.classList.add('aberto'); empurrarCRM(true); pintar(); }
  function fechar() { painel.classList.remove('aberto'); empurrarCRM(false); }

  $('aba').onclick = abrir;
  $('fechar').onclick = fechar;
  window.addEventListener('resize', () => empurrarCRM(painel.classList.contains('aberto')));

  function fmt(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  async function pintar() {
    const cfg = await bg('config');
    if (!cfg || !cfg.temSessao) {
      $('corpo').innerHTML = `<p class="muted">Entre no CRM para conectar o WhatsApp.</p>`;
      return;
    }
    const st = await bg('status');
    const wa = await bg('whatsapp_aberto');
    const recente = st.waVistoEm && Date.now() - Date.parse(st.waVistoEm) < 180000;
    let cls = 'idle', txt = 'Abra o WhatsApp Web para começar';
    if (wa.aberto && recente && st.waAutenticado) { cls = 'on'; txt = 'WhatsApp conectado e sincronizando'; }
    else if (wa.aberto && recente && !st.waAutenticado) { cls = 'off'; txt = 'WhatsApp Web aberto — escaneie o QR code'; }
    else if (wa.aberto) { cls = 'off'; txt = 'WhatsApp Web aberto — carregando…'; }
    const pend = await bg('grupos_pendentes');

    $('corpo').innerHTML = `
      <div class="status ${cls}"><span class="dot"></span><span>${txt}</span></div>
      <button class="b" id="abrir">${wa.aberto ? 'Ir para o WhatsApp Web' : 'Abrir o WhatsApp Web'}</button>
      <button class="b sec" id="sync">Sincronizar a conversa aberta agora</button>
      <div>
        <div class="linha"><span>Conectado como</span><b>${cfg.email || '—'}</b></div>
        <div class="linha"><span>Mensagens arquivadas hoje</span><b>${st.salvasHoje || 0}</b></div>
        <div class="linha"><span>Última sincronização</span><b>${fmt(st.ultimaSync)}</b></div>
      </div>
      <label class="toggle"><input type="checkbox" id="auto" ${cfg.autoSync !== false ? 'checked' : ''}/> Sincronizar automaticamente</label>
      ${
        Array.isArray(pend) && pend.length
          ? `<div><p class="muted">Grupos abertos que ainda não batem com nenhuma turma — vincule na aba <b>Conversas</b> da turma:</p><ul>${pend
              .slice(0, 8)
              .map((g) => `<li>${(g.grupo_nome || g.grupo_wa_id).replace(/</g, '&lt;')}</li>`)
              .join('')}</ul></div>`
          : ''
      }
      <p class="muted">O conteúdo completo fica na aba <b>Conversas</b> dentro de cada turma no Funil, e o resumo em <b>WhatsApp Comercial</b>.</p>
    `;
    $('abrir').onclick = async () => { await bg('abrir_whatsapp'); setTimeout(pintar, 1500); };
    $('sync').onclick = async () => { $('sync').textContent = 'Sincronizando…'; await bg('varrer_wa'); setTimeout(pintar, 3000); };
    $('auto').onchange = (e) => bg('set_pref', { pref: { autoSync: e.target.checked } });
  }

  // ---- bootstrap ----
  async function iniciar() {
    const sess = lerSessaoCRM();
    if (sess) await bg('sessao_do_crm', { sessao: sess });
    await pintar();
  }
  iniciar();
  setInterval(async () => {
    const sess = lerSessaoCRM();
    if (sess) await bg('sessao_do_crm', { sessao: sess });
    if (painel.classList.contains('aberto')) pintar();
  }, 8000);
})();
