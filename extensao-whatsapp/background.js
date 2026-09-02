// Service worker: guarda a sessão do CRM (login do vendedor) e fala com as
// Edge Functions do Supabase. O content script nunca toca nos tokens.
importScripts('config.js');
const CFG = self.AMORIN_CONFIG;

const SESSAO_KEY = 'amorin_sessao';
const PREF_KEY = 'amorin_pref';

async function getSessao() {
  const o = await chrome.storage.local.get(SESSAO_KEY);
  return o[SESSAO_KEY] || null;
}
async function setSessao(s) { await chrome.storage.local.set({ [SESSAO_KEY]: s }); }
async function limparSessao() { await chrome.storage.local.remove(SESSAO_KEY); }

async function getPref() {
  const o = await chrome.storage.local.get(PREF_KEY);
  return o[PREF_KEY] || { autoSync: true };
}

// ---- Auth ----
async function login(email, senha) {
  const r = await fetch(`${CFG.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: CFG.SUPABASE_ANON_KEY },
    body: JSON.stringify({ email, password: senha }),
  });
  const j = await r.json();
  if (!r.ok) return { ok: false, erro: j.error_description || j.msg || 'Falha no login' };
  await setSessao({
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    expira_em: Date.now() + (j.expires_in || 3600) * 1000,
    email: (j.user && j.user.email) || email,
  });
  return { ok: true, email: (j.user && j.user.email) || email };
}

async function tokenValido() {
  let s = await getSessao();
  if (!s) return null;
  if (Date.now() < s.expira_em - 60000) return s.access_token;
  // renova
  const r = await fetch(`${CFG.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: CFG.SUPABASE_ANON_KEY },
    body: JSON.stringify({ refresh_token: s.refresh_token }),
  });
  const j = await r.json();
  if (!r.ok) { await limparSessao(); return null; }
  s = {
    access_token: j.access_token,
    refresh_token: j.refresh_token || s.refresh_token,
    expira_em: Date.now() + (j.expires_in || 3600) * 1000,
    email: s.email,
  };
  await setSessao(s);
  return s.access_token;
}

async function chamarEdge(fn, payload) {
  const token = await tokenValido();
  if (!token) return { erro: 'sem sessão' };
  try {
    const r = await fetch(`${CFG.SUPABASE_URL}/functions/v1/${fn}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: CFG.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { erro: j.error || `HTTP ${r.status}` };
    return j;
  } catch (e) {
    return { erro: String(e) };
  }
}

// lista de grupos ainda sem turma (pro popup mostrar o que falta alinhar)
async function gruposPendentes() {
  const token = await tokenValido();
  if (!token) return [];
  try {
    const r = await fetch(
      `${CFG.SUPABASE_URL}/rest/v1/conversa_grupos?select=grupo_wa_id,grupo_nome,vinculo&vinculo=eq.pendente&ignorar=eq.false&order=updated_at.desc`,
      { headers: { apikey: CFG.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } }
    );
    if (!r.ok) return [];
    return await r.json();
  } catch (_) {
    return [];
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    switch (msg.cmd) {
      case 'config': {
        const s = await getSessao();
        const pref = await getPref();
        sendResponse({ temSessao: !!s, email: s && s.email, autoSync: pref.autoSync !== false });
        break;
      }
      case 'login':
        sendResponse(await login(msg.email, msg.senha));
        break;
      case 'logout':
        await limparSessao();
        sendResponse({ ok: true });
        break;
      case 'set_pref': {
        const pref = await getPref();
        await chrome.storage.local.set({ [PREF_KEY]: { ...pref, ...msg.pref } });
        sendResponse({ ok: true });
        break;
      }
      case 'resolver':
        sendResponse(await chamarEdge('whatsapp-sync', { acao: 'resolver', ...msg.payload }));
        break;
      case 'salvar':
        sendResponse(await chamarEdge('whatsapp-sync', msg.payload));
        break;
      case 'grupos_pendentes':
        sendResponse(await gruposPendentes());
        break;
      case 'status': {
        const { amorin_estado } = await chrome.storage.local.get('amorin_estado');
        sendResponse(amorin_estado || {});
        break;
      }
      default:
        sendResponse({ erro: 'cmd desconhecido' });
    }
  })();
  return true; // resposta assíncrona
});
