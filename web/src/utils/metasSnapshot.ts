// Monta o retrato de metas/PACE/ranking/conhecimento pra ancorar o "Consultor de Metas" em dados
// reais — mesmo princípio do utils/dataSnapshot.ts, mas focado no que esse chat precisa: metas
// cadastradas, ritmo vigente, acumulado do ano e o que já foi registrado na base de conhecimento.
import { calcularPace } from './pace'
import type { PontoDiario } from './pace'
import {
  intervaloDaMeta,
  intervaloDosMeses,
  metaSomaMeses,
  metaVigenteEm,
  rotuloPeriodoMeta,
  METRICA_LABEL,
  METRICA_UNIDADE,
  JANELAS_RETROSPECTIVA,
  type MetaNegocio,
  type MetricaMeta,
} from '@/hooks/useMetasNegocio'
import type { LinhaRanking } from './comercialMetrics'
import type { ConhecimentoEmpresa } from '@/hooks/useConhecimentoEmpresa'
import { marcoEstaAtrasado, type MetaMarco } from '@/hooks/useMetasMarcos'
import { FUNNEL_STAGES, type Deal, type Lead } from '@/types/crm'

/** Nome do estágio atual de uma turma pro consultor conseguir responder "quantas turmas de X
 * estão sem contato / em negociação / fechadas" sem precisar que o Lucas vá checar o SGE na mão —
 * era exatamente isso que faltava e fazia a IA devolver a pergunta em vez de responder. */
function estagioDaTurma(l: Lead, stageByLeadId: Map<string, string>): string {
  if (l.concluida) return 'Formado (já passou do semestre de formatura)'
  const st = (l.status || '').trim().toLowerCase()
  if (st === 'convertido') return 'Convertido (fechado)'
  if (st === 'perdido') return 'Perdido'
  const stageId = stageByLeadId.get(l.id) || 'stage-1'
  const stage = FUNNEL_STAGES.find((s) => s.id === stageId)
  if (stageId === 'stage-1') return 'Prospecção (sem contato ainda)'
  return stage ? stage.name : 'Em atendimento'
}

/** Lista compacta de turmas (curso/faculdade/cidade/empresa/ano/estágio) — é a base pra qualquer
 * pergunta tipo "quantas turmas de Direito na FAINOR ainda estão pra fechar". Sem isso o consultor
 * só via números agregados de PACE e nunca conseguia responder pergunta por curso/faculdade/cidade. */
function buildTurmasSnapshot(leads: Lead[], deals: Deal[]): string {
  const stageByLeadId = new Map<string, string>()
  for (const d of deals) {
    if (!d.leadId) continue
    const atual = stageByLeadId.get(d.leadId)
    if (!atual) stageByLeadId.set(d.leadId, d.stageId)
  }
  const linhas = leads
    .slice()
    .sort((a, b) => (a.curso || '').localeCompare(b.curso || '', 'pt-BR') || (a.faculdade || '').localeCompare(b.faculdade || '', 'pt-BR'))
    .map(
      (l) =>
        `- ${l.curso || '(sem curso)'} | ${l.faculdade || '(sem faculdade)'} | ${l.cidade || '(sem cidade)'} | ${l.empresa || '(sem empresa)'} | ${l.anoFormatura || '(sem ano)'} | ${estagioDaTurma(l, stageByLeadId)}`,
    )
  return linhas.join('\n')
}

function fmt(v: number, unidade: 'R$' | 'un'): string {
  if (unidade === 'R$') return `R$ ${Math.round(v).toLocaleString('pt-BR')}`
  return Math.round(v).toLocaleString('pt-BR')
}

