import { AnalysisKeyword, Transcript, TranscriptSignal } from '@/types/crm'

export interface AnalysisResult {
  score: number
  needCoverageScore: number
  timingScore: number
  decisionPowerScore: number
  perceivedValueScore: number
  signals: TranscriptSignal[]
  insights: {
    type: 'positive' | 'risk' | 'recommendation'
    text: string
    quote?: string
  }[]
  wordCount: number
  estimatedMinutes: number
}

// Normaliza texto para busca insensível a acentos e maiúsculas
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

/**
 * Analisador determinístico de transcrições baseado em heurísticas locais
 */
export function analyzeTranscriptText(
  rawText: string,
  positiveKeywords: AnalysisKeyword[],
  negativeKeywords: AnalysisKeyword[],
  weightMultiplier = 80,
): AnalysisResult {
  const normalizedContent = normalizeText(rawText)
  const words = rawText.trim().split(/\s+/).filter(Boolean)
  const wordCount = words.length
  const estimatedMinutes = Math.max(1, Math.round(wordCount / 120))

  const detectedSignals: TranscriptSignal[] = []
  let totalPositiveScore = 0
  let totalNegativeScore = 0

  // 1. Detecção de palavras-chave positivas
  positiveKeywords.forEach((kw) => {
    const normalizedKw = normalizeText(kw.word)
    if (normalizedContent.includes(normalizedKw)) {
      // Procura a frase/sentença onde a palavra aparece
      const sentences = rawText.split(/[.\n!?]/)
      const matchingSentence =
        sentences.find((s) => normalizeText(s).includes(normalizedKw))?.trim() || kw.word

      detectedSignals.push({
        text:
          matchingSentence.length > 80
            ? matchingSentence.substring(0, 77) + '...'
            : matchingSentence,
        type: 'positive',
        weight: kw.weight,
        explanation: `Menção a termo de alta intenção: "${kw.word}"`,
      })
      totalPositiveScore += kw.weight * 10
    }
  })

  // 2. Detecção de palavras-chave negativas
  negativeKeywords.forEach((kw) => {
    const normalizedKw = normalizeText(kw.word)
    if (normalizedContent.includes(normalizedKw)) {
      const sentences = rawText.split(/[.\n!?]/)
      const matchingSentence =
        sentences.find((s) => normalizeText(s).includes(normalizedKw))?.trim() || kw.word

      detectedSignals.push({
        text:
          matchingSentence.length > 80
            ? matchingSentence.substring(0, 77) + '...'
            : matchingSentence,
        type: 'negative',
        weight: kw.weight,
        explanation: `Sinal de objeção/hesitação: "${kw.word}"`,
      })
      totalNegativeScore += kw.weight * 12
    }
  })

  // 3. Padrões de perguntas do cliente (indica interesse ativo)
  const clientQuestions = (rawText.match(/Cliente:.*?\?/gi) || []).length
  if (clientQuestions >= 2) {
    totalPositiveScore += clientQuestions * 6
    detectedSignals.push({
      text: `${clientQuestions} perguntas feitas pelo cliente`,
      type: 'positive',
      weight: 3,
      explanation: 'Alto nível de engajamento e curiosidade técnica',
    })
  }

  // 4. Cálculo de probabilidade equilibrada com base no peso global
  const scale = weightMultiplier / 100
  let baseScore = 50

  if (totalPositiveScore === 0 && totalNegativeScore === 0) {
    baseScore = 45
  } else {
    const diff = (totalPositiveScore - totalNegativeScore) * scale
    baseScore = Math.min(98, Math.max(12, Math.round(50 + diff * 0.7)))
  }

  // 5. Cálculo dos 4 fatores
  const hasTimingKeywords = /urgente|hoje em dia|cronograma|esse mes|rapido/i.test(rawText)
  const hasTimingDelay = /depois|proximo trimestre|ano que vem|vamos ver/i.test(rawText)
  const timingScore = Math.min(
    95,
    Math.max(
      20,
      Math.round(
        50 + (hasTimingKeywords ? 30 : 0) - (hasTimingDelay ? 30 : 0) + (baseScore - 50) * 0.2,
      ),
    ),
  )

  const hasDecisionMakers = /diretoria|decisor|comite|aprova|eu aprovo|sou o responsavel/i.test(
    rawText,
  )
  const hasNoAuthority = /sem autoridade|preciso pedir|nao decido/i.test(rawText)
  const decisionPowerScore = Math.min(
    95,
    Math.max(
      25,
      Math.round(
        55 + (hasDecisionMakers ? 30 : 0) - (hasNoAuthority ? 30 : 0) + (baseScore - 50) * 0.15,
      ),
    ),
  )

  const hasNeedsExpressed = /dor|precisamos|desafio|problema|perda de leads/i.test(rawText)
  const needCoverageScore = Math.min(
    96,
    Math.max(30, Math.round(55 + (hasNeedsExpressed ? 28 : 0) + (baseScore - 50) * 0.2)),
  )

  const hasValuePositive = /excelente|maravilha|superou|gostei|perfeito|fechar/i.test(rawText)
  const hasValueNegative = /caro|fora da realidade|nao vale/i.test(rawText)
  const perceivedValueScore = Math.min(
    98,
    Math.max(
      15,
      Math.round(
        50 + (hasValuePositive ? 32 : 0) - (hasValueNegative ? 35 : 0) + (baseScore - 50) * 0.2,
      ),
    ),
  )

  // 6. Geração de insights estruturados
  const insights: AnalysisResult['insights'] = []

  if (baseScore >= 70) {
    insights.push({
      type: 'positive',
      text: 'Forte alinhamento com a proposta de valor e alta probabilidade de fechamento no ciclo estimado.',
    })
  } else if (baseScore < 45) {
    insights.push({
      type: 'risk',
      text: 'Hesitação detectada em torno de prioridade e orçamento. Risco de estagnação no funil.',
    })
  }

  if (hasTimingKeywords) {
    insights.push({
      type: 'positive',
      text: 'Cliente demonstrou senso de urgência favorável a uma tomada de decisão rápida.',
    })
  }

  if (hasTimingDelay) {
    insights.push({
      type: 'risk',
      text: 'Sinais de adiamento para ciclos futuros. Recomendado estruturar incentivo de fechamento no mês atual.',
    })
  }

  if (hasValueNegative || detectedSignals.some((s) => s.text.toLowerCase().includes('caro'))) {
    insights.push({
      type: 'risk',
      text: 'Objeção explícita sobre custo/preço. Recomendado reforçar ROI e economia operacional com casos de sucesso.',
    })
  }

  insights.push({
    type: 'recommendation',
    text:
      baseScore > 65
        ? 'Agendar reunião com tomadores de decisão e enviar minuta de proposta com opções de prazo.'
        : 'Efetuar follow-up focado na quantificação das dores operacionais do cliente antes de enviar nova cotação.',
  })

  return {
    score: baseScore,
    needCoverageScore,
    timingScore,
    decisionPowerScore,
    perceivedValueScore,
    signals: detectedSignals,
    insights,
    wordCount,
    estimatedMinutes,
  }
}
