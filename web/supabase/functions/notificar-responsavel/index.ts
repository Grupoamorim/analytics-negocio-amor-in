// Chamada quando o "Responsável" de uma turma no Funil é trocado - avisa
// o novo responsável por e-mail e grava uma notificação real (tabela
// `notificacoes`) pra aparecer no sininho do próprio programa. Exige
// login (verify_jwt), diferente de alerta-turma-nova que é público.
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

  let body: {
    novoResponsavelId?: string
    turmaNome?: string
    turmaId?: string
    atribuidoPorNome?: string
  }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Corpo da requisição inválido' }, 400)
  }

  if (!body.novoResponsavelId || !body.turmaNome) {
    return json({ error: 'novoResponsavelId e turmaNome são obrigatórios' }, 400)
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  const { data: destinatario } = await adminClient
    .from('profiles')
    .select('id, nome, email')
    .eq('id', body.novoResponsavelId)
    .single()

  if (!destinatario) {
    return json({ error: 'Usuário destinatário não encontrado' }, 404)
  }

  const titulo = `Você é o responsável por ${body.turmaNome}`
  const mensagem = body.atribuidoPorNome
    ? `${body.atribuidoPorNome} te atribuiu como responsável pela turma ${body.turmaNome}.`
    : `Você foi atribuído como responsável pela turma ${body.turmaNome}.`
  const link = body.turmaId ? `/pipeline?turma=${body.turmaId}` : '/pipeline'

  // 1) Notificação dentro do programa - sempre tenta gravar, mesmo se o
  // e-mail falhar depois.
  const { error: notifError } = await adminClient.from('notificacoes').insert({
    user_id: destinatario.id,
    titulo,
    mensagem,
    link,
  })

  // 2) E-mail via Resend, se configurado.
  let emailEnviado = false
  const { data: config } = await adminClient
    .from('configuracoes')
    .select('resend_api_key')
    .not('resend_api_key', 'is', null)
    .limit(1)
    .single()

  if (config?.resend_api_key && destinatario.email) {
    try {
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.resend_api_key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Amor In Formaturas <onboarding@resend.dev>',
          to: [destinatario.email],
          subject: titulo,
          text: `${mensagem}\n\nAcesse o programa pra ver os detalhes.`,
        }),
      })
      emailEnviado = resp.ok
      if (!resp.ok) console.error('Erro ao enviar e-mail via Resend:', await resp.text())
    } catch (e) {
      console.error('Erro ao chamar Resend:', e)
    }
  }

  return json({ ok: true, notificacaoGravada: !notifError, emailEnviado })
})
