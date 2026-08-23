import { useState, useMemo, useEffect } from 'react'
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
} from 'lucide-react'
import { useCRM } from '@/context/CRMContext'
import { Lead, LeadStatus, LeadSource, getTurmaDisplayName } from '@/types/crm'
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
import { Button } from '@/components/ui/button'
import ImportCsvModal from '@/components/ImportCsvModal'
import { ColumnHeaderWithFilter, ColumnFilterKey } from '@/components/ColumnHeaderWithFilter'
import { downloadTemplateCsv } from '@/utils/csvImporter'
import { Input } from '@/components/ui/input'
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

const EMPRESAS = ['AFF', 'AIF', 'AIM']
const SERVICOS = ['Formatura', 'Ensaio', 'Baile de Gala', 'Colação', 'Outro']
const CANAIS = ['Passiva', 'Ativa', 'Time comercial', 'Indicação', 'Instagram', 'Outro']

export interface SavedFilter {
  id: string
  name: string
  search: string
  curso: string
  faculdade: string
  cidade: string
  ano: string
  empresa?: string
  status?: string
}

const SAVED_FILTERS_KEY = 'turmas_saved_filters'
const PAGE_SIZE_KEY = 'turmas_page_size'

export default function LeadsPage() {
  const { leads, deals, members, addLead, updateLead, deleteLead, updateDeal } = useCRM()
  // Credenciais do SGE vêm sempre do Supabase (mesma fonte usada em Configurações),
  // nunca do localStorage — assim, cadastrar uma vez funciona em qualquer dispositivo.
  const { config: sgeAppConfig } = useConfiguracoes()
  const { toast } = useToast()

  // General Filter State
  const [search, setSearch] = useState('')
  const [filterFaculdade, setFilterFaculdade] = useState<string>('all')
  const [filterCurso, setFilterCurso] = useState<string>('all')
  const [filterCidade, setFilterCidade] = useState<string>('all')
  const [filterAno, setFilterAno] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterEmpresa, setFilterEmpresa] = useState<string>('all')

  // Column Filters State (Excel / Notion style)
  const [columnFilters, setColumnFilters] = useState<Partial<Record<ColumnFilterKey, string[]>>>({})

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

  // Unique values for each column (used for column filter dropdowns)
  const uniqueColumnValues = useMemo(() => {
    const map: Record<ColumnFilterKey, string[]> = {
      empresa: [],
      curso: [],
      faculdade: [],
      cidade: [],
      anoFormatura: [],
      status: [],
    }

    const sets: Record<ColumnFilterKey, Set<string>> = {
      empresa: new Set(),
      curso: new Set(),
      faculdade: new Set(),
      cidade: new Set(),
      anoFormatura: new Set(),
      status: new Set(),
    }

    leads.forEach((l) => {
      if (l.empresa) sets.empresa.add(l.empresa)
      if (l.curso) sets.curso.add(l.curso)
      if (l.faculdade) sets.faculdade.add(l.faculdade)
      if (l.cidade) sets.cidade.add(l.cidade)
      if (l.anoFormatura) sets.anoFormatura.add(l.anoFormatura)
      if (l.status) sets.status.add(l.status)
    })

    ;(Object.keys(sets) as ColumnFilterKey[]).forEach((key) => {
      map[key] = Array.from(sets[key]).sort()
    })

    return map
  }, [leads])

  // Filter logic (combining general filters + saved filters + column filters with logical AND)
  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      const q = search.toLowerCase().trim()
      const matchesSearch =
        !q ||
        lead.curso.toLowerCase().includes(q) ||
        lead.faculdade.toLowerCase().includes(q) ||
        lead.turma.toLowerCase().includes(q) ||
        lead.cidade.toLowerCase().includes(q) ||
        (lead.empresa && lead.empresa.toLowerCase().includes(q)) ||
        (lead.closer && lead.closer.toLowerCase().includes(q)) ||
        (lead.sdr && lead.sdr.toLowerCase().includes(q)) ||
        (lead.comoConheceu && lead.comoConheceu.toLowerCase().includes(q)) ||
        (lead.contatoNome && lead.contatoNome.toLowerCase().includes(q)) ||
        (lead.observacoes && lead.observacoes.toLowerCase().includes(q))

      const matchesFaculdade = filterFaculdade === 'all' || lead.faculdade === filterFaculdade
      const matchesCurso = filterCurso === 'all' || lead.curso === filterCurso
      const matchesCidade = filterCidade === 'all' || lead.cidade === filterCidade
      const matchesAno = filterAno === 'all' || lead.anoFormatura === filterAno
      const matchesStatus = filterStatus === 'all' || lead.status === filterStatus
      const matchesEmpresa = filterEmpresa === 'all' || lead.empresa === filterEmpresa

      // Column filters
      const matchesColEmpresa =
        !columnFilters.empresa || columnFilters.empresa.includes(lead.empresa || 'AFF')
      const matchesColCurso = !columnFilters.curso || columnFilters.curso.includes(lead.curso)
      const matchesColFaculdade =
        !columnFilters.faculdade || columnFilters.faculdade.includes(lead.faculdade)
      const matchesColCidade = !columnFilters.cidade || columnFilters.cidade.includes(lead.cidade)
      const matchesColAno =
        !columnFilters.anoFormatura || columnFilters.anoFormatura.includes(lead.anoFormatura)
      const matchesColStatus = !columnFilters.status || columnFilters.status.includes(lead.status)

      return (
        matchesSearch &&
        matchesFaculdade &&
        matchesCurso &&
        matchesCidade &&
        matchesAno &&
        matchesStatus &&
        matchesEmpresa &&
        matchesColEmpresa &&
        matchesColCurso &&
        matchesColFaculdade &&
        matchesColCidade &&
        matchesColAno &&
        matchesColStatus
      )
    })
  }, [
    leads,
    search,
    filterFaculdade,
    filterCurso,
    filterCidade,
    filterAno,
    filterStatus,
    filterEmpresa,
    columnFilters,
  ])

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [
    search,
    filterFaculdade,
    filterCurso,
    filterCidade,
    filterAno,
    filterStatus,
    filterEmpresa,
    columnFilters,
  ])

  // Pagination calculation
  const totalPages = useMemo(() => {
    if (pageSize === 'all' || filteredLeads.length === 0) return 1
    return Math.ceil(filteredLeads.length / pageSize)
  }, [filteredLeads.length, pageSize])

  const paginatedLeads = useMemo(() => {
    if (pageSize === 'all') return filteredLeads
    const start = (currentPage - 1) * pageSize
    return filteredLeads.slice(start, start + pageSize)
  }, [filteredLeads, currentPage, pageSize])

  // Check active column filters count
  const activeColFiltersCount = useMemo(() => {
    return Object.values(columnFilters).filter((arr) => arr && arr.length > 0).length
  }, [columnFilters])

  // Stats rápidos
  const stats = useMemo(() => {
    const total = leads.length
    const ganhas = leads.filter((l) => l.status === 'Convertido').length
    const perdidas = leads.filter((l) => l.status === 'Perdido').length
    const abertas = total - ganhas - perdidas
    const linkedCount = sgeLinks.length
    return { total, ganhas, perdidas, abertas, linkedCount }
  }, [leads, sgeLinks])

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
      curso: filterCurso,
      faculdade: filterFaculdade,
      cidade: filterCidade,
      ano: filterAno,
      empresa: filterEmpresa,
      status: filterStatus,
    }
    setSavedFilters((prev) => [...prev, newFilter])
    setActiveFilterId(newFilter.id)
    setSaveFilterName('')
    setIsSavePopoverOpen(false)
  }

  const handleApplySavedFilter = (sf: SavedFilter) => {
    setActiveFilterId(sf.id)
    setSearch(sf.search || '')
    setFilterCurso(sf.curso || 'all')
    setFilterFaculdade(sf.faculdade || 'all')
    setFilterCidade(sf.cidade || 'all')
    setFilterAno(sf.ano || 'all')
    setFilterEmpresa(sf.empresa || 'all')
    setFilterStatus(sf.status || 'all')
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
    setFilterFaculdade('all')
    setFilterCurso('all')
    setFilterCidade('all')
    setFilterAno('all')
    setFilterStatus('all')
    setFilterEmpresa('all')
    setColumnFilters({})
    setActiveFilterId(null)
  }

  // Column Filter Actions
  const handleToggleColumnValue = (col: ColumnFilterKey, val: string) => {
    const allColVals = uniqueColumnValues[col] || []
    setColumnFilters((prev) => {
      const current = prev[col] !== undefined ? prev[col]! : allColVals
      let updated: string[]
      if (current.includes(val)) {
        updated = current.filter((v) => v !== val)
      } else {
        updated = [...current, val]
      }
      if (updated.length === allColVals.length) {
        const next = { ...prev }
        delete next[col]
        return next
      }
      return {
        ...prev,
        [col]: updated,
      }
    })
  }

  const handleSelectAllColumn = (col: ColumnFilterKey) => {
    setColumnFilters((prev) => {
      const next = { ...prev }
      delete next[col]
      return next
    })
  }

  const handleClearColumn = (col: ColumnFilterKey) => {
    setColumnFilters((prev) => ({
      ...prev,
      [col]: [],
    }))
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
        ownerId: 'm-1',
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

  const hasAnyActiveFilter =
    search ||
    filterFaculdade !== 'all' ||
    filterCurso !== 'all' ||
    filterCidade !== 'all' ||
    filterAno !== 'all' ||
    filterStatus !== 'all' ||
    filterEmpresa !== 'all' ||
    activeColFiltersCount > 0

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

          {/* Filter Selects Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
            <Select value={filterEmpresa} onValueChange={setFilterEmpresa}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Empresa" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as Empresas</SelectItem>
                {empresas.map((emp) => (
                  <SelectItem key={emp} value={emp}>
                    {emp}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterCurso} onValueChange={setFilterCurso}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Curso" />
              </SelectTrigger>
              <SelectContent className="max-h-56">
                <SelectItem value="all">Todos os Cursos</SelectItem>
                {cursos.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterFaculdade} onValueChange={setFilterFaculdade}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Faculdade" />
              </SelectTrigger>
              <SelectContent className="max-h-56">
                <SelectItem value="all">Todas as Faculdades</SelectItem>
                {faculdades.map((fac) => (
                  <SelectItem key={fac} value={fac}>
                    {fac}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterCidade} onValueChange={setFilterCidade}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Cidade" />
              </SelectTrigger>
              <SelectContent className="max-h-56">
                <SelectItem value="all">Todas as Cidades</SelectItem>
                {cidades.map((cid) => (
                  <SelectItem key={cid} value={cid}>
                    {cid}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterAno} onValueChange={setFilterAno}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Ano Formatura" />
              </SelectTrigger>
              <SelectContent className="max-h-56">
                <SelectItem value="all">Todos os Anos</SelectItem>
                {anos.map((ano) => (
                  <SelectItem key={ano} value={ano}>
                    {ano}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Status</SelectItem>
                <SelectItem value="Novo">Novo (Prospecção)</SelectItem>
                <SelectItem value="Qualificado">Qualificado (Negociação)</SelectItem>
                <SelectItem value="Convertido">Ganhou</SelectItem>
                <SelectItem value="Perdido">Perdeu</SelectItem>
              </SelectContent>
            </Select>
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
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-950/70 border-b border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">
                  <ColumnHeaderWithFilter
                    colKey="curso"
                    title="Turma / Curso"
                    uniqueValues={uniqueColumnValues.curso}
                    selectedValues={columnFilters.curso}
                    onToggleValue={(v) => handleToggleColumnValue('curso', v)}
                    onSelectAll={() => handleSelectAllColumn('curso')}
                    onClear={() => handleClearColumn('curso')}
                  />
                </th>
                <th className="py-3 px-3">
                  <ColumnHeaderWithFilter
                    colKey="empresa"
                    title="Empresa"
                    uniqueValues={uniqueColumnValues.empresa}
                    selectedValues={columnFilters.empresa}
                    onToggleValue={(v) => handleToggleColumnValue('empresa', v)}
                    onSelectAll={() => handleSelectAllColumn('empresa')}
                    onClear={() => handleClearColumn('empresa')}
                  />
                </th>
                <th className="py-3 px-3">
                  <ColumnHeaderWithFilter
                    colKey="faculdade"
                    title="Faculdade"
                    uniqueValues={uniqueColumnValues.faculdade}
                    selectedValues={columnFilters.faculdade}
                    onToggleValue={(v) => handleToggleColumnValue('faculdade', v)}
                    onSelectAll={() => handleSelectAllColumn('faculdade')}
                    onClear={() => handleClearColumn('faculdade')}
                  />
                </th>
                <th className="py-3 px-3">
                  <ColumnHeaderWithFilter
                    colKey="cidade"
                    title="Cidade"
                    uniqueValues={uniqueColumnValues.cidade}
                    selectedValues={columnFilters.cidade}
                    onToggleValue={(v) => handleToggleColumnValue('cidade', v)}
                    onSelectAll={() => handleSelectAllColumn('cidade')}
                    onClear={() => handleClearColumn('cidade')}
                  />
                </th>
                <th className="py-3 px-3">
                  <ColumnHeaderWithFilter
                    colKey="anoFormatura"
                    title="Ano Formatura"
                    uniqueValues={uniqueColumnValues.anoFormatura}
                    selectedValues={columnFilters.anoFormatura}
                    onToggleValue={(v) => handleToggleColumnValue('anoFormatura', v)}
                    onSelectAll={() => handleSelectAllColumn('anoFormatura')}
                    onClear={() => handleClearColumn('anoFormatura')}
                  />
                </th>
                <th className="py-3 px-3">Serviço</th>
                <th className="py-3 px-3">Origem</th>
                <th className="py-3 px-3">
                  <ColumnHeaderWithFilter
                    colKey="status"
                    title="Funil"
                    uniqueValues={uniqueColumnValues.status}
                    selectedValues={columnFilters.status}
                    onToggleValue={(v) => handleToggleColumnValue('status', v)}
                    onSelectAll={() => handleSelectAllColumn('status')}
                    onClear={() => handleClearColumn('status')}
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
                  <td colSpan={12} className="py-12 text-center text-slate-500">
                    Nenhuma turma encontrada para os critérios selecionados.
                  </td>
                </tr>
              ) : (
                paginatedLeads.map((lead) => {
                  const statusInfo = STATUS_CONFIG[lead.status] || STATUS_CONFIG.Novo
                  const sgeLink = sgeLinks.find((lnk) => lnk.leadId === lead.id)

                  return (
                    <tr
                      key={lead.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors group cursor-pointer"
                      onClick={() => setSelectedLead(lead)}
                    >
                      {/* Turma / Curso */}
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          {lead.curso}
                        </div>
                        <div className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
                          <span className="font-mono font-medium text-slate-700 dark:text-slate-300">
                            {lead.turma}
                          </span>
                          <span>•</span>
                          <span>{lead.anoFormatura}</span>
                        </div>
                      </td>

                      {/* Empresa */}
                      <td className="py-3.5 px-3">
                        <Badge
                          variant="outline"
                          className="font-bold text-xs bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700"
                        >
                          {lead.empresa || 'AFF'}
                        </Badge>
                      </td>

                      {/* Faculdade */}
                      <td className="py-3.5 px-3 font-medium text-slate-800 dark:text-slate-200">
                        {lead.faculdade}
                      </td>

                      {/* Cidade */}
                      <td className="py-3.5 px-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {lead.cidade}
                      </td>

                      {/* Ano Formatura */}
                      <td className="py-3.5 px-3 text-xs font-mono text-slate-600 dark:text-slate-400">
                        {lead.anoFormatura}
                      </td>

                      {/* Tipo Serviço */}
                      <td className="py-3.5 px-3 text-xs text-slate-700 dark:text-slate-300">
                        {lead.tipoServico || '—'}
                      </td>

                      {/* Origem / Como Conheceu */}
                      <td className="py-3.5 px-3">
                        {lead.comoConheceu ? (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium">
                            {lead.comoConheceu}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">—</span>
                        )}
                      </td>

                      {/* Status / Funil */}
                      <td className="py-3.5 px-3">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border',
                            statusInfo.bg,
                            statusInfo.color,
                          )}
                        >
                          {statusInfo.label}
                        </span>
                      </td>

                      {/* Coluna SGE */}
                      <td className="py-3.5 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                        {sgeLink ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  onClick={() => handleOpenEdit(lead)}
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

                      {/* Alunos Fechados / Cadastrados (X/Y) */}
                      <td className="py-3.5 px-3 text-center">
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
                      </td>

                      {/* Observações */}
                      <td className="py-3.5 px-3 max-w-[180px]">
                        <p
                          className="text-xs text-slate-500 truncate"
                          title={lead.observacoes || lead.notes || ''}
                        >
                          {lead.observacoes || lead.notes || '—'}
                        </p>
                      </td>

                      {/* Ações */}
                      <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-slate-500 hover:text-orange-600"
                            onClick={() => handleOpenEdit(lead)}
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
                <Input
                  id="curso"
                  placeholder="Ex: Agronomia, Direito"
                  value={formData.curso}
                  onChange={(e) => setFormData({ ...formData, curso: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor="faculdade">Faculdade *</Label>
                <Input
                  id="faculdade"
                  placeholder="Ex: FAINOR, UNEX, UEFS"
                  value={formData.faculdade}
                  onChange={(e) => setFormData({ ...formData, faculdade: e.target.value })}
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
                <Input
                  id="cidade"
                  placeholder="Ex: Conquista, Feira de Santana"
                  value={formData.cidade}
                  onChange={(e) => setFormData({ ...formData, cidade: e.target.value })}
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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label htmlFor="closer">Closer Responsável</Label>
                <Input
                  id="closer"
                  placeholder="Nome do closer"
                  value={formData.closer}
                  onChange={(e) => setFormData({ ...formData, closer: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor="sdr">SDR Responsável</Label>
                <Input
                  id="sdr"
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

      {/* Drawer / Modal de Detalhes da Turma Selecionada */}
      {selectedLead && (
        <Dialog open={!!selectedLead} onOpenChange={(open) => !open && setSelectedLead(null)}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <div className="flex items-center gap-2">
                <Badge className="bg-orange-600 text-white font-bold">
                  {selectedLead.empresa || 'AFF'}
                </Badge>
                <DialogTitle className="text-xl">
                  {selectedLead.curso} • {selectedLead.faculdade}
                </DialogTitle>
              </div>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-slate-50 dark:bg-slate-900/50 p-3 rounded-lg border border-slate-200 dark:border-slate-800 text-xs">
                <div>
                  <span className="text-slate-500 block">Turma</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {selectedLead.turma}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Ano/Fase</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {selectedLead.anoFormatura}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Cidade</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {selectedLead.cidade}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Tipo Serviço</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {selectedLead.tipoServico || 'Formatura'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Como Conheceu</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {selectedLead.comoConheceu || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Status</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {STATUS_CONFIG[selectedLead.status]?.label || selectedLead.status}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Código SGE</span>
                  <span className="font-semibold text-emerald-600 font-mono">
                    {getSGELinkForLead(selectedLead.id)?.sgeProjectCode || 'Não vinculado'}
                  </span>
                </div>
                {selectedLead.dataFechamento && (
                  <div>
                    <span className="text-slate-500 block">Data Fechamento</span>
                    <span className="font-semibold text-emerald-600">
                      {selectedLead.dataFechamento}
                    </span>
                  </div>
                )}
                {selectedLead.closer && (
                  <div>
                    <span className="text-slate-500 block">Closer</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {selectedLead.closer}
                    </span>
                  </div>
                )}
                {selectedLead.sdr && (
                  <div>
                    <span className="text-slate-500 block">SDR</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {selectedLead.sdr}
                    </span>
                  </div>
                )}
              </div>

              {/* Contato Principal */}
              {(selectedLead.contatoNome || selectedLead.contatoTelefone) && (
                <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30">
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    Contato Principal
                  </h4>
                  <div className="flex items-center gap-4 text-sm">
                    {selectedLead.contatoNome && (
                      <div className="flex items-center gap-1.5 font-medium">
                        <User className="h-4 w-4 text-slate-400" />
                        {selectedLead.contatoNome}
                      </div>
                    )}
                    {selectedLead.contatoTelefone && (
                      <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                        <Phone className="h-4 w-4 text-slate-400" />
                        {selectedLead.contatoTelefone}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Link da proposta */}
              {selectedLead.linkProposta && (
                <div className="p-3 rounded-lg border border-orange-100 dark:border-orange-900 bg-orange-50/50 dark:bg-orange-950/20">
                  <a
                    href={selectedLead.linkProposta}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-medium text-orange-600 dark:text-orange-400 flex items-center gap-1.5 hover:underline"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Abrir Link da Proposta
                  </a>
                </div>
              )}

              {/* Observações */}
              <div>
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Observações
                </h4>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 min-h-[60px] whitespace-pre-wrap">
                  {selectedLead.observacoes ||
                    selectedLead.notes ||
                    'Nenhuma observação registrada.'}
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  handleOpenEdit(selectedLead)
                  setSelectedLead(null)
                }}
              >
                <Edit2 className="h-3.5 w-3.5 mr-1.5" />
                Editar
              </Button>
              <Button
                size="sm"
                className="bg-orange-600 hover:bg-orange-700 text-white"
                onClick={() => setSelectedLead(null)}
              >
                Fechar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
