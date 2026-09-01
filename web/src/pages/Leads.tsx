import { useState, useMemo, useEffect, useRef } from 'react'
import {
  Search,
  Plus,
  Trash2,
  GraduationCap,
  ExternalLink,
  Edit2,
  BookmarkPlus,
  Bookmark,
  X,
  ChevronLeft,
  ChevronRight,
  Link as LinkIcon,
  RefreshCw,
  Upload,
  Download,
  FileText,
  User,
  Phone,
  CheckCircle2,
  Users,
  Copy,
  GripVertical,
  Package,
  Sparkles,
  ClipboardCopy,
  Check,
  Presentation,
  Filter,
  Calendar,
} from 'lucide-react'
import { useCRM } from '@/context/CRMContext'
import { useAcesso } from '@/context/AcessoContext'
import {
  Lead,
  LeadStatus,
  LeadSource,
  Deal,
  getTurmaDisplayName,
  getFullTurmaName,
  FUNNEL_STAGES,
  FUNNEL_STAGE_BY_ID,
  DEFAULT_CHECKLIST_ITEMS,
  currentStageEnteredAt,
  metaProgresso,
  metaProgressoCor,
} from '@/types/crm'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  getSGELinks,
  getSGELinkForLead,
  linkTurmaToSGE,
  unlinkTurmaFromSGE,
  saveSGELinks,
  fetchSGEVendas,
  extractTurmaNameFromVenda,
  extractCodeFromVenda,
  normalizeNameForComparison,
  SGELink,
} from '@/utils/sgeIntegration'
import { useConfiguracoes } from '@/hooks/useConfiguracoes'
import {
  MultiSortControl,
  sortByField,
  sortByRules,
  type SortDirection,
  type SortRule,
} from '@/components/SortControl'
import { Button } from '@/components/ui/button'
import ImportCsvModal from '@/components/ImportCsvModal'
import { ColumnHeaderWithFilter, ColumnFilterKey } from '@/components/ColumnHeaderWithFilter'
import { TableFilterPopover, type FilterVal } from '@/components/TableFilterPopover'
import { downloadTemplateCsv } from '@/utils/csvImporter'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import LastEditedBy from '@/components/LastEditedBy'
import ApresentacaoPacotesModal from '@/components/ApresentacaoPacotesModal'
import AgendarReuniaoModal from '@/components/AgendarReuniaoModal'
import {
  PacoteTurma,
  listarPacotes,
  adicionarPacote,
  atualizarPacote,
  removerPacote,
  gerarMensagemPacotes,
} from '@/utils/pacotesTurma'
import {
  ItemCatalogo,
  TemplatePacote,
  fetchCatalogoAtivo,
  fetchTemplatesAtivos,
} from '@/utils/pacoteCatalogo'
import { fetchCursosConhecidos } from '@/utils/mercadoCursos'
import { matchesSearch } from '@/utils/searchMatch'
import { fetchCidadeFaculdades, ensureCidadeFaculdade, CidadeFaculdadesMap } from '@/utils/mercadoFaculdades'
import {
  listarDuracaoCursos,
  acharDuracaoAnos,
  semestreDaTurmaLabel,
  type DuracaoCurso,
} from '@/utils/duracaoCursos'
import DropdownComOutro from '@/components/DropdownComOutro'
import InlineEditText from '@/components/InlineEditText'

const STATUS_CONFIG: Record<LeadStatus, { label: string; color: string; bg: string }> = {
  Novo: {
    label: 'Novo',
    color: 'text-sky-700 dark:text-sky-300',
    bg: 'bg-sky-50 dark:bg-sky-950/40 border-sky-200 dark:border-sky-800',
  },
  Contactado: {
    label: 'Contactado',
    color: 'text-blue-700 dark:text-blue-300',
    bg: 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800',
  },
  Qualificado: {
    label: 'Qualificado',
    color: 'text-amber-700 dark:text-amber-300',
    bg: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800',
  },
  Agendado: {
    label: 'Agendado',
    color: 'text-orange-700 dark:text-orange-300',
    bg: 'bg-orange-50 dark:bg-orange-950/40 border-orange-200 dark:border-orange-800',
  },
  Convertido: {
    label: 'Ganhou',
    color: 'text-emerald-700 dark:text-emerald-300',
    bg: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800',
  },
  Perdido: {
    label: 'Perdeu',
    color: 'text-rose-700 dark:text-rose-300',
    bg: 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800',
  },
}

const EMPRESAS = ['AFF', 'AIF', 'AIF-SSA', 'AIF-V', 'AIM', 'SFF']
const SERVICOS = ['Formatura', 'Ensaio', 'Baile de Gala', 'Colação', 'Outro']
const CANAIS = ['Passiva', 'Ativa', 'Time comercial', 'Indicação', 'Instagram', 'Outro']

// Cor por empresa/marca — antes todas ficavam no mesmo cinza neutro e o nome
// praticamente sumia na tabela. Cada marca ganha uma cor própria e consistente.
const EMPRESA_CORES: Record<string, string> = {
  AIF: 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30',
  AFF: 'bg-amber-400/15 text-amber-600 dark:text-amber-400 border-amber-400/30',
  'AIF-SSA': 'bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-400 border-fuchsia-500/30',
  'AIF-V': 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border-cyan-500/30',
  AIM: 'bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/30',
  SFF: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30',
}
const EMPRESA_COR_PADRAO =
  'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700'

// Mesmo cálculo de "próxima ação" do checklist usado no Funil (Pipeline.tsx):
// primeiro item não marcado do checklist do estágio atual do deal da turma.
const ITEMS_BY_STAGE_ID = new Map<string, typeof DEFAULT_CHECKLIST_ITEMS>()
DEFAULT_CHECKLIST_ITEMS.forEach((item) => {
  const arr = ITEMS_BY_STAGE_ID.get(item.stageId) || []
  arr.push(item)
  ITEMS_BY_STAGE_ID.set(item.stageId, arr)
})

interface ProximaAcaoInfo {
  label: string
  prazoDate: Date
  diffDias: number
  vencido: boolean
  urgente: boolean
}

// Turmas já fechadas (Convertido/Perdido) ou formadas não precisam de próxima
// ação. Prazo = data de entrada no estágio atual + stagnationAlertDays do
// estágio (mesmo limiar de estagnação já usado no Funil).
function getProximaAcaoInfo(lead: Lead, deal: Deal | undefined): ProximaAcaoInfo | null {
  if (!deal || lead.concluida) return null
  if (lead.status === 'Convertido' || lead.status === 'Perdido') return null
  const stageMeta = FUNNEL_STAGES.find((s) => s.id === deal.stageId)
  if (!stageMeta) return null
  const items = ITEMS_BY_STAGE_ID.get(deal.stageId) || []
  const proximoItem = items.find((it) => !deal.checklist?.[it.id])
  if (!proximoItem) return null

  const enteredAt = currentStageEnteredAt(deal)
  const prazoDate = new Date(enteredAt)
  if (isNaN(prazoDate.getTime())) return null
  prazoDate.setDate(prazoDate.getDate() + stageMeta.stagnationAlertDays)

  const diffDias = Math.ceil((prazoDate.getTime() - Date.now()) / 86400000)
  return {
    label: proximoItem.label,
    prazoDate,
    diffDias,
    vencido: diffDias < 0,
    urgente: diffDias >= 0 && diffDias <= 2,
  }
}

type FilterKey = ColumnFilterKey
type FiltersState = Partial<Record<FilterKey, FilterVal>>

/** Modo de cada dimensão de filtro. */
const FILTER_MODE_SET: Record<FilterKey, 'enum' | 'range' | 'enum+range'> = {
  empresa: 'enum',
  curso: 'enum',
  faculdade: 'enum',
  cidade: 'enum',
  etapaFunil: 'enum',
  anoFormatura: 'enum+range',
  dataCadastro: 'range',
  dataFechamento: 'range',
  primeiroContato: 'range',
}
const SEM_FUNIL = '(sem funil)'

/** Dimensões mostradas como botões na barra de filtros do topo. */
const FILTER_BAR: { key: FilterKey; label: string; rangeType?: 'date' }[] = [
  { key: 'empresa', label: 'Empresa' },
  { key: 'curso', label: 'Curso' },
  { key: 'faculdade', label: 'Faculdade' },
  { key: 'cidade', label: 'Cidade' },
  { key: 'anoFormatura', label: 'Ano de Formatura' },
  { key: 'etapaFunil', label: 'Etapa do Funil' },
  { key: 'dataCadastro', label: 'Cadastro', rangeType: 'date' },
  { key: 'dataFechamento', label: 'Fechamento', rangeType: 'date' },
  { key: 'primeiroContato', label: '1º Contato', rangeType: 'date' },
]

/** Normaliza uma data (Notion / ISO / vazia) para 'YYYY-MM-DD' comparável. */
function normDate(s: string | undefined | null): string {
  if (!s) return ''
  const d = new Date(s)
  return isNaN(d.getTime()) ? String(s) : d.toISOString().slice(0, 10)
}

export interface SavedFilter {
  id: string
  name: string
  search: string
  filters: FiltersState
  /** compat: formato antigo (valor único por dimensão) */
  curso?: string
  faculdade?: string
  cidade?: string
  ano?: string
  empresa?: string
  status?: string
}

/** Converte um SavedFilter (novo ou antigo) para FiltersState. */
function savedToFilters(sf: SavedFilter): FiltersState {
  if (sf.filters && typeof sf.filters === 'object') return sf.filters
  const out: FiltersState = {}
  const put = (k: FilterKey, v?: string) => {
    if (v && v !== 'all') out[k] = { kind: 'enum', mode: 'is', values: [v] }
  }
  put('empresa', sf.empresa)
  put('curso', sf.curso)
  put('faculdade', sf.faculdade)
  put('cidade', sf.cidade)
  put('anoFormatura', sf.ano)
  return out
}

const SAVED_FILTERS_KEY = 'turmas_saved_filters'
const PAGE_SIZE_KEY = 'turmas_page_size'
const TURMA_COL_WIDTH_KEY = 'turmas_col_width_curso'
// Soma fixa das larguras das outras 12 colunas da tabela de turmas
// (checkbox 40 + empresa 90 + faculdade 140 + cidade 110 + ano 100 +
// serviço 110 + origem 110 + funil 110 + sge 90 + alunos 80 + obs 160 + ações 90).
const OTHER_COLS_WIDTH_SUM = 40 + 90 + 140 + 110 + 100 + 110 + 110 + 110 + 90 + 80 + 160 + 90
const MANUAL_ORDER_KEY = 'turmas_manual_order'

