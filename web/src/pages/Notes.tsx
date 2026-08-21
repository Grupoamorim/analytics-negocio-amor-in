import React, { useState, useMemo } from 'react'
import {
  StickyNote,
  Plus,
  Search,
  PhoneCall,
  Mail,
  Video,
  Clock,
  Edit2,
  Trash2,
  X,
  User,
  Building2,
  Calendar,
  Filter,
  CheckCircle,
} from 'lucide-react'
import { useCRM } from '@/context/CRMContext'
import { Note, NoteType, Priority } from '@/types/crm'
import { useToast } from '@/hooks/use-toast'
import AIInsightsButton from '@/components/AIInsightsButton'

export default function Notes() {
  const { notes, leads, members, deals, addNote, updateNote, deleteNote } = useCRM()
  const { toast } = useToast()

  // Filtros
  const [selectedLeadId, setSelectedLeadId] = useState<string>('Todos')
  const [selectedType, setSelectedType] = useState<string>('Todos')
  const [searchQuery, setSearchQuery] = useState('')

  // Modais
  const [modalOpen, setModalOpen] = useState(false)
  const [editingNote, setEditingNote] = useState<Note | null>(null)

  // Form State
  const [formData, setFormData] = useState({
    leadId: leads[0]?.id || '',
    dealId: '',
    type: 'Ligação' as NoteType,
    authorId: members[0]?.id || '',
    content: '',
    priority: 'Média' as Priority,
  })

  // Notas filtradas e ordenadas cronologicamente (mais recente no topo)
  const filteredNotes = useMemo(() => {
    return notes
      .filter((note) => {
        if (selectedLeadId !== 'Todos' && note.leadId !== selectedLeadId) return false
        if (selectedType !== 'Todos' && note.type !== selectedType) return false
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase()
          const lead = leads.find((l) => l.id === note.leadId)
          const matchContent = note.content.toLowerCase().includes(q)
          const matchCompany = lead?.faculdade.toLowerCase().includes(q) ?? false
          const matchLeadName = lead?.curso.toLowerCase().includes(q) ?? false
          if (!matchContent && !matchCompany && !matchLeadName) return false
        }
        return true
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [notes, leads, selectedLeadId, selectedType, searchQuery])

  // Abrir modal de criação
  const handleOpenCreateModal = () => {
    setEditingNote(null)
    setFormData({
      leadId: leads[0]?.id || '',
      dealId: '',
      type: 'Ligação',
      authorId: members[0]?.id || '',
      content: '',
      priority: 'Média',
    })
    setModalOpen(true)
  }

  // Abrir modal de edição
  const handleOpenEditModal = (note: Note) => {
    setEditingNote(note)
    setFormData({
      leadId: note.leadId,
      dealId: note.dealId || '',
      type: note.type,
      authorId: note.authorId,
      content: note.content,
      priority: note.priority || 'Média',
    })
    setModalOpen(true)
  }

  // Salvar nota
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.leadId || !formData.content.trim()) {
      toast({
        title: 'Campos Obrigatórios',
        description: 'Selecione um lead e preencha o conteúdo do atendimento.',
        variant: 'destructive',
      })
      return
    }

    if (editingNote) {
      updateNote(editingNote.id, {
        leadId: formData.leadId,
        dealId: formData.dealId || undefined,
        type: formData.type,
        authorId: formData.authorId,
        content: formData.content,
        priority: formData.priority,
      })
      toast({
        title: 'Nota Atualizada',
        description: 'Alterações registradas com sucesso.',
      })
    } else {
      addNote({
        leadId: formData.leadId,
        dealId: formData.dealId || undefined,
        type: formData.type,
        authorId: formData.authorId,
        content: formData.content,
        priority: formData.priority,
        date: new Date().toISOString(),
      })
      toast({
        title: 'Nota Adicionada',
        description: 'Interação registrada no histórico.',
      })
    }

    setModalOpen(false)
  }

  // Ícone por tipo
  const getTypeIcon = (type: NoteType) => {
    switch (type) {
      case 'Ligação':
        return <PhoneCall className="w-4 h-4 text-orange-400" />
      case 'Email':
        return <Mail className="w-4 h-4 text-orange-400" />
      case 'Reunião':
        return <Video className="w-4 h-4 text-emerald-400" />
      case 'Follow-up':
        return <Clock className="w-4 h-4 text-amber-400" />
      default:
        return <StickyNote className="w-4 h-4 text-slate-400" />
    }
  }

  // Cor do badge por tipo
  const getTypeBadgeClass = (type: NoteType) => {
    switch (type) {
      case 'Ligação':
        return 'bg-orange-500/15 text-orange-300 border-orange-500/30'
      case 'Email':
        return 'bg-orange-500/15 text-orange-300 border-orange-500/30'
      case 'Reunião':
        return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
      case 'Follow-up':
        return 'bg-amber-500/15 text-amber-300 border-amber-500/30'
      default:
        return 'bg-slate-500/15 text-slate-300 border-slate-500/30'
    }
  }

  return (
    <div className="space-y-6 animate-fade-in pb-8">
      {/* Topo da Tela */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-white/[0.06]">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-white tracking-tight flex items-center gap-3">
            Notas de Atendimento
            <span className="text-xs px-2.5 py-1 rounded-full bg-orange-500/15 text-orange-300 font-semibold border border-orange-500/25">
              {notes.length} Registros
            </span>
            <AIInsightsButton context="notes" />
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Linha do tempo cronológica de contatos, reuniões e follow-ups
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenCreateModal}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-orange-600 to-orange-600 hover:from-orange-500 hover:to-orange-500 text-white text-sm font-semibold shadow-lg shadow-orange-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          <Plus className="w-4 h-4" /> Nova Nota
        </button>
      </div>

      {/* Barra de Filtros & Pesquisa */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          {/* Dropdown de Lead */}
          <div className="flex-1 sm:flex-none">
            <select
              value={selectedLeadId}
              onChange={(e) => setSelectedLeadId(e.target.value)}
              className="w-full bg-[#111820] border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-orange-500"
            >
              <option value="Todos">Todos os Leads</option>
              {leads.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.curso} — {l.faculdade} ({l.turma})
                </option>
              ))}
            </select>
          </div>

          {/* Dropdown de Tipo */}
          <div className="flex-1 sm:flex-none">
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="w-full bg-[#111820] border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-orange-500"
            >
              <option value="Todos">Todos os Tipos</option>
              <option value="Ligação">Ligação</option>
              <option value="Email">Email</option>
              <option value="Reunião">Reunião</option>
              <option value="Follow-up">Follow-up</option>
              <option value="Outro">Outro</option>
            </select>
          </div>
        </div>

        {/* Busca por Texto */}
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar nas notas..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#111820] border border-white/[0.08] rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
        </div>
      </div>

      {/* Timeline Vertical Cronológica */}
      <div className="relative pl-6 md:pl-8 space-y-6 before:absolute before:left-3 md:before:left-4 before:top-3 before:bottom-3 before:w-[2px] before:bg-white/[0.06]">
        {filteredNotes.map((note) => {
          const lead = leads.find((l) => l.id === note.leadId)
          const author = members.find((m) => m.id === note.authorId)
          const deal = deals.find((d) => d.id === note.dealId)

          return (
            <div key={note.id} className="relative group">
              {/* Ponto na linha do tempo */}
              <div className="absolute -left-6 md:-left-8 top-3.5 w-6 h-6 rounded-full bg-[#111820] border border-white/20 flex items-center justify-center shadow-md">
                {getTypeIcon(note.type)}
              </div>

              {/* Card da Nota */}
              <div className="bg-[#111820] border border-white/[0.06] hover:border-white/[0.14] rounded-2xl p-5 shadow-lg space-y-3 transition-all hover:-translate-y-0.5">
                {/* Header do Card */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${getTypeBadgeClass(
                        note.type,
                      )}`}
                    >
                      {note.type}
                    </span>
                    <span className="text-xs font-bold text-white">
                      {lead ? lead.faculdade : 'Turma Desconhecida'}
                    </span>
                    {lead && (
                      <span className="text-xs text-slate-400">
                        • {lead.curso} {lead.turma}
                      </span>
                    )}
                    {deal && (
                      <span className="text-[10px] px-2 py-0.2 rounded bg-orange-500/10 text-orange-300 border border-orange-500/20">
                        {deal.title}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3 text-xs text-slate-400">
                    <span>
                      {new Date(note.date).toLocaleString([], {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    {note.priority && (
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.2 rounded-full ${
                          note.priority === 'Alta'
                            ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                            : note.priority === 'Média'
                              ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                              : 'bg-slate-500/15 text-slate-400 border border-slate-500/30'
                        }`}
                      >
                        {note.priority}
                      </span>
                    )}
                  </div>
                </div>

                {/* Conteúdo Livre da Nota */}
                <p className="text-xs text-slate-200 leading-relaxed bg-[#0a0f14]/50 p-3.5 rounded-xl border border-white/[0.02] whitespace-pre-wrap">
                  {note.content}
                </p>

                {/* Rodapé da Nota */}
                <div className="flex items-center justify-between pt-2 text-xs border-t border-white/[0.04]">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                      style={{ backgroundColor: author?.avatarColor || '#F97316' }}
                    >
                      {author ? author.name.substring(0, 2).toUpperCase() : 'SD'}
                    </div>
                    <span className="text-slate-400 text-[11px]">
                      Registrado por{' '}
                      <span className="text-slate-200 font-medium">{author?.name}</span>
                    </span>
                  </div>

                  <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={() => handleOpenEditModal(note)}
                      className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-white/[0.06]"
                      title="Editar Nota"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        deleteNote(note.id)
                        toast({
                          title: 'Nota Excluída',
                          description: 'O registro foi removido com sucesso.',
                        })
                      }}
                      className="p-1.5 text-slate-400 hover:text-red-400 rounded hover:bg-white/[0.06]"
                      title="Excluir Nota"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {filteredNotes.length === 0 && (
        <div className="p-12 text-center text-slate-400 text-sm bg-[#111820] border border-white/[0.06] rounded-2xl">
          Nenhuma nota de atendimento encontrada com os filtros atuais.
        </div>
      )}

      {/* Modal de Criação e Edição de Nota */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-[560px] max-h-[90vh] bg-[#111820] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-scale-in">
            <div className="px-6 py-4 border-b border-white/[0.08] flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-white">
                  {editingNote ? 'Editar Nota' : 'Nova Nota de Atendimento'}
                </h3>
                <p className="text-xs text-slate-400">
                  Registre conversas, telefonemas e tarefas realizadas
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 flex-1 text-xs">
              {/* Lead Vinculado */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Lead Vinculado <span className="text-red-400">*</span>
                </label>
                <select
                  required
                  value={formData.leadId}
                  onChange={(e) => setFormData({ ...formData, leadId: e.target.value })}
                  className="w-full bg-[#0a0f14] border border-white/10 rounded-lg p-2 text-white"
                >
                  {leads.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.curso} — {l.faculdade} ({l.turma})
                    </option>
                  ))}
                </select>
              </div>

              {/* Tipo de Atendimento & Prioridade */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Tipo de Interação
                  </label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value as NoteType })}
                    className="w-full bg-[#0a0f14] border border-white/10 rounded-lg p-2 text-white"
                  >
                    <option value="Ligação">Ligação</option>
                    <option value="Email">Email</option>
                    <option value="Reunião">Reunião</option>
                    <option value="Follow-up">Follow-up</option>
                    <option value="Outro">Outro</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Prioridade</label>
                  <select
                    value={formData.priority}
                    onChange={(e) =>
                      setFormData({ ...formData, priority: e.target.value as Priority })
                    }
                    className="w-full bg-[#0a0f14] border border-white/10 rounded-lg p-2 text-white"
                  >
                    <option value="Alta">Alta</option>
                    <option value="Média">Média</option>
                    <option value="Baixa">Baixa</option>
                  </select>
                </div>
              </div>

              {/* Responsável */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Responsável pelo Registro
                </label>
                <select
                  value={formData.authorId}
                  onChange={(e) => setFormData({ ...formData, authorId: e.target.value })}
                  className="w-full bg-[#0a0f14] border border-white/10 rounded-lg p-2 text-white"
                >
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.role})
                    </option>
                  ))}
                </select>
              </div>

              {/* Conteúdo da Nota */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-slate-300 font-semibold">
                    Conteúdo da Nota <span className="text-red-400">*</span>
                  </label>
                  <span className="text-[11px] text-slate-500">
                    {5000 - formData.content.length} caracteres restantes
                  </span>
                </div>
                <textarea
                  required
                  rows={6}
                  maxLength={5000}
                  placeholder="Descreva detalhadamente o que foi conversado, objeções levantadas e acordos estabelecidos..."
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  className="w-full bg-[#0a0f14] border border-white/10 rounded-lg p-3 text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-orange-500 leading-relaxed"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 font-semibold text-slate-400 hover:text-white rounded-lg hover:bg-white/[0.06]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 font-semibold text-white bg-gradient-to-r from-orange-600 to-orange-600 hover:from-orange-500 hover:to-orange-500 rounded-lg shadow-lg shadow-orange-500/20"
                >
                  Salvar Nota
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