export function buildMetasSnapshot({
  metas,
  pontosPorMetrica,
  ranking,
  conhecimento,
  marcos = [],
  leads = [],
  deals = [],
}: {
  metas: MetaNegocio[]
  pontosPorMetrica: Partial<Record<MetricaMeta, PontoDiario[]>>
  ranking: LinhaRanking[]
  conhecimento: ConhecimentoEmpresa[]
  marcos?: MetaMarco[]
  leads?: Lead[]
  deals?: Deal[]
}): string {
  const hoje = new Date().toISOString().slice(0, 10)
  const ano = new Date().getFullYear()
  const metricasComMeta = Array.from(new Set(metas.map((m) => m.metrica)))
  const anoJanela = JANELAS_RETROSPECTIVA.find((j) => j.label === 'Ano')!

  const linhasMetas: string[] = []
  for (const metrica of metricasComMeta) {
    const pontos = pontosPorMetrica[metrica] || []
    const unidade = METRICA_UNIDADE[metrica]

    const vigente = metaVigenteEm(metas, metrica, hoje)
    if (vigente) {
      const { ini, fim } = intervaloDaMeta(vigente)
      const pace = calcularPace(vigente.valorMeta, ini, fim, pontos)
      linhasMetas.push(
        `- ${METRICA_LABEL[metrica]} [vigente ${rotuloPeriodoMeta(vigente)}]: meta ${fmt(pace.meta, unidade)}, realizado ${fmt(pace.realizado, unidade)} (${(pace.indicePace * 100).toFixed(0)}% do ritmo esperado), projeção de fechamento ${fmt(pace.projecao, unidade)}, status: ${pace.status}.${vigente.contexto ? ` Contexto cadastrado: "${vigente.contexto}"` : ''}`,
      )
    }

    const { valor, mesesComMeta } = metaSomaMeses(metas, metrica, ano, anoJanela.meses)
    if (mesesComMeta > 0) {
      const { ini, fim } = intervaloDosMeses(ano, anoJanela.meses)
      const pace = calcularPace(valor, ini, fim, pontos)
      linhasMetas.push(
        `- ${METRICA_LABEL[metrica]} [acumulado Ano/${ano}]: meta ${fmt(pace.meta, unidade)}${mesesComMeta < anoJanela.meses.length ? ' (parcial — nem todo mês tem meta cadastrada)' : ''}, realizado ${fmt(pace.realizado, unidade)}.`,
      )
    }
  }

  // Metas cujo período já encerrou sem bater e que ainda não tiveram uma decisão registrada —
  // é o que o PaceBand mostra como "precisa de decisão". Ajuda a IA a saber disso sem perguntar.
  const linhasMetasPendentes: string[] = []
  for (const m of metas) {
    if (m.decisao) continue
    const { ini, fim } = intervaloDaMeta(m)
    if (fim >= hoje) continue
    const pontos = pontosPorMetrica[m.metrica] || []
    const pace = calcularPace(m.valorMeta, ini, fim, pontos)
    if (pace.status === 'batida') continue
    const unidade = METRICA_UNIDADE[m.metrica]
    linhasMetasPendentes.push(
      `- ${METRICA_LABEL[m.metrica]} [${rotuloPeriodoMeta(m)}]: meta ${fmt(pace.meta, unidade)}, realizado ${fmt(pace.realizado, unidade)} — período encerrado, meta NÃO batida, decisão pendente.${m.explicacao ? ` Explicação já registrada: "${m.explicacao}"` : ' Ainda sem explicação registrada.'}`,
    )
  }

  const linhasRanking = ranking
    .filter((r) => r.chave !== 'Sem responsável')
    .sort((a, b) => b.ganhas - a.ganhas)
    .slice(0, 5)
    .map(
      (r, i) =>
        `${i + 1}. ${r.chave}: ${r.ganhas} turmas ganhas, win rate ${r.winRate.toFixed(0)}%, ${r.alunosFechados} alunos fechados`,
    )

  const linhasConhecimento = conhecimento
    .slice(0, 15)
    .map(
      (c) =>
        `- [${c.periodoTipo === 'geral' ? 'geral' : `${c.periodoTipo} ${c.periodoValor ?? ''}/${c.ano ?? ''}`}] ${c.titulo}: ${c.conteudo}`,
    )

  const linhasMarcos = marcos
    .filter((m) => m.status !== 'cancelado')
    .map((m) => {
      const atrasado = marcoEstaAtrasado(m)
      const statusTxt = m.status === 'concluido' ? 'concluído' : atrasado ? 'ATRASADO (prazo vencido, ainda não concluído)' : 'pendente'
      return `- "${m.titulo}" [${statusTxt}]${m.prazo ? ` — prazo ${m.prazo}` : ' — sem prazo'}: ${m.descricao}`
    })

  const turmasSnapshot = buildTurmasSnapshot(leads, deals)

  return `## Metas e PACE (hoje: ${hoje})
${linhasMetas.join('\n') || 'Nenhuma meta cadastrada ainda.'}

## Metas vencidas sem decisão (período encerrado, meta não batida, aguardando realocar/descartar/repensar)
${linhasMetasPendentes.join('\n') || 'Nenhuma.'}

## Ranking de desempenho comercial (top 5 por turmas ganhas)
${linhasRanking.join('\n') || 'Sem dados de ranking.'}

## Turmas cadastradas (mapa de mercado / funil completo, ${leads.length} turmas — formato: curso | faculdade | cidade | empresa | ano de formatura | estágio atual)
Use esta lista pra QUALQUER pergunta sobre quantidade/status de turmas por curso, faculdade, cidade ou empresa — inclusive "quantas ainda faltam fechar", "quantas estão sem contato", "quantas estão em negociação". Conte as linhas que batem com o filtro pedido em vez de dizer que falta dado.
Estágio de cada linha é um destes: "Prospecção (sem contato ainda)", "Qualificação/Contato", ou outro nome de fase do funil (todos = AINDA EM ABERTO/pra fechar) | "Convertido (fechado)" (já fechou) | "Perdido" (não vai fechar) | "Formado (já passou do semestre de formatura)" (não conta mais como oportunidade). "Quantas ainda estão em aberto/pra fechar/sem contato" SEMPRE exclui "Convertido (fechado)", "Perdido" e "Formado" — não conte essas junto, mesmo que a pergunta seja só "quantas turmas de X existem" sem especificar status (turma perdida/fechada/formada não é mais uma oportunidade em aberto).
${turmasSnapshot || 'Nenhuma turma cadastrada ainda.'}

## Marcos e conquistas já registrados no Painel de Conquistas (não proponha de novo o que já está aqui)
${linhasMarcos.join('\n') || 'Nenhum marco cadastrado ainda.'}

## Conhecimento já registrado sobre a empresa (memória de longo prazo, mais recentes primeiro)
${linhasConhecimento.join('\n') || 'Nenhum registro salvo ainda na base de conhecimento.'}`
}
