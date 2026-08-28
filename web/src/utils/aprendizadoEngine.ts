/**
 * Motor de APRENDIZADO por curso / faculdade.
 *
 * Parte 1 (determinística): agrega os dados reais que já temos — taxa de
 * fechamento, tempo médio por fase, objeções e pontos fortes mais citados,
 * motivos de perda — sempre carregando o N (tamanho da amostra) junto, porque
 * hoje o histórico é raso e o número não pode fingir precisão que não tem.
 *
 * Parte 2 (síntese com IA): manda todo esse material real pro Gemini e pede um
 * estudo de como montar o pitch e a apresentação pra aquele recorte.
 */

import {
  Deal,
  Lead,
  Transcript,
  FunilEvento,
  AprendizadoMaterial,
  AprendizadoEstudo,
  ObjecaoContagem,
  FUNNEL_STAGE_BY_ID,
} from '@/types/crm'
import { callGemini } from '@/utils/geminiApi'

export interface AprendizadoDataset {
  deals: Deal[]
  leads: Lead[]
  transcripts: Transcript[]
  funilEventos: FunilEvento[]
  materiais: AprendizadoMaterial[]
}

export interface EstudoEscopo {
  escopo: 'curso' | 'faculdade' | 'curso_faculdade' | 'geral'
  curso?: string
  faculdade?: string
}

function norm(s?: string): string {
  return (s || '').trim().toLowerCase()
}

function matchEscopo(
  escopo: EstudoEscopo,
  curso?: string,
  faculdade?: string,
): boolean {
  const c = norm(curso)
  const f = norm(faculdade)
  switch (escopo.escopo) {
    case 'geral':
      return true
    case 'curso':
      return c === norm(escopo.curso)
    case 'faculdade':
      return f === norm(escopo.faculdade)
    case 'curso_faculdade':
      return c === norm(escopo.curso) && f === norm(escopo.faculdade)
  }
}

/** Conta ocorrências de texto exato (case-insensitive), retorna top N ordenado. */
function tally(items: string[], top = 8): ObjecaoContagem[] {
  const map = new Map<string, { texto: string; n: number }>()
  for (const raw of items) {
    const texto = (raw || '').trim()
    if (!texto) continue
    const key = texto.toLowerCase()
    const cur = map.get(key)
    if (cur) cur.n++
    else map.set(key, { texto, n: 1 })
  }
  return [...map.values()].sort((a, b) => b.n - a.n).slice(0, top)
}

function splitLinhas(t?: string): string[] {
  return (t || '')
    .split('\n')
    .map((l) => l.trim().replace(/^[-•*]\s*/, ''))
    .filter(Boolean)
}

/**
 * Agrega os dados reais do recorte. Nunca inventa: se não houver amostra,
 * os campos vêm vazios / undefined e o N fica em 0.
 */
