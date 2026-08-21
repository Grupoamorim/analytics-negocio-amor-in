import React, { useState, useMemo } from 'react'
import { Plus, Search, Edit, Trash2, X, Users, Phone, Mail, GraduationCap } from 'lucide-react'
import { useCRM } from '@/context/CRMContext'
import { getTurmaDisplayName } from '@/types/crm'
import { useToast } from '@/hooks/use-toast'

interface ContactFormData {
  nome: string
  telefone: string
  email: string
  leadId: string
}

const EMPTY_FORM: ContactFormData = { nome: '', telefone: '', email: '', leadId: '' }

export default function Contatos() {
  const { contacts, leads, members, addContact, updateContact, deleteContact } = useCRM()
  const { toast } = useToast()

  const [searchQuery, setSearchQuery] = useState('')
  const [turmaFilter, setTurmaFilter] = useState<string>('Todas')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<ContactFormData>(EMPTY_FORM)

  const leadById = useMemo(() => {
    const map = new Map(leads.map((l) => [l.id, l]))
    return map
  }, [leads])

  const filteredContacts = useMemo(() => {
    return contacts
      .filter((c) => {
        if (turmaFilter !== 'Todas' && c.leadId !== turmaFilter) return false
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase()
          const lead = leadById.get(c.leadId)
          const haystack = [
            c.nome,
            c.telefone,
            c.email,
            lead ? getTurmaDisplayName(lead) : '',
            lead?.faculdade || '',
            lead?.curso || '',
          ]
            .join(' ')
            .toLowerCase()
          if (!haystack.includes(q)) return false
        }
        return true
      })
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  }, [contacts, turmaFilter, searchQuery, leadById])

  const handleOpenCreate = () => {
    setEditingId(null)
    setFormData({ ...EMPTY_FORM, leadId: leads[0]?.id || '' })
    setModalOpen(true)
  }

  const handleOpenEdit = (id: string) => {
    const c = contacts.find((x) => x.id === id)
    if (!c) return
    setEditingId(id)
    setFormData({ nome: c.nome, telefone: c.telefone, email: c.email, leadId: c.leadId })
    setModalOpen(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.nome.trim()) {
      toast({ title: 'Nome obrigatório', variant: 'destructive' })
      return
    }
    if (!formData.leadId) {
      toast({ title: 'Selecione uma turma', variant: 'destructive' })
      return
    }
    if (editingId) {
      updateContact(editingId, {
        nome: formData.nome.trim(),
        telefone: formData.telefone.trim(),
        email: formData.email.trim(),
        leadId: formData.leadId,
      })
      toast({ title: 'Contato atualizado' })
    } else {
      addContact({
        nome: formData.nome.trim(),
        telefone: formData.telefone.trim(),
        email: formData.email.trim(),
        leadId: formData.leadId,
      })
      toast({ title: 'Contato criado' })
    }
    setModalOpen(false)
  }

  return (
    <div className="space-y-6 animate-fade-in pb-8">
      {/* Topo */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-white/[0.06]">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-white tracking-tight flex items-center gap-3">
            <Users className="w-6 h-6 text-orange-400" />
            Contatos
            <span className="text-xs px-2.5 py-1 rounded-full bg-orange-500/15 text-orange-300 font-semibold border border-orange-500/25">
              {contacts.length} Alunos
            </span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">Alunos vinculados às turmas</p>
        </div>
        <button
          type="button"
          onClick={handleOpenCreate}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-orange-600 to-orange-600 hover:from-orange-500 hover:to-orange-500 text-white text-sm font-semibold shadow-lg shadow-orange-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          <Plus className="w-4 h-4" /> Novo Contato
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-400">Turma:</label>
          <select
            value={turmaFilter}
            onChange={(e) => setTurmaFilter(e.target.value)}
            className="bg-[#111820] border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-orange-500"
          >
            <option value="Todas">Todas as Turmas</option>
            {leads.map((l) => (
              <option key={l.id} value={l.id}>
                {getTurmaDisplayName(l)}
              </option>
            ))}
          </select>
        </div>
        <div className="relative flex-1 sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por nome, turma, e-mail..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#111820] border border-white/[0.08] rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
        </div>
      </div>

      {/* Tabela desktop */}
      <div className="hidden md:block bg-[#0f1419] border border-white/[0.06] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-white/[0.02] border-b border-white/[0.06]">
              <tr className="text-[11px] uppercase tracking-wider text-slate-400">
                <th className="py-3 px-4 font-semibold">Aluno</th>
                <th className="py-3 px-4 font-semibold">Turma</th>
                <th className="py-3 px-4 font-semibold">Telefone</th>
                <th className="py-3 px-4 font-semibold">E-mail</th>
                <th className="py-3 px-4 font-semibold text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredContacts.map((c) => {
                const lead = leadById.get(c.leadId)
                return (
                  <tr
                    key={c.id}
                    className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-orange-500/20 border border-orange-500/30 text-orange-300 flex items-center justify-center text-[11px] font-bold">
                          {c.nome.substring(0, 2).toUpperCase()}
                        </div>
                        <span className="font-semibold text-white">{c.nome}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      {lead ? (
                        <span className="px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-300 border border-orange-500/20 text-[11px] font-semibold">
                          {getTurmaDisplayName(lead)}
                        </span>
                      ) : (
                        <span className="text-slate-500 text-xs">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-300">{c.telefone || '—'}</td>
                    <td className="py-3 px-4 text-slate-300">{c.email || '—'}</td>
                    <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(c.id)}
                          className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-white/[0.05]"
                          title="Editar"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            deleteContact(c.id)
                            toast({ title: 'Contato excluído' })
                          }}
                          className="p-1.5 text-slate-400 hover:text-red-400 rounded hover:bg-white/[0.05]"
                          title="Excluir"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {filteredContacts.length === 0 && (
          <div className="py-12 text-center text-slate-400 text-sm">
            Nenhum contato cadastrado ainda com os filtros atuais.
          </div>
        )}
      </div>

      {/* Cards mobile */}
      <div className="md:hidden space-y-3">
        {filteredContacts.map((c) => {
          const lead = leadById.get(c.leadId)
          return (
            <div
              key={c.id}
              className="bg-[#111820] border border-white/[0.06] rounded-xl p-4 space-y-2"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-full bg-orange-500/20 border border-orange-500/30 text-orange-300 flex items-center justify-center text-xs font-bold">
                    {c.nome.substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h4 className="font-bold text-white text-sm">{c.nome}</h4>
                    {lead && (
                      <span className="text-[11px] text-orange-300">
                        {getTurmaDisplayName(lead)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(c.id)}
                    className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-white/[0.05]"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      deleteContact(c.id)
                      toast({ title: 'Contato excluído' })
                    }}
                    className="p-1.5 text-slate-400 hover:text-red-400 rounded hover:bg-white/[0.05]"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="text-xs text-slate-300 space-y-1 pt-2 border-t border-white/[0.04]">
                {c.telefone && (
                  <div className="flex items-center gap-1.5">
                    <Phone className="w-3 h-3 text-slate-400" /> {c.telefone}
                  </div>
                )}
                {c.email && (
                  <div className="flex items-center gap-1.5">
                    <Mail className="w-3 h-3 text-slate-400" /> {c.email}
                  </div>
                )}
              </div>
            </div>
          )
        })}
        {filteredContacts.length === 0 && (
          <div className="py-12 text-center text-slate-400 text-sm">Nenhum contato encontrado.</div>
        )}
      </div>

      {/* Modal de criação/edição */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-[480px] max-h-[90vh] bg-[#111820] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-scale-in">
            <div className="px-6 py-4 border-b border-white/[0.08] flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">
                {editingId ? 'Editar Contato' : 'Novo Contato'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 flex-1">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Nome <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: João Pedro Almeida"
                  value={formData.nome}
                  onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                  className="w-full bg-[#0a0f14] border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Turma <span className="text-red-400">*</span>
                </label>
                <select
                  value={formData.leadId}
                  onChange={(e) => setFormData({ ...formData, leadId: e.target.value })}
                  className="w-full bg-[#0a0f14] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-orange-500"
                >
                  <option value="">Selecione uma turma...</option>
                  {leads.map((l) => (
                    <option key={l.id} value={l.id}>
                      {getTurmaDisplayName(l)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Telefone
                  </label>
                  <input
                    type="text"
                    placeholder="(11) 98765-4321"
                    value={formData.telefone}
                    onChange={(e) => setFormData({ ...formData, telefone: e.target.value })}
                    className="w-full bg-[#0a0f14] border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">E-mail</label>
                  <input
                    type="email"
                    placeholder="aluno@faculdade.br"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full bg-[#0a0f14] border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-300 bg-white/[0.05] hover:bg-white/[0.1] rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold text-white bg-gradient-to-r from-orange-600 to-orange-600 hover:from-orange-500 hover:to-orange-500 rounded-lg shadow-lg shadow-orange-500/20"
                >
                  Salvar Contato
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
