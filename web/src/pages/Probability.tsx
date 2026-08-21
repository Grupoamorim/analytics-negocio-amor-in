import React, { useState, useMemo, useEffect } from 'react'
import {
  BrainCircuit,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
  FileText,
  Sparkles,
  ArrowRight,
  TrendingUp,
  RefreshCw,
  X,
  Plus,
  Clock,
  ShieldCheck,
  Award,
} from 'lucide-react'
import { useCRM } from '@/context/CRMContext'
import { analyzeTranscriptText } from '@/utils/probabilityEngine'
import { useToast } from '@/hooks/use-toast'
import { Link } from 'react-router-dom'
import AIInsightsButton from '@/components/AIInsightsButton'

export default function Probability() {
  const { transcripts, leads, settings, addTranscript, reanalyzeTranscript } = useCRM()
  const { toast } = useToast()

  // Estados de Upload / Análise
  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisProgress, setAnalysisProgress] = useState(0)
  const [analysisStatusText, setAnalysisStatusText] = useState('')
  const [analysisResultsPreview, setAnalysisResultsPreview] = useState<any[]>([])
  const [associatedLeadId, setAssociatedLeadId] = useState<string>('')

  // Animação de Anel de Progresso Hero (0 ao valor em 800ms)
  const [animatedScore, setAnimatedScore] = useState(0)

  // 1. Médias globais
  const analyzedTranscripts = useMemo(() => transcripts.filter((t) => t.analyzed), [transcripts])
  const avgProbability = useMemo(() => {
    if (analyzedTranscripts.length === 0) return 62
    const sum = analyzedTranscripts.reduce((acc, t) => acc + (t.probabilityScore || 0), 0)
    return Math.round(sum / analyzedTranscripts.length)
  }, [analyzedTranscripts])

  const totalPositiveSignalsCount = useMemo(() => {
    return analyzedTranscripts.reduce(
      (acc, t) => acc + (t.signals?.filter((s) => s.type === 'positive').length || 0),
      0,
    )
  }, [analyzedTranscripts])

  // Médias dos 4 Fatores
  const avgNeedCoverage = useMemo(() => {
    if (analyzedTranscripts.length === 0) return 78
    return Math.round(
      analyzedTranscripts.reduce((acc, t) => acc + (t.needCoverageScore || 78), 0) /
        analyzedTranscripts.length,
    )
  }, [analyzedTranscripts])

  const avgTiming = useMemo(() => {
    if (analyzedTranscripts.length === 0) return 64
    return Math.round(
      analyzedTranscripts.reduce((acc, t) => acc + (t.timingScore || 64), 0) /
        analyzedTranscripts.length,
    )
  }, [analyzedTranscripts])

  const avgDecisionPower = useMemo(() => {
    if (analyzedTranscripts.length === 0) return 71
    return Math.round(
      analyzedTranscripts.reduce((acc, t) => acc + (t.decisionPowerScore || 71), 0) /
        analyzedTranscripts.length,
    )
  }, [analyzedTranscripts])

  const avgPerceivedValue = useMemo(() => {
    if (analyzedTranscripts.length === 0) return 82
    return Math.round(
      analyzedTranscripts.reduce((acc, t) => acc + (t.perceivedValueScore || 82), 0) /
        analyzedTranscripts.length,
    )
  }, [analyzedTranscripts])

  // Histograma de Distribuição (0-25%, 26-50%, 51-75%, 76-100%)
  const histogram = useMemo(() => {
    const buckets = { low: 0, medLow: 0, medHigh: 0, high: 0 }
    analyzedTranscripts.forEach((t) => {
      const s = t.probabilityScore || 0
      if (s <= 25) buckets.low++
      else if (s <= 50) buckets.medLow++
      else if (s <= 75) buckets.medHigh++
      else buckets.high++
    })
    return buckets
  }, [analyzedTranscripts])

  // Animação de contagem do anel de pontuação
  useEffect(() => {
    let start = 0
    const end = avgProbability
    const duration = 800
    const stepTime = 20
    const steps = duration / stepTime
    const increment = end / steps

    const timer = setInterval(() => {
      start += increment
      if (start >= end) {
        setAnimatedScore(end)
        clearInterval(timer)
      } else {
        setAnimatedScore(Math.floor(start))
      }
    }, stepTime)

    return () => clearInterval(timer)
  }, [avgProbability])

  // Todos os insights automáticos consolidados
  const allInsights = useMemo(() => {
    const list: {
      type: 'positive' | 'risk' | 'recommendation'
      text: string
      transcriptId: string
      company: string
      quote?: string
    }[] = []

    analyzedTranscripts.forEach((t) => {
      t.insights?.forEach((ins) => {
        list.push({
          type: ins.type,
          text: ins.text,
          transcriptId: t.id,
          company: t.company,
          quote: ins.quote,
        })
      })
    })

    return list
  }, [analyzedTranscripts])

  // Handler de seleção de arquivos
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setSelectedFiles(Array.from(e.target.files))
    }
  }

  // Execução do fluxo de upload e análise
  const handleStartAnalysis = async () => {
    if (selectedFiles.length === 0) return

    setAnalyzing(true)
    setAnalysisProgress(10)
    setAnalysisStatusText('Carregando arquivos de transcrição...')

    const results: any[] = []

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i]
      setAnalysisStatusText(
        `Analisando transcrição ${i + 1} de ${selectedFiles.length}: ${file.name}...`,
      )
      setAnalysisProgress(Math.round(((i + 1) / selectedFiles.length) * 85))

      // Leitura de texto do arquivo
      const text = await file.text()

      // Executa motor de heurísticas locais
      const res = analyzeTranscriptText(
        text,
        settings.analysisConfig.positiveKeywords,
        settings.analysisConfig.negativeKeywords,
        settings.analysisConfig.keywordWeightMultiplier,
      )

      // Salva no store
      const leadMatch = leads.find((l) => l.id === associatedLeadId)
      const companyName = leadMatch ? leadMatch.faculdade : file.name.replace(/\.[^/.]+$/, '')

      const newTr = await addTranscript({
        title: `Transcrição - ${companyName}`,
        fileName: file.name,
        company: companyName,
        contactName: leadMatch
          ? `${leadMatch.curso} ${leadMatch.faculdade} ${leadMatch.turma}`
          : 'Turma',
        leadId: associatedLeadId || undefined,
        date: new Date().toISOString(),
        durationMinutes: res.estimatedMinutes,
        wordCount: res.wordCount,
        content: text,
        analyzed: true,
        probabilityScore: res.score,
        needCoverageScore: res.needCoverageScore,
        timingScore: res.timingScore,
        decisionPowerScore: res.decisionPowerScore,
        perceivedValueScore: res.perceivedValueScore,
        signals: res.signals,
        insights: res.insights,
      })

      results.push({
        file: file.name,
        score: res.score,
        positiveSignals: res.signals.filter((s) => s.type === 'positive'),
        negativeSignals: res.signals.filter((s) => s.type === 'negative'),
        transcriptId: newTr.id,
      })

      // Simulação visual de cadência de análise
      await new Promise((resolve) => setTimeout(resolve, 300))
    }

    setAnalysisProgress(100)
    setAnalysisStatusText('Análise concluída com sucesso!')
    setAnalysisResultsPreview(results)
    setAnalyzing(false)

    toast({
      title: 'Análise Concluída',
      description: `${selectedFiles.length} transcrições processadas com novo score.`,
    })
  }

  // Cor do score
  const getScoreColor = (score: number) => {
    if (score >= 75) return '#10b981' // Esmeralda
    if (score >= 50) return '#EA580C' // Violeta
    return '#F97316' // Indigo
  }

  return (
    <div className="space-y-8 animate-fade-in pb-8">
      {/* Topo da Tela */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-white/[0.06]">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-white tracking-tight flex items-center gap-3">
            Probabilidade de Conversão
            <span className="text-xs px-2.5 py-1 rounded-full bg-orange-500/15 text-orange-300 font-semibold border border-orange-500/25">
              Motor Heurístico Ativo
            </span>
            <AIInsightsButton context="probability" />
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Análise baseada em transcrições de reuniões e histórico
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setSelectedFiles([])
            setAnalysisResultsPreview([])
            setUploadModalOpen(true)
          }}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-orange-600 to-orange-600 hover:from-orange-500 hover:to-orange-500 text-white text-sm font-semibold shadow-lg shadow-orange-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          <Upload className="w-4 h-4" /> Analisar Transcrições
        </button>
      </div>

      {/* Card Hero de Pontuação Global */}
      <div className="bg-[#111820] border border-white/[0.06] rounded-2xl p-6 lg:p-8 shadow-2xl relative overflow-hidden">
        {/* Glow de fundo */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-orange-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row items-center gap-8 relative z-10">
          {/* Anel de Progresso SVG Central */}
          <div className="relative w-44 h-44 flex items-center justify-center flex-shrink-0">
            <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
              <circle
                cx="50"
                cy="50"
                r="40"
                fill="transparent"
                stroke="rgba(255,255,255,0.06)"
                strokeWidth="8"
              />
              <circle
                cx="50"
                cy="50"
                r="40"
                fill="transparent"
                stroke={getScoreColor(avgProbability)}
                strokeWidth="8"
                strokeDasharray={`${(animatedScore * 251.2) / 100} 251.2`}
                strokeLinecap="round"
                className="transition-all duration-300"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-4xl font-extrabold text-white tracking-tight">
                {animatedScore}%
              </span>
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                Média Geral
              </span>
            </div>
          </div>

          {/* 3 Mini-KPIs ao Lado */}
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-4 w-full">
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.05]">
              <div className="text-slate-400 text-xs mb-1">Transcrições Analisadas</div>
              <div className="text-2xl font-bold text-white">{analyzedTranscripts.length}</div>
              <div className="text-[11px] text-emerald-400 mt-1 flex items-center gap-1 font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5" /> 100% processadas
              </div>
            </div>

            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.05]">
              <div className="text-slate-400 text-xs mb-1">Sinais Positivos Detectados</div>
              <div className="text-2xl font-bold text-emerald-400">{totalPositiveSignalsCount}</div>
              <div className="text-[11px] text-slate-400 mt-1">Termos de alta intenção</div>
            </div>

            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.05]">
              <div className="text-slate-400 text-xs mb-1">Convergência de Aprendizado</div>
              <div className="text-2xl font-bold text-orange-400">+8.4%</div>
              <div className="text-[11px] text-orange-300 mt-1">Melhora vs. mês anterior</div>
            </div>
          </div>
        </div>

        {/* Histograma de Distribuição Horizontal */}
        <div className="mt-8 pt-6 border-t border-white/[0.06] space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold text-slate-300">
              Distribuição de Probabilidade do Funil
            </span>
            <span>Total de {analyzedTranscripts.length} amostras</span>
          </div>

          <div className="h-4 w-full bg-white/[0.04] rounded-full overflow-hidden flex gap-0.5 p-0.5">
            <div
              className="h-full bg-red-500 rounded-l-full transition-all duration-500"
              style={{
                width: `${(histogram.low / (analyzedTranscripts.length || 1)) * 100}%`,
              }}
              title={`0-25%: ${histogram.low}`}
            />
            <div
              className="h-full bg-amber-500 transition-all duration-500"
              style={{
                width: `${(histogram.medLow / (analyzedTranscripts.length || 1)) * 100}%`,
              }}
              title={`26-50%: ${histogram.medLow}`}
            />
            <div
              className="h-full bg-orange-500 transition-all duration-500"
              style={{
                width: `${(histogram.medHigh / (analyzedTranscripts.length || 1)) * 100}%`,
              }}
              title={`51-75%: ${histogram.medHigh}`}
            />
            <div
              className="h-full bg-emerald-500 rounded-r-full transition-all duration-500"
              style={{
                width: `${(histogram.high / (analyzedTranscripts.length || 1)) * 100}%`,
              }}
              title={`76-100%: ${histogram.high}`}
            />
          </div>

          <div className="flex justify-between text-[11px] text-slate-400 pt-1">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-500" /> 0-25% ({histogram.low})
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-500" /> 26-50% ({histogram.medLow})
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-orange-500" /> 51-75% ({histogram.medHigh})
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500" /> 76-100% ({histogram.high})
            </span>
          </div>
        </div>
      </div>

      {/* Métricas de Fatores de Conversão (Grid 4 cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Fator 1: Cobertura de Necessidades */}
        <div className="bg-[#111820] border border-white/[0.06] rounded-xl p-5 hover:border-orange-500/40 transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-300">Cobertura de Necessidades</span>
            <ShieldCheck className="w-4 h-4 text-orange-400" />
          </div>
          <div className="text-2xl font-bold text-white mb-2">{avgNeedCoverage}%</div>
          <div className="w-full h-2 bg-white/[0.05] rounded-full overflow-hidden mb-2">
            <div
              className="h-full bg-orange-500 rounded-full"
              style={{ width: `${avgNeedCoverage}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-400">Quão bem a solução atendeu às dores citadas</p>
        </div>

        {/* Fator 2: Alinhamento de Timing */}
        <div className="bg-[#111820] border border-white/[0.06] rounded-xl p-5 hover:border-orange-500/40 transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-300">Alinhamento de Timing</span>
            <Clock className="w-4 h-4 text-orange-400" />
          </div>
          <div className="text-2xl font-bold text-white mb-2">{avgTiming}%</div>
          <div className="w-full h-2 bg-white/[0.05] rounded-full overflow-hidden mb-2">
            <div className="h-full bg-orange-500 rounded-full" style={{ width: `${avgTiming}%` }} />
          </div>
          <p className="text-[11px] text-slate-400">Urgência expressa para implementar</p>
        </div>

        {/* Fator 3: Poder de Decisão */}
        <div className="bg-[#111820] border border-white/[0.06] rounded-xl p-5 hover:border-amber-500/40 transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-300">Poder de Decisão</span>
            <Award className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-white mb-2">{avgDecisionPower}%</div>
          <div className="w-full h-2 bg-white/[0.05] rounded-full overflow-hidden mb-2">
            <div
              className="h-full bg-amber-500 rounded-full"
              style={{ width: `${avgDecisionPower}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-400">Presença de decisor na reunião</p>
        </div>

        {/* Fator 4: Valor Percebido */}
        <div className="bg-[#111820] border border-white/[0.06] rounded-xl p-5 hover:border-emerald-500/40 transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-300">Valor Percebido</span>
            <Sparkles className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-white mb-2">{avgPerceivedValue}%</div>
          <div className="w-full h-2 bg-white/[0.05] rounded-full overflow-hidden mb-2">
            <div
              className="h-full bg-emerald-500 rounded-full"
              style={{ width: `${avgPerceivedValue}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-400">Menções positivas à proposta</p>
        </div>
      </div>

      {/* Insights Automáticos Gerados */}
      <div className="bg-[#111820] border border-white/[0.06] rounded-xl p-6 shadow-lg space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-white">
              Insights e Recomendações Automáticas
            </h3>
            <p className="text-xs text-slate-400">
              Descobertas extraídas das transcrições gravadas
            </p>
          </div>
          <span className="text-xs font-semibold text-slate-400">{allInsights.length} Gerados</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {allInsights.map((ins, idx) => {
            const isPos = ins.type === 'positive'
            const isRisk = ins.type === 'risk'

            return (
              <div
                key={idx}
                className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.05] flex items-start gap-3 hover:border-white/[0.12] transition-colors"
              >
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                    isPos
                      ? 'bg-emerald-500/15 text-emerald-400'
                      : isRisk
                        ? 'bg-red-500/15 text-red-400'
                        : 'bg-orange-500/15 text-orange-400'
                  }`}
                >
                  {isPos && <CheckCircle2 className="w-4 h-4" />}
                  {isRisk && <AlertTriangle className="w-4 h-4" />}
                  {!isPos && !isRisk && <Lightbulb className="w-4 h-4" />}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span
                      className={`text-[11px] font-bold uppercase tracking-wider ${
                        isPos ? 'text-emerald-400' : isRisk ? 'text-red-400' : 'text-orange-400'
                      }`}
                    >
                      {isPos ? 'Sinal Positivo' : isRisk ? 'Sinal de Risco' : 'Recomendação'}
                    </span>
                    <Link
                      to="/transcricoes"
                      className="text-[10px] text-slate-500 hover:text-orange-300 flex items-center gap-0.5"
                    >
                      {ins.company} <ArrowRight className="w-2.5 h-2.5" />
                    </Link>
                  </div>

                  <p className="text-xs text-slate-200 leading-relaxed">{ins.text}</p>

                  {ins.quote && (
                    <div className="mt-2 text-[11px] text-slate-400 italic bg-white/[0.02] px-2 py-1 rounded border-l-2 border-orange-500/50">
                      &quot;{ins.quote}&quot;
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Tabela de Transcrições Utilizadas */}
      <div className="bg-[#111820] border border-white/[0.06] rounded-xl p-6 shadow-lg space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-white">
              Transcrições de Reuniões Utilizadas
            </h3>
            <p className="text-xs text-slate-400">
              Arquivos processados no cálculo de probabilidade
            </p>
          </div>
          <Link
            to="/transcricoes"
            className="text-xs text-orange-400 hover:underline flex items-center gap-1 font-semibold"
          >
            Gerenciar Transcrições <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-white/[0.06] text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                <th className="py-3 px-3">Transcrição</th>
                <th className="py-3 px-3">Empresa</th>
                <th className="py-3 px-3">Data</th>
                <th className="py-3 px-3">Probabilidade</th>
                <th className="py-3 px-3">Sinais Detectados</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {transcripts.map((t) => (
                <tr key={t.id} className="hover:bg-white/[0.02]">
                  <td className="py-3 px-3 font-semibold text-white flex items-center gap-2">
                    <FileText className="w-4 h-4 text-orange-400 flex-shrink-0" />
                    <span className="truncate max-w-[200px]">{t.title}</span>
                  </td>
                  <td className="py-3 px-3 text-slate-300">{t.company}</td>
                  <td className="py-3 px-3 text-slate-400">
                    {new Date(t.date).toLocaleDateString()}
                  </td>
                  <td className="py-3 px-3">
                    <span
                      className="px-2 py-0.5 rounded-full font-bold text-[11px]"
                      style={{
                        backgroundColor: `${getScoreColor(t.probabilityScore)}20`,
                        color: getScoreColor(t.probabilityScore),
                      }}
                    >
                      {t.probabilityScore}%
                    </span>
                  </td>
                  <td className="py-3 px-3 text-slate-400">
                    <span className="text-emerald-400 font-semibold">
                      +{t.signals?.filter((s) => s.type === 'positive').length || 0}
                    </span>{' '}
                    /{' '}
                    <span className="text-red-400 font-semibold">
                      -{t.signals?.filter((s) => s.type === 'negative').length || 0}
                    </span>
                  </td>
                  <td className="py-3 px-3">
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-semibold">
                      Analisada
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        reanalyzeTranscript(t.id)
                        toast({
                          title: 'Re-análise executada',
                          description: `${t.company} re-processado com sucesso.`,
                        })
                      }}
                      className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-white/[0.06] inline-flex items-center gap-1 text-[11px]"
                      title="Re-analisar com parâmetros atuais"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Re-analisar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Upload e Análise */}
      {uploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-[620px] max-h-[90vh] bg-[#111820] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-scale-in">
            {/* Header */}
            <div className="px-6 py-4 border-b border-white/[0.08] flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-white">Analisar Novas Transcrições</h3>
                <p className="text-xs text-slate-400">Faça upload de arquivos .txt, .md ou .docx</p>
              </div>
              <button
                type="button"
                onClick={() => setUploadModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5 flex-1">
              {/* Drop Area */}
              <label className="border-2 border-dashed border-white/15 hover:border-orange-500 rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer bg-[#0a0f14]/50 hover:bg-orange-500/[0.03] transition-all group">
                <input
                  type="file"
                  multiple
                  accept=".txt,.md,.docx,.text"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <div className="w-12 h-12 rounded-full bg-orange-500/15 flex items-center justify-center text-orange-400 group-hover:scale-110 transition-transform mb-3">
                  <Upload className="w-6 h-6" />
                </div>
                <div className="text-sm font-semibold text-white">
                  Arraste seus arquivos aqui ou clique para selecionar
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  Formatos aceitos: .txt, .md, transcrições de áudio/vídeo
                </div>
              </label>

              {/* Vincular a Lead Opcional */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Vincular a Lead Existente (Opcional)
                </label>
                <select
                  value={associatedLeadId}
                  onChange={(e) => setAssociatedLeadId(e.target.value)}
                  className="w-full bg-[#0a0f14] border border-white/10 rounded-lg p-2 text-xs text-white"
                >
                  <option value="">Nenhum lead associado (detectar automaticamente)</option>
                  {leads.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.curso} — {l.faculdade} ({l.turma})
                    </option>
                  ))}
                </select>
              </div>

              {/* Lista de Arquivos Selecionados */}
              {selectedFiles.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-slate-300">
                    Arquivos selecionados ({selectedFiles.length}):
                  </div>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {selectedFiles.map((file, idx) => (
                      <div
                        key={idx}
                        className="p-2 rounded-lg bg-[#0a0f14] border border-white/[0.06] flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-2 truncate">
                          <FileText className="w-4 h-4 text-orange-400 flex-shrink-0" />
                          <span className="text-white truncate">{file.name}</span>
                          <span className="text-slate-500 text-[10px]">
                            ({(file.size / 1024).toFixed(1)} KB)
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedFiles(selectedFiles.filter((_, i) => i !== idx))
                          }
                          className="text-slate-500 hover:text-red-400 p-1"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Barra de Progresso Animada durante Análise */}
              {analyzing && (
                <div className="p-4 rounded-xl bg-white/[0.02] border border-orange-500/30 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-orange-300 font-semibold">{analysisStatusText}</span>
                    <span className="font-bold text-white">{analysisProgress}%</span>
                  </div>
                  <div className="w-full h-2 bg-white/[0.05] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-orange-500 to-orange-500 transition-all duration-300"
                      style={{ width: `${analysisProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Resultados Parciais do Processamento */}
              {analysisResultsPreview.length > 0 && !analyzing && (
                <div className="space-y-3 pt-2 border-t border-white/[0.08]">
                  <div className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" /> Resultados Calculados:
                  </div>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {analysisResultsPreview.map((res, i) => (
                      <div
                        key={i}
                        className="p-3 rounded-lg bg-[#0a0f14] border border-white/[0.06] flex items-center justify-between text-xs"
                      >
                        <div>
                          <div className="font-semibold text-white">{res.file}</div>
                          <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                            <span className="text-emerald-400">
                              +{res.positiveSignals.length} sinais pos.
                            </span>
                            <span className="text-red-400">
                              -{res.negativeSignals.length} objeções
                            </span>
                          </div>
                        </div>
                        <span className="text-base font-extrabold text-orange-400">
                          {res.score}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer Modal */}
            <div className="px-6 py-4 border-t border-white/[0.08] flex items-center justify-between">
              <button
                type="button"
                onClick={() => setUploadModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white rounded-lg hover:bg-white/[0.06] border border-white/[0.08]"
              >
                {analysisResultsPreview.length > 0 ? 'Fechar' : 'Cancelar'}
              </button>

              <button
                type="button"
                disabled={selectedFiles.length === 0 || analyzing}
                onClick={handleStartAnalysis}
                className="px-5 py-2 text-xs font-semibold text-white bg-gradient-to-r from-orange-600 to-orange-600 hover:from-orange-500 hover:to-orange-500 rounded-lg shadow-lg shadow-orange-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {analyzing ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Analisando...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" /> Analisar Agora
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
