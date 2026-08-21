import React, { useState, useMemo, useEffect } from 'react'
import {
  DollarSign,
  Percent,
  Layers,
  Activity,
  TrendingUp,
  Calendar,
  Plus,
  CheckCircle,
  Circle,
  Trash2,
  ArrowUpRight,
  Sparkles,
  PhoneCall,
  Mail,
  Video,
  FileCheck,
  Info,
  Clock,
  AlertTriangle,
  GraduationCap,
  Link as LinkIcon,
} from 'lucide-react'
import { useCRM } from '@/context/CRMContext'
import { useToast } from '@/hooks/use-toast'
import { Link, useNavigate } from 'react-router-dom'
import AIInsightsButton from '@/components/AIInsightsButton'
import {
  Deal,
  FUNNEL_STAGES,
  FUNNEL_STAGE_BY_ID,
  daysInCurrentStage,
  totalCycleDays,
  formatBRDate,
  getTurmaDisplayName,
} from '@/types/crm'

export default function Index() {
  const {
    deals = [],
    leads = [],
    tasks = [],
    activities = [],
    settings,
    addTask,
    toggleTask,
    deleteTask,
    stages = [],
    loading,
    error,
  } = useCRM()
  const { toast } = useToast()

  const [period, setPeriod] = useState<'7d' | '30d' | '90d' | 'year'>(
    settings.defaultPeriod || '30d',
  )
  const [customDateStart, setCustomDateStart] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return d.toISOString().split('T')[0]
  })
  const [customDateEnd, setCustomDateEnd] = useState(() => {
    return new Date().toISOString().split('T')[0]
  })
  const [showNewTaskInput, setShowNewTaskInput] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskPriority, setNewTaskPriority] = useState<'Alta' | 'Média' | 'Baixa'>('Média')

  // Tooltip state para gráfico de área SVG
  const [hoveredPoint, setHoveredPoint] = useState<{
    x: number
    y: number
    month: string
    value: number
  } | null>(null)

  // 1. Cálculos de KPIs
  const totalPipeline = (deals || [])
    .filter((d) => (d.stageId || 'stage-1') !== 'stage-6')
    .reduce((acc, d) => acc + (d.value || 0), 0)

  // Turmas Ativas: leads com status !== 'Perdido' OU com deals ativos (stageId !== 'stage-6')
  const activeTurmasCount = useMemo(() => {
    const activeLeadIdsFromDeals = new Set(
      (deals || [])
        .filter((d) => (d.stageId || 'stage-1') !== 'stage-6' && d.leadId)
        .map((d) => d.leadId!),
    )
    return (leads || []).filter((l) => l.status !== 'Perdido' || activeLeadIdsFromDeals.has(l.id))
      .length
  }, [leads, deals])

  const totalLeadsCount = (leads || []).length
  const convertedLeadsCount = (leads || []).filter((l) => l.status === 'Convertido').length
  const conversionRate =
    totalLeadsCount > 0 ? ((convertedLeadsCount / totalLeadsCount) * 100).toFixed(1) : '0.0'

  // Alunos Fechados (Hoje, Mês, Ano)
  const alunosFechadosStats = useMemo(() => {
    const now = new Date()
    const todayYear = now.getFullYear()
    const todayMonth = now.getMonth() // 0-indexed
    const todayDay = now.getDate()

    let hoje = 0
    let mes = 0
    let ano = 0

    // Função auxiliar para extrair Date de dataFechamento ou do histórico do deal
    const getCloseDate = (lead: (typeof leads)[0]): Date | null => {
      // 1. Tentar dataFechamento explícita da Lead (pode vir como 'DD/MM/YYYY' ou 'YYYY-MM-DD' ou ISO)
      if (lead.dataFechamento) {
        const raw = lead.dataFechamento.trim()
        if (raw.includes('/')) {
          const parts = raw.split('/')
          if (parts.length === 3) {
            const d = parseInt(parts[0], 10)
            const m = parseInt(parts[1], 10) - 1
            const y = parseInt(parts[2], 10)
            const dateObj = new Date(y, m, d)
            if (!isNaN(dateObj.getTime())) return dateObj
          }
        }
        const parsed = new Date(raw)
        if (!isNaN(parsed.getTime())) return parsed
      }

      // 2. Se não houver dataFechamento, usar a data de transição para "Fechou ou Perdeu" (stage-6) com resultado "ganho"
      const relatedDeal = (deals || []).find((d) => d.leadId === lead.id)
      if (relatedDeal && (relatedDeal.outcome === 'ganho' || relatedDeal.stageId === 'stage-6')) {
        const stage6History = relatedDeal.stageHistory?.find((h) => h.stage === 'stage-6')
        if (stage6History?.enteredAt) {
          const parsed = new Date(stage6History.enteredAt)
          if (!isNaN(parsed.getTime())) return parsed
        }
        if (relatedDeal.updatedAt) {
          const parsed = new Date(relatedDeal.updatedAt)
          if (!isNaN(parsed.getTime())) return parsed
        }
      }

      return null
    }

    ;(leads || []).forEach((lead) => {
      const count = lead.alunosFechados || 0
      if (count <= 0) return

      const closeDate = getCloseDate(lead)
      if (!closeDate) {
        // Se tem alunos fechados mas sem data registrada, computa no ano atual
        ano += count
        return
      }

      const closeY = closeDate.getFullYear()
      const closeM = closeDate.getMonth()
      const closeD = closeDate.getDate()

      if (closeY === todayYear) {
        ano += count
        if (closeM === todayMonth) {
          mes += count
          if (closeD === todayDay) {
            hoje += count
          }
        }
      }
    })

    return { hoje, mes, ano }
  }, [leads, deals])

  // 2. Dados do Gráfico de Faturamento Mensal (SVG puro)
  const monthlyRevenueData = [
    { month: 'Set', value: 340000 },
    { month: 'Out', value: 520000 },
    { month: 'Nov', value: 680000 },
    { month: 'Dez', value: 890000 },
    { month: 'Jan', value: 1050000 },
    { month: 'Fev', value: 1284500 },
  ]

  // Dimensões do SVG
  const svgWidth = 500
  const svgHeight = 220
  const paddingX = 40
  const paddingY = 30
  const maxRevenue = 1500000
  const minRevenue = 0

  const getSvgCoordinates = (index: number, val: number) => {
    const x = paddingX + (index / (monthlyRevenueData.length - 1)) * (svgWidth - paddingX * 2)
    const y = svgHeight - paddingY - (val / maxRevenue) * (svgHeight - paddingY * 2)
    return { x, y }
  }

  const points = monthlyRevenueData.map((d, i) => getSvgCoordinates(i, d.value))
  const linePathD = points.reduce((acc, p, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`, '')
  const areaPathD = `${linePathD} L ${points[points.length - 1].x} ${svgHeight - paddingY} L ${points[0].x} ${svgHeight - paddingY} Z`

  // 3. Funil de Conversão
  const stageStats = (stages || []).map((stage) => {
    const dealsInStage = (deals || []).filter((d) => d.stageId === stage.id)
    const totalVal = dealsInStage.reduce((acc, d) => acc + (d.value || 0), 0)
    return {
      stage,
      count: dealsInStage.length,
      totalVal,
    }
  })
  const maxStageCount = Math.max(...stageStats.map((s) => s.count), 1)

  // 4. Leads por Fonte (Rosca SVG pura)
  const sourceCounts: Record<string, number> = {}
  ;(leads || []).forEach((l) => {
    const src = l.source || 'Outros'
    sourceCounts[src] = (sourceCounts[src] || 0) + 1
  })
  const sourceColors: Record<string, string> = {
    Indicação: '#EA580C',
    LinkedIn: '#F97316',
    Website: '#3b82f6',
    Eventos: '#14b8a6',
    Outros: '#94a3b8',
    Passiva: '#3b82f6',
    Ativa: '#F97316',
    'Time comercial': '#10b981',
  }

  const sourceData = Object.entries(sourceCounts).map(([name, count]) => ({
    name,
    count,
    color: sourceColors[name] || '#F97316',
    percentage: totalLeadsCount > 0 ? Math.round((count / totalLeadsCount) * 100) : 0,
  }))

  // 5. Melhores Negócios (Top 5)
  const topDeals = [...(deals || [])].sort((a, b) => (b.value || 0) - (a.value || 0)).slice(0, 5)
  const maxDealVal = topDeals[0]?.value || 1

  const navigate = useNavigate()
  const leadById = useMemo(() => new Map((leads || []).map((l) => [l.id, l])), [leads])

  // 6. Ciclo de Vendas — métricas de tempo por estágio e ciclo total
  const cycleStats = useMemo(() => {
    // Tempo médio em cada estágio (soma de daysInStage de todas as entradas históricas).
    const stageSums: Record<string, { total: number; count: number }> = {}
    FUNNEL_STAGES.forEach((s) => (stageSums[s.id] = { total: 0, count: 0 }))

    ;(deals || []).forEach((d) => {
      const hist = d.stageHistory || []
      hist.forEach((h) => {
        if (!stageSums[h.stage]) stageSums[h.stage] = { total: 0, count: 0 }
        // Usa daysInStage do histórico; se for o último aberto, recalcula.
        const days = h === hist[hist.length - 1] ? daysInCurrentStage(d) : h.daysInStage || 0
        stageSums[h.stage].total += days
        stageSums[h.stage].count += 1
      })
    })

    const avgPerStage = FUNNEL_STAGES.map((s) => {
      const st = stageSums[s.id] || { total: 0, count: 0 }
      return {
        stage: s,
        avgDays: st.count > 0 ? Math.round(st.total / st.count) : 0,
        count: st.count,
      }
    })

    // Tempo médio total do ciclo (só turmas que chegaram ao stage-6).
    const closedDeals = (deals || []).filter((d) =>
      d.stageHistory?.some((h) => h.stage === 'stage-6'),
    )
    const totalDays = closedDeals.map((d) => totalCycleDays(d))
    const avgTotal =
      totalDays.length > 0 ? Math.round(totalDays.reduce((a, b) => a + b, 0) / totalDays.length) : 0

    // Conversão entre estágios consecutivos: quantas turmas já passaram por cada estágio.
    const enteredCount: Record<string, number> = {}
    ;(deals || []).forEach((d) => {
      const seen = new Set<string>()
      ;(d.stageHistory || []).forEach((h) => seen.add(h.stage))
      seen.forEach((s) => (enteredCount[s] = (enteredCount[s] || 0) + 1))
    })

    const conversions = FUNNEL_STAGES.slice(0, -1).map((s, i) => {
      const next = FUNNEL_STAGES[i + 1]
      const from = enteredCount[s.id] || 0
      const to = enteredCount[next.id] || 0
      return {
        from: s,
        to: next,
        rate: from > 0 ? Math.round((to / from) * 100) : 0,
        fromCount: from,
        toCount: to,
      }
    })

    return { avgPerStage, avgTotal, conversions, closedCount: closedDeals.length }
  }, [deals])

  // 7. Turmas estagnadas (top 5 há mais tempo sem movimentação)
  const stagnantDeals = useMemo(() => {
    return (deals || [])
      .filter((d) => (d.stageId || 'stage-1') !== 'stage-6')
      .map((d) => {
        const stageKey = d.stageId || 'stage-1'
        const meta = FUNNEL_STAGE_BY_ID[stageKey]
        const days = daysInCurrentStage(d)
        const lead = d.leadId ? leadById.get(d.leadId) : undefined
        return {
          deal: d,
          lead,
          days,
          stage: meta,
          isAlert: meta ? days >= meta.stagnationAlertDays : false,
        }
      })
      .sort((a, b) => b.days - a.days)
      .slice(0, 5)
  }, [deals, leadById])

  const goToPipelineCard = (dealId: string) => {
    ;(window as any).__pipelineHighlightDealId = dealId
    navigate('/pipeline')
  }

  // Handle criação de nova tarefa rápida
  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTaskTitle.trim()) return
    addTask(newTaskTitle.trim(), newTaskPriority)
    setNewTaskTitle('')
    setShowNewTaskInput(false)
    toast({
      title: 'Tarefa criada',
      description: 'Ação adicionada ao seu checklist do SDR.',
    })
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Alerta de erro caso ocorra */}
      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <span>Erro ao sincronizar dados com o servidor: {error}</span>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="text-xs px-3 py-1 rounded bg-red-500/20 hover:bg-red-500/30 font-semibold"
          >
            Recarregar
          </button>
        </div>
      )}

      {/* Indicador de carregamento */}
      {loading && (leads || []).length === 0 && (
        <div className="p-6 rounded-xl bg-[#111820] border border-white/[0.06] text-center text-slate-400 text-sm flex flex-col items-center justify-center gap-2">
          <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
          <span>Carregando dados do CRM...</span>
        </div>
      )}

      {/* Topo da Tela: Cabeçalho & Controles de Período */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-white/[0.06]">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-white tracking-tight flex items-center gap-2">
            Dashboard
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
              Ao Vivo
            </span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">Visão geral das suas vendas e equipe</p>
        </div>

        {/* Controles de Período & Data Range Picker */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Pills Segmentados */}
          <div className="inline-flex rounded-lg bg-white/[0.05] p-1 border border-white/[0.06]">
            {(['7d', '30d', '90d', 'year'] as const).map((p) => {
              const labels: Record<string, string> = {
                '7d': '7 dias',
                '30d': '30 dias',
                '90d': '90 dias',
                year: 'Ano',
              }
              const isActive = period === p
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                    isActive
                      ? 'bg-white text-slate-900 shadow-md font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {labels[p]}
                </button>
              )
            })}
          </div>

          {/* Seletor Customizado Nativo */}
          <div className="flex items-center gap-2 bg-[#111820] border border-white/[0.08] px-3 py-1.5 rounded-lg text-xs text-slate-300">
            <Calendar className="w-3.5 h-3.5 text-orange-400" />
            <input
              type="date"
              value={customDateStart}
              onChange={(e) => setCustomDateStart(e.target.value)}
              className="bg-transparent text-slate-200 focus:outline-none text-xs"
            />
            <span className="text-slate-500">até</span>
            <input
              type="date"
              value={customDateEnd}
              onChange={(e) => setCustomDateEnd(e.target.value)}
              className="bg-transparent text-slate-200 focus:outline-none text-xs"
            />
          </div>
        </div>
      </div>

      {/* Grade de 4 Cards KPI */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
          Indicadores
        </h2>
        <AIInsightsButton context="dashboard-kpis" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
        {/* KPI 1: Turmas Ativas */}
        <div className="bg-[#111820] border border-white/[0.06] rounded-xl p-5 hover:border-white/[0.14] hover:-translate-y-1 transition-all duration-200 shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-slate-400">Turmas Ativas</span>
            <div className="w-9 h-9 rounded-full bg-orange-500/15 flex items-center justify-center text-orange-400">
              <GraduationCap className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl lg:text-3xl font-bold text-white tracking-tight">
            {activeTurmasCount}
          </div>
          <div className="mt-2 text-xs text-slate-400">turmas no funil</div>
        </div>

        {/* KPI 2: Taxa de Conversão */}
        <div className="bg-[#111820] border border-white/[0.06] rounded-xl p-5 hover:border-white/[0.14] hover:-translate-y-1 transition-all duration-200 shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-slate-400">Taxa de Conversão</span>
            <div className="w-9 h-9 rounded-full bg-orange-500/15 flex items-center justify-center text-orange-400">
              <Percent className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl lg:text-3xl font-bold text-white tracking-tight">
            {conversionRate}%
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-orange-400">
            <ArrowUpRight className="w-4 h-4" />
            <span>+3,2%</span>
            <span className="text-slate-500 font-normal">SDR benchmark</span>
          </div>
        </div>

        {/* KPI 3: Pipeline Ativo */}
        <div className="bg-[#111820] border border-white/[0.06] rounded-xl p-5 hover:border-white/[0.14] hover:-translate-y-1 transition-all duration-200 shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-slate-400">Pipeline Ativo</span>
            <div className="w-9 h-9 rounded-full bg-orange-500/15 flex items-center justify-center text-orange-400">
              <Layers className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl lg:text-3xl font-bold text-white tracking-tight">
            R$ {totalPipeline.toLocaleString('pt-BR')}
          </div>
          <div className="mt-2 text-xs text-slate-400">Oportunidades em aberto no funil</div>
        </div>

        {/* KPI 4: Turmas Ganhas / Convertidas */}
        <div className="bg-[#111820] border border-white/[0.06] rounded-xl p-5 hover:border-white/[0.14] hover:-translate-y-1 transition-all duration-200 shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-slate-400">Turmas Ganhas</span>
            <div className="w-9 h-9 rounded-full bg-emerald-500/15 flex items-center justify-center text-emerald-400">
              <CheckCircle className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl lg:text-3xl font-bold text-white tracking-tight flex items-baseline gap-1.5">
            <span>{convertedLeadsCount}</span>
            <span className="text-sm font-normal text-slate-400">/ {totalLeadsCount} turmas</span>
          </div>
          <div className="mt-2 text-xs text-emerald-400 font-medium">Contratos fechados</div>
        </div>
      </div>

      {/* Mini-Cards de Alunos Fechados (Hoje, Mês, Ano) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Card 1: Alunos Fechados Hoje */}
        <div className="bg-[#111820]/90 border border-emerald-500/20 rounded-xl p-4 flex items-center justify-between hover:border-emerald-500/40 transition-all">
          <div>
            <div className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Alunos Fechados Hoje
            </div>
            <div className="text-2xl font-bold text-emerald-400 mt-1">
              {alunosFechadosStats.hoje}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">Contratos assinados na data de hoje</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold text-sm">
            Hoje
          </div>
        </div>

        {/* Card 2: Alunos Fechados no Mês */}
        <div className="bg-[#111820]/90 border border-orange-500/20 rounded-xl p-4 flex items-center justify-between hover:border-orange-500/40 transition-all">
          <div>
            <div className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-orange-400" />
              Alunos Fechados no Mês
            </div>
            <div className="text-2xl font-bold text-orange-400 mt-1">{alunosFechadosStats.mes}</div>
            <p className="text-[11px] text-slate-500 mt-0.5">Soma do mês corrente</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400 font-bold text-sm">
            Mês
          </div>
        </div>

        {/* Card 3: Alunos Fechados no Ano */}
        <div className="bg-[#111820]/90 border border-orange-500/20 rounded-xl p-4 flex items-center justify-between hover:border-orange-500/40 transition-all">
          <div>
            <div className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-orange-400" />
              Alunos Fechados no Ano
            </div>
            <div className="text-2xl font-bold text-orange-400 mt-1">{alunosFechadosStats.ano}</div>
            <p className="text-[11px] text-slate-500 mt-0.5">Total acumulado no ano</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400 font-bold text-sm">
            Ano
          </div>
        </div>
      </div>

      {/* Seção de Gráficos (Grid 2 colunas) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gráfico 1: Funil de Conversão */}
        {settings.dashboardWidgets.funnelChart && (
          <div className="bg-[#111820] border border-white/[0.06] rounded-xl p-6 shadow-lg flex flex-col justify-between">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-semibold text-white">Funil de Conversão</h3>
                <p className="text-xs text-slate-400">Distribuição de deals por estágio</p>
              </div>
              <div className="flex items-center gap-2">
                <AIInsightsButton context="dashboard-funnel" />
                <Link
                  to="/pipeline"
                  className="text-xs text-orange-400 hover:underline flex items-center gap-1"
                >
                  Ver Kanban <ArrowUpRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>

            <div className="space-y-3 my-auto">
              {stageStats.map(({ stage, count, totalVal }, idx) => {
                const widthPercent = Math.max(18, Math.round((count / (maxStageCount || 1)) * 100))
                return (
                  <div key={stage.id} className="space-y-1">
                    <div className="flex justify-between items-center text-xs">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: stage.color }}
                        />
                        <span className="font-medium text-slate-200">{stage.name}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-slate-400">{count} deals</span>
                        <span className="font-semibold text-slate-300">
                          R$ {(totalVal / 1000).toFixed(0)}k
                        </span>
                      </div>
                    </div>
                    <div className="w-full h-3 bg-white/[0.05] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${widthPercent}%`,
                          backgroundColor: stage.color,
                          opacity: 0.85,
                        }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Gráfico 3: Leads por Fonte (Rosca pura) */}
        {settings.dashboardWidgets.leadSourceChart && (
          <div className="bg-[#111820] border border-white/[0.06] rounded-xl p-6 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-semibold text-white">Leads por Fonte</h3>
                <p className="text-xs text-slate-400">Canais de aquisição de prospecção</p>
              </div>
              <div className="flex items-center gap-2">
                <AIInsightsButton context="dashboard-leadsource" />
                <span className="text-xs font-semibold text-slate-300">
                  Total: {totalLeadsCount}
                </span>
              </div>
            </div>

            {sourceData.length === 0 ? (
              <div className="text-center text-xs text-slate-500 py-10">
                Nenhum lead cadastrado ainda.
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row items-center justify-around gap-6">
                {/* Rosca SVG Central */}
                <div className="relative w-40 h-40 flex items-center justify-center">
                  <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                    {(() => {
                      let cumulative = 0
                      return sourceData.map((s, idx) => {
                        const strokeDasharray = `${s.percentage} ${100 - s.percentage}`
                        const strokeDashoffset = -cumulative
                        cumulative += s.percentage
                        return (
                          <circle
                            key={idx}
                            cx="50"
                            cy="50"
                            r="38"
                            fill="transparent"
                            stroke={s.color}
                            strokeWidth="12"
                            strokeDasharray={strokeDasharray}
                            strokeDashoffset={strokeDashoffset}
                            className="transition-all duration-300 hover:opacity-80"
                          />
                        )
                      })
                    })()}
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-2xl font-bold text-white">{totalLeadsCount}</span>
                    <span className="text-[10px] uppercase text-slate-400 tracking-wider">
                      Leads
                    </span>
                  </div>
                </div>

                {/* Legenda Lateral */}
                <div className="space-y-2 flex-1 max-w-xs">
                  {sourceData.map((s, idx) => (
                    <div key={idx} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: s.color }}
                        />
                        <span className="text-slate-300">{s.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white">{s.percentage}%</span>
                        <span className="text-slate-500">({s.count})</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Gráfico 4: Melhores Negócios (Top 5) */}
        {settings.dashboardWidgets.topDeals && (
          <div className="bg-[#111820] border border-white/[0.06] rounded-xl p-6 shadow-lg flex flex-col justify-between">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-semibold text-white">Melhores Negócios</h3>
                <p className="text-xs text-slate-400">Maiores oportunidades ativas</p>
              </div>
              <div className="flex items-center gap-2">
                <AIInsightsButton context="dashboard-topdeals" />
                <Sparkles className="w-4 h-4 text-amber-400" />
              </div>
            </div>

            <div className="space-y-3.5">
              {topDeals.length === 0 ? (
                <div className="text-center text-xs text-slate-500 py-8">
                  Nenhum negócio ativo no momento.
                </div>
              ) : (
                topDeals.map((deal) => {
                  const val = deal.value || 0
                  const ratio = Math.max(20, Math.round((val / maxDealVal) * 100))
                  const linkedLead = deal.leadId ? leadById.get(deal.leadId) : undefined
                  const displayName = linkedLead
                    ? getTurmaDisplayName(linkedLead)
                    : [deal.company, deal.contactName].filter(Boolean).join(' — ') ||
                      deal.title ||
                      'Negócio sem nome'

                  return (
                    <div key={deal.id} className="space-y-1">
                      <div className="flex justify-between items-center text-xs">
                        <div
                          className="font-medium text-white truncate max-w-[180px] sm:max-w-[240px]"
                          title={displayName}
                        >
                          {displayName}
                        </div>
                        <div className="font-bold text-orange-300">
                          R$ {val.toLocaleString('pt-BR')}
                        </div>
                      </div>
                      <div className="w-full h-2.5 bg-white/[0.05] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-orange-500 to-orange-500 transition-all duration-500"
                          style={{ width: `${ratio}%` }}
                        />
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* Ciclo de Vendas */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
            Ciclo de Vendas
          </h2>
          <div className="relative group">
            <button
              type="button"
              className="text-slate-500 hover:text-slate-300 transition-colors"
              aria-label="Informações sobre Ciclo de Vendas"
            >
              <Info className="w-4 h-4" />
            </button>
            <div className="absolute left-0 top-full mt-2 z-30 w-[280px] hidden group-hover:block">
              <div className="rounded-lg border border-white/10 bg-[#0a0f14] shadow-2xl p-3">
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Tempo médio que as turmas passam em cada estágio do funil, da Prospecção até o
                  Fechou/Perdeu. Turmas paradas há mais tempo que o limite do estágio aparecem em
                  destaque.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Tempo médio total */}
          <div className="bg-[#111820] border border-white/[0.06] rounded-xl p-5 shadow-lg flex flex-col justify-between">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-slate-400">Tempo Médio Total do Ciclo</span>
              <div className="w-9 h-9 rounded-full bg-orange-500/15 flex items-center justify-center text-orange-400">
                <Clock className="w-5 h-5" />
              </div>
            </div>
            <div>
              <div className="text-3xl font-bold text-white tracking-tight">
                {cycleStats.avgTotal}{' '}
                <span className="text-base font-medium text-slate-400">dias</span>
              </div>
              <div className="mt-2 text-xs text-slate-400">
                Da Prospecção até Fechou/Perdeu • {cycleStats.closedCount} turmas fechadas
              </div>
            </div>
          </div>

          {/* Tempo médio por estágio (barras horizontais) */}
          <div className="bg-[#111820] border border-white/[0.06] rounded-xl p-5 shadow-lg lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white">Tempo Médio por Estágio</h3>
              <span className="text-[10px] text-slate-400">em dias</span>
            </div>
            <div className="space-y-2.5">
              {cycleStats.avgPerStage.map(({ stage, avgDays }) => {
                const maxAvg = Math.max(...cycleStats.avgPerStage.map((s) => s.avgDays), 1)
                const width = Math.max(6, Math.round((avgDays / maxAvg) * 100))
                return (
                  <div key={stage.id} className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 w-[140px] flex-shrink-0">
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: stage.color }}
                      />
                      <span className="text-[11px] text-slate-300 truncate">{stage.name}</span>
                    </div>
                    <div className="flex-1 h-3 bg-white/[0.05] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${width}%`, backgroundColor: stage.color }}
                      />
                    </div>
                    <span className="text-[11px] font-semibold text-white w-8 text-right">
                      {avgDays}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Conversão entre estágios + Turmas paradas */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          {/* Taxa de conversão entre estágios */}
          <div className="bg-[#111820] border border-white/[0.06] rounded-xl p-5 shadow-lg">
            <h3 className="text-sm font-semibold text-white mb-4">Conversão entre Estágios</h3>
            <div className="space-y-2.5">
              {cycleStats.conversions.map(({ from, to, rate, fromCount, toCount }) => (
                <div key={from.id} className="flex items-center gap-2 text-xs">
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: from.color }}
                  />
                  <span className="text-slate-300 w-[110px] truncate">{from.name}</span>
                  <ArrowUpRight className="w-3 h-3 text-slate-500 flex-shrink-0" />
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: to.color }}
                  />
                  <span className="text-slate-300 w-[110px] truncate">{to.name}</span>
                  <span
                    className={`ml-auto font-bold ${
                      rate >= 60
                        ? 'text-emerald-400'
                        : rate >= 30
                          ? 'text-amber-400'
                          : 'text-red-400'
                    }`}
                  >
                    {rate}%
                  </span>
                  <span className="text-[10px] text-slate-500 w-16 text-right">
                    {toCount}/{fromCount}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Turmas paradas */}
          <div className="bg-[#111820] border border-white/[0.06] rounded-xl p-5 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white">Turmas Paradas</h3>
              <span className="text-[10px] text-slate-400">Top 5 sem movimentação</span>
            </div>
            <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
              {stagnantDeals.length === 0 && (
                <div className="text-center text-xs text-slate-500 py-6">
                  Nenhuma turma parada no momento.
                </div>
              )}
              {stagnantDeals.map(({ deal, lead, days, stage, isAlert }) => (
                <button
                  key={deal.id}
                  type="button"
                  onClick={() => goToPipelineCard(deal.id)}
                  className="w-full flex items-center gap-3 p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04] hover:border-white/[0.12] transition-colors text-left"
                >
                  <div
                    className={`w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 ${
                      isAlert ? 'bg-amber-500/15 text-amber-400' : 'bg-slate-500/15 text-slate-400'
                    }`}
                  >
                    {isAlert ? (
                      <AlertTriangle className="w-4 h-4" />
                    ) : (
                      <GraduationCap className="w-4 h-4" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-white truncate">
                      {lead ? getTurmaDisplayName(lead) : deal.title}
                    </div>
                    <div className="text-[10px] text-slate-400 truncate">
                      {stage?.name} • {stage?.suggestedAction}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div
                      className={`text-xs font-bold ${isAlert ? 'text-amber-400' : 'text-slate-300'}`}
                    >
                      {days} dias
                    </div>
                    <div className="text-[10px] text-slate-500">parada</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Seção Inferior: Atividade Recente + Próximas Ações/Tarefas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Atividade Recente */}
        {settings.dashboardWidgets.recentActivity && (
          <div className="bg-[#111820] border border-white/[0.06] rounded-xl p-6 shadow-lg flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-semibold text-white">Atividade Recente</h3>
                <p className="text-xs text-slate-400">
                  Linha do tempo de interações e movimentações
                </p>
              </div>
              <div className="flex items-center gap-2">
                <AIInsightsButton context="dashboard-activities" />
                <Activity className="w-4 h-4 text-slate-400" />
              </div>
            </div>

            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
              {activities.slice(0, 7).map((act) => {
                return (
                  <div
                    key={act.id}
                    className="flex items-start gap-3 p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.03] hover:border-white/[0.08] transition-colors"
                  >
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-white shadow-sm mt-0.5"
                      style={{ backgroundColor: act.color || '#F97316' }}
                    >
                      {act.type === 'reuniao' && <Video className="w-3.5 h-3.5" />}
                      {act.type === 'nota' && <PhoneCall className="w-3.5 h-3.5" />}
                      {act.type === 'fechamento' && <FileCheck className="w-3.5 h-3.5" />}
                      {act.type === 'proposta' && <DollarSign className="w-3.5 h-3.5" />}
                      {act.type === 'estagio' && <Layers className="w-3.5 h-3.5" />}
                      {act.type === 'lead' && <Mail className="w-3.5 h-3.5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-white truncate">
                          {act.title}
                        </span>
                        <span className="text-[10px] text-slate-500 whitespace-nowrap">
                          {new Date(act.timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 mt-0.5 line-clamp-2">
                        {act.description}
                      </p>
                      <div className="text-[10px] text-slate-500 mt-1">Por {act.authorName}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Tarefas Pendentes (Próximas Ações) */}
        {settings.dashboardWidgets.pendingTasks && (
          <div className="bg-[#111820] border border-white/[0.06] rounded-xl p-6 shadow-lg flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-semibold text-white">Tarefas Pendentes</h3>
                  <p className="text-xs text-slate-400">Próximas ações prioritárias do time</p>
                </div>
                <div className="flex items-center gap-2">
                  <AIInsightsButton context="dashboard-tasks" />
                  <button
                    type="button"
                    onClick={() => setShowNewTaskInput(!showNewTaskInput)}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-orange-500/20 text-orange-300 border border-orange-500/30 rounded-lg hover:bg-orange-500/30 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> Adicionar
                  </button>
                </div>
              </div>

              {/* Form Inline de Adicionar Tarefa */}
              {showNewTaskInput && (
                <form
                  onSubmit={handleCreateTask}
                  className="mb-4 p-3 bg-white/[0.03] rounded-lg border border-white/10 space-y-2 animate-fade-in"
                >
                  <input
                    type="text"
                    placeholder="Descrição da ação (ex: Ligar para decisor da TechFlow)"
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    className="w-full bg-[#0a0f14] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                    autoFocus
                  />
                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-slate-400 text-[11px]">Prioridade:</span>
                      {(['Alta', 'Média', 'Baixa'] as const).map((prio) => (
                        <button
                          key={prio}
                          type="button"
                          onClick={() => setNewTaskPriority(prio)}
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all ${
                            newTaskPriority === prio
                              ? prio === 'Alta'
                                ? 'bg-red-500 text-white'
                                : prio === 'Média'
                                  ? 'bg-amber-500 text-slate-900'
                                  : 'bg-slate-500 text-white'
                              : 'bg-white/[0.05] text-slate-400'
                          }`}
                        >
                          {prio}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowNewTaskInput(false)}
                        className="text-xs text-slate-400 hover:text-white px-2 py-1"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        className="text-xs bg-orange-600 hover:bg-orange-500 text-white px-3 py-1 rounded font-semibold"
                      >
                        Salvar
                      </button>
                    </div>
                  </div>
                </form>
              )}

              {/* Lista de Tarefas com Risco animado */}
              <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                {tasks.map((t) => (
                  <div
                    key={t.id}
                    className={`flex items-center justify-between p-2.5 rounded-lg border transition-all ${
                      t.completed
                        ? 'bg-white/[0.01] border-white/[0.02] opacity-60'
                        : 'bg-white/[0.03] border-white/[0.05] hover:border-white/[0.12]'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => toggleTask(t.id)}
                        className="text-slate-400 hover:text-orange-400 transition-colors flex-shrink-0"
                      >
                        {t.completed ? (
                          <CheckCircle className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <Circle className="w-4 h-4" />
                        )}
                      </button>
                      <div className="min-w-0">
                        <span
                          className={`text-xs block truncate transition-all duration-200 ${
                            t.completed
                              ? 'line-through text-slate-500'
                              : 'text-slate-200 font-medium'
                          }`}
                        >
                          {t.title}
                        </span>
                        {t.dueDate && (
                          <span className="text-[10px] text-slate-400">Prazo: {t.dueDate}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          t.priority === 'Alta'
                            ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                            : t.priority === 'Média'
                              ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                              : 'bg-slate-500/15 text-slate-400 border border-slate-500/30'
                        }`}
                      >
                        {t.priority}
                      </span>
                      <button
                        type="button"
                        onClick={() => deleteTask(t.id)}
                        className="text-slate-500 hover:text-red-400 p-1"
                        title="Excluir tarefa"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
