/**
 * Motor de probabilidade ÚNICA de fechamento de uma turma.
 *
 * Regra de ouro (definida com o Lucas): a análise da reunião (foco/transcrição)
 * MANDA no número — é o único fator que mede se a turma quer. O funil só TEMPERA:
 *
 *   1. bônus pequeno por portão de fase já vencido, proporcional à seletividade
 *      do portão (Comissão→Turma ≈ 0, porque quase todo mundo passa; a coluna é
 *      um "falta fazer", não uma conquista);
 *   2. ajuste por velocidade / estagnação na coluna atual — esse morde: turma
 *      parada há muito tempo cai forte; turma rápida = engajada, sobe;
 *   3. leve empurrão pela taxa histórica de fechamento do curso/faculdade, com
 *      peso proporcional ao tamanho da amostra (N).
 *
 * `final = clamp(base + ajustePortao + ajusteVelocidade + ajusteCursoFac, 3, 99)`
 */

import {
  Deal,
  ProbBreakdown,
  Transcript,
  FunnelStageMeta,
  FUNNEL_STAGE_BY_ID,
  FUNNEL_STAGES,
  daysInCurrentStage,
} from '@/types/crm'

/** Pesos fixos do motor. Calibrados pelo playbook; edição em Admin fica pra depois. */
export const MOTOR_WEIGHTS = {
  /**
   * Bônus por portão vencido (transição ENTRE estágios consecutivos), pela ordem
   * das fases. Índice i = bônus por ter saído do estágio i para o i+1.
   * Prospecção→Qualif quase nada; Comissão→Turma mínimo (só uma apresentação);
   * Turma→Decisão é o que pesa (a turma inteira já viu a proposta).
   */
  portao: {
    'stage-1->stage-2': 0,
    'stage-2->stage-3': 2,
    'stage-3->stage-4': 1,
    'stage-4->stage-5': 4,
  } as Record<string, number>,
  /** Teto do bônus acumulado de portões. */
  portaoMax: 8,
  /** Ajuste por velocidade na coluna atual, por faixa de (dias / alerta de estagnação). */
  velocidade: {
    rapida: 5, // ratio <= 0.5
    saudavel: 0, // 0.5 < ratio <= 1.0
    lenta: -8, // 1.0 < ratio <= 2.0
    estagnada: -18, // ratio > 2.0
  },
  /** Efeito máximo (para cima ou para baixo) da taxa de fechamento do curso/faculdade. */
  cursoFacMax: 5,
  /** N de turmas resolvidas a partir do qual o efeito curso/faculdade fica "cheio". */
  cursoFacNParaConfiancaTotal: 15,
  /** Piso/teto do número final. */
  min: 3,
  max: 99,
}

const STAGE_ORDER = FUNNEL_STAGES.map((s) => s.id)

