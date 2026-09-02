// Convite de usuário por e-mail (Administração > Usuários).
// Só quem já é admin (checado via profiles) pode chamar. Usa a service
// role key (nunca exposta ao cliente) pra criar o usuário no Supabase Auth
// e mandar o e-mail de convite - o convidado define a própria senha pelo
// link, o admin nunca vê nem define a senha de ninguém.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405)

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

  const authHeader = req.headers.get('Authorization') || ''
  const callerToken = authHeader.replace(/^Bearer\s+/i, '')
  if (!callerToken) return json({ error: 'Não autenticado' }, 401)

  // Cliente com o token de quem chamou, só pra validar quem é e se é admin.
  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userErr } = await callerClient.auth.getUser(callerToken)
  if (userErr || !userData?.user) return json({ error: 'Sessão inválida' }, 401)

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  const { data: perfilCaller } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .single()

  if (perfilCaller?.role !== 'admin') {
    return json({ error: 'Só administradores podem convidar usuários' }, 403)
  }

  let body: { email?: string; nome?: string; role?: string; paginas?: unknown; resend?: boolean }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Corpo da requisição inválido' }, 400)
  }

  const email = (body.email || '').trim().toLowerCase()
  const nome = (body.nome || '').trim()
  const role = (body.role || 'membro').trim()
  const paginas = Array.isArray(body.paginas)
    ? (body.paginas as unknown[]).filter((p): p is string => typeof p === 'string')
    : null
  const CARGOS_VALIDOS = ['admin', 'comercial_admin', 'financeiro', 'comercial', 'membro']

  if (!email || !email.includes('@')) return json({ error: 'E-mail inválido' }, 400)

  const APP_URL = Deno.env.get('APP_URL') || 'https://analytics-negocio-amor-in.pages.dev'
  const redirectTo = `${APP_URL}/redefinir-senha`

  // ── Reenviar o e-mail de acesso de um usuário que já foi convidado ──
  if (body.resend === true) {
    // 1ª tentativa: reenviar o convite (funciona pra quem ainda não confirmou o e-mail).
    const { error: reinviteErr } = await adminClient.auth.admin.inviteUserByEmail(email, {
      redirectTo,
    })
    if (!reinviteErr) return json({ ok: true, resent: 'convite' })

    // Já confirmou o e-mail: manda um link de redefinição de senha em vez do convite.
    const { error: recErr } = await adminClient.auth.resetPasswordForEmail(email, { redirectTo })
    if (recErr) return json({ error: recErr.message || reinviteErr.message }, 400)
    return json({ ok: true, resent: 'senha' })
  }

  if (!CARGOS_VALIDOS.includes(role)) return json({ error: 'Cargo inválido' }, 400)

  const { data: invited, error: inviteErr } = await adminClient.auth.admin.inviteUserByEmail(email, {
    data: nome ? { nome } : undefined,
    redirectTo,
  })

  if (inviteErr || !invited?.user) {
    return json({ error: inviteErr?.message || 'Não foi possível convidar esse e-mail' }, 400)
  }

  // O trigger on_auth_user_created já cria o profile com role 'membro' por
  // padrão - se o admin escolheu outro cargo na hora do convite, aplicamos
  // aqui em cima.
  if (role !== 'membro') {
    await adminClient.from('profiles').update({ role }).eq('id', invited.user.id)
  }

  // Abas do menu que o admin liberou pra esse usuário (não se aplica a admin).
  if (role !== 'admin' && paginas) {
    await adminClient
      .from('acesso_paginas')
      .upsert({ user_id: invited.user.id, paginas, updated_at: new Date().toISOString() })
  }

  return json({ ok: true, userId: invited.user.id })
})