export function computeEstudoAgregado(
  escopo: EstudoEscopo,
  data: AprendizadoDataset,
): AprendizadoEstudo {
  const leadById = new Map(data.leads.map((l) => [l.id, l]))
  const infoDoDeal = (d: Deal) => {
    const l = d.leadId ? leadById.get(d.leadId) : undefined
    return { curso: l?.curso, faculdade: l?.faculdade }
  }

  const dealsNoEscopo = data.deals.filter((d) => {
    const { curso, faculdade } = infoDoDeal(d)
    return matchEscopo(escopo, curso, faculdade)
  })
  const dealIds = new Set(dealsNoEscopo.map((d) => d.id))
  const leadIds = new Set(dealsNoEscopo.map((d) => d.leadId).filter(Boolean) as string[])

  const resolvidos = dealsNoEscopo.filter((d) => d.outcome === 'ganho' || d.outcome === 'perdido')
  const ganhos = resolvidos.filter((d) => d.outcome === 'ganho').length
  const taxaFechamento = resolvidos.length > 0 ? ganhos / resolvidos.length : undefined

  // Transcrições do recorte
  const transcripts = data.transcripts.filter((t) => t.leadId && leadIds.has(t.leadId))

  // Eventos do recorte
  const eventos = data.funilEventos.filter(
    (e) =>
      (e.dealId && dealIds.has(e.dealId)) ||
      matchEscopo(escopo, e.curso, e.faculdade),
  )

  // Materiais soltos do recorte (ou todos, se escopo geral)
  const materiais = data.materiais.filter((m) =>
    matchEscopo(escopo, m.curso, m.faculdade),
  )

  // Avanço por portão: de quantos eventos "from->to" temos registro
  const taxaAvancoPorPortao: Record<string, number> = {}
  const tempoPorEstagio: Record<string, { soma: number; n: number }> = {}
  for (const e of eventos) {
    if (e.tipo !== 'transicao' || !e.fromStage || !e.toStage) continue
    const gate = `${e.fromStage}->${e.toStage}`
    taxaAvancoPorPortao[gate] = (taxaAvancoPorPortao[gate] || 0) + 1
    if (typeof e.diasNoEstagioOrigem === 'number') {
      const acc = tempoPorEstagio[e.fromStage] || { soma: 0, n: 0 }
      acc.soma += e.diasNoEstagioOrigem
      acc.n++
      tempoPorEstagio[e.fromStage] = acc
    }
  }
  const tempoMedioPorEstagio: Record<string, number> = {}
  for (const [stage, { soma, n }] of Object.entries(tempoPorEstagio)) {
    if (n > 0) tempoMedioPorEstagio[stage] = Math.round(soma / n)
  }

  // Objeções / pontos fortes: texto exato citado pelo Gemini nas transcrições + materiais
  const objecoes = [
    ...transcripts.flatMap((t) => t.geminiAnalysis?.pontosAtencao || []),
    ...materiais.flatMap((m) => splitLinhas(m.pontosAtencao)),
  ]
  const fortes = [
    ...transcripts.flatMap((t) => t.geminiAnalysis?.pontosFortes || []),
    ...materiais.flatMap((m) => splitLinhas(m.pontosFortes)),
  ]
  const motivosPerda = [
    ...resolvidos
      .filter((d) => d.outcome === 'perdido' && d.lostReason)
      .map((d) => d.lostReason as string),
    ...eventos.filter((e) => e.outcome === 'perdido' && e.motivoPerda).map((e) => e.motivoPerda as string),
    ...materiais.filter((m) => m.categoria === 'turma_perdida').flatMap((m) => splitLinhas(m.licoes)),
  ]

  return {
    escopo: escopo.escopo,
    curso: escopo.curso,
    faculdade: escopo.faculdade,
    amostraTurmas: resolvidos.length,
    amostraReunioes: transcripts.length,
    taxaFechamento,
    taxaAvancoPorPortao,
    tempoMedioPorEstagio,
    objecoesComuns: tally(objecoes),
    pontosFortesComuns: tally(fortes),
    motivosPerdaComuns: tally(motivosPerda),
    geradoPor: 'regras',
    geradoEm: new Date().toISOString(),
  }
}