/** Taxa de fechamento histórica de um recorte (curso e/ou faculdade) + tamanho da amostra. */
export interface CursoFacRate {
  /** Fração 0–1 de turmas resolvidas que fecharam (ganho / (ganho + perdido)). */
  rate: number
  /** Nº de turmas resolvidas (ganho + perdido) que embasam a taxa. */
  n: number
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

/** Probabilidade da reunião mais recente de uma turma (Gemini > heurística). */
export function transcriptProbabilidade(t?: Transcript | null): number | undefined {
  if (!t) return undefined
  const g = t.geminiAnalysis?.probabilidade
  if (typeof g === 'number' && g > 0) return g
  if (typeof t.probabilityScore === 'number' && t.probabilityScore > 0) return t.probabilityScore
  return undefined
}

/** Soma dos bônus de portão pelos estágios que a turma já venceu (pela posição atual). */
function bonusPortao(stageId: string): number {
  const idx = STAGE_ORDER.indexOf(stageId)
  if (idx <= 0) return 0
  let total = 0
  for (let i = 0; i < idx; i++) {
    total += MOTOR_WEIGHTS.portao[`${STAGE_ORDER[i]}->${STAGE_ORDER[i + 1]}`] ?? 0
  }
  return Math.min(total, MOTOR_WEIGHTS.portaoMax)
}

function ajusteVelocidade(deal: Deal, stageMeta: FunnelStageMeta): { valor: number; label: string } {
  const alerta = stageMeta.stagnationAlertDays || 7
  if (alerta >= 999) return { valor: 0, label: 'saudável' } // stage-6 não tem prazo
  const dias = daysInCurrentStage(deal)
  const ratio = dias / alerta
  if (ratio <= 0.5) return { valor: MOTOR_WEIGHTS.velocidade.rapida, label: 'rápida' }
  if (ratio <= 1.0) return { valor: MOTOR_WEIGHTS.velocidade.saudavel, label: 'saudável' }
  if (ratio <= 2.0) return { valor: MOTOR_WEIGHTS.velocidade.lenta, label: 'lenta' }
  return { valor: MOTOR_WEIGHTS.velocidade.estagnada, label: 'estagnada' }
}

function ajusteCursoFac(rate?: CursoFacRate | null): { valor: number; n: number } {
  // Só usa a taxa histórica do curso/faculdade quando há amostra suficiente
  // (>= 8 turmas com desfecho) — abaixo disso não há média confiável.
  if (!rate || rate.n < 8) return { valor: 0, n: rate?.n ?? 0 }
  const confianca = Math.min(1, rate.n / MOTOR_WEIGHTS.cursoFacNParaConfiancaTotal)
  const bruto = (rate.rate - 0.5) * 2 * MOTOR_WEIGHTS.cursoFacMax // rate 0→-max, 1→+max
  const valor = clamp(bruto * confianca, -MOTOR_WEIGHTS.cursoFacMax, MOTOR_WEIGHTS.cursoFacMax)
  return { valor: Math.round(valor), n: rate.n }
}

export interface ComputeArgs {
  deal: Deal
  latestTranscript?: Transcript | null
  /** Taxa de fechamento do recorte mais específico disponível (curso+faculdade > curso > faculdade). */
  cursoFacRate?: CursoFacRate | null
}

/**
 * Calcula a probabilidade única de fechamento da turma e devolve o "porquê".
 */
export function computeDealProbability({
  deal,
  latestTranscript,
  cursoFacRate,
}: ComputeArgs): { score: number; breakdown: ProbBreakdown } {
  const stageId = deal.stageId || 'stage-1'
  const stageMeta = FUNNEL_STAGE_BY_ID[stageId] || FUNNEL_STAGES[0]

  // Prospecção: ainda não houve contato com a comissão nem reunião — não dá pra
  // estimar probabilidade de fechamento com honestidade. Só avaliamos a partir
  // da Qualificação/Contato. (Decisão do Lucas.)
  if (stageId === 'stage-1' || deal.stage === 'prospeccao') {
    return {
      score: 0,
      breakdown: {
        base: 0,
        semReuniao: true,
        naoAvaliavel: true,
        ajustePortao: 0,
        ajusteVelocidade: 0,
        ajusteCursoFac: 0,
        cursoFacN: 0,
        velocidadeLabel: 'saudável',
        final: 0,
      },
    }
  }

  // Estágio final: o resultado já é conhecido, não há o que estimar.
  if (stageId === 'stage-6' || deal.stage === 'fechou-ou-perdeu') {
    const finalScore = deal.outcome === 'ganho' ? 100 : deal.outcome === 'perdido' ? 0 : 50
    return {
      score: finalScore,
      breakdown: {
        base: finalScore,
        semReuniao: !latestTranscript,
        ajustePortao: 0,
        ajusteVelocidade: 0,
        ajusteCursoFac: 0,
        cursoFacN: 0,
        velocidadeLabel: 'saudável',
        final: finalScore,
      },
    }
  }

  const tProb = transcriptProbabilidade(latestTranscript)
  const semReuniao = tProb === undefined
  const base = semReuniao ? stageMeta.defaultProbability : (tProb as number)

  const aPortao = bonusPortao(stageId)
  const vel = ajusteVelocidade(deal, stageMeta)
  const cf = ajusteCursoFac(cursoFacRate)

  const final = Math.round(
    clamp(base + aPortao + vel.valor + cf.valor, MOTOR_WEIGHTS.min, MOTOR_WEIGHTS.max),
  )

  return {
    score: final,
    breakdown: {
      base: Math.round(base),
      semReuniao,
      ajustePortao: aPortao,
      ajusteVelocidade: vel.valor,
      ajusteCursoFac: cf.valor,
      cursoFacN: cf.n,
      velocidadeLabel: vel.label,
      final,
    },
  }
}

/** Cor do número de probabilidade (mesma escala usada nos cards do funil). */
export function probColor(score: number): string {
  if (score >= 70) return '#34D399'
  if (score >= 45) return '#FBBF24'
  return '#F87171'
}
