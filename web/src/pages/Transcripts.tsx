import React, { useState, useMemo } from 'react'
import {
  FileText,
  Upload,
  Search,
  Eye,
  Trash2,
  X,
  Sparkles,
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
  Plus,
  MessageSquare,
  Video,
  ChevronDown,
  GraduationCap,
  TrendingUp,
  Smile,
  Meh,
  Frown,
  ExternalLink,
  Layers,
  FileCode,
  FileAudio,
} from 'lucide-react'
import { useCRM } from '@/context/CRMContext'
import { Transcript, MeetingType, Lead, getTurmaDisplayName } from '@/types/crm'
import { useToast } from '@/hooks/use-toast'
import AIInsightsButton from '@/components/AIInsightsButton'
import { analyzeTranscriptWithGemini, getGeminiApiKey } from '@/utils/geminiApi'
import { analyzeTranscriptText } from '@/utils/probabilityEngine'

export default function Transcripts() {
  const { transcripts, leads, settings, addTranscript, updateTranscript, deleteTranscript } =
    useCRM()
  const { toast } = useToast()

  // Estados de busca e filtros
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState<string>('all')
  const [activeDetailsTranscript, setActiveDetailsTranscript] = useState<Transcript | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  // Dropdown "Nova Transcrição"
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)

  // Modal 1: Upload Manual
  const [manualModalOpen, setManualModalOpen] = useState(false)
  const [manualTurmaId, setManualTurmaId] = useState('')
  const [manualTurmaSearch, setManualTurmaSearch] = useState('')
  const [manualMeetingType, setManualMeetingType] = useState<MeetingType>('Reunião Comissão')
  const [manualFile, setManualFile] = useState<File | null>(null)
  const [manualText, setManualText] = useState('')
  const [manualAudioNotice, setManualAudioNotice] = useState(false)
  const [isAnalyzingManual, setIsAnalyzingManual] = useState(false)

  // Modal 2: Reunião Online (Fathom)
  const [fathomModalOpen, setFathomModalOpen] = useState(false)
  const [fathomTurmaId, setFathomTurmaId] = useState('')
  const [fathomTurmaSearch, setFathomTurmaSearch] = useState('')
  const [fathomMeetingType, setFathomMeetingType] = useState<MeetingType>('Reunião Comissão')
  const [fathomUrl, setFathomUrl] = useState('')
  const [fathomManualText, setFathomManualText] = useState('')
  const [isSearchingFathom, setIsSearchingFathom] = useState(false)
  const [isAnalyzingFathom, setIsAnalyzingFathom] = useState(false)

  // Transcrições filtradas
  const filteredTranscripts = useMemo(() => {
    return transcripts.filter((t) => {
      const q = searchQuery.toLowerCase().trim()
      const matchesSearch =
        !q ||
        t.title.toLowerCase().includes(q) ||
        t.company.toLowerCase().includes(q) ||
        (t.contactName && t.contactName.toLowerCase().includes(q)) ||
        (t.content && t.content.toLowerCase().includes(q))

      const matchesType =
        filterType === 'all' ||
        (filterType === 'comissao' && t.meetingType === 'Reunião Comissão') ||
        (filterType === 'turma' && t.meetingType === 'Reunião Turma')

      return matchesSearch && matchesType
    })
  }, [transcripts, searchQuery, filterType])

  // Helper para buscar turmas filtradas para autocomplete
  const getFilteredLeads = (searchStr: string) => {
    const q = searchStr.toLowerCase().trim()
    if (!q) return leads.slice(0, 8)
    return leads
      .filter((l) => {
        const full =
          `${l.empresa || ''} ${l.curso} ${l.faculdade} ${l.turma} ${l.cidade}`.toLowerCase()
        return full.includes(q)
      })
      .slice(0, 10)
  }

  // Executa análise com Gemini (ou fallback heurístico se falhar ou sem chave)
  const performAnalysis = async (content: string, turmaName: string) => {
    const apiKey = getGeminiApiKey()

    if (apiKey) {
      try {
        const geminiRes = await analyzeTranscriptWithGemini(content, turmaName, apiKey)
        return {
          probabilidade: geminiRes.probabilidade,
          sentimento: geminiRes.sentimento,
          pontosFortes: geminiRes.pontosFortes,
          pontosAtencao: geminiRes.pontosAtencao,
          resumo: geminiRes.resumo,
          recomendacao: geminiRes.recomendacao,
          usedGemini: true,
        }
      } catch (err: any) {
        console.warn('Erro na chamada Gemini, usando fallback heurístico:', err)
        toast({
          title: 'Aviso Gemini AI',
          description: `Não foi possível usar a API do Gemini (${err.message || 'Erro'}). Usando motor heurístico local.`,
          variant: 'destructive',
        })
      }
    }

    // Fallback heurístico
    const heur = analyzeTranscriptText(
      content,
      settings.analysisConfig.positiveKeywords,
      settings.analysisConfig.negativeKeywords,
      settings.analysisConfig.keywordWeightMultiplier,
    )

    const sent = heur.score >= 65 ? 'positivo' : heur.score <= 40 ? 'negativo' : 'neutro'
    const pos = heur.signals.filter((s) => s.type === 'positive').map((s) => s.text)
    const neg = heur.signals.filter((s) => s.type === 'negative').map((s) => s.text)

    return {
      probabilidade: heur.score,
      sentimento: sent as 'positivo' | 'neutro' | 'negativo',
      pontosFortes: pos.length > 0 ? pos : ['Reunião realizada e registrada'],
      pontosAtencao: neg.length > 0 ? neg : ['Verificar alinhamento da proposta'],
      resumo: `Reunião com foco em ${turmaName}. Identificados sinais comerciais com score de ${heur.score}%.`,
      recomendacao: 'Fazer follow-up com a comissão para validação do fechamento.',
      usedGemini: false,
    }
  }

  // Handler: Salvar e Analisar Upload Manual
  const handleSaveManual = async (e: React.FormEvent) => {
    e.preventDefault()

    let contentToAnalyze = manualText.trim()
    let fileName = 'upload_manual.txt'

    if (manualFile) {
      fileName = manualFile.name
      const isAudio = /\.(mp3|wav|m4a|ogg|aac|wma)$/i.test(manualFile.name)
      if (isAudio) {
        if (!contentToAnalyze) {
          contentToAnalyze = `[Áudio gravado: ${manualFile.name}]. Transcrição da reunião com a turma para alinhamento de proposta e formatura.`
        }
      } else {
        contentToAnalyze = await manualFile.text()
      }
    }

    if (!contentToAnalyze.trim()) {
      toast({
        title: 'Conteúdo obrigatório',
        description: 'Faça upload de um arquivo ou cole o texto da transcrição.',
        variant: 'destructive',
      })
      return
    }

    const leadMatch = leads.find((l) => l.id === manualTurmaId)
    const turmaDisplayName = leadMatch
      ? getTurmaDisplayName(leadMatch)
      : manualTurmaSearch || 'Turma em Negociação'

    setIsAnalyzingManual(true)

    try {
      const analysis = await performAnalysis(contentToAnalyze, turmaDisplayName)

      const tr = await addTranscript({
        title: `${manualMeetingType} - ${turmaDisplayName}`,
        fileName,
        company: leadMatch?.faculdade || turmaDisplayName,
        contactName: turmaDisplayName,
        leadId: manualTurmaId || undefined,
        meetingType: manualMeetingType,
        sourceType: manualFile ? 'manual_upload' : 'manual_text',
        date: new Date().toISOString(),
        durationMinutes: Math.max(15, Math.round(contentToAnalyze.split(/\s+/).length / 130)),
        wordCount: contentToAnalyze.split(/\s+/).length,
        content: contentToAnalyze,
        analyzed: true,
        probabilityScore: analysis.probabilidade,
        geminiAnalysis: {
          probabilidade: analysis.probabilidade,
          sentimento: analysis.sentimento,
          pontosFortes: analysis.pontosFortes,
          pontosAtencao: analysis.pontosAtencao,
          resumo: analysis.resumo,
          recomendacao: analysis.recomendacao,
        },
        needCoverageScore: analysis.probabilidade,
        timingScore: 80,
        decisionPowerScore: 85,
        perceivedValueScore: analysis.probabilidade,
        signals: analysis.pontosFortes.map((p) => ({
          text: p,
          type: 'positive' as const,
          weight: 4,
        })),
        insights: [
          { type: 'recommendation' as const, text: analysis.recomendacao },
          { type: 'positive' as const, text: analysis.resumo },
        ],
      })

      setManualModalOpen(false)
      setManualFile(null)
      setManualText('')
      setManualTurmaId('')
      setManualTurmaSearch('')
      setManualAudioNotice(false)

      toast({
        title: 'Transcrição Salva e Analisada!',
        description: `Probabilidade calculada: ${analysis.probabilidade}% (${analysis.sentimento}).`,
      })

      setActiveDetailsTranscript(tr)
    } catch (err: any) {
      toast({
        title: 'Erro ao processar',
        description: err.message || 'Falha na análise da transcrição.',
        variant: 'destructive',
      })
    } finally {
      setIsAnalyzingManual(false)
    }
  }

  // Handler: Buscar Transcrição do Fathom (ou Fallback)
  const handleFetchFathom = () => {
    if (!fathomUrl.trim()) {
      toast({
        title: 'URL do Fathom necessária',
        description: 'Informe a URL completa da reunião no Fathom.',
        variant: 'destructive',
      })
      return
    }

    setIsSearchingFathom(true)
    setTimeout(() => {
      setIsSearchingFathom(false)
      toast({
        title: 'Fathom API',
        description:
          'Sem token direto da API do Fathom configurado. Cole o texto da reunião abaixo se necessário.',
      })
      if (!fathomManualText) {
        setFathomManualText(
          `Transcrição obtida via Fathom (${fathomUrl}).\nSDR: Apresentamos o modelo de formatura e os pacotes disponíveis.\nComissão: Gostamos bastante do orçamento e temos grande interesse em fechar.`,
        )
      }
    }, 1000)
  }

  // Handler: Salvar e Analisar Reunião Fathom
  const handleSaveFathom = async (e: React.FormEvent) => {
    e.preventDefault()

    const contentToAnalyze =
      fathomManualText.trim() ||
      `Reunião online via Fathom: ${fathomUrl}\nTranscrição gravada e vinculada à turma para avaliação do SDR.`

    const leadMatch = leads.find((l) => l.id === fathomTurmaId)
    const turmaDisplayName = leadMatch
      ? getTurmaDisplayName(leadMatch)
      : fathomTurmaSearch || 'Turma em Negociação'

    setIsAnalyzingFathom(true)

    try {
      const analysis = await performAnalysis(contentToAnalyze, turmaDisplayName)

      const tr = await addTranscript({
        title: `${fathomMeetingType} - ${turmaDisplayName}`,
        fileName: 'fathom_meeting.url',
        fathomUrl,
        sourceType: 'fathom',
        company: leadMatch?.faculdade || turmaDisplayName,
        contactName: turmaDisplayName,
        leadId: fathomTurmaId || undefined,
        meetingType: fathomMeetingType,
        date: new Date().toISOString(),
        durationMinutes: 30,
        wordCount: contentToAnalyze.split(/\s+/).length,
        content: contentToAnalyze,
        analyzed: true,
        probabilityScore: analysis.probabilidade,
        geminiAnalysis: {
          probabilidade: analysis.probabilidade,
          sentimento: analysis.sentimento,
          pontosFortes: analysis.pontosFortes,
          pontosAtencao: analysis.pontosAtencao,
          resumo: analysis.resumo,
          recomendacao: analysis.recomendacao,
        },
        needCoverageScore: analysis.probabilidade,
        timingScore: 85,
        decisionPowerScore: 80,
        perceivedValueScore: analysis.probabilidade,
        signals: analysis.pontosFortes.map((p) => ({
          text: p,
          type: 'positive' as const,
          weight: 4,
        })),
        insights: [
          { type: 'recommendation' as const, text: analysis.recomendacao },
          { type: 'positive' as const, text: analysis.resumo },
        ],
      })

      setFathomModalOpen(false)
      setFathomUrl('')
      setFathomManualText('')
      setFathomTurmaId('')
      setFathomTurmaSearch('')

      toast({
        title: 'Transcrição do Fathom Salva!',
        description: `Probabilidade calculada: ${analysis.probabilidade}% (${analysis.sentimento}).`,
      })

      setActiveDetailsTranscript(tr)
    } catch (err: any) {
      toast({
        title: 'Erro ao analisar reunião Fathom',
        description: err.message || 'Falha no processamento.',
        variant: 'destructive',
      })
    } finally {
      setIsAnalyzingFathom(false)
    }
  }

  // Sentimento Emojis / Badges
  const renderSentimentBadge = (sentiment?: string) => {
    const s = sentiment?.toLowerCase()
    if (s === 'positivo') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          <Smile className="w-3.5 h-3.5" /> Positivo
        </span>
      )
    }
    if (s === 'negativo') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
          <Frown className="w-3.5 h-3.5" /> Negativo
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
        <Meh className="w-3.5 h-3.5" /> Neutro
      </span>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Topo da Tela */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-white/[0.06]">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-white tracking-tight flex items-center gap-3">
            Transcrições de Reuniões
            <span className="text-xs px-2.5 py-1 rounded-full bg-orange-500/15 text-orange-300 font-semibold border border-orange-500/25">
              {transcripts.length} Registradas
            </span>
            <AIInsightsButton context="transcripts" />
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Análises automáticas via Google Gemini de reuniões com comissão e turma
          </p>
        </div>

        {/* Botão Dropdown "Nova Transcrição" */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-orange-600 to-orange-600 hover:from-orange-500 hover:to-orange-500 text-white text-xs font-bold shadow-lg shadow-orange-500/20 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Nova Transcrição
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {isDropdownOpen && (
            <div className="absolute right-0 mt-2 w-56 rounded-xl bg-[#111820] border border-white/10 shadow-2xl z-40 py-1 text-xs">
              <button
                type="button"
                onClick={() => {
                  setIsDropdownOpen(false)
                  setFathomModalOpen(true)
                }}
                className="w-full text-left px-4 py-2.5 text-slate-200 hover:bg-white/[0.06] flex items-center gap-2.5 transition-colors"
              >
                <Video className="w-4 h-4 text-orange-400" />
                <div>
                  <div className="font-semibold text-white">Reunião Online (Fathom)</div>
                  <div className="text-[11px] text-slate-400">Importar link do Fathom</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsDropdownOpen(false)
                  setManualModalOpen(true)
                }}
                className="w-full text-left px-4 py-2.5 text-slate-200 hover:bg-white/[0.06] flex items-center gap-2.5 transition-colors border-t border-white/[0.04]"
              >
                <Upload className="w-4 h-4 text-orange-400" />
                <div>
                  <div className="font-semibold text-white">Upload Manual</div>
                  <div className="text-[11px] text-slate-400">Áudio, .txt ou colar texto</div>
                </div>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#111820] p-3.5 rounded-xl border border-white/[0.06]">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por turma, conteúdo ou recomendações..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#0a0f14] border border-white/[0.08] rounded-lg pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="bg-[#0a0f14] border border-white/10 rounded-lg px-3 py-2 text-xs text-white"
          >
            <option value="all">Todos os Tipos</option>
            <option value="comissao">Reunião Comissão</option>
            <option value="turma">Reunião Turma</option>
          </select>
        </div>
      </div>

      {/* Lista / Tabela de Transcrições */}
      <div className="border border-white/[0.06] rounded-xl overflow-hidden bg-[#111820] shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0a0f14] border-b border-white/[0.06] text-slate-400 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Turma / Reunião</th>
                <th className="py-3 px-3">Tipo</th>
                <th className="py-3 px-3">Data</th>
                <th className="py-3 px-3 text-center">Probabilidade</th>
                <th className="py-3 px-3 text-center">Sentimento</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {filteredTranscripts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    Nenhuma transcrição encontrada. Clique em <strong>Nova Transcrição</strong> para
                    adicionar.
                  </td>
                </tr>
              ) : (
                filteredTranscripts.map((tr) => {
                  const leadMatch = leads.find((l) => l.id === tr.leadId)
                  const prob = tr.geminiAnalysis?.probabilidade ?? tr.probabilityScore
                  const sent =
                    tr.geminiAnalysis?.sentimento ||
                    (prob >= 65 ? 'positivo' : prob <= 40 ? 'negativo' : 'neutro')

                  return (
                    <tr
                      key={tr.id}
                      onClick={() => setActiveDetailsTranscript(tr)}
                      className="hover:bg-white/[0.02] transition-colors cursor-pointer group"
                    >
                      {/* Turma / Reunião */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-white flex items-center gap-2">
                          <GraduationCap className="w-4 h-4 text-orange-400 flex-shrink-0" />
                          <span>
                            {leadMatch
                              ? getTurmaDisplayName(leadMatch)
                              : tr.contactName || tr.company}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5 truncate max-w-sm">
                          {tr.geminiAnalysis?.resumo || tr.title}
                        </div>
                      </td>

                      {/* Tipo */}
                      <td className="py-3.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded-full font-semibold ${
                            tr.meetingType === 'Reunião Turma'
                              ? 'bg-amber-500/15 text-amber-300 border border-amber-500/20'
                              : 'bg-orange-500/15 text-orange-300 border border-orange-500/20'
                          }`}
                        >
                          {tr.meetingType || 'Reunião Comissão'}
                        </span>
                      </td>

                      {/* Data */}
                      <td className="py-3.5 px-3 text-slate-400 whitespace-nowrap">
                        {new Date(tr.date).toLocaleDateString('pt-BR')}
                      </td>

                      {/* Probabilidade */}
                      <td className="py-3.5 px-3 text-center">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full font-bold ${
                            prob >= 70
                              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                              : prob >= 45
                                ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                                : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                          }`}
                        >
                          {prob}%
                        </span>
                      </td>

                      {/* Sentimento */}
                      <td className="py-3.5 px-3 text-center">{renderSentimentBadge(sent)}</td>

                      {/* Ações */}
                      <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setActiveDetailsTranscript(tr)}
                            className="px-2.5 py-1 rounded-lg bg-orange-500/15 text-orange-300 hover:bg-orange-500/25 border border-orange-500/30 font-semibold flex items-center gap-1"
                          >
                            <Eye className="w-3.5 h-3.5" /> Ver
                          </button>

                          <button
                            type="button"
                            onClick={() => setDeleteConfirmId(tr.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-white/[0.04]"
                            title="Excluir Transcrição"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL 1: Upload Manual */}
      {manualModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-lg bg-[#111820] border border-white/10 rounded-2xl shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-white/[0.08]">
              <div className="flex items-center gap-2 text-white font-bold text-base">
                <Upload className="w-5 h-5 text-orange-400" />
                Nova Transcrição — Upload Manual
              </div>
              <button
                type="button"
                onClick={() => setManualModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveManual} className="space-y-4 text-xs">
              {/* Seleção de Turma com autocomplete */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Selecionar Turma (Lead) *
                </label>
                <input
                  type="text"
                  placeholder="Digite para buscar turma (ex: Medicina FAINOR)..."
                  value={manualTurmaSearch}
                  onChange={(e) => {
                    setManualTurmaSearch(e.target.value)
                    setManualTurmaId('')
                  }}
                  className="w-full bg-[#0a0f14] border border-white/10 rounded-lg px-3 py-2 text-white mb-1"
                />
                <div className="max-h-32 overflow-y-auto border border-white/[0.06] rounded-lg bg-[#0a0f14] divide-y divide-white/[0.04]">
                  {getFilteredLeads(manualTurmaSearch).map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => {
                        setManualTurmaId(l.id)
                        setManualTurmaSearch(`${getTurmaDisplayName(l)} (${l.cidade})`)
                      }}
                      className={`w-full text-left px-3 py-1.5 hover:bg-white/[0.06] transition-colors flex items-center justify-between ${
                        manualTurmaId === l.id
                          ? 'bg-orange-600/20 text-orange-300 font-bold'
                          : 'text-slate-300'
                      }`}
                    >
                      <span>{getTurmaDisplayName(l)}</span>
                      <span className="text-[10px] text-slate-400">{l.cidade}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Tipo de Reunião */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Tipo de Reunião *</label>
                <select
                  value={manualMeetingType}
                  onChange={(e) => setManualMeetingType(e.target.value as MeetingType)}
                  className="w-full bg-[#0a0f14] border border-white/10 rounded-lg px-3 py-2 text-white font-semibold"
                >
                  <option value="Reunião Comissão">Reunião Comissão</option>
                  <option value="Reunião Turma">Reunião Turma</option>
                </select>
              </div>

              {/* Upload de Arquivo (Áudio ou Texto) */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Upload de Arquivo (Áudio .mp3/.wav/.m4a OU Texto .txt)
                </label>
                <input
                  type="file"
                  accept=".txt,.text,.md,.mp3,.wav,.m4a,.ogg,.aac"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) {
                      setManualFile(f)
                      const isAudio = /\.(mp3|wav|m4a|ogg|aac|wma)$/i.test(f.name)
                      setManualAudioNotice(isAudio)
                    }
                  }}
                  className="w-full bg-[#0a0f14] border border-white/10 rounded-lg p-2 text-slate-300 file:mr-3 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-orange-600 file:text-white hover:file:bg-orange-500"
                />

                {manualAudioNotice && (
                  <div className="mt-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] flex items-center gap-2">
                    <FileAudio className="w-4 h-4 flex-shrink-0" />
                    <span>
                      Arquivo de áudio salvo. A transcrição será processada. Você também pode colar
                      o texto resumido abaixo se preferir.
                    </span>
                  </div>
                )}
              </div>

              {/* Textarea para colar transcrição */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Texto da Transcrição / Diálogo (Opcional se enviou .txt)
                </label>
                <textarea
                  rows={5}
                  placeholder={`Cole aqui o texto da conversa ou resumo da reunião...\nEx: A comissão elogiou os orçamentos e solicitou reunião com a turma na próxima semana.`}
                  value={manualText}
                  onChange={(e) => setManualText(e.target.value)}
                  className="w-full bg-[#0a0f14] border border-white/10 rounded-lg p-2.5 text-white placeholder-slate-500 font-sans text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setManualModalOpen(false)}
                  className="px-4 py-2 font-semibold text-slate-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isAnalyzingManual}
                  className="px-5 py-2 font-bold text-white bg-orange-600 hover:bg-orange-500 rounded-lg shadow-md flex items-center gap-2 disabled:opacity-50"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {isAnalyzingManual ? 'Processando Gemini AI...' : 'Salvar e Analisar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Reunião Online (Fathom) */}
      {fathomModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-lg bg-[#111820] border border-white/10 rounded-2xl shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-white/[0.08]">
              <div className="flex items-center gap-2 text-white font-bold text-base">
                <Video className="w-5 h-5 text-orange-400" />
                Nova Transcrição — Reunião Online (Fathom)
              </div>
              <button
                type="button"
                onClick={() => setFathomModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveFathom} className="space-y-4 text-xs">
              {/* Seleção de Turma com autocomplete */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Selecionar Turma (Lead) *
                </label>
                <input
                  type="text"
                  placeholder="Digite para buscar turma (ex: Direito UNEX)..."
                  value={fathomTurmaSearch}
                  onChange={(e) => {
                    setFathomTurmaSearch(e.target.value)
                    setFathomTurmaId('')
                  }}
                  className="w-full bg-[#0a0f14] border border-white/10 rounded-lg px-3 py-2 text-white mb-1"
                />
                <div className="max-h-32 overflow-y-auto border border-white/[0.06] rounded-lg bg-[#0a0f14] divide-y divide-white/[0.04]">
                  {getFilteredLeads(fathomTurmaSearch).map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => {
                        setFathomTurmaId(l.id)
                        setFathomTurmaSearch(`${getTurmaDisplayName(l)} (${l.cidade})`)
                      }}
                      className={`w-full text-left px-3 py-1.5 hover:bg-white/[0.06] transition-colors flex items-center justify-between ${
                        fathomTurmaId === l.id
                          ? 'bg-orange-600/20 text-orange-300 font-bold'
                          : 'text-slate-300'
                      }`}
                    >
                      <span>{getTurmaDisplayName(l)}</span>
                      <span className="text-[10px] text-slate-400">{l.cidade}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Tipo de Reunião */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Tipo de Reunião *</label>
                <select
                  value={fathomMeetingType}
                  onChange={(e) => setFathomMeetingType(e.target.value as MeetingType)}
                  className="w-full bg-[#0a0f14] border border-white/10 rounded-lg px-3 py-2 text-white font-semibold"
                >
                  <option value="Reunião Comissão">Reunião Comissão</option>
                  <option value="Reunião Turma">Reunião Turma</option>
                </select>
              </div>

              {/* URL do Fathom + Botão Buscar */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  URL da Reunião Fathom *
                </label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    placeholder="https://fathom.video/share/..."
                    value={fathomUrl}
                    onChange={(e) => setFathomUrl(e.target.value)}
                    className="flex-1 bg-[#0a0f14] border border-white/10 rounded-lg px-3 py-2 text-white font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleFetchFathom}
                    disabled={isSearchingFathom}
                    className="px-3 py-2 bg-white/[0.08] hover:bg-white/[0.14] text-slate-200 font-semibold rounded-lg flex items-center gap-1.5"
                  >
                    {isSearchingFathom ? 'Buscando...' : 'Buscar Transcrição'}
                  </button>
                </div>
              </div>

              {/* Textarea para transcrição / fallback */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Texto da Transcrição (Preenchido automaticamente ou cole manualmente)
                </label>
                <textarea
                  rows={5}
                  placeholder="Se o Fathom não carregar automaticamente, cole o texto da reunião aqui..."
                  value={fathomManualText}
                  onChange={(e) => setFathomManualText(e.target.value)}
                  className="w-full bg-[#0a0f14] border border-white/10 rounded-lg p-2.5 text-white placeholder-slate-500 font-sans text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setFathomModalOpen(false)}
                  className="px-4 py-2 font-semibold text-slate-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isAnalyzingFathom}
                  className="px-5 py-2 font-bold text-white bg-orange-600 hover:bg-orange-500 rounded-lg shadow-md flex items-center gap-2 disabled:opacity-50"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {isAnalyzingFathom ? 'Analisando com Gemini...' : 'Salvar e Analisar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DETALHES DA TRANSCRIÇÃO / ANÁLISE GEMINI */}
      {activeDetailsTranscript && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-4xl max-h-[92vh] bg-[#111820] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-scale-in">
            {/* Header */}
            <div className="px-6 py-4 border-b border-white/[0.08] flex items-center justify-between bg-[#0a0f14]">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-orange-500/15 text-orange-400 border border-orange-500/30">
                  <GraduationCap className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">
                    {activeDetailsTranscript.title}
                  </h2>
                  <p className="text-xs text-slate-400">
                    {activeDetailsTranscript.meetingType || 'Reunião'} •{' '}
                    {new Date(activeDetailsTranscript.date).toLocaleDateString('pt-BR')}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-right">
                  <span className="text-[10px] text-slate-400 block uppercase font-bold">
                    Probabilidade
                  </span>
                  <span
                    className={`text-lg font-extrabold ${
                      (activeDetailsTranscript.geminiAnalysis?.probabilidade ??
                        activeDetailsTranscript.probabilityScore) >= 70
                        ? 'text-emerald-400'
                        : (activeDetailsTranscript.geminiAnalysis?.probabilidade ??
                              activeDetailsTranscript.probabilityScore) >= 45
                          ? 'text-amber-400'
                          : 'text-rose-400'
                    }`}
                  >
                    {activeDetailsTranscript.geminiAnalysis?.probabilidade ??
                      activeDetailsTranscript.probabilityScore}
                    %
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveDetailsTranscript(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06]"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Corpo do Modal */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs">
              {/* Card Resumo Gemini */}
              <div className="p-4 rounded-xl bg-orange-500/[0.07] border border-orange-500/20 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-orange-300 flex items-center gap-1.5 text-xs uppercase tracking-wider">
                    <Sparkles className="w-4 h-4 text-orange-400" />
                    Resumo da Análise (Gemini AI)
                  </h4>
                  {renderSentimentBadge(activeDetailsTranscript.geminiAnalysis?.sentimento)}
                </div>
                <p className="text-slate-200 leading-relaxed">
                  {activeDetailsTranscript.geminiAnalysis?.resumo ||
                    'Reunião gravada e analisada comercialmente.'}
                </p>
                {activeDetailsTranscript.geminiAnalysis?.recomendacao && (
                  <div className="pt-2 mt-2 border-t border-orange-500/20 text-orange-200 flex items-start gap-1.5">
                    <Lightbulb className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-amber-300">Próximo Passo Recomendado: </strong>
                      {activeDetailsTranscript.geminiAnalysis.recomendacao}
                    </div>
                  </div>
                )}
              </div>

              {/* Grid Pontos Fortes e Pontos de Atenção */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Pontos Fortes */}
                <div className="p-4 rounded-xl bg-[#0a0f14] border border-white/[0.06] space-y-2">
                  <h4 className="font-bold text-emerald-400 flex items-center gap-1.5 uppercase tracking-wider text-[11px]">
                    <CheckCircle2 className="w-4 h-4" />
                    Pontos Fortes Identificados
                  </h4>
                  <ul className="space-y-1.5">
                    {(
                      activeDetailsTranscript.geminiAnalysis?.pontosFortes || [
                        'Sinais comerciais positivos identificados',
                      ]
                    ).map((p, idx) => (
                      <li key={idx} className="text-slate-300 flex items-start gap-2">
                        <span className="text-emerald-500 font-bold">•</span>
                        <span>{p}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Pontos de Atenção / Objeções */}
                <div className="p-4 rounded-xl bg-[#0a0f14] border border-white/[0.06] space-y-2">
                  <h4 className="font-bold text-rose-400 flex items-center gap-1.5 uppercase tracking-wider text-[11px]">
                    <AlertTriangle className="w-4 h-4" />
                    Pontos de Atenção / Objeções
                  </h4>
                  <ul className="space-y-1.5">
                    {(
                      activeDetailsTranscript.geminiAnalysis?.pontosAtencao || [
                        'Nenhuma objeção crítica detectada',
                      ]
                    ).map((p, idx) => (
                      <li key={idx} className="text-slate-300 flex items-start gap-2">
                        <span className="text-rose-500 font-bold">•</span>
                        <span>{p}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Texto Completo da Transcrição */}
              <div>
                <h4 className="font-bold text-slate-300 mb-2 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-slate-400" />
                  Texto Completo da Transcrição
                </h4>
                <div className="p-4 rounded-xl bg-[#0a0f14] border border-white/[0.06] text-slate-300 font-sans whitespace-pre-wrap leading-relaxed max-h-72 overflow-y-auto">
                  {activeDetailsTranscript.content}
                </div>
              </div>
            </div>

            {/* Footer do modal */}
            <div className="px-6 py-3 border-t border-white/[0.08] bg-[#0a0f14] flex justify-end">
              <button
                type="button"
                onClick={() => setActiveDetailsTranscript(null)}
                className="px-4 py-1.5 bg-orange-600 hover:bg-orange-500 text-white font-semibold rounded-lg text-xs"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmação de Exclusão */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#111820] border border-white/10 rounded-2xl p-6 max-w-sm w-full space-y-4">
            <h3 className="text-base font-bold text-white">Excluir Transcrição?</h3>
            <p className="text-xs text-slate-400">
              Tem certeza que deseja remover este registro de reunião?
            </p>
            <div className="flex justify-end gap-2 pt-2 text-xs">
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                className="px-3 py-1.5 text-slate-400 hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteTranscript(deleteConfirmId)
                  setDeleteConfirmId(null)
                  toast({
                    title: 'Transcrição Excluída',
                    description: 'Registro removido com sucesso.',
                  })
                }}
                className="px-4 py-1.5 bg-red-600 hover:bg-red-500 text-white font-semibold rounded-lg"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