export default function LeadsPage() {
  const { leads, deals, members, addLead, updateLead, deleteLead, updateDeal } = useCRM()
  const { usuarios: usuariosSistema } = useAcesso()
  // Credenciais do SGE vêm sempre do Supabase (mesma fonte usada em Configurações),
  // nunca do localStorage — assim, cadastrar uma vez funciona em qualquer dispositivo.
  const { config: sgeAppConfig } = useConfiguracoes()
  const { toast } = useToast()

  // turma_id -> deal, pra saber o estágio/checklist atual de cada turma no
  // Funil e derivar a próxima ação. Segue o mesmo padrão de `.find` usado em
  // outros pontos do app (turma_id não tem unicidade garantida no schema,
  // mas na prática é 1:1).
  const dealByLeadId = useMemo(() => {
    const map = new Map<string, Deal>()
    deals.forEach((d) => {
      if (d.leadId) map.set(d.leadId, d)
    })
    return map
  }, [deals])

  // Filtros — um objeto só, empilhável. Cada dimensão pode ser
  // "é" / "não é" (enum multi) ou "está entre" (faixa, p/ ano e datas).
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<FiltersState>({})
  const [showConcluidas, setShowConcluidas] = useState(false)

  const setFilter = (key: FilterKey, next: FilterVal | undefined) =>
    setFilters((prev) => {
      const n = { ...prev }
      if (next === undefined) delete n[key]
      else n[key] = next
      return n
    })

  // Ordenação
  const [sortRules, setSortRules] = useState<SortRule[]>([
    { field: 'empresa', direction: 'asc' },
    { field: 'faculdade', direction: 'asc' },
    { field: 'curso', direction: 'asc' },
    { field: 'anoFormatura', direction: 'asc' },
  ])
  const [manualMode, setManualMode] = useState(false)
  const sortDirFor = (field: string): SortDirection | false => {
    const r = sortRules.find((r) => r.field === field)
    return r ? r.direction : false
  }
  const setSingleSort = (field: string, direction: SortDirection) => {
    setManualMode(false)
    setSortRules([{ field, direction }])
  }

  // Largura ajustável da coluna "Turma / Curso" — arraste a borda direita do
  // cabeçalho pra ver o nome completo sem quebra, ou encolher pra compactar.
  const [turmaColWidth, setTurmaColWidth] = useState<number>(() => {
    try {
      const stored = localStorage.getItem(TURMA_COL_WIDTH_KEY)
      const n = stored ? Number(stored) : NaN
      return !isNaN(n) && n >= 140 && n <= 640 ? n : 260
    } catch {
      return 260
    }
  })
  // Ref sincronizada de forma síncrona a cada movimento (não via useEffect)
  // porque handleResizeEnd precisa do valor mais recente no exato momento do
  // mouseup, sem depender do React ter tido chance de rodar o efeito antes.
  const turmaColWidthRef = useRef(turmaColWidth)
  const resizeStateRef = useRef<{ startX: number; startWidth: number } | null>(null)

  const handleResizeMove = (e: MouseEvent) => {
    if (!resizeStateRef.current) return
    const delta = e.clientX - resizeStateRef.current.startX
    const next = Math.min(640, Math.max(140, resizeStateRef.current.startWidth + delta))
    turmaColWidthRef.current = next
    setTurmaColWidth(next)
  }
  const handleResizeEnd = () => {
    resizeStateRef.current = null
    window.removeEventListener('mousemove', handleResizeMove)
    window.removeEventListener('mouseup', handleResizeEnd)
    try {
      localStorage.setItem(TURMA_COL_WIDTH_KEY, String(turmaColWidthRef.current))
    } catch {
      // ignora
    }
  }
  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    resizeStateRef.current = { startX: e.clientX, startWidth: turmaColWidth }
    window.addEventListener('mousemove', handleResizeMove)
    window.addEventListener('mouseup', handleResizeEnd)
  }
  useEffect(() => {
    return () => {
      window.removeEventListener('mousemove', handleResizeMove)
      window.removeEventListener('mouseup', handleResizeEnd)
    }
  }, [])

  // Nome da etapa do funil (Kanban) de cada turma, via o deal vinculado.
  const etapaFunilDoLead = (lead: Lead): string =>
    FUNNEL_STAGE_BY_ID[dealByLeadId.get(lead.id)?.stageId || '']?.name || SEM_FUNIL

  // Saved Filters State
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>(() => {
    try {
      const stored = localStorage.getItem(SAVED_FILTERS_KEY)
      return stored ? JSON.parse(stored) : []
    } catch {
      return []
    }
  })
  const [saveFilterName, setSaveFilterName] = useState('')
  const [isSavePopoverOpen, setIsSavePopoverOpen] = useState(false)
  const [activeFilterId, setActiveFilterId] = useState<string | null>(null)

  // Pagination State
  const [pageSize, setPageSize] = useState<number | 'all'>(() => {
    try {
      const stored = localStorage.getItem(PAGE_SIZE_KEY)
      if (stored === 'all') return 'all'
      if (stored) {
        const num = Number(stored)
        if ([10, 20, 30, 50, 100].includes(num)) return num
      }
      return 20
    } catch {
      return 20
    }
  })
  const [currentPage, setCurrentPage] = useState<number>(1)

  // SGE links
  const [sgeLinks, setSgeLinks] = useState<SGELink[]>(() => getSGELinks())
  const [isSyncingSGE, setIsSyncingSGE] = useState(false)

  useEffect(() => {
    const handleSgeLinksChange = () => {
      setSgeLinks(getSGELinks())
    }
    window.addEventListener('sge_links_changed', handleSgeLinksChange)
    window.addEventListener('storage', handleSgeLinksChange)
    return () => {
      window.removeEventListener('sge_links_changed', handleSgeLinksChange)
      window.removeEventListener('storage', handleSgeLinksChange)
    }
  }, [])

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [editingLead, setEditingLead] = useState<Lead | null>(null)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  // Base real de cursos/cidades/faculdades já cadastrados — usada nos
  // dropdowns pra evitar erro de digitação ao criar/editar turma.
  const [cursosConhecidosModal, setCursosConhecidosModal] = useState<string[]>([])
  const [cidadeFaculdadesModal, setCidadeFaculdadesModal] = useState<CidadeFaculdadesMap>({})
  const cidadesConhecidasModal = useMemo(
    () => Object.keys(cidadeFaculdadesModal).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [cidadeFaculdadesModal],
  )
  // Duração dos cursos (Admin → Turmas) — pra calcular em que semestre a turma está.
  const [duracaoCursos, setDuracaoCursos] = useState<DuracaoCurso[]>([])
  const semestreDaTurmaTexto = (l: { anoFormatura?: string | null; curso?: string | null; faculdade?: string | null }) =>
    semestreDaTurmaLabel(l.anoFormatura, acharDuracaoAnos(duracaoCursos, l.curso, l.faculdade))
  useEffect(() => {
    fetchCursosConhecidos().then(setCursosConhecidosModal)
    fetchCidadeFaculdades().then(setCidadeFaculdadesModal)
    listarDuracaoCursos().then(setDuracaoCursos)
  }, [])

  // Persist saved filters
  useEffect(() => {
    try {
      localStorage.setItem(SAVED_FILTERS_KEY, JSON.stringify(savedFilters))
    } catch (e) {
      console.error('Error saving filters', e)
    }
  }, [savedFilters])

  // Persist page size preference
  const handlePageSizeChange = (size: number | 'all') => {
    setPageSize(size)
    setCurrentPage(1)
    try {
      localStorage.setItem(PAGE_SIZE_KEY, String(size))
    } catch (e) {
      console.error('Error saving page size', e)
    }
  }

  // Form State
  const [formData, setFormData] = useState<{
    curso: string
    faculdade: string
    turma: string
    anoFormatura: string
    cidade: string
    status: LeadStatus
    source: LeadSource
    potentialValue: number
    ownerId: string
    empresa: string
    tipoServico: string
    comoConheceu: string
    closer: string
    concorrentes: string
    observacoes: string
    sdr: string
    primeiroContatoEm: string
    dataCadastro: string
    dataFechamento: string
    linkProposta: string
    contatoNome: string
    contatoTelefone: string
    alunosFechados: number
    sgeCode: string
  }>({
    curso: '',
    faculdade: '',
    turma: 'Turma 0',
    anoFormatura: '2027.1',
    cidade: 'Conquista',
    status: 'Novo',
    source: 'Ativa',
    potentialValue: 35000,
    ownerId: members[0]?.id || '',
    empresa: 'AFF',
    tipoServico: 'Formatura',
    comoConheceu: 'Passiva',
    closer: '',
    concorrentes: '',
    observacoes: '',
    sdr: '',
    primeiroContatoEm: '',
    dataCadastro: '',
    dataFechamento: '',
    linkProposta: '',
    contatoNome: '',
    contatoTelefone: '',
    alunosFechados: 0,
    sgeCode: '',
  })

  // Listas únicas para filtros gerais
  const faculdades = useMemo(() => {
    const set = new Set<string>()
    leads.forEach((l) => l.faculdade && set.add(l.faculdade))
    return Array.from(set).sort()
  }, [leads])

  const cursos = useMemo(() => {
    const set = new Set<string>()
    leads.forEach((l) => l.curso && set.add(l.curso))
    return Array.from(set).sort()
  }, [leads])

  const cidades = useMemo(() => {
    const set = new Set<string>()
    leads.forEach((l) => l.cidade && set.add(l.cidade))
    return Array.from(set).sort()
  }, [leads])

  const anos = useMemo(() => {
    const set = new Set<string>()
    leads.forEach((l) => l.anoFormatura && set.add(l.anoFormatura))
    return Array.from(set).sort()
  }, [leads])

  const empresas = useMemo(() => {
    const set = new Set<string>()
    leads.forEach((l) => l.empresa && set.add(l.empresa))
    return Array.from(set).sort()
  }, [leads])

  const origensConhecidas = useMemo(() => {
    const set = new Set<string>(['Ativa', 'Passiva', 'Indicação'])
    leads.forEach((l) => l.comoConheceu && set.add(l.comoConheceu))
    return Array.from(set).sort()
  }, [leads])

  // Valores possíveis de cada dimensão enum (pros checkboxes do filtro)
  const uniqueColumnValues = useMemo(() => {
    const s = {
      empresa: new Set<string>(),
      curso: new Set<string>(),
      faculdade: new Set<string>(),
      cidade: new Set<string>(),
      anoFormatura: new Set<string>(),
      etapaFunil: new Set<string>(),
    }
    leads.forEach((l) => {
      if (l.empresa) s.empresa.add(l.empresa)
      if (l.curso) s.curso.add(l.curso)
      if (l.faculdade) s.faculdade.add(l.faculdade)
      if (l.cidade) s.cidade.add(l.cidade)
      if (l.anoFormatura) s.anoFormatura.add(l.anoFormatura)
      s.etapaFunil.add(etapaFunilDoLead(l))
    })
    const order = FUNNEL_STAGES.map((st) => st.name)
    return {
      empresa: [...s.empresa].sort(),
      curso: [...s.curso].sort(),
      faculdade: [...s.faculdade].sort(),
      cidade: [...s.cidade].sort(),
      anoFormatura: [...s.anoFormatura].sort(),
      etapaFunil: [...s.etapaFunil].sort(
        (a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99),
      ),
    } as Record<'empresa' | 'curso' | 'faculdade' | 'cidade' | 'anoFormatura' | 'etapaFunil', string[]>
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leads, dealByLeadId])

  // Filter logic (combining general filters + saved filters + column filters with logical AND)
  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      const matchBusca = matchesSearch(
        [
          getFullTurmaName(lead),
          lead.curso,
          lead.faculdade,
          lead.turma,
          lead.anoFormatura,
          lead.cidade,
          lead.empresa,
          lead.closer,
          lead.sdr,
          lead.comoConheceu,
          lead.contatoNome,
          lead.observacoes,
        ],
        search,
      )

      const matchesConcluida = showConcluidas || !lead.concluida
      if (!matchBusca || !matchesConcluida) return false

      // Valor do lead em cada dimensão de filtro
      const valOf = (key: FilterKey): string => {
        switch (key) {
          case 'empresa':
            return lead.empresa || 'AFF'
          case 'curso':
            return lead.curso || ''
          case 'faculdade':
            return lead.faculdade || ''
          case 'cidade':
            return lead.cidade || ''
          case 'anoFormatura':
            return lead.anoFormatura || ''
          case 'etapaFunil':
            return etapaFunilDoLead(lead)
          case 'dataCadastro':
            return normDate(lead.dataCadastro)
          case 'dataFechamento':
            return normDate(lead.dataFechamento)
          case 'primeiroContato':
            return normDate(lead.primeiroContatoEm)
        }
      }

      for (const [k, f] of Object.entries(filters) as [FilterKey, FilterVal][]) {
        if (!f) continue
        const v = valOf(k)
        if (f.kind === 'enum') {
          const inSet = f.values.includes(v)
          if (f.mode === 'is' && !inSet) return false
          if (f.mode === 'not' && inSet) return false
        } else {
          const cv = k === 'anoFormatura' ? v : normDate(v)
          const from = k === 'anoFormatura' ? f.from : normDate(f.from)
          const to = k === 'anoFormatura' ? f.to : normDate(f.to)
          if (!cv) return false
          if (from && cv < from) return false
          if (to && cv > to) return false
        }
      }
      return true
    })
  }, [leads, search, filters, showConcluidas, dealByLeadId])

  // Opções de ordenação disponíveis para a tabela de turmas
  const SORT_OPTIONS = [
    { value: 'curso', label: 'Curso' },
    { value: 'empresa', label: 'Empresa' },
    { value: 'faculdade', label: 'Faculdade' },
    { value: 'cidade', label: 'Cidade' },
    { value: 'anoFormatura', label: 'Ano de Formatura' },
    { value: 'status', label: 'Etapa do Funil' },
    { value: 'tipoServico', label: 'Tipo de Serviço' },
    { value: 'alunosFechados', label: 'Alunos Fechados' },
    { value: 'potentialValue', label: 'Valor Potencial' },
  ]

  // Ordem manual (arrastar e soltar) — guarda a sequência de IDs escolhida
  // pelo Lucas, persistida no navegador. Turmas ainda não posicionadas
  // manualmente ficam no fim, na ordem natural.
  const [manualOrder, setManualOrder] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(MANUAL_ORDER_KEY)
      return stored ? JSON.parse(stored) : []
    } catch {
      return []
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(MANUAL_ORDER_KEY, JSON.stringify(manualOrder))
    } catch {
      // ignora
    }
  }, [manualOrder])
  const [draggedId, setDraggedId] = useState<string | null>(null)

  const extractSortValue = (lead: Lead, field: string): unknown => {
    switch (field) {
      case 'manual': {
        const idx = manualOrder.indexOf(lead.id)
        return idx === -1 ? Number.MAX_SAFE_INTEGER : idx
      }
      case 'alunosFechados':
        return lead.alunosFechados || 0
      case 'potentialValue':
        return lead.potentialValue || 0
      case 'status': {
        const nome = etapaFunilDoLead(lead)
        const idx = FUNNEL_STAGES.findIndex((s) => s.name === nome)
        return idx === -1 ? 99 : idx
      }
      default:
        return (lead as any)[field]
    }
  }

  // Sorted list (aplicada sobre os resultados já filtrados) — em modo manual usa a
  // ordem arrastada pelo Lucas; senão, aplica os critérios de ordenação em cascata
  // (o primeiro manda, os seguintes só desempatam).
  const sortedLeads = useMemo(() => {
    if (manualMode) return sortByField(filteredLeads, 'manual', 'asc', extractSortValue)
    return sortByRules(filteredLeads, sortRules, extractSortValue)
  }, [filteredLeads, sortRules, manualMode, manualOrder])

  // Ao entrar no modo manual pela primeira vez, congela a ordem atualmente
  // exibida como ponto de partida pra arrastar.
  const toggleManualMode = () => {
    setManualMode((prev) => {
      const next = !prev
      if (next && manualOrder.length === 0) {
        setManualOrder(sortedLeads.map((l) => l.id))
      }
      return next
    })
  }

  const handleDragStartRow = (id: string) => setDraggedId(id)
  const handleDropOnRow = (targetId: string) => {
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null)
      return
    }
    setManualOrder((prev) => {
      const base = prev.length > 0 ? prev : sortedLeads.map((l) => l.id)
      const next = base.filter((id) => id !== draggedId)
      const targetIdx = next.indexOf(targetId)
      next.splice(targetIdx === -1 ? next.length : targetIdx, 0, draggedId)
      return next
    })
    setDraggedId(null)
  }

  // Seleção de turmas (checkboxes) — usada para duplicar em lote
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const toggleSelectAllVisible = () => {
    setSelectedIds((prev) => {
      const allSelected = paginatedLeads.length > 0 && paginatedLeads.every((l) => prev.has(l.id))
      const next = new Set(prev)
      paginatedLeads.forEach((l) => (allSelected ? next.delete(l.id) : next.add(l.id)))
      return next
    })
  }

  function proximaTurmaPara(base: Lead): string {
    const nums = leads
      .filter((l) => l.curso === base.curso && l.faculdade === base.faculdade && l.cidade === base.cidade)
      .map((l) => parseInt((l.turma || '').replace(/\D/g, ''), 10))
      .filter((n) => !isNaN(n))
    const max = nums.length ? Math.max(...nums) : 0
    return `Turma ${max + 1}`
  }

  const handleDuplicateSelected = async () => {
    const toDuplicate = leads.filter((l) => selectedIds.has(l.id))
    if (toDuplicate.length === 0) return
    for (const l of toDuplicate) {
      await addLead({
        curso: l.curso,
        faculdade: l.faculdade,
        turma: proximaTurmaPara(l),
        anoFormatura: l.anoFormatura,
        cidade: l.cidade,
        status: 'Novo',
        source: l.source,
        potentialValue: l.potentialValue,
        ownerId: l.ownerId || members[0]?.id || '',
        empresa: l.empresa,
        tipoServico: l.tipoServico,
        comoConheceu: l.comoConheceu,
        closer: '',
        concorrentes: '',
        observacoes: '',
        notes: '',
        sdr: '',
        primeiroContatoEm: '',
        dataCadastro: '',
        dataFechamento: '',
        linkProposta: '',
        contatoNome: '',
        contatoTelefone: '',
        alunosFechados: 0,
        createdAt: new Date().toISOString(),
        totalAlunos: 0,
      })
    }
    toast({
      title: `${toDuplicate.length} turma(s) duplicada(s)`,
      description: 'As cópias entraram como "Novo" — edite o que precisar em cada uma.',
    })
    setSelectedIds(new Set())
  }

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [search, filters])

  // Pagination calculation
  const totalPages = useMemo(() => {
    if (pageSize === 'all' || sortedLeads.length === 0) return 1
    return Math.ceil(sortedLeads.length / pageSize)
  }, [sortedLeads.length, pageSize])

  const paginatedLeads = useMemo(() => {
    if (pageSize === 'all') return sortedLeads
    const start = (currentPage - 1) * pageSize
    return sortedLeads.slice(start, start + pageSize)
  }, [sortedLeads, currentPage, pageSize])

  const activeColFiltersCount = Object.keys(filters).length

  // Stats rápidos
  const stats = useMemo(() => {
    // Turmas com mesmaTurmaFisicaDe preenchido são a mesma turma física de outra
    // linha (pacote/venda separado no SGE) - não contam como turma adicional aqui,
    // embora seus alunos/pagamentos continuem reais e contados normalmente em
    // Financeiro/DRE (que somam por cliente/pagamento, não por linha de turma).
    const contaveis = leads.filter((l) => !l.mesmaTurmaFisicaDe)
    const total = contaveis.length
    const ganhas = contaveis.filter((l) => l.status === 'Convertido').length
    const perdidas = contaveis.filter((l) => l.status === 'Perdido').length
    const abertas = total - ganhas - perdidas
    // Vinculada ao SGE = turmas.codigo já é o código real do SGE, ou o
    // Auto-Win (roda sozinho 3x/dia) já achou o match e gravou em
    // turmas.codigo_sge. Vem do banco, não do localStorage deste navegador -
    // por isso é igual pra qualquer pessoa que abrir o site.
    const linkedCount = contaveis.filter((l) => !!l.codigoSGE).length
    return { total, ganhas, perdidas, abertas, linkedCount }
  }, [leads])

  // Market Share por Empresa: participação de cada marca (AIF, AFF, SFF, AIM...)
  // sobre o total de turmas visíveis com os filtros atuais aplicados.
  const shareEmpresa = useMemo(() => {
    const counts = new Map<string, number>()
    for (const l of filteredLeads) {
      const emp = l.empresa || 'Sem empresa'
      counts.set(emp, (counts.get(emp) || 0) + 1)
    }
    const total = filteredLeads.length
    return Array.from(counts.entries())
      .map(([empresa, count]) => ({ empresa, count, pct: total > 0 ? (count / total) * 100 : 0 }))
      .sort((a, b) => b.count - a.count || a.empresa.localeCompare(b.empresa, 'pt-BR'))
  }, [filteredLeads])

  // Sincronização SGE Automática com Auto-Win
  const handleSyncSGE = async () => {
    const cfg = { cnpj: sgeAppConfig.sgeCnpj, token: sgeAppConfig.sgeToken }
    if (!cfg.cnpj?.trim() || !cfg.token?.trim()) {
      toast({
        title: 'Credenciais do SGE não configuradas',
        description: 'Configure o CNPJ e Token na página de Configurações (/configuracoes).',
        variant: 'destructive',
      })
      return
    }

    setIsSyncingSGE(true)

    try {
      const now = new Date()
      const past90 = new Date()
      past90.setDate(past90.getDate() - 90)

      const startDateStr = past90.toISOString().split('T')[0]
      const endDateStr = now.toISOString().split('T')[0]

      const vendas = await fetchSGEVendas(cfg.cnpj, cfg.token, startDateStr, endDateStr)

      const currentLinks = getSGELinks()
      const linkedLeadIds = new Set(currentLinks.map((l) => l.leadId))

      let newlyLinked = 0
      let alreadyLinked = 0
      let unmatched = 0
      let autoWonCount = 0

      const nextLinksMap = new Map<string, SGELink>()
      currentLinks.forEach((l) => nextLinksMap.set(l.leadId, l))

      // Mapeamento normalizado de todas as turmas do CRM
      const crmTurmasMap = new Map<
        string,
        {
          id: string
          fullName: string
          variations: string[]
        }
      >()

      leads.forEach((l) => {
        const full1 = `${l.empresa || ''} ${l.curso} ${l.faculdade} ${l.turma} ${l.anoFormatura} ${l.cidade}`
        const full2 = `${l.curso} ${l.faculdade} ${l.turma} ${l.anoFormatura} ${l.cidade}`
        const full3 = `${l.curso} ${l.faculdade} ${l.turma}`
        const full4 = getTurmaDisplayName(l)

        crmTurmasMap.set(l.id, {
          id: l.id,
          fullName: full1.trim(),
          variations: [
            normalizeNameForComparison(full1),
            normalizeNameForComparison(full2),
            normalizeNameForComparison(full3),
            normalizeNameForComparison(full4),
          ],
        })
      })

      for (const venda of vendas) {
        const rawTurmaName = extractTurmaNameFromVenda(venda)
        const sgeCode = extractCodeFromVenda(venda)

        if (!rawTurmaName || !sgeCode) continue

        const normVendaName = normalizeNameForComparison(rawTurmaName)
        let matchedLeadId: string | null = null

        for (const [leadId, info] of crmTurmasMap.entries()) {
          if (info.variations.some((v) => v === normVendaName)) {
            matchedLeadId = leadId
            break
          }
          if (
            normVendaName.length > 5 &&
            info.variations.some((v) => v.includes(normVendaName) || normVendaName.includes(v))
          ) {
            matchedLeadId = leadId
            break
          }
        }

        if (matchedLeadId) {
          if (linkedLeadIds.has(matchedLeadId)) {
            alreadyLinked++
          } else {
            newlyLinked++
            linkedLeadIds.add(matchedLeadId)
            nextLinksMap.set(matchedLeadId, {
              leadId: matchedLeadId,
              sgeProjectCode: sgeCode,
              sgeProjectName: rawTurmaName,
              linkedAt: new Date().toISOString(),
            })
          }

          // Auto-Win: Se turma encontrada no SGE e o estágio atual não for stage-6 ("Fechou ou Perdeu"), move automaticamente
          const relatedDeal = deals.find((d) => d.leadId === matchedLeadId)
          const matchedLead = leads.find((l) => l.id === matchedLeadId)
          const nowIso = new Date().toISOString()
          const todayBr = new Date().toLocaleDateString('pt-BR')

          if (relatedDeal && relatedDeal.stageId !== 'stage-6') {
            const currentHistory = relatedDeal.stageHistory || [
              { stage: relatedDeal.stageId, enteredAt: relatedDeal.createdAt, daysInStage: 0 },
            ]
            const updatedHistory = [
              ...currentHistory,
              { stage: 'stage-6', enteredAt: nowIso, daysInStage: 0 },
            ]

            updateDeal(relatedDeal.id, {
              stageId: 'stage-6',
              outcome: 'ganho',
              probability: 100,
              stageHistory: updatedHistory,
              updatedAt: nowIso,
            })

            // Atualiza também status da Lead se ainda não era Convertido
            if (matchedLead && matchedLead.status !== 'Convertido') {
              updateLead(matchedLead.id, {
                status: 'Convertido',
                dataFechamento: matchedLead.dataFechamento || todayBr,
              })
            }
            autoWonCount++
          } else if (matchedLead && matchedLead.status !== 'Convertido') {
            updateLead(matchedLead.id, {
              status: 'Convertido',
              dataFechamento: matchedLead.dataFechamento || todayBr,
            })
            autoWonCount++
          }
        } else {
          unmatched++
        }
      }

      const finalLinks = Array.from(nextLinksMap.values())
      saveSGELinks(finalLinks)
      setSgeLinks(finalLinks)

      toast({
        title: 'Sincronização concluída com o SGE!',
        description: `${newlyLinked} novas turmas vinculadas, ${alreadyLinked} já vinculadas, ${autoWonCount} movidas para Ganho (Auto-Win), ${unmatched} sem match.`,
      })
    } catch (err: any) {
      toast({
        title: 'Erro na sincronização',
        description: err.message || 'Falha ao buscar dados da API do SGE.',
        variant: 'destructive',
      })
    } finally {
      setIsSyncingSGE(false)
    }
  }

  // Saved Filters Operations
  const handleSaveCurrentFilter = () => {
    if (!saveFilterName.trim()) return
    const newFilter: SavedFilter = {
      id: `filter-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: saveFilterName.trim(),
      search,
      filters,
    }
    setSavedFilters((prev) => [...prev, newFilter])
    setActiveFilterId(newFilter.id)
    setSaveFilterName('')
    setIsSavePopoverOpen(false)
  }

  const handleApplySavedFilter = (sf: SavedFilter) => {
    setActiveFilterId(sf.id)
    setSearch(sf.search || '')
    setFilters(savedToFilters(sf))
  }

  const handleRemoveSavedFilter = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    setSavedFilters((prev) => prev.filter((f) => f.id !== id))
    if (activeFilterId === id) {
      setActiveFilterId(null)
    }
  }

  const handleClearAllFilters = () => {
    setSearch('')
    setFilters({})
    setActiveFilterId(null)
  }

  const handleOpenCreate = () => {
    setEditingLead(null)
    setFormData({
      curso: '',
      faculdade: '',
      turma: 'Turma 0',
      anoFormatura: '2027.1',
      cidade: 'Conquista',
      status: 'Novo',
      source: 'Passiva',
      potentialValue: 35000,
      ownerId: members[0]?.id || '',
      empresa: 'AFF',
      tipoServico: 'Formatura',
      comoConheceu: 'Passiva',
      closer: '',
      concorrentes: '',
      observacoes: '',
      sdr: '',
      primeiroContatoEm: '',
      dataCadastro: '',
      dataFechamento: '',
      linkProposta: '',
      contatoNome: '',
      contatoTelefone: '',
      alunosFechados: 0,
      sgeCode: '',
    })
    setIsModalOpen(true)
  }

  const handleOpenEdit = (lead: Lead) => {
    setEditingLead(lead)
    const existingSge = getSGELinkForLead(lead.id)
    setFormData({
      curso: lead.curso || '',
      faculdade: lead.faculdade || '',
      turma: lead.turma || '',
      anoFormatura: lead.anoFormatura || '',
      cidade: lead.cidade || '',
      status: lead.status,
      source: lead.source,
      potentialValue: lead.potentialValue || 0,
      ownerId: lead.ownerId || members[0]?.id || '',
      empresa: lead.empresa || 'AFF',
      tipoServico: lead.tipoServico || 'Formatura',
      comoConheceu: lead.comoConheceu || 'Passiva',
      closer: lead.closer || '',
      concorrentes: lead.concorrentes || '',
      observacoes: lead.observacoes || lead.notes || '',
      sdr: lead.sdr || '',
      primeiroContatoEm: lead.primeiroContatoEm || '',
      dataCadastro: lead.dataCadastro || '',
      dataFechamento: lead.dataFechamento || '',
      linkProposta: lead.linkProposta || '',
      contatoNome: lead.contatoNome || '',
      contatoTelefone: lead.contatoTelefone || '',
      alunosFechados: lead.alunosFechados || 0,
      sgeCode: existingSge?.sgeProjectCode || '',
    })
    setIsModalOpen(true)
  }

  const handleSave = async () => {
    if (!formData.curso.trim() || !formData.faculdade.trim()) return

    const payload = {
      curso: formData.curso.trim(),
      faculdade: formData.faculdade.trim(),
      turma: formData.turma.trim() || 'Turma 0',
      anoFormatura: formData.anoFormatura.trim() || '2027.1',
      cidade: formData.cidade.trim() || 'Conquista',
      status: formData.status,
      source: (formData.comoConheceu || formData.source || 'Ativa') as LeadSource,
      potentialValue: Number(formData.potentialValue) || 0,
      ownerId: formData.ownerId || members[0]?.id || '',
      empresa: formData.empresa,
      tipoServico: formData.tipoServico,
      comoConheceu: formData.comoConheceu,
      closer: formData.closer,
      concorrentes: formData.concorrentes,
      observacoes: formData.observacoes,
      notes: formData.observacoes,
      sdr: formData.sdr,
      primeiroContatoEm: formData.primeiroContatoEm,
      dataCadastro: formData.dataCadastro,
      dataFechamento: formData.dataFechamento,
      linkProposta: formData.linkProposta,
      contatoNome: formData.contatoNome,
      contatoTelefone: formData.contatoTelefone,
      alunosFechados: Math.max(0, Number(formData.alunosFechados) || 0),
    }

    let savedLeadId = editingLead?.id
    if (editingLead) {
      await updateLead(editingLead.id, payload)
    } else {
      const created = await addLead({
        ...payload,
        createdAt: new Date().toISOString(),
        totalAlunos: 0,
      })
      savedLeadId = created.id
    }

    // Atualiza vínculo SGE se preenchido
    if (savedLeadId) {
      if (formData.sgeCode.trim()) {
        const fullTurmaDesc = `${payload.empresa} ${payload.curso} ${payload.faculdade} ${payload.turma}`
        const updated = linkTurmaToSGE(savedLeadId, formData.sgeCode.trim(), fullTurmaDesc)
        setSgeLinks(updated)
      } else if (editingLead) {
        const updated = unlinkTurmaFromSGE(savedLeadId)
        setSgeLinks(updated)
      }
    }

    setIsModalOpen(false)
    setEditingLead(null)
  }

  const handleDelete = (id: string) => {
    deleteLead(id)
    if (selectedLead?.id === id) setSelectedLead(null)
    setDeleteConfirmId(null)
  }

  const hasAnyActiveFilter = !!search || activeColFiltersCount > 0

  return (
    <div className="space-y-6">
      {/* Header com botões de ação e integração SGE */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <GraduationCap className="h-7 w-7 text-orange-600 dark:text-orange-400" />
            Turmas (Leads)
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Gestão completa das turmas importadas do Notion e sincronizadas com o CRM.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {selectedIds.size > 0 && (
            <Button
              variant="outline"
              onClick={handleDuplicateSelected}
              className="gap-2 border-orange-300 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 hover:bg-orange-100 dark:hover:bg-orange-900/50"
            >
              <Copy className="h-4 w-4" />
              Duplicar {selectedIds.size} Selecionada{selectedIds.size > 1 ? 's' : ''}
            </Button>
          )}

          {/* Botão Sincronizar SGE */}
          <Button
            variant="outline"
            onClick={handleSyncSGE}
            disabled={isSyncingSGE}
            className="gap-2 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
            title="Sincronizar turmas automaticamente com projetos de vendas do SGE ERP"
          >
            <RefreshCw
              className={cn(
                'h-4 w-4 text-emerald-600 dark:text-emerald-400',
                isSyncingSGE && 'animate-spin',
              )}
            />
            {isSyncingSGE ? 'Sincronizando...' : 'Sincronizar SGE'}
          </Button>

          <Button
            variant="outline"
            onClick={() => setIsImportModalOpen(true)}
            className="gap-2 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
          >
            <Upload className="h-4 w-4 text-orange-600 dark:text-orange-400" />
            Importar CSV
          </Button>

          <Button
            onClick={handleOpenCreate}
            className="bg-orange-600 hover:bg-orange-700 text-white gap-2 shadow-sm"
          >
            <Plus className="h-4 w-4" />
            Nova Turma
          </Button>
        </div>
      </div>

      {/* KPI Cards (Total, Em Andamento, Ganhas, Perdidas + Badge SGE) */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Card className="border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-sm">
          <CardContent className="p-4">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Total de Turmas
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">
              {stats.total}
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-sm">
          <CardContent className="p-4">
            <div className="text-xs font-medium text-amber-600 dark:text-amber-400">
              Em Andamento
            </div>
            <div className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">
              {stats.abertas}
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-sm">
          <CardContent className="p-4">
            <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Ganhas</div>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
              {stats.ganhas}
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-sm">
          <CardContent className="p-4">
            <div className="text-xs font-medium text-rose-600 dark:text-rose-400">Perdidas</div>
            <div className="text-2xl font-bold text-rose-600 dark:text-rose-400 mt-1">
              {stats.perdidas}
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-sm col-span-2 sm:col-span-1">
          <CardContent className="p-4">
            <div className="text-xs font-medium text-orange-600 dark:text-orange-400 flex items-center justify-between">
              <span>Vinculadas ao SGE</span>
              <LinkIcon className="h-3.5 w-3.5 text-emerald-500" />
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1 flex items-baseline gap-1">
              <span>{stats.linkedCount}</span>
              <span className="text-xs font-normal text-slate-500">de {stats.total}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Market Share por Empresa */}
      {shareEmpresa.length > 1 && (
        <Card className="border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-sm">
          <CardContent className="p-4">
            <div className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-3">
              Market Share por Empresa{' '}
              <span className="font-normal text-slate-400">
                ({filteredLeads.length} turma{filteredLeads.length === 1 ? '' : 's'} nos filtros
                atuais)
              </span>
            </div>
            <div className="space-y-2">
              {shareEmpresa.map((e) => (
                <div key={e.empresa} className="flex items-center gap-3">
                  <div className="w-20 shrink-0 text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">
                    {e.empresa}
                  </div>
                  <div className="flex-1 h-5 rounded-md bg-slate-100 dark:bg-slate-950 overflow-hidden border border-slate-200 dark:border-white/[0.06]">
                    <div
                      className="h-full rounded-md bg-gradient-to-r from-orange-600 to-orange-500"
                      style={{ width: `${Math.max(e.pct, 3)}%` }}
                    />
                  </div>
                  <div className="w-24 shrink-0 text-right text-xs">
                    <span className="font-semibold text-slate-800 dark:text-slate-100">
                      {e.count}
                    </span>
                    <span className="text-slate-400 ml-1.5">({e.pct.toFixed(1)}%)</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Saved Filters Chips (if any saved) */}
      {savedFilters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 p-3 bg-slate-50/70 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 mr-1">
            <Bookmark className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" />
            <span>Filtros Salvos:</span>
          </div>
          {savedFilters.map((sf) => {
            const isActive = activeFilterId === sf.id
            return (
              <Badge
                key={sf.id}
                variant={isActive ? 'default' : 'outline'}
                className={cn(
                  'cursor-pointer text-xs py-1 px-2.5 gap-1.5 transition-all shadow-none',
                  isActive
                    ? 'bg-orange-600 hover:bg-orange-700 text-white font-medium'
                    : 'bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700',
                )}
                onClick={() => handleApplySavedFilter(sf)}
              >
                <span>{sf.name}</span>
                <button
                  type="button"
                  onClick={(e) => handleRemoveSavedFilter(sf.id, e)}
                  className="rounded-full hover:bg-black/20 dark:hover:bg-white/20 p-0.5"
                  title="Remover filtro salvo"
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            )
          })}
        </div>
      )}

      {/* Filtros e Busca */}
      <Card className="border-slate-200 dark:border-slate-800">
        <CardContent className="p-4 space-y-3">
          {/* Top filter controls */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 pb-2 border-b border-slate-100 dark:border-slate-800">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Buscar por curso, faculdade, cidade, SDR, closer, observações..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-slate-50 dark:bg-slate-950/50"
              />
            </div>

            <div className="flex items-center gap-2">
              {/* Ordenação — vários critérios em cascata, estilo Notion (o 1º manda, os seguintes só desempatam) */}
              <MultiSortControl options={SORT_OPTIONS} rules={sortRules} onRulesChange={setSortRules} />
              <Button
                type="button"
                variant={manualMode ? 'default' : 'outline'}
                size="sm"
                className="h-9 text-xs gap-1.5"
                onClick={toggleManualMode}
                title="Arrastar linhas manualmente pra reordenar"
              >
                <GripVertical className="h-3.5 w-3.5" /> Manual
              </Button>

              {/* Dropdown Filtros Salvos */}
              {savedFilters.length > 0 && (
                <Select
                  value={activeFilterId || 'none'}
                  onValueChange={(val) => {
                    if (val === 'none') {
                      setActiveFilterId(null)
                    } else {
                      const found = savedFilters.find((f) => f.id === val)
                      if (found) handleApplySavedFilter(found)
                    }
                  }}
                >
                  <SelectTrigger className="w-[170px] h-9 text-xs">
                    <SelectValue placeholder="Filtros Salvos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum salvo selecionado</SelectItem>
                    {savedFilters.map((sf) => (
                      <SelectItem key={sf.id} value={sf.id} className="text-xs">
                        {sf.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {/* Botão Salvar Filtros Popover */}
              <Popover open={isSavePopoverOpen} onOpenChange={setIsSavePopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 gap-1.5 text-xs border-slate-300 dark:border-slate-700"
                  >
                    <BookmarkPlus className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
                    Salvar Filtros
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-3 space-y-3 z-50 shadow-xl" align="end">
                  <div className="space-y-1">
                    <h4 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      Salvar visualização atual
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Guarda a busca e os filtros de Curso, Faculdade, Cidade, Ano, Empresa e
                      Status.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Input
                      placeholder="Ex: Medicina 2027 Conquista"
                      value={saveFilterName}
                      onChange={(e) => setSaveFilterName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSaveCurrentFilter()}
                      className="h-8 text-xs"
                      autoFocus
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsSavePopoverOpen(false)}
                        className="h-7 text-xs"
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
            </div>
          </div>

          {/* Filtros empilháveis — clique pra escolher vários valores; datas têm "está entre" */}
          <div className="flex flex-wrap items-center gap-2">
            {FILTER_BAR.map((fb) => {
              const cur = filters[fb.key]
              const label =
                cur?.kind === 'enum'
                  ? `${fb.label}: ${cur.values.length}${cur.mode === 'not' ? ' exceto' : ''}`
                  : cur?.kind === 'range'
                    ? `${fb.label}: ${cur.from || '…'}–${cur.to || '…'}`
                    : fb.label
              return (
                <TableFilterPopover
                  key={fb.key}
                  title={fb.label}
                  modeSet={FILTER_MODE_SET[fb.key]}
                  uniqueValues={
                    fb.rangeType === 'date'
                      ? []
                      : (uniqueColumnValues as Record<string, string[]>)[fb.key] || []
                  }
                  rangeInputType={fb.rangeType === 'date' ? 'date' : 'text'}
                  rangeSuggestions={fb.key === 'anoFormatura' ? uniqueColumnValues.anoFormatura : []}
                  value={cur}
                  onChange={(next) => setFilter(fb.key, next)}
                  trigger={
                    <button
                      type="button"
                      className={cn(
                        'h-8 px-3 rounded-lg text-xs font-medium border inline-flex items-center gap-1.5 cursor-pointer transition-colors',
                        cur
                          ? 'bg-orange-600 text-white border-transparent'
                          : 'text-slate-400 border-white/[0.1] bg-[#0a0f14] hover:text-white hover:border-white/25',
                      )}
                    >
                      <Filter className="h-3 w-3" />
                      {label}
                    </button>
                  }
                />
              )
            })}

            {hasAnyActiveFilter && (
              <button
                type="button"
                onClick={handleClearAllFilters}
                className="h-8 px-3 rounded-lg text-xs font-medium text-slate-400 hover:text-white border border-white/[0.1] bg-[#0a0f14]"
              >
                Limpar tudo
              </button>
            )}

            <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap px-1">
              <Checkbox
                checked={showConcluidas}
                onCheckedChange={(v) => setShowConcluidas(v === true)}
              />
              Mostrar formados
            </label>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-500 pt-1 border-t border-slate-100 dark:border-slate-800">
            <span className="flex items-center gap-2">
              <span>
                Exibindo <strong>{filteredLeads.length}</strong> de <strong>{leads.length}</strong>{' '}
                turmas
              </span>
              {activeColFiltersCount > 0 && (
                <Badge
                  variant="secondary"
                  className="text-[10px] bg-orange-50 dark:bg-orange-950/60 text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-orange-800"
                >
                  {activeColFiltersCount} filtro(s) de coluna ativo(s)
                </Badge>
              )}
              {manualMode && (
                <Badge
                  variant="secondary"
                  className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-700 gap-1"
                >
                  <GripVertical className="h-3 w-3" /> Arraste as linhas pra reordenar
                </Badge>
              )}
              {selectedIds.size > 0 && (
                <Badge
                  variant="secondary"
                  className="text-[10px] bg-orange-50 dark:bg-orange-950/60 text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-orange-800"
                >
                  {selectedIds.size} selecionada{selectedIds.size > 1 ? 's' : ''}
                </Badge>
              )}
            </span>
            {hasAnyActiveFilter && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearAllFilters}
                className="h-7 text-xs text-orange-600 hover:text-orange-700 p-0"
              >
                Limpar todos os filtros
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tabela de Turmas */}
      <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900 shadow-sm">
        <div className="overflow-x-auto">
          <table
            className="text-left text-sm"
            style={{ tableLayout: 'fixed', width: OTHER_COLS_WIDTH_SUM + turmaColWidth }}
          >
            <colgroup>
              <col style={{ width: 40 }} />
              <col style={{ width: turmaColWidth }} />
              <col style={{ width: 90 }} />
              <col style={{ width: 140 }} />
              <col style={{ width: 110 }} />
              <col style={{ width: 100 }} />
              <col style={{ width: 110 }} />
              <col style={{ width: 110 }} />
              <col style={{ width: 110 }} />
              <col style={{ width: 90 }} />
              <col style={{ width: 80 }} />
              <col style={{ width: 160 }} />
              <col style={{ width: 90 }} />
            </colgroup>
            <thead className="bg-slate-50 dark:bg-slate-950/70 border-b border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3 pl-4 pr-2">
                  <Checkbox
                    checked={paginatedLeads.length > 0 && paginatedLeads.every((l) => selectedIds.has(l.id))}
                    onCheckedChange={() => toggleSelectAllVisible()}
                    aria-label="Selecionar todas as turmas visíveis"
                  />
                </th>
                <th className="py-3 px-4 relative overflow-hidden">
                  <ColumnHeaderWithFilter
                    colKey="curso"
                    title="Turma / Curso"
                    modeSet={FILTER_MODE_SET.curso}
                    uniqueValues={uniqueColumnValues.curso}
                    value={filters.curso}
                    onChange={(next) => setFilter('curso', next)}
                    onSort={(dir) => setSingleSort('curso', dir)}
                    isSorted={sortDirFor('curso')}
                  />
                  <div
                    onMouseDown={handleResizeStart}
                    title="Arraste para redimensionar a coluna"
                    className="absolute top-0 right-0 h-full w-2 cursor-col-resize hover:bg-orange-500/40 active:bg-orange-500/60"
                  />
                </th>
                <th className="py-3 px-3">
                  <ColumnHeaderWithFilter
                    colKey="empresa"
                    title="Empresa"
                    modeSet={FILTER_MODE_SET.empresa}
                    uniqueValues={uniqueColumnValues.empresa}
                    value={filters.empresa}
                    onChange={(next) => setFilter('empresa', next)}
                    onSort={(dir) => setSingleSort('empresa', dir)}
                    isSorted={sortDirFor('empresa')}
                  />
                </th>
                <th className="py-3 px-3">
                  <ColumnHeaderWithFilter
                    colKey="faculdade"
                    title="Faculdade"
                    modeSet={FILTER_MODE_SET.faculdade}
                    uniqueValues={uniqueColumnValues.faculdade}
                    value={filters.faculdade}
                    onChange={(next) => setFilter('faculdade', next)}
                    onSort={(dir) => setSingleSort('faculdade', dir)}
                    isSorted={sortDirFor('faculdade')}
                  />
                </th>
                <th className="py-3 px-3">
                  <ColumnHeaderWithFilter
                    colKey="cidade"
                    title="Cidade"
                    modeSet={FILTER_MODE_SET.cidade}
                    uniqueValues={uniqueColumnValues.cidade}
                    value={filters.cidade}
                    onChange={(next) => setFilter('cidade', next)}
                    onSort={(dir) => setSingleSort('cidade', dir)}
                    isSorted={sortDirFor('cidade')}
                  />
                </th>
                <th className="py-3 px-3">
                  <ColumnHeaderWithFilter
                    colKey="anoFormatura"
                    title="Ano Formatura"
                    modeSet={FILTER_MODE_SET.anoFormatura}
                    uniqueValues={uniqueColumnValues.anoFormatura}
                    rangeSuggestions={uniqueColumnValues.anoFormatura}
                    value={filters.anoFormatura}
                    onChange={(next) => setFilter('anoFormatura', next)}
                    onSort={(dir) => setSingleSort('anoFormatura', dir)}
                    isSorted={sortDirFor('anoFormatura')}
                  />
                </th>
                <th className="py-3 px-3" title="Em que semestre do curso a turma está hoje (precisa da duração do curso em Admin → Turmas)">
                  Semestre
                </th>
                <th className="py-3 px-3">Serviço</th>
                <th className="py-3 px-3">Origem</th>
                <th className="py-3 px-3">
                  <ColumnHeaderWithFilter
                    colKey="etapaFunil"
                    title="Etapa do Funil"
                    modeSet={FILTER_MODE_SET.etapaFunil}
                    uniqueValues={uniqueColumnValues.etapaFunil}
                    value={filters.etapaFunil}
                    onChange={(next) => setFilter('etapaFunil', next)}
                    onSort={(dir) => setSingleSort('status', dir)}
                    isSorted={sortDirFor('status')}
                  />
                </th>
                <th className="py-3 px-3 text-center">SGE</th>
                <th className="py-3 px-3 text-center">Alunos</th>
                <th className="py-3 px-3">Observações</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {paginatedLeads.length === 0 ? (
                <tr>
                  <td colSpan={14} className="py-12 text-center text-slate-500">
                    Nenhuma turma encontrada para os critérios selecionados.
                  </td>
                </tr>
              ) : (
                paginatedLeads.map((lead) => {
                  const sgeLink = sgeLinks.find((lnk) => lnk.leadId === lead.id)
                  const isManualMode = manualMode
                  const proximaAcao = getProximaAcaoInfo(lead, dealByLeadId.get(lead.id))

                  return (
                    <tr
                      key={lead.id}
                      className={cn(
                        'hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors group cursor-pointer',
                        draggedId === lead.id && 'opacity-40',
                      )}
                      onClick={() => setSelectedLead(lead)}
                      draggable={isManualMode}
                      onDragStart={(e) => {
                        e.stopPropagation()
                        handleDragStartRow(lead.id)
                      }}
                      onDragOver={(e) => isManualMode && e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        handleDropOnRow(lead.id)
                      }}
                    >
                      {/* Seleção + arrastar */}
                      <td className="py-3.5 pl-4 pr-2" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1.5">
                          {isManualMode && (
                            <GripVertical className="h-4 w-4 text-slate-400 cursor-grab active:cursor-grabbing shrink-0" />
                          )}
                          <Checkbox
                            checked={selectedIds.has(lead.id)}
                            onCheckedChange={() => toggleSelectOne(lead.id)}
                            aria-label={`Selecionar ${getFullTurmaName(lead)}`}
                          />
                        </div>
                      </td>

                      {/* Turma / Curso */}
                      <td className="py-3.5 px-4 overflow-hidden">
                        <div
                          className="font-semibold text-slate-900 dark:text-slate-100 overflow-hidden text-ellipsis whitespace-nowrap"
                          title={getFullTurmaName(lead)}
                        >
                          {getFullTurmaName(lead)}
                        </div>
                        <div className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
                          <span className="font-mono font-medium text-slate-700 dark:text-slate-300">
                            {lead.turma}
                          </span>
                          <span>•</span>
                          <span>{lead.anoFormatura}</span>
                          {lead.concluida && (
                            <Badge
                              variant="secondary"
                              className="text-[10px] py-0 px-1.5 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800"
                              title={
                                lead.concluidaEm
                                  ? `Formou em ${new Date(lead.concluidaEm).toLocaleDateString('pt-BR')}`
                                  : 'Formado'
                              }
                            >
                              Formado
                            </Badge>
                          )}
                          {proximaAcao && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span
                                    className={cn(
                                      'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full',
                                      proximaAcao.vencido
                                        ? 'bg-rose-500/20 text-rose-500 dark:text-rose-400'
                                        : proximaAcao.urgente
                                          ? 'bg-amber-500/20 text-amber-500 dark:text-amber-400'
                                          : 'bg-blue-500/20 text-blue-500 dark:text-blue-400',
                                    )}
                                  >
                                    <Sparkles className="h-2.5 w-2.5" />
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent className="text-xs p-2.5 max-w-xs space-y-1 bg-[#0a0f14] border-white/10 text-white">
                                  <div className="font-semibold text-slate-200">Próxima ação</div>
                                  <div>{proximaAcao.label}</div>
                                  <div
                                    className={cn(
                                      'text-[10px]',
                                      proximaAcao.vencido ? 'text-rose-400' : 'text-slate-500',
                                    )}
                                  >
                                    {proximaAcao.vencido
                                      ? `Atrasado ${Math.abs(proximaAcao.diffDias)} dia(s)`
                                      : `Prazo ${proximaAcao.prazoDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`}
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                      </td>

                      {/* Empresa — edição inline */}
                      <td className="py-3.5 px-3" onClick={(e) => e.stopPropagation()}>
                        <select
                          value={lead.empresa || 'AFF'}
                          onChange={(e) => updateLead(lead.id, { empresa: e.target.value })}
                          className={cn(
                            'text-xs font-bold rounded border bg-transparent px-1.5 py-0.5 cursor-pointer focus:outline-none focus:ring-1 focus:ring-orange-500',
                            EMPRESA_CORES[lead.empresa || 'AFF'] || EMPRESA_COR_PADRAO,
                          )}
                        >
                          {EMPRESAS.map((emp) => (
                            <option key={emp} value={emp} className="bg-white dark:bg-slate-900">
                              {emp}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Faculdade */}
                      <td
                        className="py-3.5 px-3 font-medium text-slate-800 dark:text-slate-200 overflow-hidden text-ellipsis whitespace-nowrap"
                        title={lead.faculdade}
                      >
                        {lead.faculdade}
                      </td>

                      {/* Cidade */}
                      <td className="py-3.5 px-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {lead.cidade}
                      </td>

                      {/* Ano Formatura — edição inline */}
                      <td
                        className="py-3.5 px-3 text-xs font-mono text-slate-600 dark:text-slate-400"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <InlineEditText
                          value={lead.anoFormatura || ''}
                          onSave={(v) => updateLead(lead.id, { anoFormatura: v })}
                          placeholder="2027.1"
                          className="text-xs font-mono text-slate-700 dark:text-slate-300 w-16"
                        />
                      </td>

                      {/* Semestre do curso (calculado: ano de formatura + duração do curso) */}
                      <td className="py-3.5 px-3 text-xs whitespace-nowrap">
                        {(() => {
                          const txt = semestreDaTurmaTexto(lead)
                          return (
                            <span
                              className={cn(
                                'font-medium',
                                txt === '—' || txt === 'A iniciar'
                                  ? 'text-slate-400 dark:text-slate-500'
                                  : txt === 'Formado'
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : 'text-slate-700 dark:text-slate-300',
                              )}
                              title={
                                txt === '—'
                                  ? 'Cadastre a duração desse curso em Admin → Turmas'
                                  : 'Semestre atual / total do curso'
                              }
                            >
                              {txt}
                            </span>
                          )
                        })()}
                      </td>

                      {/* Tipo Serviço */}
                      <td className="py-3.5 px-3 text-xs text-slate-700 dark:text-slate-300">
                        {lead.tipoServico || '—'}
                      </td>

                      {/* Origem / Como Conheceu — edição inline */}
                      <td className="py-3.5 px-3 min-w-[110px]" onClick={(e) => e.stopPropagation()}>
                        <DropdownComOutro
                          label="Origem"
                          showLabel={false}
                          variant="underline"
                          value={lead.comoConheceu || ''}
                          options={origensConhecidas}
                          placeholder="—"
                          onSave={(v) =>
                            updateLead(lead.id, { comoConheceu: v, source: v as LeadSource })
                          }
                          fieldClassName="w-full bg-transparent border-b border-transparent hover:border-slate-300 dark:hover:border-slate-700 focus:border-orange-500 text-xs text-slate-700 dark:text-slate-300 focus:outline-none px-0.5 py-0.5"
                        />
                      </td>

                      {/* Etapa do Funil (Kanban) */}
                      <td className="py-3.5 px-3">
                        {(() => {
                          const etapa = etapaFunilDoLead(lead)
                          const cor =
                            FUNNEL_STAGES.find((s) => s.name === etapa)?.color || '#64748b'
                          return (
                            <span
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border"
                              style={{
                                color: cor,
                                borderColor: `${cor}66`,
                                backgroundColor: `${cor}1a`,
                              }}
                            >
                              {etapa}
                            </span>
                          )
                        })()}
                      </td>

                      {/* Coluna SGE */}
                      <td className="py-3.5 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                        {sgeLink ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  onClick={() => setSelectedLead(lead)}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-mono font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25 transition-colors cursor-pointer"
                                >
                                  <LinkIcon className="w-3 h-3" />
                                  <span>{sgeLink.sgeProjectCode}</span>
                                </button>
                              </TooltipTrigger>
                              <TooltipContent className="text-xs p-2.5 max-w-xs space-y-1 bg-[#0a0f14] border-white/10 text-white">
                                <div className="font-semibold text-emerald-400">
                                  Vinculado ao SGE
                                </div>
                                <div>
                                  <span className="text-slate-400">Código: </span>
                                  <span className="font-mono">{sgeLink.sgeProjectCode}</span>
                                </div>
                                {sgeLink.sgeProjectName && (
                                  <div>
                                    <span className="text-slate-400">Nome SGE: </span>
                                    <span>{sgeLink.sgeProjectName}</span>
                                  </div>
                                )}
                                {sgeLink.linkedAt && (
                                  <div className="text-[10px] text-slate-500">
                                    Vinculado em:{' '}
                                    {new Date(sgeLink.linkedAt).toLocaleDateString('pt-BR')}
                                  </div>
                                )}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          <span className="inline-flex items-center justify-center text-xs text-slate-400 px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800/60 font-mono">
                            —
                          </span>
                        )}
                      </td>

                      {/* Alunos Fechados / Cadastrados + progresso da meta */}
                      <td className="py-3.5 px-3 text-center">
                        {(() => {
                          const mp = metaProgresso(lead)
                          return (
                            <div className="inline-flex flex-col items-center gap-1 min-w-[64px]">
                              <span className="inline-flex items-center justify-center min-w-[28px] h-6 px-2 rounded-md text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                                {lead.alunosFechados && lead.alunosFechados > 0 ? (
                                  <span className="flex items-center gap-0.5">
                                    <span className="text-emerald-500 font-bold">
                                      {lead.alunosFechados}
                                    </span>
                                    <span className="text-slate-400">/</span>
                                    <span>{lead.totalAlunos || 0}</span>
                                  </span>
                                ) : (
                                  <span>{lead.totalAlunos || 0}</span>
                                )}
                              </span>
                              {mp.pct != null && (
                                <div
                                  className="w-full"
                                  title={`${mp.fechados} de ${mp.meta} contratos (meta)`}
                                >
                                  <div className="h-1 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                                    <div
                                      className="h-full rounded-full"
                                      style={{
                                        width: `${Math.min(100, mp.pct)}%`,
                                        backgroundColor: metaProgressoCor(mp.pct),
                                      }}
                                    />
                                  </div>
                                  <span
                                    className="text-[10px] font-semibold"
                                    style={{ color: metaProgressoCor(mp.pct) }}
                                  >
                                    {mp.pct}% da meta
                                  </span>
                                </div>
                              )}
                            </div>
                          )
                        })()}
                      </td>

                      {/* Observações — edição inline */}
                      <td
                        className="py-3.5 px-3 max-w-[180px]"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <InlineEditText
                          value={lead.observacoes || lead.notes || ''}
                          onSave={(v) => updateLead(lead.id, { observacoes: v, notes: v })}
                          placeholder="—"
                          className="text-xs text-slate-500 w-full"
                        />
                      </td>

                      {/* Ações */}
                      <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-slate-500 hover:text-orange-600"
                            onClick={() => setSelectedLead(lead)}
                            title="Editar Turma"
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>

                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-slate-500 hover:text-rose-600"
                            onClick={() => setDeleteConfirmId(lead.id)}
                            title="Excluir Turma"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 flex flex-col sm:flex-row items-center justify-between gap-4">
          {/* Seletor de Page Size */}
          <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
            <span>Mostrar:</span>
            <div className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-0.5">
              {[10, 20, 30, 50, 100].map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => handlePageSizeChange(size)}
                  className={cn(
                    'px-2.5 py-1 text-xs rounded-md font-medium transition-colors cursor-pointer',
                    pageSize === size
                      ? 'bg-orange-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800',
                  )}
                >
                  {size}
                </button>
              ))}
              <button
                type="button"
                onClick={() => handlePageSizeChange('all')}
                className={cn(
                  'px-2.5 py-1 text-xs rounded-md font-medium transition-colors cursor-pointer',
                  pageSize === 'all'
                    ? 'bg-orange-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800',
                )}
              >
                Todas
              </button>
            </div>
            <span>turmas por página</span>
          </div>

          {/* Navegação de Páginas */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-600 dark:text-slate-400 font-medium">
              Página {currentPage} de {totalPages || 1}
            </span>

            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                disabled={currentPage <= 1 || pageSize === 'all'}
                className="h-8 px-2.5 text-xs gap-1"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Anterior
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                disabled={currentPage >= totalPages || pageSize === 'all'}
                className="h-8 px-2.5 text-xs gap-1"
              >
                Próximo
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Botão Baixar Planilha Modelo no final da página */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900">
        <div className="space-y-0.5 text-center sm:text-left">
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center justify-center sm:justify-start gap-2">
            <FileText className="h-4 w-4 text-orange-600 dark:text-orange-400" />
            Planilha Modelo para Importação
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Baixe o template CSV oficial com os 16 cabeçalhos pré-formatados e linha de exemplo.
          </p>
        </div>

        <Button
          variant="outline"
          onClick={downloadTemplateCsv}
          className="gap-2 text-xs font-semibold border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
        >
          <Download className="h-4 w-4 text-orange-600 dark:text-orange-400" />
          Baixar Planilha Modelo
        </Button>
      </div>

      {/* Modal de Criação / Edição de Turma */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-orange-600" />
              {editingLead ? 'Editar Turma' : 'Cadastrar Nova Turma'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Linha 1: Empresa, Curso, Faculdade */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label htmlFor="empresa">Empresa *</Label>
                <Select
                  value={formData.empresa}
                  onValueChange={(v) => setFormData({ ...formData, empresa: v })}
                >
                  <SelectTrigger id="empresa">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {EMPRESAS.map((e) => (
                      <SelectItem key={e} value={e}>
                        {e}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="curso">Curso *</Label>
                <DropdownComOutro
                  label="Curso"
                  showLabel={false}
                  value={formData.curso}
                  options={cursosConhecidosModal}
                  onSave={(v) => setFormData({ ...formData, curso: v })}
                  placeholder="Ex: Agronomia, Direito"
                  fieldClassName="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:text-sm"
                />
              </div>

              <div>
                <Label htmlFor="faculdade">Faculdade *</Label>
                <DropdownComOutro
                  label="Faculdade"
                  showLabel={false}
                  value={formData.faculdade}
                  options={formData.cidade ? cidadeFaculdadesModal[formData.cidade] || [] : []}
                  onSave={(v) => {
                    setFormData({ ...formData, faculdade: v })
                    if (formData.cidade) ensureCidadeFaculdade(formData.cidade, v)
                  }}
                  placeholder="Ex: FAINOR, UNEX, UEFS"
                  fieldClassName="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:text-sm"
                />
              </div>
            </div>

            {/* Linha 2: Turma, Ano/Fase, Cidade */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label htmlFor="turma">Turma *</Label>
                <Input
                  id="turma"
                  placeholder="Ex: Turma 0, Turma 15"
                  value={formData.turma}
                  onChange={(e) => setFormData({ ...formData, turma: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor="anoFormatura">Ano / Fase *</Label>
                <Input
                  id="anoFormatura"
                  placeholder="Ex: 2027.1, 2029.2"
                  value={formData.anoFormatura}
                  onChange={(e) => setFormData({ ...formData, anoFormatura: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor="cidade">Cidade *</Label>
                <DropdownComOutro
                  label="Cidade"
                  showLabel={false}
                  value={formData.cidade}
                  options={cidadesConhecidasModal}
                  onSave={(v) => setFormData({ ...formData, cidade: v })}
                  placeholder="Ex: Conquista, Feira de Santana"
                  fieldClassName="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:text-sm"
                />
              </div>
            </div>

            {/* Linha 3: Tipo Serviço, Como Conheceu, Status */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label htmlFor="tipoServico">Tipo de Serviço</Label>
                <Select
                  value={formData.tipoServico}
                  onValueChange={(v) => setFormData({ ...formData, tipoServico: v })}
                >
                  <SelectTrigger id="tipoServico">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {SERVICOS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="comoConheceu">Como Conheceu</Label>
                <Select
                  value={formData.comoConheceu}
                  onValueChange={(v) => setFormData({ ...formData, comoConheceu: v })}
                >
                  <SelectTrigger id="comoConheceu">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {CANAIS.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="status">Status CRM</Label>
                <Select
                  value={formData.status}
                  onValueChange={(v) => setFormData({ ...formData, status: v as LeadStatus })}
                >
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Novo">Novo (Prospecção)</SelectItem>
                    <SelectItem value="Qualificado">Qualificado (Negociação)</SelectItem>
                    <SelectItem value="Convertido">Ganhou</SelectItem>
                    <SelectItem value="Perdido">Perdeu</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Linha 4: Closer, SDR, Concorrentes */}
            <datalist id="usuarios-sistema-lista">
              {usuariosSistema.map((u) => (
                <option key={u.id} value={u.nome} />
              ))}
            </datalist>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label htmlFor="closer">Closer Responsável</Label>
                <Input
                  id="closer"
                  list="usuarios-sistema-lista"
                  placeholder="Nome do closer"
                  value={formData.closer}
                  onChange={(e) => setFormData({ ...formData, closer: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor="sdr">SDR Responsável</Label>
                <Input
                  id="sdr"
                  list="usuarios-sistema-lista"
                  placeholder="Nome do SDR"
                  value={formData.sdr}
                  onChange={(e) => setFormData({ ...formData, sdr: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor="concorrentes">Concorrentes</Label>
                <Input
                  id="concorrentes"
                  placeholder="Ex: Empresa X, Y"
                  value={formData.concorrentes}
                  onChange={(e) => setFormData({ ...formData, concorrentes: e.target.value })}
                />
              </div>
            </div>

            {/* Linha 5: Contato Principal (Nome e Telefone) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="contatoNome">Nome do Contato Principal</Label>
                <Input
                  id="contatoNome"
                  placeholder="Ex: Presidente da comissão"
                  value={formData.contatoNome}
                  onChange={(e) => setFormData({ ...formData, contatoNome: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor="contatoTelefone">Telefone do Contato</Label>
                <Input
                  id="contatoTelefone"
                  placeholder="(77) 99999-9999"
                  value={formData.contatoTelefone}
                  onChange={(e) => setFormData({ ...formData, contatoTelefone: e.target.value })}
                />
              </div>
            </div>

            {/* Linha 6: Datas, Link da Proposta e Alunos Fechados */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <Label
                  htmlFor="alunosFechados"
                  className="text-emerald-600 dark:text-emerald-400 font-semibold"
                >
                  Alunos Fechados (Contratos)
                </Label>
                <Input
                  id="alunosFechados"
                  type="number"
                  min="0"
                  placeholder="0"
                  value={formData.alunosFechados}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      alunosFechados: Math.max(0, parseInt(e.target.value) || 0),
                    })
                  }
                  className="font-bold border-emerald-500/30 focus-visible:ring-emerald-500"
                />
                <p className="text-[10px] text-slate-400 mt-0.5">
                  {editingLead?.codigoSGE
                    ? '🔄 Sincronizado automaticamente com o SGE — só edite pra corrigir uma exceção'
                    : 'Turma ainda não vinculada ao SGE — preencha manualmente por enquanto'}
                </p>
              </div>

              <div>
                <Label htmlFor="dataFechamento">Data de Fechamento</Label>
                <Input
                  id="dataFechamento"
                  placeholder="Ex: 31/12/2024"
                  value={formData.dataFechamento}
                  onChange={(e) => setFormData({ ...formData, dataFechamento: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor="primeiroContatoEm">Primeiro Contato Em</Label>
                <Input
                  id="primeiroContatoEm"
                  placeholder="Ex: 15/01/2025"
                  value={formData.primeiroContatoEm}
                  onChange={(e) => setFormData({ ...formData, primeiroContatoEm: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor="linkProposta">Link da Proposta</Label>
                <Input
                  id="linkProposta"
                  placeholder="https://..."
                  value={formData.linkProposta}
                  onChange={(e) => setFormData({ ...formData, linkProposta: e.target.value })}
                />
              </div>
            </div>

            {/* Linha 7: Código SGE ERP */}
            <div className="p-3 rounded-lg border border-orange-500/20 bg-orange-50/40 dark:bg-orange-950/20">
              <div className="flex items-center justify-between mb-1.5">
                <Label
                  htmlFor="sgeCode"
                  className="text-xs font-semibold flex items-center gap-1.5 text-orange-700 dark:text-orange-300"
                >
                  <LinkIcon className="w-3.5 h-3.5" />
                  Código SGE (Projeto ERP)
                </Label>
                {formData.sgeCode && (
                  <Badge
                    variant="outline"
                    className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                  >
                    Integrado
                  </Badge>
                )}
              </div>
              <Input
                id="sgeCode"
                placeholder="Ex: 4892 ou PROJ-102"
                value={formData.sgeCode}
                onChange={(e) => setFormData({ ...formData, sgeCode: e.target.value })}
                className="font-mono text-xs bg-white dark:bg-slate-900 border-orange-200 dark:border-orange-800"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Identificador do projeto no SGE para sincronização de contratos e pagamentos.
              </p>
            </div>

            {/* Observações (Textarea grande) */}
            <div>
              <Label htmlFor="observacoes">Observações Gerais</Label>
              <Textarea
                id="observacoes"
                rows={4}
                placeholder="Detalhes sobre a turma, histórico de contato, particularidades..."
                value={formData.observacoes}
                onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={!formData.curso.trim() || !formData.faculdade.trim()}
              className="bg-orange-600 hover:bg-orange-700 text-white"
            >
              {editingLead ? 'Salvar Alterações' : 'Cadastrar Turma'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Drawer / Modal de Detalhes da Turma Selecionada — tudo editável direto, sem passo extra de "Editar" */}
      {selectedLead && (
        <SelectedLeadDetail
          key={selectedLead.id}
          lead={selectedLead}
          stageId={dealByLeadId.get(selectedLead.id)?.stageId}
          onClose={() => setSelectedLead(null)}
          onPatch={(patch) => {
            updateLead(selectedLead.id, patch)
            setSelectedLead((prev) => (prev ? { ...prev, ...patch } : prev))
          }}
          onOpenFullForm={() => {
            handleOpenEdit(selectedLead)
            setSelectedLead(null)
          }}
        />
      )}

      {/* Modal de Importação de CSV */}
      <ImportCsvModal open={isImportModalOpen} onOpenChange={setIsImportModalOpen} />

      {/* Confirmação de Exclusão */}
      <Dialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-500 py-2">
            Tem certeza de que deseja remover esta turma? Esta ação não pode ser desfeita.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
            >
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Detalhe da turma selecionada — tudo editável direto (clicou, já edita),
// mais Pacotes da Turma + geração de mensagem de WhatsApp e Apresentação.
// ---------------------------------------------------------------------------
function SelectedLeadDetail({
  lead,
  stageId,
  onClose,
  onPatch,
  onOpenFullForm,
}: {
  lead: Lead
  stageId?: string
  onClose: () => void
  onPatch: (patch: Partial<Lead>) => void
  onOpenFullForm: () => void
}) {
  const { toast } = useToast()
  const sgeLink = getSGELinkForLead(lead.id)

  // Pacotes + mensagem
  const [pacotes, setPacotes] = useState<PacoteTurma[]>([])
  const [loadingPacotes, setLoadingPacotes] = useState(true)
  const [novoPacote, setNovoPacote] = useState<{
    nome: string
    valor: string
    parcelas: string
    itens: string[]
  }>({ nome: '', valor: '', parcelas: '', itens: [] })
  const [salvandoPacote, setSalvandoPacote] = useState(false)
  const [catalogoItens, setCatalogoItens] = useState<ItemCatalogo[]>([])
  const [templatesPacote, setTemplatesPacote] = useState<TemplatePacote[]>([])
  const [mensagemGerada, setMensagemGerada] = useState<string | null>(null)
  const [gerandoMensagem, setGerandoMensagem] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const [mostrarApresentacao, setMostrarApresentacao] = useState(false)
  const [agendarReuniaoOpen, setAgendarReuniaoOpen] = useState(false)
  const [cursosConhecidos, setCursosConhecidos] = useState<string[]>([])
  const [cidadeFaculdades, setCidadeFaculdades] = useState<CidadeFaculdadesMap>({})
  const [duracaoCursos, setDuracaoCursos] = useState<DuracaoCurso[]>([])
  const cidadesConhecidas = useMemo(
    () => Object.keys(cidadeFaculdades).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [cidadeFaculdades],
  )
  const semestreTxt = semestreDaTurmaLabel(
    lead.anoFormatura,
    acharDuracaoAnos(duracaoCursos, lead.curso, lead.faculdade),
  )

  // Ticket médio = média do valor dos pacotes cadastrados; Valor Esperado =
  // Ticket Médio x Meta de Contratos da turma. Sempre calculado, nunca digitado.
  const ticketMedio = pacotes.length > 0 ? pacotes.reduce((acc, p) => acc + p.valor, 0) / pacotes.length : 0
  const valorEsperado = ticketMedio * (lead.metaContratos || 0)

  useEffect(() => {
    listarPacotes(lead.id).then((p) => {
      setPacotes(p)
      setLoadingPacotes(false)
    })
    fetchCatalogoAtivo().then(setCatalogoItens)
    fetchTemplatesAtivos().then(setTemplatesPacote)
  }, [lead.id])

  useEffect(() => {
    fetchCursosConhecidos().then(setCursosConhecidos)
    fetchCidadeFaculdades().then(setCidadeFaculdades)
    listarDuracaoCursos().then(setDuracaoCursos)
  }, [])

  const handleAdicionarPacote = async () => {
    if (!novoPacote.nome.trim() || !novoPacote.valor.trim()) return
    setSalvandoPacote(true)
    try {
      const criado = await adicionarPacote(lead.id, {
        nome: novoPacote.nome.trim(),
        valor: Number(novoPacote.valor.replace(',', '.')) || 0,
        parcelas: Number(novoPacote.parcelas) || 1,
        itens: novoPacote.itens,
        ordem: pacotes.length,
      })
      setPacotes((prev) => [...prev, criado])
      setNovoPacote({ nome: '', valor: '', parcelas: '', itens: [] })
      setMensagemGerada(null)
    } finally {
      setSalvandoPacote(false)
    }
  }

  const handleRemoverPacote = async (id: string) => {
    await removerPacote(id)
    setPacotes((prev) => prev.filter((p) => p.id !== id))
    setMensagemGerada(null)
  }

  const handleAplicarTemplate = (template: TemplatePacote) => {
    setNovoPacote((d) => ({ ...d, nome: d.nome || template.nome, itens: [...template.itens] }))
  }

  const handleToggleItemNovoPacote = (nomeItem: string) => {
    setNovoPacote((d) => ({
      ...d,
      itens: d.itens.includes(nomeItem)
        ? d.itens.filter((i) => i !== nomeItem)
        : [...d.itens, nomeItem],
    }))
  }

  const handleToggleItemPacoteExistente = async (pacote: PacoteTurma, nomeItem: string) => {
    const novosItens = pacote.itens.includes(nomeItem)
      ? pacote.itens.filter((i) => i !== nomeItem)
      : [...pacote.itens, nomeItem]
    await atualizarPacote(pacote.id, { itens: novosItens })
    setPacotes((prev) => prev.map((p) => (p.id === pacote.id ? { ...p, itens: novosItens } : p)))
    setMensagemGerada(null)
  }

  const handleEditarCampoPacote = async (
    pacote: PacoteTurma,
    campo: 'nome' | 'valor' | 'parcelas',
    valor: string,
  ) => {
    const patch =
      campo === 'nome'
        ? { nome: valor }
        : campo === 'valor'
          ? { valor: Number(valor.replace(',', '.')) || 0 }
          : { parcelas: Number(valor) || 1 }
    await atualizarPacote(pacote.id, patch)
    setPacotes((prev) => prev.map((p) => (p.id === pacote.id ? { ...p, ...patch } : p)))
    setMensagemGerada(null)
  }

  const handleGerarMensagem = async () => {
    if (pacotes.length === 0) return
    setGerandoMensagem(true)
    try {
      const texto = await gerarMensagemPacotes(lead, pacotes, sgeLink)
      setMensagemGerada(texto)
    } finally {
      setGerandoMensagem(false)
    }
  }

  const handleCopiarMensagem = () => {
    if (!mensagemGerada) return
    navigator.clipboard.writeText(mensagemGerada)
    setCopiado(true)
    toast({ title: 'Mensagem copiada' })
    setTimeout(() => setCopiado(false), 2000)
  }

  return (
    <>
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-xl max-h-[90vh] overflow-y-auto"
        onPointerDownOutside={(e) => mostrarApresentacao && e.preventDefault()}
        onInteractOutside={(e) => mostrarApresentacao && e.preventDefault()}
        onEscapeKeyDown={(e) => mostrarApresentacao && e.preventDefault()}
      >
        <DialogHeader>
          <div className="flex items-center gap-2">
            <select
              value={lead.empresa || 'AFF'}
              onChange={(e) => onPatch({ empresa: e.target.value })}
              className="bg-orange-600 text-white font-bold text-xs rounded-md px-2 py-1 border-none focus:outline-none focus:ring-1 focus:ring-orange-400"
            >
              {EMPRESAS.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
            <DialogTitle className="text-xl sr-only">{getTurmaDisplayName(lead)}</DialogTitle>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <DropdownComOutro
              label="Curso"
              showLabel={false}
              value={lead.curso}
              options={cursosConhecidos}
              onSave={(v) => onPatch({ curso: v })}
              placeholder="Curso"
              fieldClassName="bg-transparent text-lg font-bold text-slate-900 dark:text-slate-100 border-b border-transparent hover:border-slate-300 focus:border-orange-500 focus:outline-none px-0.5 w-full"
            />
            <DropdownComOutro
              label="Faculdade"
              showLabel={false}
              value={lead.faculdade}
              options={lead.cidade ? cidadeFaculdades[lead.cidade] || [] : []}
              onSave={(v) => {
                onPatch({ faculdade: v })
                if (lead.cidade) ensureCidadeFaculdade(lead.cidade, v)
              }}
              placeholder="Faculdade"
              fieldClassName="bg-transparent text-lg font-bold text-slate-900 dark:text-slate-100 border-b border-transparent hover:border-slate-300 focus:border-orange-500 focus:outline-none px-0.5 w-full"
            />
          </div>
          <LastEditedBy email={lead.updatedByEmail} updatedAt={lead.updatedAt} className="mt-1" />
        </DialogHeader>

        <button
          type="button"
          onClick={() => setAgendarReuniaoOpen(true)}
          className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-300 hover:bg-orange-500/20 text-xs font-semibold py-2 transition-colors"
        >
          <Calendar className="w-3.5 h-3.5" />{' '}
          {stageId === 'stage-3'
            ? 'Agendar reunião de comissão'
            : stageId === 'stage-4'
              ? 'Agendar reunião de turma'
              : 'Agendar reunião'}
        </button>

        <div className="space-y-4 py-2 text-xs">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-slate-50 dark:bg-slate-900/50 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
            <InlineField label="Turma" defaultValue={lead.turma} onSave={(v) => onPatch({ turma: v })} />
            <InlineField
              label="Ano/Fase"
              defaultValue={lead.anoFormatura}
              onSave={(v) => onPatch({ anoFormatura: v })}
            />
            <div>
              <span className="text-slate-500 block mb-0.5">Semestre atual</span>
              <span
                className={cn(
                  'font-medium',
                  semestreTxt === '—' || semestreTxt === 'A iniciar'
                    ? 'text-slate-400'
                    : semestreTxt === 'Formado'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-slate-800 dark:text-slate-200',
                )}
                title={
                  semestreTxt === '—'
                    ? 'Cadastre a duração desse curso em Admin → Turmas'
                    : 'Semestre atual / total do curso'
                }
              >
                {semestreTxt}
              </span>
            </div>
            <DropdownComOutro
              label="Cidade"
              variant="underline"
              value={lead.cidade}
              options={cidadesConhecidas}
              onSave={(v) => onPatch({ cidade: v })}
            />
            <div>
              <span className="text-slate-500 block mb-0.5">Tipo Serviço</span>
              <select
                value={lead.tipoServico || 'Formatura'}
                onChange={(e) => onPatch({ tipoServico: e.target.value })}
                className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded px-1.5 py-1 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-orange-500"
              >
                {SERVICOS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <span className="text-slate-500 block mb-0.5">Como Conheceu</span>
              <select
                value={lead.comoConheceu || 'Passiva'}
                onChange={(e) => onPatch({ comoConheceu: e.target.value })}
                className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded px-1.5 py-1 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-orange-500"
              >
                {CANAIS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <span className="text-slate-500 block mb-0.5">Status</span>
              <select
                value={lead.status}
                onChange={(e) => onPatch({ status: e.target.value as LeadStatus })}
                className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded px-1.5 py-1 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-orange-500"
              >
                {Object.keys(STATUS_CONFIG).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_CONFIG[s as LeadStatus].label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <span className="text-slate-500 block">Código SGE</span>
              <span className="font-semibold text-emerald-600 font-mono">
                {lead.codigoSGE || sgeLink?.sgeProjectCode || 'Não vinculado'}
              </span>
            </div>
            <InlineField
              label="Data Fechamento"
              defaultValue={lead.dataFechamento || ''}
              onSave={(v) => onPatch({ dataFechamento: v })}
            />
            <InlineField label="Closer" defaultValue={lead.closer || ''} onSave={(v) => onPatch({ closer: v })} />
            <InlineField label="SDR" defaultValue={lead.sdr || ''} onSave={(v) => onPatch({ sdr: v })} />
            <InlineField
              label="Qtd. Comissão"
              type="number"
              defaultValue={lead.quantidadeComissao != null ? String(lead.quantidadeComissao) : ''}
              onSave={(v) => onPatch({ quantidadeComissao: v ? Number(v) : undefined })}
            />
            <InlineField
              label="Meta de Contratos"
              type="number"
              defaultValue={lead.metaContratos != null ? String(lead.metaContratos) : ''}
              onSave={(v) => onPatch({ metaContratos: v ? Number(v) : undefined })}
            />
            <InlineField
              label="Alunos Fechados"
              type="number"
              defaultValue={String(lead.alunosFechados || 0)}
              onSave={(v) => onPatch({ alunosFechados: Number(v) || 0 })}
              hint={
                lead.codigoSGE
                  ? '🔄 Automático via SGE — editar aqui é sobrescrito no próximo sync'
                  : 'Turma ainda não vinculada ao SGE — valor manual'
              }
            />
          </div>

          {(() => {
            const mp = metaProgresso(lead)
            if (mp.pct == null) return null
            return (
              <div className="text-xs">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-slate-500">Progresso da meta</span>
                  <span className="font-semibold" style={{ color: metaProgressoCor(mp.pct) }}>
                    {mp.fechados}/{mp.meta} contratos · {mp.pct}%
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(100, mp.pct)}%`,
                      backgroundColor: metaProgressoCor(mp.pct),
                    }}
                  />
                </div>
              </div>
            )
          })()}

          {/* Contato Principal */}
          <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30">
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Contato Principal
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <InlineField
                label="Nome"
                defaultValue={lead.contatoNome || ''}
                onSave={(v) => onPatch({ contatoNome: v })}
              />
              <InlineField
                label="Telefone"
                defaultValue={lead.contatoTelefone || ''}
                onSave={(v) => onPatch({ contatoTelefone: v })}
              />
            </div>
          </div>

          {/* Link da proposta */}
          <div className="p-3 rounded-lg border border-orange-100 dark:border-orange-900 bg-orange-50/50 dark:bg-orange-950/20">
            <InlineField
              label="Link da Proposta"
              defaultValue={lead.linkProposta || ''}
              onSave={(v) => onPatch({ linkProposta: v })}
              placeholder="Cole o link do Canva ou qualquer URL..."
            />
            {lead.linkProposta && (
              <a
                href={lead.linkProposta}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-medium text-orange-600 dark:text-orange-400 flex items-center gap-1.5 hover:underline mt-1.5"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Abrir Link da Proposta
              </a>
            )}
          </div>

          {/* Observações */}
          <div>
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Observações
            </h4>
            <textarea
              defaultValue={lead.observacoes || lead.notes || ''}
              onBlur={(e) => onPatch({ observacoes: e.target.value, notes: e.target.value })}
              rows={3}
              placeholder="Nenhuma observação registrada."
              className="w-full p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-orange-500 resize-none"
            />
          </div>

          {/* Pacotes da Turma + Mensagem de WhatsApp */}
          <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-200">
                <Package className="w-3.5 h-3.5 text-orange-500" /> Pacotes da Turma
              </div>
              {pacotes.length > 0 && (
                <button
                  type="button"
                  onClick={() => setMostrarApresentacao(true)}
                  className="text-[10px] font-semibold text-orange-600 dark:text-orange-400 hover:underline inline-flex items-center gap-1"
                >
                  <Presentation className="w-3 h-3" /> Ver Apresentação
                </button>
              )}
            </div>

            {pacotes.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <span className="text-slate-500 block">Ticket Médio (automático)</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    R$ {ticketMedio.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <span className="text-slate-500 block">Valor Esperado (TM × Meta)</span>
                  <span className="font-semibold text-orange-600 dark:text-orange-400">
                    {lead.metaContratos
                      ? `R$ ${valorEsperado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                      : 'defina a Meta de Contratos'}
                  </span>
                </div>
              </div>
            )}

            {loadingPacotes ? (
              <p className="text-slate-500">Carregando pacotes...</p>
            ) : (
              <div className="space-y-2">
                {pacotes.length === 0 && (
                  <p className="text-slate-500">Nenhum pacote cadastrado ainda para essa turma.</p>
                )}
                {pacotes.map((p) => (
                  <div
                    key={p.id}
                    className="p-2.5 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1 grid grid-cols-3 gap-2">
                        <InlineField
                          label="Nome"
                          defaultValue={p.nome}
                          onSave={(v) => handleEditarCampoPacote(p, 'nome', v)}
                        />
                        <InlineField
                          label="Valor (R$)"
                          defaultValue={String(p.valor)}
                          onSave={(v) => handleEditarCampoPacote(p, 'valor', v)}
                        />
                        <InlineField
                          label="Parcelas"
                          type="number"
                          defaultValue={String(p.parcelas)}
                          onSave={(v) => handleEditarCampoPacote(p, 'parcelas', v)}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoverPacote(p.id)}
                        className="text-slate-400 hover:text-red-500 flex-shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {catalogoItens.map((item) => {
                        const incluso = p.itens.includes(item.nome)
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => handleToggleItemPacoteExistente(p, item.nome)}
                            className={`text-[10px] px-2 py-1 rounded-full border ${
                              incluso
                                ? 'bg-orange-100 dark:bg-orange-950/60 text-orange-700 dark:text-orange-400 border-orange-300 dark:border-orange-800'
                                : 'bg-slate-50 dark:bg-slate-900 text-slate-400 border-slate-200 dark:border-slate-700'
                            }`}
                          >
                            {incluso ? '✓ ' : ''}
                            {item.nome}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="p-2.5 rounded-lg bg-white dark:bg-slate-950 border border-dashed border-slate-300 dark:border-slate-700 space-y-2">
              <div className="text-slate-500 text-[11px]">Novo pacote — comece por um template:</div>
              <div className="flex flex-wrap gap-1.5">
                {templatesPacote.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => handleAplicarTemplate(t)}
                    className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-orange-600 text-white hover:bg-orange-500"
                  >
                    {t.nome}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <InlineField
                  label="Nome do pacote"
                  defaultValue={novoPacote.nome}
                  onSave={(v) => setNovoPacote((d) => ({ ...d, nome: v }))}
                  liveOnChange
                />
                <InlineField
                  label="Valor (R$)"
                  defaultValue={novoPacote.valor}
                  onSave={(v) => setNovoPacote((d) => ({ ...d, valor: v }))}
                  liveOnChange
                />
              </div>
              <InlineField
                label="Parcelas"
                type="number"
                defaultValue={novoPacote.parcelas}
                onSave={(v) => setNovoPacote((d) => ({ ...d, parcelas: v }))}
                liveOnChange
              />
              <div>
                <label className="block text-slate-500 mb-1">Itens do pacote (clique pra marcar)</label>
                <div className="flex flex-wrap gap-1.5">
                  {catalogoItens.map((item) => {
                    const incluso = novoPacote.itens.includes(item.nome)
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleToggleItemNovoPacote(item.nome)}
                        className={`text-[10px] px-2 py-1 rounded-full border ${
                          incluso
                            ? 'bg-orange-100 dark:bg-orange-950/60 text-orange-700 dark:text-orange-400 border-orange-300 dark:border-orange-800'
                            : 'bg-slate-50 dark:bg-slate-900 text-slate-400 border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        {incluso ? '✓ ' : ''}
                        {item.nome}
                      </button>
                    )
                  })}
                </div>
              </div>
              <button
                type="button"
                onClick={handleAdicionarPacote}
                disabled={salvandoPacote || !novoPacote.nome.trim() || !novoPacote.valor.trim()}
                className="text-[10px] font-semibold text-white bg-orange-600 hover:bg-orange-500 disabled:opacity-50 rounded px-2.5 py-1.5 inline-flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Adicionar Pacote
              </button>
            </div>

            {pacotes.length > 0 && (
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
                <button
                  type="button"
                  onClick={handleGerarMensagem}
                  disabled={gerandoMensagem}
                  className="text-[11px] font-semibold text-white bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 disabled:opacity-60 rounded-lg px-3 py-2 inline-flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {gerandoMensagem ? 'Gerando...' : 'Gerar Mensagem de WhatsApp'}
                </button>
                {!sgeLink && (
                  <p className="text-[10px] text-amber-600 dark:text-amber-400/80">
                    Essa turma ainda não está vinculada ao SGE — a mensagem sai sem o link de
                    assinatura do contrato.
                  </p>
                )}
                {mensagemGerada && (
                  <div className="space-y-1.5">
                    <textarea
                      readOnly
                      rows={10}
                      value={mensagemGerada}
                      className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-2.5 text-[11px] text-slate-700 dark:text-slate-200 leading-relaxed focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleCopiarMensagem}
                      className="text-[10px] font-semibold text-orange-600 dark:text-orange-400 hover:underline inline-flex items-center gap-1"
                    >
                      {copiado ? (
                        <>
                          <Check className="w-3 h-3" /> Copiado!
                        </>
                      ) : (
                        <>
                          <ClipboardCopy className="w-3 h-3" /> Copiar mensagem
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onOpenFullForm}>
            <Edit2 className="h-3.5 w-3.5 mr-1.5" />
            Formulário Completo
          </Button>
          <Button size="sm" className="bg-orange-600 hover:bg-orange-700 text-white" onClick={onClose}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {mostrarApresentacao && (
      <ApresentacaoPacotesModal
        lead={lead}
        pacotes={pacotes}
        sgeLink={sgeLink}
        onClose={() => setMostrarApresentacao(false)}
      />
    )}

    <AgendarReuniaoModal
      lead={lead}
      stageId={stageId}
      open={agendarReuniaoOpen}
      onOpenChange={setAgendarReuniaoOpen}
    />
    </>
  )
}

/** Campo de texto que edita inline: clica, digita, sai do campo e já salva. */
function InlineField({
  label,
  defaultValue,
  onSave,
  type = 'text',
  placeholder,
  liveOnChange,
  hint,
}: {
  label: string
  defaultValue: string
  onSave: (value: string) => void
  type?: string
  placeholder?: string
  liveOnChange?: boolean
  hint?: string
}) {
  if (liveOnChange) {
    return (
      <div>
        <label className="block text-slate-500 mb-0.5">{label}</label>
        <input
          type={type}
          value={defaultValue}
          onChange={(e) => onSave(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded px-1.5 py-1 text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-orange-500"
        />
        {hint && <p className="text-[10px] text-slate-400 mt-0.5">{hint}</p>}
      </div>
    )
  }
  return (
    <div>
      <label className="block text-slate-500 mb-0.5">{label}</label>
      <input
        type={type}
        defaultValue={defaultValue}
        onBlur={(e) => e.target.value !== defaultValue && onSave(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-transparent border-b border-transparent hover:border-slate-300 dark:hover:border-slate-700 focus:border-orange-500 font-semibold text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none px-0.5"
      />
      {hint && <p className="text-[10px] text-slate-400 mt-0.5">{hint}</p>}
    </div>
  )
}
