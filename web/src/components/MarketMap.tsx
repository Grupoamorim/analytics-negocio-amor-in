import { useEffect, useMemo, useState } from 'react'
import {
  Users,
  GraduationCap,
  Building2,
  MapPin,
  Filter,
  X,
  Map as MapIcon,
  BarChart3,
  BookmarkPlus,
  Bookmark,
  Trash2,
} from 'lucide-react'
import { extractTurmaNumber } from '@/types/captacao'
import { Deal, Lead, FUNNEL_STAGES } from '@/types/crm'
import { useCRM } from '@/context/CRMContext'
import AIInsightsButton from '@/components/AIInsightsButton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

interface SavedMapFilter {
  id: string
  name: string
  curso: string
  faculdade: string
  cidade: string
  anoFormatura: string
  selectedStages: string[]
}

const SAVED_MAP_FILTERS_KEY = 'mapa_mercado_saved_filters'

type FilterKey = 'curso' | 'faculdade' | 'cidade' | 'anoFormatura'

const FILTER_DEFS: { key: FilterKey; label: string }[] = [
  { key: 'curso', label: 'Curso' },
  { key: 'faculdade', label: 'Faculdade' },
  { key: 'cidade', label: 'Cidade' },
  { key: 'anoFormatura', label: 'Ano de Formatura' },
]

/** Id do pseudo-estágio que representa turmas sem deal no pipeline. */
const SEM_PIPELINE_ID = 'sem-pipeline'

/**
 * Lista de opções do filtro "Status do Funil": os 6 estágios oficiais
 * + "Sem pipeline" (turmas sem deal associado).
 */
const FUNNEL_FILTER_OPTIONS: { id: string; name: string; color: string }[] = [
  ...FUNNEL_STAGES.map((s) => ({ id: s.id, name: s.name, color: s.color })),
  { id: SEM_PIPELINE_ID, name: 'Sem pipeline', color: '#475569' },
]

/** Conta ocorrências por chave. */
function countBy<T>(items: T[], key: (i: T) => string): Map<string, number> {
  const map = new Map<string, number>()
  for (const it of items) {
    const k = key(it)
    map.set(k, (map.get(k) ?? 0) + 1)
  }
  return map
}

/**
 * O Mapa de Mercado é a mesma base de Turmas do Funil — toda turma
 * cadastrada já entra automaticamente aqui, sem lista separada. O status
 * do funil de cada uma vem direto do deal vinculado (mesmo id, sem
 * cruzamento por nome/curso como antes).
 */
