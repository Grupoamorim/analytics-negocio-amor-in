/**
 * Motor de probabilidade ÚNICA de fechamento de uma turma.
 *
 * Regras de ouro (definidas com o Lucas):
 *
 *   1. A probabilidade SÓ começa a valer depois que o item "Qualificação do
 *      Contato" do checklist é marcado (ou a turma já está numa fase que
 *      pressupõe isso — Reunião Comissão em diante). Antes disso: "—".
 *   2. Sem transcrição/gravação de reunião analisada NÃO existe número — é ela
 *      que mede se a turma quer. Antes da primeira reunião analisada: "—".
 *   3. Quando há número, PELO MENOS 90% do peso vem da transcrição (`base`).
 *      O funil só TEMPERA de leve (no máximo ±1/9 da base, e nunca mais que
 *      ±8 pontos no total): portão de fase vencido, velocidade/estagnação na
 *      coluna e taxa histórica do curso/faculdade (só com amostra >= 8).
 *
 * `final = clamp(base + tempero, 3, 99)`, com `|tempero| <= min(8, base/9)`.
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

/** Id do item de checklist "Qualificação do Contato" (2º item da etapa Qualificação/Contato). */
export const QUALIFICACAO_CHECKLIST_ID = 'stage-2-1'

/** Pesos fixos do motor. Propositalmente pequenos — a transcrição é que manda. */
export const MOTOR_WEIGHTS = {
  /**
   * Bônus por portão vencido (transição ENTRE estágios consecutivos), pela ordem
   * das fases. Índice i = bônus por ter saído do estágio i para o i+1.
   * Tudo minúsculo: a coluna é um "falta fazer", não uma conquista, e o que
   * importa de verdade (a reunião) já está na base.
   */
  portao: {
    'stage-1->stage-2': 0,
    'stage-2->stage-3': 1,
    'stage-3->stage-4': 1,
    'stage-4->stage-5': 2,
  } as Record<string, number>,
  /** Teto do bônus acumulado de portões. */
  portaoMax: 4,
  /** Ajuste por velocidade na coluna atual, por faixa de (dias / alerta de estagnação). */
  velocidade: {
    rapida: 2, // ratio <= 0.5
    saudavel: 0, // 0.5 < ratio <= 1.0
    lenta: -2, // 1.0 < ratio <= 2.0
    estagnada: -5, // ratio > 2.0
  },
  /** Efeito máximo (para cima ou para baixo) da taxa de fechamento do curso/faculdade. */
  cursoFacMax: 2,
  /** N de turmas resolvidas a partir do qual o efeito curso/faculdade fica "cheio". */
  cursoFacNParaConfiancaTotal: 15,
  /** Teto ABSOLUTO do tempero somado (o funil nunca mexe mais que isso). */
  temperoMax: 8,
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

/** N máximo de reuniões (as mais recentes) que entram na média da base. */
export const MAX_REUNIOES_NA_MEDIA = 4

/**
 * Média da probabilidade das reuniões analisadas de uma turma — até as
 * `MAX_REUNIOES_NA_MEDIA` mais recentes (por data). Comissão, turma, turma B,
 * matutino/noturno: cada gravação analisada conta igual. Devolve também
 * quantas reuniões entraram na conta.
 */
export function mediaTranscriptProbabilidade(
  transcripts?: Array<Transcript | null> | null,
): { media: number; n: number } | undefined {
  if (!transcripts || transcripts.length === 0) return undefined
  const ordenadas = [...transcripts]
    .filter((t): t is Transcript => !!t)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, MAX_REUNIOES_NA_MEDIA)
  const probs = ordenadas
    .map((t) => transcriptProbabilidade(t))
    .filter((p): p is number => typeof p === 'number')
  if (probs.length === 0) return undefined
  return { media: probs.reduce((s, p) => s + p, 0) / probs.length, n: probs.length }
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

/** Turma "qualificada": item de checklist marcado OU já numa fase que pressupõe isso. */
function estaQualificado(deal: Deal, stageIdx: number): boolean {
  if (deal.checklist?.[QUALIFICACAO_CHECKLIST_ID] === true) return true
  // Reunião Comissão (stage-3) em diante: a qualificação já aconteceu por definição.
  return stageIdx >= 2
}

function naoAvaliavel(motivo: string, semReuniao: boolean): { score: number; breakdown: ProbBreakdown } {
  return {
    score: 0,
    breakdown: {
      base: 0,
      semReuniao,
      naoAvaliavel: true,
      motivo,
      ajustePortao: 0,
      ajusteVelocidade: 0,
      ajusteCursoFac: 0,
      cursoFacN: 0,
      velocidadeLabel: 'saudável',
      final: 0,
    },
  }
}

export interface ComputeArgs {
  deal: Deal
  latestTranscript?: Transcript | null
  /** Todas as reuniões analisadas da turma. Quando presente, a base vira a MÉDIA das até 4 mais recentes. */
  transcripts?: Array<Transcript | null> | null
  /** Taxa de fechamento do recorte mais específico disponível (curso+faculdade > curso > faculdade). */
  cursoFacRate?: CursoFacRate | null
}

/**
 * Calcula a probabilidade única de fechamento da turma e devolve o "porquê".
 */
export function computeDealProbability({
  deal,
  latestTranscript,
  transcripts,
  cursoFacRate,
}: ComputeArgs): { score: number; breakdown: ProbBreakdown } {
  // A base é a MÉDIA das até 4 reuniões analisadas mais recentes da turma
  // (comissão + turma + turma B + matutino/noturno contam igual). Sem lista,
  // cai pro comportamento antigo (só a reunião mais recente).
  const media = mediaTranscriptProbabilidade(transcripts)
  const stageId = deal.stageId || 'stage-1'
  const stageIdx = STAGE_ORDER.indexOf(stageId)
  const stageMeta = FUNNEL_STAGE_BY_ID[stageId] || FUNNEL_STAGES[0]

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

  const tProb = media ? media.media : transcriptProbabilidade(latestTranscript)
  const amostraReunioes = media ? media.n : latestTranscript && tProb !== undefined ? 1 : 0
  const semReuniao = tProb === undefined

  // Portão 1: só conta a partir da Qualificação do Contato marcada.
  if (!estaQualificado(deal, stageIdx)) {
    return naoAvaliavel('Marque "Qualificação do Contato" no checklist', semReuniao)
  }

  // Portão 2: sem reunião/gravação analisada não há como estimar (é ela que
  // carrega 90%+ do peso).
  if (semReuniao) {
    return naoAvaliavel('Aguardando reunião/gravação analisada', true)
  }

  // A partir daqui: qualificada E com transcrição. A transcrição é a base.
  const base = tProb as number

  const aPortao = bonusPortao(stageId)
  // Turma "sem resposta" (sumiu): trata como estagnada, independente do relógio.
  const vel = deal.semResposta
    ? { valor: MOTOR_WEIGHTS.velocidade.estagnada, label: 'sem resposta' }
    : ajusteVelocidade(deal, stageMeta)
  const cf = ajusteCursoFac(cursoFacRate)

  // O funil só tempera: no máx. ±8 e nunca mais que ~1/9 da base (garante que
  // pelo menos 90% do número vem da transcrição). Se estourar, encolhe os 3
  // ajustes proporcionalmente pra o "porquê" continuar somando certo.
  const bruto = aPortao + vel.valor + cf.valor
  const teto = Math.min(MOTOR_WEIGHTS.temperoMax, Math.floor(base / 9))
  let pPortao = aPortao
  let pVel = vel.valor
  let pCf = cf.valor
  if (bruto !== 0 && Math.abs(bruto) > teto) {
    const k = teto / Math.abs(bruto)
    pPortao = Math.round(aPortao * k)
    pVel = Math.round(vel.valor * k)
    pCf = Math.round(cf.valor * k)
  }
  const tempero = pPortao + pVel + pCf

  const final = Math.round(clamp(base + tempero, MOTOR_WEIGHTS.min, MOTOR_WEIGHTS.max))

  return {
    score: final,
    breakdown: {
      base: Math.round(base),
      amostraReunioes,
      semReuniao: false,
      ajustePortao: pPortao,
      ajusteVelocidade: pVel,
      ajusteCursoFac: pCf,
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
