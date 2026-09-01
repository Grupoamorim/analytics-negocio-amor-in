// Página pública da apresentação da turma (/p/:token).
// Sem login: recebe o token e devolve turma + pacotes + fotos, SÓ se a
// apresentação estiver publicada. Usa service role pra montar o payload
// (os pacotes não são legíveis por anon).
import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } })

function nomeCompletoTurma(t: Record<string, unknown>): string {
  return ['empresa', 'curso', 'faculdade', 'turma', 'ano_formatura', 'cidade']
    .map((k) => t[k])
    .filter((v) => v != null && String(v).trim() !== '')
    .join(' ')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const url = new URL(req.url)
  let token = url.searchParams.get('token') || ''
  if (!token && req.method === 'POST') {
    try {
      token = (await req.json())?.token || ''
    } catch { /* ignora */ }
  }
  if (!token) return json({ error: 'token ausente' }, 400)

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: ap } = await admin
    .from('apresentacao_publica')
    .select('turma_id, fotos, titulo, mensagem, publicada')
    .eq('token', token)
    .maybeSingle()

  if (!ap || !ap.publicada) return json({ error: 'apresentação não encontrada ou não publicada' }, 404)

  const { data: turma } = await admin
    .from('turmas')
    .select('empresa, curso, faculdade, turma, ano_formatura, cidade')
    .eq('id', ap.turma_id)
    .single()

  const { data: pacotes } = await admin
    .from('pacotes_turma')
    .select('nome, valor, parcelas, itens, ordem')
    .eq('turma_id', ap.turma_id)
    .order('valor', { ascending: false })

  const { data: logo } = await admin.from('logo_marca_publica').select('logo_url').maybeSingle()

  return json({
    titulo: ap.titulo || (turma ? nomeCompletoTurma(turma) : 'Apresentação'),
    nomeTurma: turma ? nomeCompletoTurma(turma) : '',
    empresa: turma?.empresa || 'AIF',
    mensagem: ap.mensagem || null,
    logoUrl: logo?.logo_url || null,
    fotos: ap.fotos || [],
    pacotes: (pacotes || []).map((p: any) => ({
      nome: p.nome,
      valor: Number(p.valor) || 0,
      parcelas: p.parcelas || 1,
      itens: p.itens || [],
    })),
  })
})
