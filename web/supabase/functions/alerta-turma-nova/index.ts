// Chamada pelo formulário público de Captação (sem login) quando a pessoa
// não encontra a turma dela no Mapa de Mercado e precisa se cadastrar
// manualmente - manda um e-mail avisando que existe uma turma nova sem
// nenhum cadastro no sistema. Não exige JWT (público), só dispara um
// e-mail informativo, sem acesso a dado sensível.
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

  let body: { curso?: string; faculdade?: string; cidade?: string; turma?: string; anoFormatura?: string; nome?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Corpo da requisição inválido' }, 400)
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  const { data: config } = await adminClient
    .from('configuracoes')
    .select('resend_api_key, email_alerta_turma_nova')
    .not('resend_api_key', 'is', null)
    .limit(1)
    .single()

  if (!config?.resend_api_key || !config?.email_alerta_turma_nova) {
    // Sem e-mail configurado ainda - não quebra o cadastro da pessoa por
    // causa disso, só não manda o aviso.
    return json({ ok: true, emailEnviado: false })
  }

  const linhas = [
    `Curso: ${body.curso || '(não informado)'}`,
    `Faculdade: ${body.faculdade || '(não informado)'}`,
    `Cidade: ${body.cidade || '(não informado)'}`,
    `Turma: ${body.turma || '(não informado)'}`,
    `Ano de Formatura: ${body.anoFormatura || '(não informado)'}`,
    `Cadastrado por: ${body.nome || '(não informado)'}`,
  ]

  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.resend_api_key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Amor In Formaturas <onboarding@resend.dev>',
        to: [config.email_alerta_turma_nova],
        subject: 'Mapa de Mercado: turma sem cadastro algum',
        text: `Alguém se cadastrou pela Captação numa turma que não existe ainda no Mapa de Mercado:\n\n${linhas.join('\n')}\n\nVerifique e cadastre essa turma no Mapa de Mercado se fizer sentido.`,
      }),
    })

    if (!resp.ok) {
      const errText = await resp.text()
      console.error('Erro ao enviar e-mail via Resend:', errText)
      return json({ ok: true, emailEnviado: false })
    }

    return json({ ok: true, emailEnviado: true })
  } catch (e) {
    console.error('Erro ao chamar Resend:', e)
    return json({ ok: true, emailEnviado: false })
  }
})
