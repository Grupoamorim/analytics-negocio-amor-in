import { useState, useEffect, useMemo, useRef } from 'react'
import {
  QrCode,
  Copy,
  Check,
  Search,
  ArrowUpDown,
  Pencil,
  Trash2,
  X,
  Download,
  Users,
  List,
  Map as MapIcon,
} from 'lucide-react'
import QRCode from 'qrcode'
import { loadLeads, updateLead, deleteLead } from '@/utils/captacaoStorage'
import { CaptacaoLead, normalizeTurma, extractTurmaNumber } from '@/types/captacao'
import { formatPhoneBR } from '@/utils/phoneMask'
import { useToast } from '@/hooks/use-toast'
import MarketMap from '@/components/MarketMap'
import AIInsightsButton from '@/components/AIInsightsButton'

type SortField = keyof CaptacaoLead
type SortOrder = 'asc' | 'desc'
type Tab = 'lista' | 'mapa'

export default function Captacao() {
  const { toast } = useToast()
  const [leads, setLeads] = useState<CaptacaoLead[]>([])
  const [copied, setCopied] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState<string>('')
  const [activeTab, setActiveTab] = useState<Tab>('lista')

  const [searchQuery, setSearchQuery] = useState('')
  const [sortField, setSortField] = useState<SortField>('dataCadastro')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')

  const [editingLead, setEditingLead] = useState<CaptacaoLead | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<CaptacaoLead | null>(null)

  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // URL pública completa do formulário
  const formUrl = useMemo(() => {
    if (typeof window !== 'undefined') {
      const { origin, pathname } = window.location
      const base = pathname.replace(/\/captacao.*$/, '')
      return `${origin}${base}/captacao/form`
    }
    return '/captacao/form'
  }, [])

  // Recarrega os leads do Supabase
  const refreshLeads = () => {
    loadLeads().then(setLeads)
  }

  // Carrega leads iniciais no mount e faz polling leve, já que os cadastros
  // agora vêm do formulário público (outros navegadores/dispositivos).
  useEffect(() => {
    refreshLeads()
    const intervalId = window.setInterval(refreshLeads, 15000)
    return () => window.clearInterval(intervalId)
  }, [])

  // Gera QR code como data URL
  useEffect(() => {
    let active = true
    QRCode.toDataURL(formUrl, {
      width: 200,
      margin: 1,
      color: { dark: '#0a0f14', light: '#ffffff' },
      errorCorrectionLevel: 'M',
    })
      .then((url) => {
        if (active) setQrDataUrl(url)
      })
      .catch(() => {
        if (active) setQrDataUrl('')
      })
    return () => {
      active = false
    }
  }, [formUrl])

  const handleCopy = async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(formUrl)
      } else {
        const ta = document.createElement('textarea')
        ta.value = formUrl
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      }
      setCopied(true)
      if (copyTimer.current) clearTimeout(copyTimer.current)
      copyTimer.current = setTimeout(() => setCopied(false), 2000)
      toast({
        title: 'Link copiado',
        description: 'O link público foi copiado para a área de transferência.',
      })
    } catch {
      toast({
        title: 'Erro ao copiar',
        description: 'Não foi possível copiar o link.',
        variant: 'destructive',
      })
    }
  }

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder('asc')
    }
  }

  const filteredLeads = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    return leads
      .filter((l) => {
        if (!q) return true
        return l.nome.toLowerCase().includes(q) || l.email.toLowerCase().includes(q)
      })
      .sort((a, b) => {
        let va: string | number = a[sortField]
        let vb: string | number = b[sortField]
        if (sortField === 'turma') {
          va = parseInt(String(a.turma).replace(/\D/g, ''), 10) || 0
          vb = parseInt(String(b.turma).replace(/\D/g, ''), 10) || 0
        } else if (sortField === 'dataCadastro') {
          va = new Date(a.dataCadastro).getTime()
          vb = new Date(b.dataCadastro).getTime()
        } else {
          va = String(a[sortField]).toLowerCase()
          vb = String(b[sortField]).toLowerCase()
        }
        if (va < vb) return sortOrder === 'asc' ? -1 : 1
        if (va > vb) return sortOrder === 'asc' ? 1 : -1
        return 0
      })
  }, [leads, searchQuery, sortField, sortOrder])

  const openEditModal = (lead: CaptacaoLead) => {
    setEditingLead(lead)
    setModalOpen(true)
  }

  const handleDelete = async (lead: CaptacaoLead) => {
    try {
      await deleteLead(lead.id)
      refreshLeads()
      toast({ title: 'Lead excluído', description: `${lead.nome} foi removido da lista.` })
    } catch {
      toast({ title: 'Erro ao excluir', variant: 'destructive' })
    } finally {
      setConfirmDelete(null)
    }
  }

  const exportCsv = () => {
    const headers = [
      'Curso',
      'Faculdade',
      'Turma',
      'Ano de Formatura',
      'Cidade',
      'Nome Completo',
      'Telefone',
      'Email',
      'Data de Cadastro',
    ]
    const escape = (v: string) => `"${String(v).replace(/"/g, '""')}"`
    const rows = filteredLeads.map((l) =>
      [
        l.curso,
        l.faculdade,
        l.turma,
        l.anoFormatura,
        l.cidade,
        l.nome,
        l.telefone,
        l.email,
        new Date(l.dataCadastro).toLocaleString('pt-BR'),
      ]
        .map(escape)
        .join(','),
    )
    const csv = [headers.map(escape).join(','), ...rows].join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `captacao-leads-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast({ title: 'CSV exportado', description: `${filteredLeads.length} registros exportados.` })
  }

  return (
    <div className="space-y-6 animate-fade-in pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-white/[0.06]">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-white tracking-tight flex items-center gap-3">
            Captação de Leads
            <span className="text-xs px-2.5 py-1 rounded-full bg-orange-500/15 text-orange-300 font-semibold border border-orange-500/25">
              {leads.length} Captados
            </span>
            <AIInsightsButton
              context={activeTab === 'mapa' ? 'captacao-mapa' : 'captacao-lista'}
              data={activeTab === 'mapa' ? leads : filteredLeads}
            />
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Gerencie seus formulários de captação e listas de contatos
          </p>
        </div>
      </div>

      {/* Card de Link + QR Code */}
      <div className="bg-[#111820] border border-white/[0.06] rounded-xl p-5 sm:p-6 shadow-xl">
        <div className="flex flex-col lg:flex-row gap-6 items-center lg:items-start">
          {/* QR Code */}
          <div className="flex-shrink-0">
            <div className="w-[200px] h-[200px] bg-white rounded-xl border border-white/10 p-2 flex items-center justify-center">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt="QR Code do formulário de captação"
                  className="w-full h-full"
                />
              ) : (
                <div className="w-full h-full rounded-lg bg-slate-200 animate-pulse" />
              )}
            </div>
            <p className="text-[11px] text-slate-500 text-center mt-2">
              Escaneie para abrir o formulário
            </p>
          </div>

          {/* Link + ações */}
          <div className="flex-1 w-full space-y-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <QrCode className="w-4 h-4 text-orange-400" />
                <h2 className="text-sm font-semibold text-white">Link público de captação</h2>
              </div>
              <p className="text-xs text-slate-400 mb-3">
                Compartilhe este link ou QR code com futuros clientes. Ao preencherem o formulário,
                os dados caem automaticamente na lista abaixo.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex-1 bg-[#0a0f14] border border-white/10 rounded-lg px-3 py-2.5 text-xs text-slate-200 font-mono truncate">
                {formUrl}
              </div>
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-orange-600 to-orange-600 hover:from-orange-500 hover:to-orange-500 text-white text-xs font-semibold shadow-lg shadow-orange-500/20 transition-all hover:scale-[1.02] active:scale-[0.98] whitespace-nowrap"
                title="Copiar link público"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-emerald-300" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
                {copied ? 'Copiado!' : 'Copiar Link'}
              </button>
            </div>

            <div className="flex items-center gap-2 text-[11px] text-slate-500">
              {copied ? (
                <span className="inline-flex items-center gap-1.5 text-emerald-400">
                  <Check className="w-3.5 h-3.5" /> Link copiado para a área de transferência
                </span>
              ) : (
                <span>Clique em "Copiar Link" para compartilhar com seus clientes.</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Navegação por abas */}
      <div className="flex items-center gap-1 p-1 bg-[rgba(255,255,255,0.03)] border border-white/[0.06] rounded-xl w-fit">
        <TabButton
          active={activeTab === 'lista'}
          onClick={() => setActiveTab('lista')}
          icon={<List className="w-4 h-4" />}
          label="Lista"
        />
        <TabButton
          active={activeTab === 'mapa'}
          onClick={() => setActiveTab('mapa')}
          icon={<MapIcon className="w-4 h-4" />}
          label="Mapa de Mercado"
        />
      </div>

      {activeTab === 'mapa' ? (
        <MarketMap leads={leads} />
      ) : (
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Users className="w-4 h-4 text-orange-400" />
              <span>
                <strong className="text-white">{filteredLeads.length}</strong> de {leads.length}{' '}
                pessoas na lista
              </span>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filtrar por nome ou email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-[#111820] border border-white/[0.08] rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
              </div>
              <button
                type="button"
                onClick={exportCsv}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#111820] border border-white/[0.08] text-slate-300 hover:text-white hover:bg-white/[0.06] text-xs font-medium transition-colors"
                title="Exportar como CSV"
              >
                <Download className="w-3.5 h-3.5" /> CSV
              </button>
            </div>
          </div>

          {/* Tabela desktop */}
          <div className="hidden md:block bg-[#111820] border border-white/[0.06] rounded-xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/[0.06] bg-white/[0.02] text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                    {(
                      [
                        ['curso', 'Curso'],
                        ['faculdade', 'Faculdade'],
                        ['turma', 'Turma'],
                        ['anoFormatura', 'Ano Formatura'],
                        ['cidade', 'Cidade'],
                        ['nome', 'Nome Completo'],
                        ['telefone', 'Telefone'],
                        ['email', 'Email'],
                      ] as [SortField, string][]
                    ).map(([field, label]) => (
                      <th
                        key={field}
                        className="py-3.5 px-4 cursor-pointer hover:text-white whitespace-nowrap"
                        onClick={() => handleSort(field)}
                      >
                        <div className="flex items-center gap-1.5">
                          {label} <ArrowUpDown className="w-3 h-3" />
                        </div>
                      </th>
                    ))}
                    <th className="py-3.5 px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04] text-xs">
                  {filteredLeads.map((lead) => (
                    <tr
                      key={lead.id}
                      className="hover:bg-white/[0.03] transition-colors group cursor-pointer"
                      onClick={() => openEditModal(lead)}
                    >
                      <td className="py-3 px-4 font-medium text-slate-200">{lead.curso}</td>
                      <td className="py-3 px-4 text-slate-300">{lead.faculdade}</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-300 border border-orange-500/20 text-[11px]">
                          {lead.turma}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-300 font-mono">{lead.anoFormatura}</td>
                      <td className="py-3 px-4 text-slate-300">{lead.cidade}</td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-white group-hover:text-orange-300 transition-colors">
                          {lead.nome}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-300 whitespace-nowrap">
                        {lead.telefone}
                      </td>
                      <td className="py-3 px-4 text-slate-300">{lead.email}</td>
                      <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => openEditModal(lead)}
                            className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-white/[0.05]"
                            title="Editar"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDelete(lead)}
                            className="p-1.5 text-slate-400 hover:text-red-400 rounded hover:bg-white/[0.05]"
                            title="Excluir"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filteredLeads.length === 0 && (
              <div className="py-12 text-center text-slate-400 text-sm">
                {leads.length === 0
                  ? 'Nenhum lead captado ainda. Compartilhe o link público para começar.'
                  : 'Nenhum lead encontrado com o filtro atual.'}
              </div>
            )}
          </div>

          {/* Cards mobile */}
          <div className="md:hidden space-y-3">
            {filteredLeads.map((lead) => (
              <div
                key={lead.id}
                onClick={() => openEditModal(lead)}
                className="bg-[#111820] border border-white/[0.06] rounded-xl p-4 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="font-bold text-white text-sm">{lead.nome}</h4>
                    <p className="text-xs text-slate-400">{lead.email}</p>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-300 border border-orange-500/20 text-[10px] whitespace-nowrap">
                    {lead.turma}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-white/[0.04]">
                  <div>
                    <span className="text-slate-500">Curso:</span>{' '}
                    <span className="text-slate-200">{lead.curso}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Faculdade:</span>{' '}
                    <span className="text-slate-200">{lead.faculdade}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Formatura:</span>{' '}
                    <span className="text-slate-200">{lead.anoFormatura}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Cidade:</span>{' '}
                    <span className="text-slate-200">{lead.cidade}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-slate-500">Telefone:</span>{' '}
                    <span className="text-slate-200">{lead.telefone}</span>
                  </div>
                </div>
                <div
                  className="flex items-center justify-end gap-2 pt-2 border-t border-white/[0.04]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => openEditModal(lead)}
                    className="text-xs text-slate-300 font-semibold px-2 py-1 rounded hover:bg-white/[0.05]"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(lead)}
                    className="text-xs text-red-400 font-semibold px-2 py-1 rounded hover:bg-red-500/10"
                  >
                    Excluir
                  </button>
                </div>
              </div>
            ))}
            {filteredLeads.length === 0 && (
              <div className="py-12 text-center text-slate-400 text-sm">
                {leads.length === 0
                  ? 'Nenhum lead captado ainda.'
                  : 'Nenhum lead encontrado com o filtro atual.'}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal de Edição */}
      {modalOpen && editingLead && (
        <EditLeadModal
          lead={editingLead}
          onClose={() => setModalOpen(false)}
          onSave={(patch) => {
            updateLead(editingLead.id, patch)
              .then(() => {
                refreshLeads()
                setModalOpen(false)
                toast({
                  title: 'Lead atualizado',
                  description: `${patch.nome || editingLead.nome} salvo com sucesso.`,
                })
              })
              .catch(() => toast({ title: 'Erro ao salvar', variant: 'destructive' }))
          }}
        />
      )}

      {/* Confirmação de exclusão */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-sm bg-[#111820] border border-white/10 rounded-2xl shadow-2xl p-6 animate-scale-in">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-red-500/15 border border-red-500/25">
                <Trash2 className="w-5 h-5 text-red-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-white">Excluir lead</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Tem certeza que deseja excluir{' '}
                  <strong className="text-slate-200">{confirmDelete.nome}</strong>? Esta ação não
                  pode ser desfeita.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center justify-end gap-2 mt-5">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white rounded-lg hover:bg-white/[0.06] border border-white/[0.08]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleDelete(confirmDelete)}
                className="px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-500 rounded-lg shadow-lg shadow-red-500/20"
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

// ---------- Modal de Edição ----------
interface EditModalProps {
  lead: CaptacaoLead
  onClose: () => void
  onSave: (patch: Partial<CaptacaoLead>) => void
}

function EditLeadModal({ lead, onClose, onSave }: EditModalProps) {
  const [form, setForm] = useState({
    curso: lead.curso,
    faculdade: lead.faculdade,
    turma: extractTurmaNumber(lead.turma),
    anoFormatura: lead.anoFormatura,
    cidade: lead.cidade,
    nome: lead.nome,
    telefone: lead.telefone,
    email: lead.email,
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const set = (field: keyof typeof form, value: string) => {
    setForm((f) => ({ ...f, [field]: value }))
    if (errors[field]) setErrors((e) => ({ ...e, [field]: '' }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (!form.curso.trim()) errs.curso = 'Curso é obrigatório.'
    if (!form.faculdade.trim()) errs.faculdade = 'Faculdade é obrigatória.'
    if (!form.anoFormatura.trim()) errs.anoFormatura = 'Ano de formatura é obrigatório.'
    if (!form.cidade.trim()) errs.cidade = 'Cidade é obrigatória.'
    if (!form.nome.trim()) errs.nome = 'Nome completo é obrigatório.'
    if (!form.telefone.trim()) errs.telefone = 'Telefone é obrigatório.'
    if (!form.email.trim()) errs.email = 'Email é obrigatório.'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = 'Email inválido.'

    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      return
    }

    onSave({
      curso: form.curso.trim(),
      faculdade: form.faculdade.trim(),
      turma: form.turma.trim(),
      anoFormatura: form.anoFormatura.trim(),
      cidade: form.cidade.trim(),
      nome: form.nome.trim(),
      telefone: form.telefone.trim(),
      email: form.email.trim(),
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-[580px] max-h-[90vh] bg-[#111820] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-scale-in">
        <div className="px-6 py-4 border-b border-white/[0.08] flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-white">Editar Lead Captado</h3>
            <p className="text-xs text-slate-400">Atualize os dados do contato</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 flex-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field
              label="Curso"
              required
              error={errors.curso}
              value={form.curso}
              onChange={(v) => set('curso', v)}
              placeholder="Ex: Engenharia Civil"
            />
            <Field
              label="Faculdade"
              required
              error={errors.faculdade}
              value={form.faculdade}
              onChange={(v) => set('faculdade', v)}
              placeholder="Ex: USP"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Field
                label="Turma"
                value={form.turma}
                onChange={(v) => set('turma', v)}
                placeholder="Ex: 10 (não é o semestre)"
              />
              <p className="text-[10px] text-slate-500 mt-1">
                Número da turma, não o semestre. Ex: 10, 11. Se vazio, salva como "Turma 0".
              </p>
            </div>
            <Field
              label="Ano de Formatura"
              required
              error={errors.anoFormatura}
              value={form.anoFormatura}
              onChange={(v) => set('anoFormatura', v)}
              placeholder="Ex: 2026.2"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field
              label="Cidade"
              required
              error={errors.cidade}
              value={form.cidade}
              onChange={(v) => set('cidade', v)}
              placeholder="Ex: São Paulo"
            />
            <Field
              label="Nome Completo"
              required
              error={errors.nome}
              value={form.nome}
              onChange={(v) => set('nome', v)}
              placeholder="Ex: João Silva"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Telefone <span className="text-red-400">*</span>
              </label>
              <input
                type="tel"
                placeholder="Ex: (11) 99999-9999"
                value={form.telefone}
                onChange={(e) => set('telefone', formatPhoneBR(e.target.value))}
                className="w-full bg-[#0a0f14] border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
              {errors.telefone && (
                <p className="text-[10px] text-red-400 mt-1">{errors.telefone}</p>
              )}
            </div>
            <Field
              label="Email"
              required
              type="email"
              error={errors.email}
              value={form.email}
              onChange={(v) => set('email', v)}
              placeholder="Ex: joao@email.com"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-white/[0.08]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white rounded-lg hover:bg-white/[0.06] border border-white/[0.08]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-semibold text-white bg-gradient-to-r from-orange-600 to-orange-600 hover:from-orange-500 hover:to-orange-500 rounded-lg shadow-lg shadow-orange-500/20"
            >
              Salvar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

interface FieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  required?: boolean
  type?: string
  error?: string
}

interface TabButtonProps {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}

function TabButton({ active, onClick, icon, label }: TabButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
        active
          ? 'bg-gradient-to-r from-orange-600 to-orange-600 text-white shadow-lg shadow-orange-500/20'
          : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  required,
  type = 'text',
  error,
}: FieldProps) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-300 mb-1">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full bg-[#0a0f14] border rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-orange-500 ${
          error ? 'border-red-500/60' : 'border-white/10'
        }`}
      />
      {error && <p className="text-[10px] text-red-400 mt-1">{error}</p>}
    </div>
  )
}

// Reexporta para garantir uso do normalize em outros módulos (mantém API estável)
export { normalizeTurma, extractTurmaNumber }
