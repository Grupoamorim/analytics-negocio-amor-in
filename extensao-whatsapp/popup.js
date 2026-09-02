const CFG = window.AMORIN_CONFIG;
const $ = (id) => document.getElementById(id);
const bg = (cmd, dados) => new Promise((r) => chrome.runtime.sendMessage({ cmd, ...dados }, r));

function fmtData(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

async function render() {
  const cfg = await bg('config');
  if (!cfg.temSessao) {
    $('deslogado').hidden = false;
    $('logado').hidden = true;
    return;
  }
  $('deslogado').hidden = true;
  $('logado').hidden = false;
  $('emailLogado').textContent = cfg.email || '';
  $('autoSync').checked = cfg.autoSync !== false;

  const st = await bg('status');
  $('salvasHoje').textContent = st.salvasHoje || 0;
  $('ultimaSync').textContent = fmtData(st.ultimaSync);

  const pend = await bg('grupos_pendentes');
  if (Array.isArray(pend) && pend.length) {
    $('pendentes').hidden = false;
    $('listaPendentes').innerHTML = pend
      .map((g) => `<li>${(g.grupo_nome || g.grupo_wa_id).replace(/</g, '&lt;')}</li>`)
      .join('');
  } else {
    $('pendentes').hidden = true;
  }
}

$('btnLogin').addEventListener('click', async () => {
  $('erroLogin').textContent = '';
  const email = $('email').value.trim();
  const senha = $('senha').value;
  if (!email || !senha) { $('erroLogin').textContent = 'Preencha e-mail e senha.'; return; }
  $('btnLogin').disabled = true;
  const r = await bg('login', { email, senha });
  $('btnLogin').disabled = false;
  if (!r.ok) { $('erroLogin').textContent = r.erro || 'Falha no login.'; return; }
  $('senha').value = '';
  render();
});

$('btnLogout').addEventListener('click', async () => { await bg('logout'); render(); });

$('autoSync').addEventListener('change', async (e) => {
  await bg('set_pref', { pref: { autoSync: e.target.checked } });
});

$('btnAgora').addEventListener('click', async () => {
  $('btnAgora').textContent = 'Sincronizando…';
  const [aba] = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });
  if (aba) {
    await chrome.tabs.sendMessage(aba.id, { cmd: 'varrer_agora' }).catch(() => {});
  }
  setTimeout(() => { $('btnAgora').textContent = 'Sincronizar a conversa aberta agora'; render(); }, 3000);
});

$('btnAbrirCrm').addEventListener('click', () => chrome.tabs.create({ url: CFG.APP_URL }));

render();