/** Monta o texto de contexto (corpus real) que vai pro Gemini. */
export function montarCorpusParaIA(
  escopo: EstudoEscopo,
  agg: AprendizadoEstudo,
  data: AprendizadoDataset,
): string {
  const leadById = new Map(data.leads.map((l) => [l.id, l]))
  const leadIds = new Set(
    data.deals
      .filter((d) => {
        const l = d.leadId ? leadById.get(d.leadId) : undefined
        return matchEscopo(escopo, l?.curso, l?.faculdade)
      })
      .map((d) => d.leadId)
      .filter(Boolean) as string[],
  )

  const linhas: string[] = []
  const stageNome = (id?: string) => (id ? FUNNEL_STAGE_BY_ID[id]?.name || id : '?')

  linhas.push(`## Números reais do recorte (amostra pequena — trate como indício, não verdade)`)
  linhas.push(`- Turmas com desfecho: ${agg.amostraTurmas}`)
  linhas.push(
    `- Taxa de fechamento: ${
      agg.taxaFechamento != null ? Math.round(agg.taxaFechamento * 100) + '%' : 'sem dados'
    }`,
  )
  linhas.push(`- Reuniões analisadas: ${agg.amostraReunioes}`)
  if (agg.tempoMedioPorEstagio && Object.keys(agg.tempoMedioPorEstagio).length) {
    linhas.push(
      `- Tempo médio por fase (dias): ` +
        Object.entries(agg.tempoMedioPorEstagio)
          .map(([s, d]) => `${stageNome(s)}=${d}`)
          .join(', '),
    )
  }
  if (agg.objecoesComuns?.length) {
    linhas.push(`\n## Objeções / pontos de atenção mais citados`)
    agg.objecoesComuns.forEach((o) => linhas.push(`- (${o.n}x) ${o.texto}`))
  }
  if (agg.pontosFortesComuns?.length) {
    linhas.push(`\n## Pontos fortes mais citados`)
    agg.pontosFortesComuns.forEach((o) => linhas.push(`- (${o.n}x) ${o.texto}`))
  }
  if (agg.motivosPerdaComuns?.length) {
    linhas.push(`\n## Motivos de perda / lições de turmas que não fecharam`)
    agg.motivosPerdaComuns.forEach((o) => linhas.push(`- (${o.n}x) ${o.texto}`))
  }

  // Resumos das reuniões do recorte
  const transcripts = data.transcripts
    .filter((t) => t.leadId && leadIds.has(t.leadId))
    .slice(0, 12)
  if (transcripts.length) {
    linhas.push(`\n## Resumos de reuniões reais deste recorte`)
    transcripts.forEach((t) => {
      const g = t.geminiAnalysis
      linhas.push(
        `- [${t.meetingType || 'Reunião'}] prob ${g?.probabilidade ?? t.probabilityScore}%. ` +
          `Resumo: ${g?.resumo || '(sem resumo)'} ` +
          `Objeções: ${(g?.pontosAtencao || []).join('; ') || 'nenhuma'}.`,
      )
    })
  }

  // Materiais soltos (turmas ganhas/perdidas fora do processo + treinamentos)
  const materiais = data.materiais.filter((m) => matchEscopo(escopo, m.curso, m.faculdade))
  if (materiais.length) {
    linhas.push(`\n## Material de aprendizado (fora do funil) e treinamentos internos`)
    materiais.slice(0, 15).forEach((m) => {
      linhas.push(
        `- [${m.categoria}] ${m.titulo}. Lições: ${m.licoes || '—'}. Táticas: ${m.taticas || '—'}.`,
      )
    })
  }

  return linhas.join('\n')
}

export interface EstudoIA {
  oQueFunciona: string
  oQueEvitar: string
  pitchRecomendado: string
  estruturaApresentacao: string
  preferenciasFormandos: string
}

