import React, { useState, useMemo } from 'react'
import { Plus, Search, Trash2, X, Users, Phone, Mail } from 'lucide-react'
import { useCRM } from '@/context/CRMContext'
import { getTurmaDisplayName, getFullTurmaName } from '@/types/crm'
import { matchesSearch } from '@/utils/searchMatch'
import { useToast } from '@/hooks/use-toast'
import LastEditedBy from '@/components/LastEditedBy'
import InlineEditText from '@/components/InlineEditText'
import { SortControl, sortByField, type SortDirection } from '@/components/SortControl'

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
  const [sortField, setSortField] = useState<string>('nome')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const CONTACT_SORT_OPTIONS = [
    { value: 'nome', label: 'Nome (A-Z)' },
    { value: 'telefone', label: 'Telefone' },
    { value: 'email', label: 'E-mail' },
    { value: 'updatedAt', label: 'Última edição' },
  ]
  const [modalOpen, setModalOpen] = useState(false)
  const [formData, setFormData] = useState<ContactFormData>(EMPTY_FORM)

  const leadById = useMemo(() => {
    const map = new Map(leads.map((l) => [l.id, l]))
    return map
  }, [leads])

  const filteredContacts = useMemo(() => {
    const base = contacts.filter((c) => {
      if (turmaFilter !== 'Todas' && c.leadId !== turmaFilter) return false
      if (searchQuery.trim()) {
        const lead = leadById.get(c.leadId)
        if (
          !matchesSearch(
            [
              c.nome,
              c.telefone,
              c.email,
              lead ? getFullTurmaName(lead) : '',
              lead?.faculdade,
              lead?.curso,
              lead?.cidade,
              lead?.anoFormatura,
            ],
            searchQuery,
          )
        )
          return false
      }
      return true
    })
    return sortByField(base, sortField, sortDirection, (c, f) => (c as any)[f])
  }, [contacts, turmaFilter, searchQuery, leadById, sortField, sortDirection])

  const handleOpenCreate = () => {
    setFormData({ ...EMPTY_FORM, leadId: leads[0]?.id || '' })
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
    addContact({
      nome: formData.nome.trim(),
      telefone: formData.telefone.trim(),
      email: formData.email.trim(),
      leadId: formData.leadId,
    })
    toast({ title: 'Contato criado' })
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
        <div className="flex flex-wrap items-center gap-2">
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
          <SortControl
            options={CONTACT_SORT_OPTIONS}
            field={sortField}
            direction={sortDirection}
            onFieldChange={setSortField}
            onDirectionToggle={() => setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))}
          />
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
                <th className="py-3 px-4 font-semibold">Última edição</th>
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
                    <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-orange-500/20 border border-orange-500/30 text-orange-300 flex items-center justify-center text-[11px] font-bold shrink-0">
                          {c.nome.substring(0, 2).toUpperCase()}
                        </div>
                        <InlineEditText
                          value={c.nome}
                          onSave={(v) => v && updateContact(c.id, { nome: v })}
                          className="font-semibold text-white"
                        />
                      </div>
                    </td>
                    <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                      <select
                        value={c.leadId}
                        onChange={(e) => updateContact(c.id, { leadId: e.target.value })}
                        className="bg-transparent border-b border-transparent hover:border-white/20 focus:border-orange-500 focus:outline-none text-orange-300 text-[11px] font-semibold py-0.5"
                      >
                        {leads.map((l) => (
                          <option key={l.id} value={l.id} className="bg-[#111820] text-white">
                            {getTurmaDisplayName(l)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3 px-4 text-slate-300" onClick={(e) => e.stopPropagation()}>
                      <InlineEditText
                        value={c.telefone}
                        onSave={(v) => updateContact(c.id, { telefone: v })}
                      />
                    </td>
                    <td className="py-3 px-4 text-slate-300" onClick={(e) => e.stopPropagation()}>
                      <InlineEditText
                        value={c.email}
                        type="email"
                        onSave={(v) => updateContact(c.id, { email: v })}
                      />
                    </td>
                    <td className="py-3 px-4">
                      <LastEditedBy email={c.updatedByEmail} updatedAt={c.updatedAt} />
                    </td>
                    <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
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
              <div className="flex items-start justify-between" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-2.5 flex-1 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-orange-500/20 border border-orange-500/30 text-orange-300 flex items-center justify-center text-xs font-bold shrink-0">
                    {c.nome.substring(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <InlineEditText
                      value={c.nome}
                      onSave={(v) => v && updateContact(c.id, { nome: v })}
                      className="font-bold text-white text-sm"
                    />
                    {lead && (
                      <select
                        value={c.leadId}
                        onChange={(e) => updateContact(c.id, { leadId: e.target.value })}
                        className="bg-transparent text-[11px] text-orange-300 focus:outline-none max-w-full"
                      >
                        {leads.map((l) => (
                          <option key={l.id} value={l.id} className="bg-[#111820] text-white">
                            {getTurmaDisplayName(l)}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    deleteContact(c.id)
                    toast({ title: 'Contato excluído' })
                  }}
                  className="p-1.5 text-slate-400 hover:text-red-400 rounded hover:bg-white/[0.05] shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div
                className="text-xs text-slate-300 space-y-1 pt-2 border-t border-white/[0.04]"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center gap-1.5">
                  <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                  <InlineEditText
                    value={c.telefone}
                    onSave={(v) => updateContact(c.id, { telefone: v })}
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                  <InlineEditText
                    value={c.email}
                    type="email"
                    onSave={(v) => updateContact(c.id, { email: v })}
                  />
                </div>
                <LastEditedBy email={c.updatedByEmail} updatedAt={c.updatedAt} />
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
                Novo Contato
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
