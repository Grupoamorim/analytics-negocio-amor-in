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

function fmt(v: number, unidade: 'R$' | 'un'): string {
  if (unidade === 'R$') return `R$ ${Math.round(v).toLocaleString('pt-BR')}`
  return Math.round(v).toLocaleString('pt-BR')
}

export function buildMetasSnapshot({
  metas,
  pontosPorMetrica,
  ranking,
  conhecimento,
}: {
  metas: MetaNegocio[]
  pontosPorMetrica: Partial<Record<MetricaMeta, PontoDiario[]>>
  ranking: LinhaRanking[]
  conhecimento: ConhecimentoEmpresa[]
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

  return `## Metas e PACE (hoje: ${hoje})
${linhasMetas.join('\n') || 'Nenhuma meta cadastrada ainda.'}

## Ranking de desempenho comercial (top 5 por turmas ganhas)
${linhasRanking.join('\n') || 'Sem dados de ranking.'}

## Conhecimento já registrado sobre a empresa (memória de longo prazo, mais recentes primeiro)
${linhasConhecimento.join('\n') || 'Nenhum registro salvo ainda na base de conhecimento.'}`
}