export default function MarketMap() {
  const { leads, deals } = useCRM()

  const [filters, setFilters] = useState<Record<FilterKey, string>>({
    curso: '',
    faculdade: '',
    cidade: '',
    anoFormatura: '',
  })
  // Estágios selecionados no filtro "Status do Funil". Vazio = mostra tudo.
  const [selectedStages, setSelectedStages] = useState<string[]>([])

  // Filtros salvos (preview salvo com curso/faculdade/cidade/ano/estágios)
  const [savedFilters, setSavedFilters] = useState<SavedMapFilter[]>(() => {
    try {
      const stored = localStorage.getItem(SAVED_MAP_FILTERS_KEY)
      return stored ? JSON.parse(stored) : []
    } catch {
      return []
    }
  })
  const [activeSavedFilterId, setActiveSavedFilterId] = useState<string | null>(null)
  const [saveFilterName, setSaveFilterName] = useState('')
  const [isSavePopoverOpen, setIsSavePopoverOpen] = useState(false)

  useEffect(() => {
    try {
      localStorage.setItem(SAVED_MAP_FILTERS_KEY, JSON.stringify(savedFilters))
    } catch {
      // ignora
    }
  }, [savedFilters])

  const handleSaveCurrentFilter = () => {
    if (!saveFilterName.trim()) return
    const newFilter: SavedMapFilter = {
      id: `mapfilter-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: saveFilterName.trim(),
      curso: filters.curso,
      faculdade: filters.faculdade,
      cidade: filters.cidade,
      anoFormatura: filters.anoFormatura,
      selectedStages,
    }
    setSavedFilters((prev) => [...prev, newFilter])
    setActiveSavedFilterId(newFilter.id)
    setSaveFilterName('')
    setIsSavePopoverOpen(false)
  }

  const handleApplySavedFilter = (sf: SavedMapFilter) => {
    setActiveSavedFilterId(sf.id)
    setFilters({
      curso: sf.curso || '',
      faculdade: sf.faculdade || '',
      cidade: sf.cidade || '',
      anoFormatura: sf.anoFormatura || '',
    })
    setSelectedStages(sf.selectedStages || [])
  }

  const handleRemoveSavedFilter = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    setSavedFilters((prev) => prev.filter((f) => f.id !== id))
    if (activeSavedFilterId === id) setActiveSavedFilterId(null)
  }

  // Mapa leadId -> stageId atual (mesmo id da turma, sem cruzamento por nome).
  const stageByLeadId = useMemo(() => {
    const latestByLead = new Map<string, Deal>()
    for (const d of deals) {
      if (!d.leadId) continue
      const prev = latestByLead.get(d.leadId)
      if (!prev || new Date(d.updatedAt) > new Date(prev.updatedAt)) {
        latestByLead.set(d.leadId, d)
      }
    }
    const map = new Map<string, string>()
    latestByLead.forEach((d, leadId) => map.set(leadId, d.stageId))
    return map
  }, [deals])

  /** Retorna o stageId atual de uma turma (ou "sem-pipeline"). */
  const stageOfLead = (l: Lead): string => stageByLeadId.get(l.id) ?? SEM_PIPELINE_ID

  // Listas de opções disponíveis (derivadas dos dados brutos)
  const options = useMemo(() => {
    const unique = (key: FilterKey) =>
      Array.from(new Set(leads.map((l) => l[key]).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, 'pt-BR'),
      )
    return {
      curso: unique('curso'),
      faculdade: unique('faculdade'),
      cidade: unique('cidade'),
      anoFormatura: unique('anoFormatura'),
    } as Record<FilterKey, string[]>
  }, [leads])

  // Leads filtrados pelas seleções atuais (inclui filtro de estágio do funil)
  const filtered = useMemo(() => {
    return leads.filter((l) => {
      for (const key of FILTER_DEFS.map((d) => d.key)) {
        if (filters[key] && l[key] !== filters[key]) return false
      }
      if (selectedStages.length > 0 && !selectedStages.includes(stageOfLead(l))) return false
      return true
    })
  }, [leads, filters, selectedStages, stageByLeadId])

  const hasActiveFilter = Object.values(filters).some(Boolean) || selectedStages.length > 0

  const toggleStage = (stageId: string) => {
    setSelectedStages((prev) =>
      prev.includes(stageId) ? prev.filter((s) => s !== stageId) : [...prev, stageId],
    )
    setActiveSavedFilterId(null)
  }

  // ---- Métricas de resumo ----
  const totalLeads = filtered.length
  const totalTurmas = new Set(filtered.map((l) => l.turma)).size
  const totalCursos = new Set(filtered.map((l) => l.curso)).size
  const totalFaculdades = new Set(filtered.map((l) => l.faculdade)).size
  const totalCidades = new Set(filtered.map((l) => l.cidade)).size

  // ---- Market Share por Curso (leads por curso / total de leads) ----
  const shareCurso = useMemo(() => {
    const m = countBy(filtered, (l) => l.curso)
    return Array.from(m.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'pt-BR'))
  }, [filtered])

  // ---- Market Share por Faculdade (leads por faculdade / total de leads) ----
  const shareFaculdade = useMemo(() => {
    const m = countBy(filtered, (l) => l.faculdade)
    return Array.from(m.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'pt-BR'))
  }, [filtered])

  // ---- Grade Cidade × Curso (contagem de TURMAS distintas) ----
  const cidadeCurso = useMemo(() => {
    if (filtered.length === 0)
      return { cidades: [], cursos: [], cells: new Map<string, number>(), maxCell: 0 }
    const cidades = Array.from(new Set(filtered.map((l) => l.cidade))).sort((a, b) =>
      a.localeCompare(b, 'pt-BR'),
    )
    const cursos = Array.from(new Set(filtered.map((l) => l.curso))).sort((a, b) =>
      a.localeCompare(b, 'pt-BR'),
    )
    // para cada par cidade × curso, conta turmas distintas
    const turmasPorPar = new Map<string, Set<string>>()
    for (const l of filtered) {
      const k = `${l.cidade}|||${l.curso}`
      if (!turmasPorPar.has(k)) turmasPorPar.set(k, new Set())
      turmasPorPar.get(k)!.add(l.turma)
    }
    const cells = new Map<string, number>()
    let maxCell = 0
    turmasPorPar.forEach((set, k) => {
      const c = set.size
      cells.set(k, c)
      if (c > maxCell) maxCell = c
    })
    return { cidades, cursos, cells, maxCell }
  }, [filtered])

  // ---- Distribuição por Cidade (turmas distintas por cidade, do maior p/ menor) ----
  const distCidade = useMemo(() => {
    const turmasPorCidade = new Map<string, Set<string>>()
    for (const l of filtered) {
      if (!turmasPorCidade.has(l.cidade)) turmasPorCidade.set(l.cidade, new Set())
      turmasPorCidade.get(l.cidade)!.add(l.turma)
    }
    return Array.from(turmasPorCidade.entries())
      .map(([label, set]) => ({ label, count: set.size }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'pt-BR'))
  }, [filtered])

  const maxCidadeCount = distCidade.length ? distCidade[0].count : 0

  const clearFilters = () => {
    setFilters({ curso: '', faculdade: '', cidade: '', anoFormatura: '' })
    setSelectedStages([])
    setActiveSavedFilterId(null)
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho do Mapa + IA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
          <MapIcon className="w-4 h-4 text-orange-400" />
          Mapa de Mercado
        </div>
        <AIInsightsButton context="captacao-mapa" data={filtered} />
      </div>

      {/* Filtros */}
      <div className="bg-[rgba(255,255,255,0.03)] border border-white/[0.06] rounded-xl p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
            <Filter className="w-4 h-4 text-orange-400" />
            Filtros
          </div>
          <div className="flex items-center gap-2">
            {savedFilters.length > 0 && (
              <select
                value={activeSavedFilterId || ''}
                onChange={(e) => {
                  const found = savedFilters.find((f) => f.id === e.target.value)
                  if (found) handleApplySavedFilter(found)
                  else setActiveSavedFilterId(null)
                }}
                className="bg-[#0a0f14] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-[11px] text-white focus:outline-none focus:ring-1 focus:ring-orange-500"
              >
                <option value="">Filtros Salvos</option>
                {savedFilters.map((sf) => (
                  <option key={sf.id} value={sf.id}>
                    {sf.name}
                  </option>
                ))}
              </select>
            )}

            {activeSavedFilterId && (
              <button
                type="button"
                onClick={(e) => handleRemoveSavedFilter(activeSavedFilterId, e)}
                title="Remover filtro salvo"
                className="text-slate-400 hover:text-rose-400 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}

            <Popover open={isSavePopoverOpen} onOpenChange={setIsSavePopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 text-[11px] bg-[#0a0f14] border-white/[0.08] text-slate-300 hover:text-white hover:bg-white/[0.06]"
                >
                  <BookmarkPlus className="h-3.5 w-3.5 text-orange-400" />
                  Salvar Filtro
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-3 space-y-3 z-50 shadow-xl bg-[#111820] border-white/[0.08]" align="end">
                <div className="space-y-1">
                  <h4 className="text-xs font-semibold text-white">Salvar esta visualização</h4>
                  <p className="text-[11px] text-slate-400">
                    Guarda curso, faculdade, cidade, ano e os estágios do funil selecionados.
                  </p>
                </div>
                <div className="space-y-2">
                  <Input
                    placeholder="Ex: Medicina Conquista 2027"
                    value={saveFilterName}
                    onChange={(e) => setSaveFilterName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveCurrentFilter()}
                    className="h-8 text-xs bg-[#0a0f14] border-white/[0.08] text-white"
                    autoFocus
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsSavePopoverOpen(false)}
                      className="h-7 text-xs text-slate-300 hover:text-white"
                    >
                      Cancelar
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSaveCurrentFilter}
                      disabled={!saveFilterName.trim()}
                      className="h-7 text-xs bg-orange-600 hover:bg-orange-700 text-white"
                    >
                      Salvar
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            {hasActiveFilter && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-3 h-3" /> Limpar
              </button>
            )}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {FILTER_DEFS.map(({ key, label }) => (
            <div key={key}>
              <label className="block text-[10px] uppercase tracking-wider text-slate-500 mb-1">
                {label}
              </label>
              <select
                value={filters[key]}
                onChange={(e) => {
                  setFilters((f) => ({ ...f, [key]: e.target.value }))
                  setActiveSavedFilterId(null)
                }}
                className="w-full bg-[#0a0f14] border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-orange-500"
              >
                <option value="">Todos</option>
                {options[key].map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>

        {/* Filtro: Status do Funil (chips multi-select) */}
        <div className="mt-4 pt-4 border-t border-white/[0.06]">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-[10px] uppercase tracking-wider text-slate-500">
              Status do Funil
            </label>
            {selectedStages.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedStages([])}
                className="inline-flex items-center gap-1 text-[10px] text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-3 h-3" /> Limpar estágios
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {FUNNEL_FILTER_OPTIONS.map((stage) => {
              const active = selectedStages.includes(stage.id)
              return (
                <button
                  key={stage.id}
                  type="button"
                  onClick={() => toggleStage(stage.id)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${
                    active
                      ? 'text-white border-transparent shadow-sm'
                      : 'text-slate-400 border-white/[0.08] bg-[#0a0f14] hover:text-white hover:border-white/20'
                  }`}
                  style={active ? { backgroundColor: stage.color } : undefined}
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: active ? 'rgba(255,255,255,0.85)' : stage.color }}
                  />
                  {stage.name}
                </button>
              )
            })}
          </div>
          <p className="text-[10px] text-slate-500 mt-2">
            {selectedStages.length === 0
              ? 'Mostrando todas as turmas. Selecione um ou mais estágios para filtrar.'
              : `Filtrando por ${selectedStages.length} estágio(s) do funil.`}
          </p>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-[rgba(255,255,255,0.03)] border border-white/[0.06] rounded-xl py-16 text-center">
          <Users className="w-8 h-8 text-slate-600 mx-auto mb-3" />
          <p className="text-sm text-slate-400">
            {leads.length === 0
              ? 'Nenhum lead captado ainda para gerar o mapa de mercado.'
              : 'Nenhum lead encontrado com os filtros aplicados.'}
          </p>
        </div>
      ) : (
        <>
          {/* Cards de resumo */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <SummaryCard
              icon={<GraduationCap className="w-4 h-4" />}
              label="Total de Turmas"
              value={totalTurmas}
            />
            <SummaryCard
              icon={<Users className="w-4 h-4" />}
              label="Cursos Distintos"
              value={totalCursos}
            />
            <SummaryCard
              icon={<Building2 className="w-4 h-4" />}
              label="Faculdades"
              value={totalFaculdades}
            />
            <SummaryCard
              icon={<MapPin className="w-4 h-4" />}
              label="Cidades"
              value={totalCidades}
            />
          </div>

          {/* Market Share por Curso e por Faculdade */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Section
              icon={<BarChart3 className="w-4 h-4" />}
              title="Market Share por Curso"
              subtitle={`Participação de mercado — leads por curso sobre o total de ${totalLeads} leads.`}
            >
              <ShareBarList items={shareCurso} total={totalLeads} accent />
            </Section>

            <Section
              icon={<Building2 className="w-4 h-4" />}
              title="Market Share por Faculdade"
              subtitle={`Participação de mercado — leads por faculdade sobre o total de ${totalLeads} leads.`}
            >
              <ShareBarList items={shareFaculdade} total={totalLeads} />
            </Section>
          </div>

          {/* Grade Cidade × Curso */}
          <Section
            icon={<MapIcon className="w-4 h-4" />}
            title="Grade de Turmas por Cidade × Curso"
            subtitle="Contagem de turmas distintas em cada cidade/curso. Células tracejadas = cidade sem aquele curso (oportunidade de cobertura)."
          >
            <div className="overflow-x-auto -mx-1 px-1">
              <table className="w-full border-collapse text-xs min-w-[480px]">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 bg-[#0d141b] text-left py-2.5 px-3 text-[10px] uppercase tracking-wider text-slate-400 font-semibold border-b border-white/[0.06]">
                      Cidade
                    </th>
                    {cidadeCurso.cursos.map((c) => (
                      <th
                        key={c}
                        className="py-2.5 px-2 text-[10px] uppercase tracking-wider text-slate-400 font-semibold border-b border-white/[0.06] text-center whitespace-nowrap"
                      >
                        {c.length > 14 ? `${c.slice(0, 13)}…` : c}
                      </th>
                    ))}
                    <th className="py-2.5 px-3 text-[10px] uppercase tracking-wider text-orange-300 font-semibold border-b border-white/[0.06] text-center">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {cidadeCurso.cidades.map((cidade) => {
                    let rowTotal = 0
                    return (
                      <tr key={cidade} className="hover:bg-white/[0.02]">
                        <td className="sticky left-0 z-10 bg-[#0d141b] py-2.5 px-3 text-slate-200 font-medium border-b border-white/[0.04] whitespace-nowrap">
                          {cidade}
                        </td>
                        {cidadeCurso.cursos.map((curso) => {
                          const count = cidadeCurso.cells.get(`${cidade}|||${curso}`) ?? 0
                          rowTotal += count
                          return (
                            <td
                              key={curso}
                              className="py-2 px-2 border-b border-white/[0.04] text-center"
                            >
                              <MatrixCell count={count} max={cidadeCurso.maxCell} />
                            </td>
                          )
                        })}
                        <td className="py-2.5 px-3 border-b border-white/[0.04] text-center">
                          <span className="inline-flex items-center justify-center min-w-[24px] px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-300 text-[11px] font-semibold border border-orange-500/25">
                            {rowTotal}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <Legend turmasLabel />
          </Section>

          {/* Distribuição por Cidade */}
          <Section
            icon={<MapPin className="w-4 h-4" />}
            title="Distribuição por Cidade"
            subtitle="Quantidade de turmas distintas por cidade (do maior para o menor)."
          >
            <BarList items={distCidade} max={maxCidadeCount} accent />
          </Section>
        </>
      )}
    </div>
  )
}

// ---------------- Subcomponentes ----------------

function SummaryCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: number
}) {
  return (
    <div className="bg-[rgba(255,255,255,0.03)] border border-white/[0.06] rounded-xl p-4 flex items-center gap-3">
      <div className="p-2.5 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-300">
        {icon}
      </div>
      <div>
        <div className="text-2xl font-bold text-white leading-none">{value}</div>
        <div className="text-[11px] text-slate-400 mt-1">{label}</div>
      </div>
    </div>
  )
}

function Section({
  icon,
  title,
  subtitle,
  children,
}: {
  icon?: React.ReactNode
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-[rgba(255,255,255,0.03)] border border-white/[0.06] rounded-xl p-4 sm:p-5">
      <div className="mb-4">
        <div className="flex items-center gap-2">
          {icon && <span className="text-orange-400">{icon}</span>}
          <h3 className="text-sm font-semibold text-white">{title}</h3>
        </div>
        {subtitle && <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

/**
 * Lista de barras horizontais de Market Share: mostra porcentagem (sobre o total)
 * e valor absoluto, ordenada do maior para o menor.
 */
function ShareBarList({
  items,
  total,
  accent,
}: {
  items: { label: string; count: number }[]
  total: number
  accent?: boolean
}) {
  if (items.length === 0) {
    return <p className="text-xs text-slate-500 py-4 text-center">Sem dados.</p>
  }
  const maxCount = items.length ? items[0].count : 0
  return (
    <div className="space-y-2.5">
      {items.map((it) => {
        const pct = total > 0 ? (it.count / total) * 100 : 0
        const barWidth = maxCount > 0 ? (it.count / maxCount) * 100 : 0
        return (
          <div key={it.label} className="flex items-center gap-3">
            <div className="w-28 sm:w-36 shrink-0 text-xs text-slate-300 truncate" title={it.label}>
              {it.label}
            </div>
            <div className="flex-1 h-6 rounded-md bg-[#0a0f14] overflow-hidden border border-white/[0.04]">
              <div
                className={`h-full rounded-md ${
                  accent
                    ? 'bg-gradient-to-r from-orange-600 to-orange-500'
                    : 'bg-gradient-to-r from-orange-600 to-orange-500'
                }`}
                style={{ width: `${Math.max(barWidth, 4)}%` }}
              />
            </div>
            <div className="shrink-0 w-24 text-right">
              <span className="text-xs font-semibold text-white">{it.count}</span>
              <span className="text-[11px] text-slate-400 ml-1.5">({pct.toFixed(1)}%)</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function BarList({
  items,
  max,
  accent,
}: {
  items: { label: string; count: number }[]
  max: number
  accent?: boolean
}) {
  if (items.length === 0) {
    return <p className="text-xs text-slate-500 py-4 text-center">Sem dados.</p>
  }
  return (
    <div className="space-y-2.5">
      {items.map((it) => {
        const pct = max > 0 ? (it.count / max) * 100 : 0
        return (
          <div key={it.label} className="flex items-center gap-3">
            <div className="w-28 sm:w-36 shrink-0 text-xs text-slate-300 truncate" title={it.label}>
              {it.label}
            </div>
            <div className="flex-1 h-6 rounded-md bg-[#0a0f14] overflow-hidden border border-white/[0.04]">
              <div
                className={`h-full rounded-md ${
                  accent
                    ? 'bg-gradient-to-r from-orange-600 to-orange-500'
                    : 'bg-gradient-to-r from-orange-600 to-orange-500'
                }`}
                style={{ width: `${Math.max(pct, 6)}%` }}
              />
            </div>
            <div className="w-8 text-right text-xs font-semibold text-white">{it.count}</div>
          </div>
        )
      })}
    </div>
  )
}

function MatrixCell({ count, max }: { count: number; max: number }) {
  if (count === 0) {
    return (
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-dashed border-white/10 text-transparent">
        0
      </span>
    )
  }
  const intensity = max > 0 ? count / max : 0
  // do 0.15 ao 0.7 de opacidade do indigo
  const alpha = 0.15 + intensity * 0.55
  return (
    <span
      className="inline-flex items-center justify-center w-7 h-7 rounded-md text-[11px] font-bold text-white border border-orange-500/30"
      style={{ backgroundColor: `rgba(99,102,241,${alpha.toFixed(2)})` }}
      title={`${count} turma(s)`}
    >
      {count}
    </span>
  )
}

function Legend({ turmasLabel = false }: { turmasLabel?: boolean }) {
  return (
    <div className="flex items-center gap-4 mt-3 text-[10px] text-slate-500">
      <span className="flex items-center gap-1.5">
        <span className="w-3 h-3 rounded bg-[rgba(99,102,241,0.7)]" /> Maior concentração
      </span>
      <span className="flex items-center gap-1.5">
        <span className="w-3 h-3 rounded bg-[rgba(99,102,241,0.15)]" /> Menor
      </span>
      <span className="flex items-center gap-1.5">
        <span className="w-3 h-3 rounded border border-dashed border-white/15" /> Sem{' '}
        {turmasLabel ? 'turmas' : 'leads'} (oportunidade)
      </span>
    </div>
  )
}

// Reexport util (mantém compatibilidade de import em outros módulos)
export { extractTurmaNumber }
