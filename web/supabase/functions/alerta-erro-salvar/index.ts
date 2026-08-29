// Chamada pelo app (utils/reportError.ts) sempre que um INSERT/UPDATE/DELETE
// no Supabase falha e o dado só ficou salvo no cache local do navegador.
// Grava uma notificação real (sino, tabela `notificacoes`) pra cada admin e
// manda um e-mail via Resend pro endereço em Admin > Preferências
// (configuracoes.email_alerta_erro). Exige login (verify_jwt) - só faz
// sentido pra erro disparado por um usuário autenticado do próprio app.
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

  let body: { contexto?: string; mensagem?: string; url?: string; quando?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Corpo da requisição inválido' }, 400)
  }
  if (!body.contexto || !body.mensagem) {
    return json({ error: 'contexto e mensagem são obrigatórios' }, 400)
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  const titulo = `Erro ao salvar: ${body.contexto}`
  const mensagem = `${body.mensagem}${body.url ? `\nTela: ${body.url}` : ''}`

  // 1) Notificação real (sino) pra cada admin.
  const { data: admins } = await adminClient.from('profiles').select('id').eq('role', 'admin')
  if (admins && admins.length > 0) {
    await adminClient.from('notificacoes').insert(
      admins.map((a) => ({
        user_id: a.id,
        titulo,
        mensagem,
        link: body.url ? new URL(body.url).pathname : null,
      })),
    )
  }

  // 2) E-mail via Resend, se configurado.
  let emailEnviado = false
  const { data: config } = await adminClient
    .from('configuracoes')
    .select('resend_api_key, email_alerta_erro')
    .not('resend_api_key', 'is', null)
    .limit(1)
    .single()

  if (config?.resend_api_key && config?.email_alerta_erro) {
    try {
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.resend_api_key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Amor In Formaturas <onboarding@resend.dev>',
          to: [config.email_alerta_erro],
          subject: titulo,
          text: `Um salvamento falhou no site e pode não ter sido gravado no banco:\n\n${mensagem}\n\nQuando: ${body.quando || '(não informado)'}`,
        }),
      })
      emailEnviado = resp.ok
      if (!resp.ok) console.error('Erro ao enviar e-mail via Resend:', await resp.text())
    } catch (e) {
      console.error('Erro ao chamar Resend:', e)
    }
  }

  return json({ ok: true, emailEnviado })
})
