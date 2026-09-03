// Roda só na página /whatsapp-comercial do CRM (grupoamorin.com.br / pages.dev /
// localhost). Renderiza o status da conexão do WhatsApp DENTRO da própria página
// (não mais um botão flutuante) — usa a sessão que o vendedor já tem no CRM, não
// pede login de novo.
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

  const MONTAGEM_ID = 'amorin-extensao-status';
  let root = null;

  function montarUI(alvo) {
    if (root) return; // já montado
    alvo.innerHTML = ''; // tira o "carregando..." estático da página
    const host = document.createElement('div');
    root = host.attachShadow({ mode: 'open' });
    alvo.appendChild(host);
    root.innerHTML = `
      <style>
        * { box-sizing: border-box; font-family: -apple-system, "Segoe UI", Roboto, sans-serif; }
        .status { display: flex; align-items: center; gap: 8px; font-size: 13px; padding: 8px 10px;
          border-radius: 8px; border: 1px solid #2a2d33; }
        .dot { width: 9px; height: 9px; border-radius: 50%; flex: none; }
        .on .dot { background: #34d399; } .off .dot { background: #f59e0b; } .idle .dot { background: #71717a; }
        .corpo { display: flex; flex-direction: column; gap: 10px; }
        button.b { padding: 9px 14px; border: 0; border-radius: 8px; cursor: pointer;
          font-weight: 600; font-size: 13px; background: #f97316; color: #fff; }
        button.b.sec { background: #23262d; color: #e4e4e7; font-weight: 500; }
        .row { display: flex; gap: 8px; flex-wrap: wrap; }
        .linha { display: flex; justify-content: space-between; font-size: 12px; color: #a1a1aa;
          padding: 5px 0; border-bottom: 1px solid #1c1f24; max-width: 360px; }
        .linha b { color: #f4f4f5; }
        .toggle { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #d4d4d8; }
        .muted { color: #8a8a93; font-size: 12px; line-height: 1.5; }
        ul { margin: 4px 0 0; padding-left: 16px; font-size: 12px; color: #d4d4d8; }
      </style>
      <div class="corpo" id="corpo">carregando…</div>
    `;
    pintar();
  }

  function fmt(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  async function pintar() {
    if (!root) return;
    const $ = (id) => root.getElementById(id);
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
      <div class="row">
        <button class="b" id="abrir">${wa.aberto ? 'Ir para o WhatsApp Web' : 'Abrir o WhatsApp Web'}</button>
        <button class="b sec" id="sync">Sincronizar a conversa aberta agora</button>
      </div>
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
      <p class="muted">O conteúdo completo fica na aba <b>Conversas</b> dentro de cada turma no Funil. No WhatsApp Web, o painel <b>🪶 Amor In</b> mostra a turma vinculada e as mensagens padrão.</p>
    `;
    $('abrir').onclick = async () => { await bg('abrir_whatsapp'); setTimeout(pintar, 1500); };
    $('sync').onclick = async () => { $('sync').textContent = 'Sincronizando…'; await bg('varrer_wa'); setTimeout(pintar, 3000); };
    $('auto').onchange = (e) => bg('set_pref', { pref: { autoSync: e.target.checked } });
  }

  // ---- espera o React montar o container na página (SPA — pode não existir ainda) ----
  function procurarEMontar() {
    const alvo = document.getElementById(MONTAGEM_ID);
    if (alvo) montarUI(alvo);
  }

  async function iniciar() {
    const sess = lerSessaoCRM();
    if (sess) await bg('sessao_do_crm', { sessao: sess });
    procurarEMontar();
  }
  iniciar();
  setInterval(async () => {
    const sess = lerSessaoCRM();
    if (sess) await bg('sessao_do_crm', { sessao: sess });
    procurarEMontar();
    if (root) pintar();
  }, 6000);
})();
