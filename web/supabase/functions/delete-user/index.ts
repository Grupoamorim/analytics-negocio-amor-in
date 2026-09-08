// Excluir usuário (Administração > Usuários).
// Só quem já é admin (checado via profiles) pode chamar. Usa a service
// role key (nunca exposta ao cliente) pra apagar o usuário do Supabase Auth
// - o profile some junto pelo ON DELETE CASCADE em profiles.id -> auth.users.id.
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
    return json({ error: 'Só administradores podem excluir usuários' }, 403)
  }

  let body: { userId?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Corpo da requisição inválido' }, 400)
  }

  const userId = (body.userId || '').trim()
  if (!userId) return json({ error: 'userId é obrigatório' }, 400)

  if (userId === userData.user.id) {
    return json({ error: 'Você não pode excluir a si mesmo' }, 400)
  }

  const { error: deleteErr } = await adminClient.auth.admin.deleteUser(userId)
  if (deleteErr) {
    return json({ error: deleteErr.message || 'Não foi possível excluir o usuário' }, 400)
  }

  return json({ ok: true })
})
