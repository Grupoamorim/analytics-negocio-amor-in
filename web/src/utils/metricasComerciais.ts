// Métricas comerciais do funil, calculadas dos dados que já existem:
// deals (com stageHistory), funil_eventos e sem_resposta_episodios.
// Usado no Dashboard, na Probabilidade e onde mais precisar de número comercial.
import { FUNNEL_STAGES, daysBetween, type Deal, type FunilEvento, type Lead } from '@/types/crm'
import { dataFechamento as dataFechamentoLead } from '@/utils/comercialMetrics'

const ORDEM = FUNNEL_STAGES.map((s) => s.id) // ['stage-1'... 'stage-6']
const idx = (stageId?: string) => (stageId ? ORDEM.indexOf(stageId) : -1)

export interface EpisodioSemResposta {
  dealId?: string
  stageId?: string
  iniciouEm: string
  encerrouEm?: string | null
  dias?: number | null
  encerrouPor?: string | null
}

export interface FaseMetrica {
  stageId: string
  nome: string
  turmasAgora: number
  tempoMedioDias: number | null // quanto tempo a turma fica nessa fase
  conversaoParaProxima: number | null // 0..1 — quantas avançaram da fase
  amostraConversao: number
}

export interface MetricasComerciais {
  totalAtivas: number
  ganhos: number
  perdidos: number
  winRate: number | null
  prazoMedioFechamentoDias: number | null // entrada no funil -> ganho
  fases: FaseMetrica[]
  semResposta: {
    agora: number
    taxaAgora: number | null // sobre as ativas
    episodiosEncerrados: number
    diasMedioEpisodio: number | null
    viraramPerda: number
  }
}

/** Data em que a turma foi ganha — prioriza `turmas.fechamento_contrato` (calculado a partir da
 * primeira assinatura/adesão real do aluno, ver sync_normalized_from_sge() no Supabase e
 * comercialMetrics.ts:dataFechamento, 2026-09-17), caindo pro evento de desfecho do funil e por
 * último updatedAt do deal só quando a turma ainda não tem esse dado real (turma sem nenhuma
 * adesão/pagamento vinculado ainda). Sem essa prioridade, "prazo médio de fechamento" media a
 * data em que alguém arrastou/editou o card no funil, não quando o aluno realmente assinou. */
function dataFechamento(deal: Deal, eventos: FunilEvento[], leadById: Map<string, Lead>): string | null {
  const lead = deal.leadId ? leadById.get(deal.leadId) : undefined
  const real = lead ? dataFechamentoLead(lead) : null
  if (real) return real
  const ev = eventos.find(
    (e) => e.tipo === 'desfecho' && e.outcome === 'ganho' && (e.dealId === deal.id || e.turmaId === deal.leadId),
  )
  return ev?.createdAt || deal.updatedAt || null
}

export function calcularMetricasComerciais(
  deals: Deal[],
  funilEventos: FunilEvento[],
  episodios: EpisodioSemResposta[] = [],
  leads: Lead[] = [],
): MetricasComerciais {
  const leadById = new Map(leads.map((l) => [l.id, l]))
  const ativas = deals.filter((d) => d.stageId !== 'stage-6' && !d.outcome)
  const ganhosArr = deals.filter((d) => d.outcome === 'ganho')
  const perdidosArr = deals.filter((d) => d.outcome === 'perdido')

  // prazo médio entrada -> fechamento (ganho)
  const prazos: number[] = []
  for (const d of ganhosArr) {
    const fim = dataFechamento(d, funilEventos, leadById)
    if (fim && d.createdAt) prazos.push(daysBetween(d.createdAt, fim))
  }
  const prazoMedio = prazos.length
    ? Math.round(prazos.reduce((a, b) => a + b, 0) / prazos.length)
    : null

  // tempo por fase + conversão por fase
  const fases: FaseMetrica[] = FUNNEL_STAGES.filter((s) => s.id !== 'stage-6').map((s) => {
    const sIdx = idx(s.id)

    // tempo médio: entradas de stageHistory nessa fase que já foram concluídas
    const tempos: number[] = []
    for (const d of deals) {
      for (const h of d.stageHistory || []) {
        if ((h.stage === s.id || idx(h.stage) === sIdx) && h.daysInStage > 0) tempos.push(h.daysInStage)
      }
    }
    const tempoMedio = tempos.length
      ? Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length)
      : null

    // conversão: das turmas que chegaram nessa fase, quantas passaram da fase
    let chegaram = 0
    let avancaram = 0
    for (const d of deals) {
      const maxIdx = Math.max(
        idx(d.stageId),
        ...(d.stageHistory || []).map((h) => idx(h.stage)),
        d.outcome === 'ganho' ? ORDEM.length - 1 : -1,
      )
      if (maxIdx >= sIdx) {
        chegaram++
        if (maxIdx > sIdx) avancaram++
      }
    }

    return {
      stageId: s.id,
      nome: s.name,
      turmasAgora: ativas.filter((d) => d.stageId === s.id).length,
      tempoMedioDias: tempoMedio,
      conversaoParaProxima: chegaram ? avancaram / chegaram : null,
      amostraConversao: chegaram,
    }
  })

  const encerrados = episodios.filter((e) => e.encerrouEm)
  const diasEp = encerrados.map((e) => e.dias ?? daysBetween(e.iniciouEm, e.encerrouEm as string))
  const semRespAgora = deals.filter((d) => d.semResposta && d.stageId !== 'stage-6').length

  return {
    totalAtivas: ativas.length,
    ganhos: ganhosArr.length,
    perdidos: perdidosArr.length,
    winRate: ganhosArr.length + perdidosArr.length
      ? ganhosArr.length / (ganhosArr.length + perdidosArr.length)
      : null,
    prazoMedioFechamentoDias: prazoMedio,
    fases,
    semResposta: {
      agora: semRespAgora,
      taxaAgora: ativas.length ? semRespAgora / ativas.length : null,
      episodiosEncerrados: encerrados.length,
      diasMedioEpisodio: diasEp.length
        ? Math.round(diasEp.reduce((a, b) => a + b, 0) / diasEp.length)
        : null,
      viraramPerda: encerrados.filter((e) => e.encerrouPor === 'perdido').length,
    },
  }
}
