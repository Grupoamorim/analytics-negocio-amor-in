// Agenda uma reunião de turma na agenda "AMOR IN GESTÃO" do Google.
//
// O acesso ao Google Agenda é feito por um Web App do Google Apps Script
// publicado na conta adm@lucasamorim.com.br (jeito mais simples e sem custo:
// não precisa de conta de serviço nem OAuth). O Apps Script roda COMO o
// adm@ e usa CalendarApp direto. Esta função só valida o usuário logado,
// monta o título no padrão do sistema e chama o Apps Script.
//
// Convenção do título (a mesma que os coletores de transcrição Plaud/Fathom
// esperam — eles casam o marcador em qualquer posição):
//   "(PR-F|PR-S|ON) Apresentação [texto extra] <Comissão|Turma...> <turma completa>"
import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } })

const MODALIDADES: Record<string, string> = {
  'PR-F': 'Presencial Fora (fora do estúdio)',
  'PR-S': 'Presencial Estúdio',
  'ON': 'Online',
}

function nomeCompletoTurma(t: Record<string, unknown>): string {
  return ['empresa', 'curso', 'faculdade', 'turma', 'ano_formatura', 'cidade']
    .map((k) => t[k])
    .filter((v) => v != null && String(v).trim() !== '')
    .join(' ')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405)

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
  const SCRIPT_URL = Deno.env.get('GCAL_APPS_SCRIPT_URL') || ''
  const SCRIPT_SECRET = Deno.env.get('GCAL_APPS_SCRIPT_SECRET') || ''

  const authHeader = req.headers.get('Authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!token) return json({ error: 'Não autenticado' }, 401)

  const caller = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } })
  const { data: u, error: uErr } = await caller.auth.getUser(token)
  if (uErr || !u?.user) return json({ error: 'Sessão inválida' }, 401)

  const admin = createClient(SUPABASE_URL, SERVICE_KEY)

  let body: any
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Corpo inválido' }, 400)
  }

  const acao = body.acao || 'criar'

  // ── Cancelar ──
  if (acao === 'cancelar') {
    const { data: r } = await admin.from('reunioes_agendadas').select('*').eq('id', body.id).single()
    if (!r) return json({ error: 'Reunião não encontrada' }, 404)
    if (r.gcal_event_id && SCRIPT_URL) {
      try {
        await fetch(SCRIPT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ secret: SCRIPT_SECRET, action: 'delete', eventId: r.gcal_event_id }),
        })
      } catch (_) { /* ignora — segue cancelando no banco */ }
    }
    await admin.from('reunioes_agendadas').update({ status: 'cancelada', updated_at: new Date().toISOString() }).eq('id', body.id)
    return json({ ok: true })
  }

  // ── Criar ──
  const { turma_id, tipo_reuniao, modalidade, texto_extra, inicio, fim, responsavel } = body
  if (!turma_id || !inicio || !fim) return json({ error: 'turma_id, inicio e fim são obrigatórios' }, 400)
  if (!MODALIDADES[modalidade]) return json({ error: 'modalidade inválida (PR-F | PR-S | ON)' }, 400)

  const { data: turma } = await admin
    .from('turmas')
    .select('id, empresa, curso, faculdade, turma, ano_formatura, cidade')
    .eq('id', turma_id)
    .single()
  if (!turma) return json({ error: 'Turma não encontrada' }, 404)

  const tipo = (tipo_reuniao || 'Turma').trim()
  const extra = (texto_extra || '').trim()
  const nomeTurma = nomeCompletoTurma(turma)
  // O marcador de modalidade fica NA FRENTE de todo o nome:
  //   "(PR-F) Apresentação Comissão AIF Direito FAINOR Turma 43N 2030.1 Conquista"
  const titulo = `(${modalidade}) Apresentação ${extra ? extra + ' ' : ''}${tipo} ${nomeTurma}`

  const descricao = [
    `Turma: ${nomeTurma}`,
    responsavel ? `Responsável: ${responsavel}` : null,
    `Modalidade: ${MODALIDADES[modalidade]}`,
    `Agendado por ${u.user.email} pelo Amor In Gestão.`,
  ].filter(Boolean).join('\n')

  let gcalId: string | null = null
  let gcalLink: string | null = null
  if (SCRIPT_URL) {
    try {
      const res = await fetch(SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret: SCRIPT_SECRET,
          action: 'create',
          titulo,
          inicio,
          fim,
          descricao,
        }),
      })
      const j = await res.json()
      if (j.error) return json({ error: `Google Agenda: ${j.error}` }, 400)
      gcalId = j.id || null
      gcalLink = j.htmlLink || null
    } catch (e) {
      return json({ error: `Falha ao falar com o Google Agenda: ${e}` }, 502)
    }
  }

  const { data: row, error: insErr } = await admin
    .from('reunioes_agendadas')
    .insert({
      turma_id,
      tipo_reuniao: tipo,
      modalidade,
      texto_extra: extra || null,
      titulo,
      descricao,
      inicio,
      fim,
      responsavel: responsavel || null,
      gcal_event_id: gcalId,
      gcal_html_link: gcalLink,
      criado_por: u.user.id,
    })
    .select()
    .single()
  if (insErr) return json({ error: insErr.message }, 400)

  return json({ ok: true, reuniao: row })
})