/** Chama o Gemini para sintetizar o estudo do recorte a partir do corpus real. */
export async function gerarEstudoIA(
  escopo: EstudoEscopo,
  corpus: string,
  apiKey?: string,
  model?: string,
): Promise<EstudoIA> {
  const alvo =
    escopo.escopo === 'geral'
      ? 'todas as turmas de formatura'
      : [escopo.curso, escopo.faculdade].filter(Boolean).join(' — ')

  const prompt = `Você é um head de vendas de formatura da Amor In Formaturas, especialista em fechar contratos com comissões e turmas de faculdade.

Abaixo está TODO o material real que temos sobre o recorte: "${alvo}". A amostra é pequena — use como indício e seja honesto sobre incerteza, NUNCA invente número ou fato que não está no material.

MATERIAL:
"""
${corpus.substring(0, 18000)}
"""

Com base SÓ nesse material, escreva um estudo prático pro time de vendas. Retorne OBRIGATORIAMENTE apenas um JSON válido (sem markdown, sem texto antes/depois) neste formato:
{
  "oQueFunciona": "<o que, nesse recorte, tem levado turmas a avançar de fase e fechar>",
  "oQueEvitar": "<erros e gatilhos que travaram avanço ou fecharam a porta nesse recorte>",
  "pitchRecomendado": "<roteiro de pitch específico pra esse curso/faculdade: abertura, argumentos de valor na ordem certa, como responder às objeções mais citadas, como conduzir pro fechamento>",
  "estruturaApresentacao": "<estrutura recomendada da apresentação pra turma: seções na ordem, o que enfatizar, o que cortar, duração sugerida>",
  "preferenciasFormandos": "<o que os formandos desse curso/faculdade parecem valorizar e o que os incomoda, segundo o material>"
}`

  const raw = await callGemini(prompt, apiKey, model)
  let cleaned = raw.trim()
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
  }
  try {
    const p = JSON.parse(cleaned)
    return {
      oQueFunciona: String(p.oQueFunciona || ''),
      oQueEvitar: String(p.oQueEvitar || ''),
      pitchRecomendado: String(p.pitchRecomendado || ''),
      estruturaApresentacao: String(p.estruturaApresentacao || ''),
      preferenciasFormandos: String(p.preferenciasFormandos || ''),
    }
  } catch {
    return {
      oQueFunciona: '',
      oQueEvitar: '',
      pitchRecomendado: raw.slice(0, 2000),
      estruturaApresentacao: '',
      preferenciasFormandos: '',
    }
  }
}

/** Analisa um material solto de aprendizado com o Gemini. */
export interface MaterialAnalise {
  resumo: string
  licoes: string
  pontosFortes: string
  pontosAtencao: string
  taticas: string
  sentimento: 'positivo' | 'neutro' | 'negativo'
}

export async function analisarMaterialAprendizado(
  categoria: string,
  titulo: string,
  conteudo: string,
  apiKey?: string,
  model?: string,
): Promise<MaterialAnalise> {
  const foco =
    categoria === 'treinamento'
      ? 'É uma aula/treinamento interno de vendas. Extraia as técnicas ensinadas e como aplicá-las nas reuniões com comissão e turma.'
      : categoria === 'turma_ganha'
        ? 'É a gravação de uma negociação de turma que FECHOU. Extraia o que funcionou e é replicável.'
        : 'É a gravação de uma negociação de turma que NÃO fechou. Extraia o que deu errado e como evitar.'

  const prompt = `Você é analista de vendas de formatura. ${foco}

TÍTULO: ${titulo}
CONTEÚDO:
"""
${(conteudo || '').substring(0, 15000)}
"""

Retorne OBRIGATORIAMENTE apenas um JSON válido (sem markdown) neste formato:
{
  "resumo": "<2 a 4 frases>",
  "licoes": "<principais lições, uma por linha>",
  "pontosFortes": "<o que foi bem feito, uma por linha>",
  "pontosAtencao": "<erros / riscos / objeções não contornadas, uma por linha>",
  "taticas": "<táticas e frases concretas para reaproveitar, uma por linha>",
  "sentimento": "<positivo | neutro | negativo>"
}`

  const raw = await callGemini(prompt, apiKey, model)
  let cleaned = raw.trim()
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
  }
  try {
    const p = JSON.parse(cleaned)
    const s = String(p.sentimento || 'neutro').toLowerCase()
    return {
      resumo: String(p.resumo || ''),
      licoes: String(p.licoes || ''),
      pontosFortes: String(p.pontosFortes || ''),
      pontosAtencao: String(p.pontosAtencao || ''),
      taticas: String(p.taticas || ''),
      sentimento: (['positivo', 'neutro', 'negativo'].includes(s) ? s : 'neutro') as
        | 'positivo'
        | 'neutro'
        | 'negativo',
    }
  } catch {
    return {
      resumo: raw.slice(0, 400),
      licoes: '',
      pontosFortes: '',
      pontosAtencao: '',
      taticas: '',
      sentimento: 'neutro',
    }
  }
}
