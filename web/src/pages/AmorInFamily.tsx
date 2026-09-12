import React, { useState, useMemo } from 'react'
import {
  Heart,
  Upload,
  Search,
  Eye,
  Trash2,
  X,
  Sparkles,
  AlertTriangle,
  Lightbulb,
  Plus,
  MessageSquare,
  Video,
  ChevronDown,
  GraduationCap,
  TrendingUp,
  DollarSign,
  Smile,
  Meh,
  Frown,
  CheckCircle2,
  FileText,
  FileAudio,
} from 'lucide-react'
import { useCRM } from '@/context/CRMContext'
import { Transcript, getTurmaDisplayName } from '@/types/crm'
import { useToast } from '@/hooks/use-toast'
import { analyzeTranscriptWithGemini, getGeminiApiKey, transcribeAudioWithGemini } from '@/utils/geminiApi'
import { analyzeTranscriptText } from '@/utils/probabilityEngine'
import { SortControl, sortByField, type SortDirection } from '@/components/SortControl'
import { matchesSearch } from '@/utils/searchMatch'
import KpiCard from '@/components/dashboard/KpiCard'

// Tipo de reunião usado só nessa tela — evento de pós-venda "Amor in Family"
// (cross-sell de pacotes de álbuns/produtos pra turmas que JÁ fecharam formatura).
// Reaproveita a mesma tabela/infra de transcrições do Comercial (analisada pelo
// Gemini), só filtrando por esse meetingType — igual ao padrão de "Reunião
// Comissão"/"Reunião Turma" em Transcrições.
const MEETING_TYPE = 'Amor in Family'

const CONTEXTO_NEGOCIO_GEMINI =
  'Este é um evento comercial de PÓS-VENDA chamado "Amor In Family": feito para turmas que JÁ FECHARAM contrato de formatura com a empresa, com objetivo de cross-sell — vender pacotes adicionais de álbuns de fotos e produtos complementares para os alunos e famílias. A "probabilidade" deve refletir a chance de fechamento dessa venda adicional (álbum/produto), não da formatura em si, que já está fechada.'

export default function AmorInFamily() {
  const { transcripts, leads, settings, addTranscript, deleteTranscript } = useCRM()
  const { toast } = useToast()

  const familyTranscripts = useMemo(
    () => transcripts.filter((t) => t.meetingType === MEETING_TYPE),
    [transcripts],
  )

  // Estados de busca e filtros
  const [searchQuery, setSearchQuery] = useState('')
  const [sortField, setSortField] = useState('date')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const SORT_OPTIONS = [
    { value: 'date', label: 'Data' },
    { value: 'title', label: 'Turma / Reunião (A-Z)' },
    { value: 'probabilityScore', label: 'Probabilidade' },
  ]
  const [activeDetailsTranscript, setActiveDetailsTranscript] = useState<Transcript | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  // Análise de Objeções (agregada, filtrável por curso/faculdade/mês)
  const [objecoesOpen, setObjecoesOpen] = useState(true)
  const [objecoesCurso, setObjecoesCurso] = useState('all')
  const [objecoesFaculdade, setObjecoesFaculdade] = useState('all')
  const [objecoesPeriodo, setObjecoesPeriodo] = useState('all')

  // Dropdown "Nova Gravação"
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)

  // Modal 1: Upload Manual
  const [manualModalOpen, setManualModalOpen] = useState(false)
  const [manualTurmaId, setManualTurmaId] = useState('')
  const [manualTurmaSearch, setManualTurmaSearch] = useState('')
  const [manualCurso, setManualCurso] = useState('')
  const [manualFile, setManualFile] = useState<File | null>(null)
  const [manualText, setManualText] = useState('')
  const [manualAudioNotice, setManualAudioNotice] = useState(false)
  const [isAnalyzingManual, setIsAnalyzingManual] = useState(false)
  const [isTranscrevendoAudio, setIsTranscrevendoAudio] = useState(false)

  // Modal 2: Reunião Online (Fathom)
  const [fathomModalOpen, setFathomModalOpen] = useState(false)
  const [fathomTurmaId, setFathomTurmaId] = useState('')
  const [fathomTurmaSearch, setFathomTurmaSearch] = useState('')
  const [fathomUrl, setFathomUrl] = useState('')
  const [fathomManualText, setFathomManualText] = useState('')
  const [isAnalyzingFathom, setIsAnalyzingFathom] = useState(false)

  // Gravações filtradas
  const filteredTranscripts = useMemo(() => {
    const base = familyTranscripts.filter((t) =>
      matchesSearch([t.title, t.company, t.contactName, t.content], searchQuery),
    )
    return sortByField(base, sortField, sortDirection, (t, f) => (t as any)[f])
  }, [familyTranscripts, searchQuery, sortField, sortDirection])

  // Cursos conhecidos (das turmas cadastradas) — usado no seletor de curso do
  // upload, pra não depender de vincular a turma exata (Amor in Family ainda
  // não sabe a turma real de cada aluno, só o curso).
  const cursoOptions = useMemo(() => {
    const cursos = new Set<string>()
    leads.forEach((l) => l.curso && cursos.add(l.curso))
    return Array.from(cursos).sort()
  }, [leads])

  // KPIs básicos (só o que dá pra calcular sem dado de venda)
  const kpis = useMemo(() => {
    const turmasParticipantes = new Set(
      familyTranscripts.map((t) => t.leadId || t.curso).filter(Boolean),
    )
    const comAnalise = familyTranscripts.filter((t) => t.geminiAnalysis)
    const probMedia =
      comAnalise.length > 0
        ? Math.round(
            comAnalise.reduce((sum, t) => sum + (t.geminiAnalysis?.probabilidade || 0), 0) /
              comAnalise.length,
          )
        : null
    return {
      totalGravacoes: familyTranscripts.length,
      turmasParticipantes: turmasParticipantes.size,
      probMedia,
    }
  }, [familyTranscripts])

  // Opções de curso/faculdade pros filtros da análise de objeções
  const { objecoesCursoOptions, objecoesFaculdadeOptions } = useMemo(() => {
    const cursos = new Set<string>()
    const faculdades = new Set<string>()
    familyTranscripts.forEach((t) => {
      const lead = leads.find((l) => l.id === t.leadId)
      const curso = lead?.curso || t.curso
      if (curso) cursos.add(curso)
      if (lead?.faculdade) faculdades.add(lead.faculdade)
    })
    return {
      objecoesCursoOptions: Array.from(cursos).sort(),
      objecoesFaculdadeOptions: Array.from(faculdades).sort(),
    }
  }, [familyTranscripts, leads])

  // Ranking real de objeções (texto exato do que o Gemini extraiu, sem
  // clusterização por IA) — filtrável por curso, faculdade e mês.
  const objecoesRanking = useMemo(() => {
    const normalize = (s: string) => s.trim().replace(/\s+/g, ' ').replace(/[.;]+$/, '')
    const counts = new Map<string, { count: number; label: string }>()
    let totalConsiderados = 0

    familyTranscripts.forEach((t) => {
      const lead = leads.find((l) => l.id === t.leadId)
      const curso = lead?.curso || t.curso
      if (objecoesCurso !== 'all' && curso !== objecoesCurso) return
      if (objecoesFaculdade !== 'all' && lead?.faculdade !== objecoesFaculdade) return
      const mes = t.date ? t.date.slice(0, 7) : ''
      if (objecoesPeriodo !== 'all' && mes !== objecoesPeriodo) return

      const pontos = t.geminiAnalysis?.pontosAtencao || []
      if (pontos.length === 0) return
      totalConsiderados += 1
      pontos.forEach((p) => {
        const norm = normalize(p)
        if (!norm) return
        const key = norm.toLowerCase()
        const existing = counts.get(key)
        if (existing) existing.count += 1
        else counts.set(key, { count: 1, label: norm })
      })
    })

    const ranking = Array.from(counts.values()).sort((a, b) => b.count - a.count)
    return { ranking, totalConsiderados }
  }, [familyTranscripts, leads, objecoesCurso, objecoesFaculdade, objecoesPeriodo])

  const objecoesPeriodoOptions = useMemo(() => {
    const meses = new Set<string>()
    familyTranscripts.forEach((t) => {
      if (t.date) meses.add(t.date.slice(0, 7))
    })
    return Array.from(meses).sort().reverse()
  }, [familyTranscripts])

  // Autocomplete de turma — prioriza turmas já Convertidas (é pra elas que o
  // evento Amor in Family acontece), mas não bloqueia buscar as demais.
  const getFilteredLeads = (searchStr: string) => {
    const base = !searchStr.trim()
      ? leads
      : leads.filter((l) =>
          matchesSearch([l.empresa, l.curso, l.faculdade, l.turma, l.cidade, l.anoFormatura], searchStr),
        )
    return [...base]
      .sort((a, b) => (a.status === 'Convertido' ? -1 : 0) - (b.status === 'Convertido' ? -1 : 0))
      .slice(0, 10)
  }

  const performAnalysis = async (content: string, turmaName: string) => {
    const apiKey = getGeminiApiKey()

    if (apiKey) {
      try {
        const geminiRes = await analyzeTranscriptWithGemini(
          content,
          turmaName,
          apiKey,
          undefined,
          undefined,
          CONTEXTO_NEGOCIO_GEMINI,
        )
        return {
          probabilidade: geminiRes.probabilidade,
          sentimento: geminiRes.sentimento,
          pontosFortes: geminiRes.pontosFortes,
          pontosAtencao: geminiRes.pontosAtencao,
          resumo: geminiRes.resumo,
          recomendacao: geminiRes.recomendacao,
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
      pontosAtencao: neg.length > 0 ? neg : ['Verificar objeções sobre o pacote de álbuns'],
      resumo: `Reunião do evento Amor in Family com ${turmaName}. Score de ${heur.score}%.`,
      recomendacao: 'Fazer follow-up com a turma sobre o fechamento do pacote de álbuns.',
    }
  }

  const handleSaveManual = async (e: React.FormEvent) => {
    e.preventDefault()

    const leadMatch = leads.find((l) => l.id === manualTurmaId)

    if (!manualTurmaId && !manualCurso) {
      toast({
        title: 'Turma ou curso obrigatório',
        description: 'Selecione a turma (se já souber) ou, no mínimo, o curso do aluno.',
        variant: 'destructive',
      })
      return
    }

    let contentToAnalyze = manualText.trim()
    let fileName = 'upload_manual.txt'

    if (manualFile) {
      fileName = manualFile.name
      const isAudio = /\.(mp3|wav|m4a|ogg|aac|wma)$/i.test(manualFile.name)
      if (isAudio) {
        if (!contentToAnalyze) {
          const apiKey = getGeminiApiKey()
          if (!apiKey) {
            toast({
              title: 'Chave do Gemini necessária',
              description: 'Configure em Administração → IA pra transcrever áudio automaticamente.',
              variant: 'destructive',
            })
            return
          }
          setIsTranscrevendoAudio(true)
          try {
            contentToAnalyze = await transcribeAudioWithGemini(manualFile, apiKey)
          } catch (err: any) {
            toast({
              title: 'Erro ao transcrever áudio',
              description: err.message || 'Falha ao transcrever o áudio com o Gemini.',
              variant: 'destructive',
            })
            setIsTranscrevendoAudio(false)
            return
          }
          setIsTranscrevendoAudio(false)
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

    const turmaDisplayName = leadMatch
      ? getTurmaDisplayName(leadMatch)
      : manualTurmaSearch || manualCurso || 'Turma Amor in Family'

    setIsAnalyzingManual(true)
    try {
      const analysis = await performAnalysis(contentToAnalyze, turmaDisplayName)

      const tr = await addTranscript({
        title: `${MEETING_TYPE} - ${turmaDisplayName}`,
        fileName,
        company: leadMatch?.faculdade || manualCurso || turmaDisplayName,
        contactName: turmaDisplayName,
        leadId: manualTurmaId || undefined,
        curso: leadMatch ? undefined : manualCurso || undefined,
        meetingType: MEETING_TYPE,
        sourceType: manualFile ? 'manual_upload' : 'manual_text',
        date: new Date().toISOString(),
        durationMinutes: Math.max(15, Math.round(contentToAnalyze.split(/\s+/).length / 130)),
        wordCount: contentToAnalyze.split(/\s+/).length,
        content: contentToAnalyze,
        analyzed: true,
        probabilityScore: analysis.probabilidade,
        geminiAnalysis: analysis,
        needCoverageScore: analysis.probabilidade,
        timingScore: 80,
        decisionPowerScore: 85,
        perceivedValueScore: analysis.probabilidade,
        signals: analysis.pontosFortes.map((p) => ({ text: p, type: 'positive' as const, weight: 4 })),
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
      setManualCurso('')
      setManualAudioNotice(false)

      toast({
        title: 'Gravação salva e analisada!',
        description: `Probabilidade de fechamento do álbum: ${analysis.probabilidade}% (${analysis.sentimento}).`,
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

  const handleSaveFathom = async (e: React.FormEvent) => {
    e.preventDefault()

    const contentToAnalyze =
      fathomManualText.trim() ||
      `Reunião do evento Amor in Family via Fathom: ${fathomUrl}\nTranscrição gravada e vinculada à turma.`

    const leadMatch = leads.find((l) => l.id === fathomTurmaId)
    const turmaDisplayName = leadMatch
      ? getTurmaDisplayName(leadMatch)
      : fathomTurmaSearch || 'Turma Amor in Family'

    setIsAnalyzingFathom(true)
    try {
      const analysis = await performAnalysis(contentToAnalyze, turmaDisplayName)

      const tr = await addTranscript({
        title: `${MEETING_TYPE} - ${turmaDisplayName}`,
        fileName: 'fathom_meeting.url',
        fathomUrl,
        sourceType: 'fathom',
        company: leadMatch?.faculdade || turmaDisplayName,
        contactName: turmaDisplayName,
        leadId: fathomTurmaId || undefined,
        meetingType: MEETING_TYPE,
        date: new Date().toISOString(),
        durationMinutes: 30,
        wordCount: contentToAnalyze.split(/\s+/).length,
        content: contentToAnalyze,
        analyzed: true,
        probabilityScore: analysis.probabilidade,
        geminiAnalysis: analysis,
        needCoverageScore: analysis.probabilidade,
        timingScore: 85,
        decisionPowerScore: 80,
        perceivedValueScore: analysis.probabilidade,
        signals: analysis.pontosFortes.map((p) => ({ text: p, type: 'positive' as const, weight: 4 })),
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
        title: 'Gravação do Fathom salva!',
        description: `Probabilidade de fechamento do álbum: ${analysis.probabilidade}% (${analysis.sentimento}).`,
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
            <Heart className="w-6 h-6 text-rose-400" />
            Amor in Family
            <span className="text-xs px-2.5 py-1 rounded-full bg-orange-500/15 text-orange-300 font-semibold border border-orange-500/25">
              {familyTranscripts.length} Gravações
            </span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Evento de pós-venda com turmas já fechadas — cross-sell de pacotes de álbuns.
            Objeções, sentimento e probabilidade de fechamento por gravação, analisados via Gemini.
          </p>
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-orange-600 hover:from-rose-500 hover:to-orange-500 text-white text-xs font-bold shadow-lg shadow-rose-500/20 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Nova Gravação
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
                <Video className="w-4 h-4 text-rose-400" />
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
                <Upload className="w-4 h-4 text-rose-400" />
                <div>
                  <div className="font-semibold text-white">Upload Manual</div>
                  <div className="text-[11px] text-slate-400">Áudio, .txt ou colar texto</div>
                </div>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Gravações Enviadas"
          value={String(kpis.totalGravacoes)}
          icon={FileText}
          ajuda="Total de reuniões do evento Amor in Family (gravações/transcrições) já enviadas e analisadas."
        />
        <KpiCard
          label="Turmas Participantes"
          value={String(kpis.turmasParticipantes)}
          icon={GraduationCap}
          ajuda="Número de turmas distintas com pelo menos uma gravação do Amor in Family."
        />
        <KpiCard
          label="Probabilidade Média"
          value={kpis.probMedia === null ? '—' : `${kpis.probMedia}%`}
          icon={TrendingUp}
          tom={
            kpis.probMedia === null
              ? 'neutro'
              : kpis.probMedia >= 65
                ? 'verde'
                : kpis.probMedia <= 40
                  ? 'vermelho'
                  : 'ambar'
          }
          sub="chance média de fechar o pacote de álbuns"
          ajuda="Média da probabilidade de fechamento (estimada pelo Gemini a partir do conteúdo das gravações) entre todas as reuniões do Amor in Family já analisadas."
        />
        <KpiCard
          label="Taxa de Fechamento / Ticket Médio"
          value="—"
          icon={DollarSign}
          tom="ambar"
          sub="aguardando planilha de vendas do evento"
          ajuda="Essas métricas dependem dos dados reais de venda do pacote de álbuns (quem fechou, valor). Assim que a planilha de vendas do Amor in Family for enviada, elas passam a ser calculadas aqui."
        />
      </div>

      {/* Análise de Objeções (agregada) */}
      <div className="rounded-xl border border-white/[0.06] bg-[#111820] overflow-hidden">
        <button
          type="button"
          onClick={() => setObjecoesOpen((v) => !v)}
          className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
        >
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            <AlertTriangle className="w-4 h-4 text-rose-400" />
            Análise de Objeções
            <span className="text-[10px] font-semibold text-slate-400">
              (mais citadas pelo Gemini nas gravações do Amor in Family)
            </span>
          </div>
          <ChevronDown
            className={`w-4 h-4 text-slate-400 transition-transform ${objecoesOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {objecoesOpen && (
          <div className="px-4 pb-4 space-y-3 border-t border-white/[0.06] pt-3">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={objecoesCurso}
                onChange={(e) => setObjecoesCurso(e.target.value)}
                className="bg-[#0a0f14] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white"
              >
                <option value="all">Todos os cursos</option>
                {objecoesCursoOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <select
                value={objecoesFaculdade}
                onChange={(e) => setObjecoesFaculdade(e.target.value)}
                className="bg-[#0a0f14] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white"
              >
                <option value="all">Todas as faculdades</option>
                {objecoesFaculdadeOptions.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
              <select
                value={objecoesPeriodo}
                onChange={(e) => setObjecoesPeriodo(e.target.value)}
                className="bg-[#0a0f14] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white"
              >
                <option value="all">Todo o período</option>
                {objecoesPeriodoOptions.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <span className="text-[10px] text-slate-500 ml-auto">
                {objecoesRanking.totalConsiderados} reunião(ões) com objeções registradas
              </span>
            </div>

            {objecoesRanking.ranking.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">
                Nenhuma objeção registrada ainda — vai aparecer aqui conforme as gravações do Amor in
                Family forem enviadas e analisadas pelo Gemini.
              </p>
            ) : (
              <ul className="space-y-1.5 max-h-80 overflow-y-auto">
                {objecoesRanking.ranking.slice(0, 15).map((item, idx) => (
                  <li
                    key={idx}
                    className="flex items-center gap-3 bg-[#0a0f14] border border-white/[0.05] rounded-lg px-3 py-2"
                  >
                    <span className="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-md bg-rose-500/15 text-rose-300 text-[11px] font-bold">
                      {item.count}x
                    </span>
                    <span className="text-slate-300 text-xs">{item.label}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Barra de Busca e Ordenação */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#111820] p-3.5 rounded-xl border border-white/[0.06]">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por turma, conteúdo ou recomendações..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#0a0f14] border border-white/[0.08] rounded-lg pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
          />
        </div>
        <SortControl
          options={SORT_OPTIONS}
          field={sortField}
          direction={sortDirection}
          onFieldChange={setSortField}
          onDirectionToggle={() => setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))}
        />
      </div>

      {/* Lista / Tabela de Gravações */}
      <div className="border border-white/[0.06] rounded-xl overflow-hidden bg-[#111820] shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0a0f14] border-b border-white/[0.06] text-slate-400 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Turma</th>
                <th className="py-3 px-3">Data</th>
                <th className="py-3 px-3 text-center">Probabilidade</th>
                <th className="py-3 px-3 text-center">Sentimento</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {filteredTranscripts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-500">
                    Nenhuma gravação do Amor in Family ainda. Clique em{' '}
                    <strong>Nova Gravação</strong> para adicionar a primeira.
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
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-white flex items-center gap-2">
                          <GraduationCap className="w-4 h-4 text-rose-400 flex-shrink-0" />
                          <span>{leadMatch ? getTurmaDisplayName(leadMatch) : tr.contactName || tr.company}</span>
                          {!leadMatch && tr.curso && (
                            <span className="px-1.5 py-0.5 rounded-full bg-rose-500/15 text-rose-300 text-[10px] font-semibold border border-rose-500/20">
                              {tr.curso}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5 truncate max-w-sm">
                          {tr.geminiAnalysis?.resumo || tr.title}
                        </div>
                      </td>

                      <td className="py-3.5 px-3 text-slate-400 whitespace-nowrap">
                        {new Date(tr.date).toLocaleDateString('pt-BR')}
                      </td>

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

                      <td className="py-3.5 px-3 text-center">{renderSentimentBadge(sent)}</td>

                      <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setActiveDetailsTranscript(tr)}
                            className="px-2.5 py-1 rounded-lg bg-rose-500/15 text-rose-300 hover:bg-rose-500/25 border border-rose-500/30 font-semibold flex items-center gap-1"
                          >
                            <Eye className="w-3.5 h-3.5" /> Ver
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmId(tr.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-white/[0.04]"
                            title="Excluir Gravação"
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
                <Upload className="w-5 h-5 text-rose-400" />
                Amor in Family — Upload Manual
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
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Selecionar Turma (se já souber)
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
                        manualTurmaId === l.id ? 'bg-rose-600/20 text-rose-300 font-bold' : 'text-slate-300'
                      }`}
                    >
                      <span>{getTurmaDisplayName(l)}</span>
                      <span className="text-[10px] text-slate-400">
                        {l.status === 'Convertido' ? 'Convertido • ' : ''}
                        {l.cidade}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Curso {manualTurmaId ? '(opcional — já tem turma selecionada)' : '*'}
                </label>
                <select
                  value={manualCurso}
                  onChange={(e) => setManualCurso(e.target.value)}
                  disabled={!!manualTurmaId}
                  className="w-full bg-[#0a0f14] border border-white/10 rounded-lg px-3 py-2 text-white disabled:opacity-40"
                >
                  <option value="">Selecione o curso...</option>
                  {cursoOptions.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-500 mt-1">
                  Ainda não sabe a turma exata? Só o curso já serve — dá pra vincular a turma certa
                  depois.
                </p>
              </div>

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
                  className="w-full bg-[#0a0f14] border border-white/10 rounded-lg p-2 text-slate-300 file:mr-3 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-rose-600 file:text-white hover:file:bg-rose-500"
                />
                {manualAudioNotice && (
                  <div className="mt-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] flex items-center gap-2">
                    <FileAudio className="w-4 h-4 flex-shrink-0" />
                    <span>
                      Áudio detectado — se não colar texto abaixo, ele é transcrito automaticamente
                      pelo Gemini ao salvar (pode levar um minuto ou mais, dependendo da duração).
                    </span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Texto da Transcrição / Diálogo (opcional — se vazio e o arquivo for áudio, o Gemini
                  transcreve sozinho)
                </label>
                <textarea
                  rows={5}
                  placeholder="Cole aqui o texto da conversa ou resumo da reunião do evento Amor in Family..."
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
                  disabled={isAnalyzingManual || isTranscrevendoAudio}
                  className="px-5 py-2 font-bold text-white bg-rose-600 hover:bg-rose-500 rounded-lg shadow-md flex items-center gap-2 disabled:opacity-50"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {isTranscrevendoAudio
                    ? 'Transcrevendo áudio com Gemini...'
                    : isAnalyzingManual
                      ? 'Processando Gemini AI...'
                      : 'Salvar e Analisar'}
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
                <Video className="w-5 h-5 text-rose-400" />
                Amor in Family — Reunião Online (Fathom)
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
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Selecionar Turma (já fechada) *
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
                        fathomTurmaId === l.id ? 'bg-rose-600/20 text-rose-300 font-bold' : 'text-slate-300'
                      }`}
                    >
                      <span>{getTurmaDisplayName(l)}</span>
                      <span className="text-[10px] text-slate-400">
                        {l.status === 'Convertido' ? 'Convertido • ' : ''}
                        {l.cidade}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">URL da Reunião Fathom *</label>
                <input
                  type="url"
                  placeholder="https://fathom.video/share/..."
                  value={fathomUrl}
                  onChange={(e) => setFathomUrl(e.target.value)}
                  className="w-full bg-[#0a0f14] border border-white/10 rounded-lg px-3 py-2 text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Texto da Transcrição (cole manualmente se o Fathom não carregar automaticamente)
                </label>
                <textarea
                  rows={5}
                  placeholder="Cole o texto da reunião aqui..."
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
                  className="px-5 py-2 font-bold text-white bg-rose-600 hover:bg-rose-500 rounded-lg shadow-md flex items-center gap-2 disabled:opacity-50"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {isAnalyzingFathom ? 'Analisando com Gemini...' : 'Salvar e Analisar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DETALHES DA GRAVAÇÃO / ANÁLISE GEMINI */}
      {activeDetailsTranscript && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-4xl max-h-[92vh] bg-[#111820] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-scale-in">
            <div className="px-6 py-4 border-b border-white/[0.08] flex items-center justify-between bg-[#0a0f14]">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-rose-500/15 text-rose-400 border border-rose-500/30">
                  <Heart className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">{activeDetailsTranscript.title}</h2>
                  <p className="text-xs text-slate-400">
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

            <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs">
              <div className="p-4 rounded-xl bg-rose-500/[0.07] border border-rose-500/20 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-rose-300 flex items-center gap-1.5 text-xs uppercase tracking-wider">
                    <Sparkles className="w-4 h-4 text-rose-400" />
                    Resumo da Análise (Gemini AI)
                  </h4>
                  {renderSentimentBadge(activeDetailsTranscript.geminiAnalysis?.sentimento)}
                </div>
                <p className="text-slate-200 leading-relaxed">
                  {activeDetailsTranscript.geminiAnalysis?.resumo ||
                    'Reunião do evento Amor in Family registrada.'}
                </p>
                {activeDetailsTranscript.geminiAnalysis?.recomendacao && (
                  <div className="pt-2 mt-2 border-t border-rose-500/20 text-rose-200 flex items-start gap-1.5">
                    <Lightbulb className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-amber-300">Próximo Passo Recomendado: </strong>
                      {activeDetailsTranscript.geminiAnalysis.recomendacao}
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

              <div>
                <h4 className="font-bold text-slate-300 mb-2 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
                  Texto Completo da Transcrição
                </h4>
                <div className="p-4 rounded-xl bg-[#0a0f14] border border-white/[0.06] text-slate-300 font-sans whitespace-pre-wrap leading-relaxed max-h-72 overflow-y-auto">
                  {activeDetailsTranscript.content}
                </div>
              </div>
            </div>

            <div className="px-6 py-3 border-t border-white/[0.08] bg-[#0a0f14] flex justify-end">
              <button
                type="button"
                onClick={() => setActiveDetailsTranscript(null)}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-semibold rounded-lg text-xs"
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
            <h3 className="text-base font-bold text-white">Excluir Gravação?</h3>
            <p className="text-xs text-slate-400">
              Tem certeza que deseja remover este registro do Amor in Family?
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
                  toast({ title: 'Gravação Excluída', description: 'Registro removido com sucesso.' })
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
