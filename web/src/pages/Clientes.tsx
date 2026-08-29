import { useState, useMemo } from 'react'
import { Search, Users, Phone, Mail } from 'lucide-react'
import { useCRM } from '@/context/CRMContext'
import { useClientes } from '@/hooks/useClientes'
import { getTurmaDisplayName } from '@/types/crm'
import InlineEditText from '@/components/InlineEditText'
import { SortControl, sortByField, type SortDirection } from '@/components/SortControl'

const SORT_OPTIONS = [
  { value: 'nome', label: 'Nome (A-Z)' },
  { value: 'turmaNome', label: 'Turma' },
  { value: 'email', label: 'E-mail' },
  { value: 'createdAt', label: 'Cadastrado em' },
]

export default function Clientes() {
  const { leads } = useCRM()
  const { clientes, loading, updateCliente } = useClientes()

  const [searchQuery, setSearchQuery] = useState('')
  const [turmaFilter, setTurmaFilter] = useState<string>('Todas')
  const [sortField, setSortField] = useState<string>('nome')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  const leadById = useMemo(() => new Map(leads.map((l) => [l.id, l])), [leads])

  const semEmail = useMemo(() => clientes.filter((c) => !c.email).length, [clientes])

  const enriched = useMemo(
    () =>
      clientes.map((c) => {
        const lead = c.turmaId ? leadById.get(c.turmaId) : undefined
        return { ...c, turmaNome: lead ? getTurmaDisplayName(lead) : '' }
      }),
    [clientes, leadById],
  )

  const filtered = useMemo(() => {
    const base = enriched.filter((c) => {
      if (turmaFilter !== 'Todas' && c.turmaId !== turmaFilter) return false
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const haystack = [c.nome, c.email, c.telefone, c.turmaNome].join(' ').toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
    return sortByField(base, sortField, sortDirection, (c, f) => (c as any)[f])
  }, [enriched, turmaFilter, searchQuery, sortField, sortDirection])

  return (
    <div className="space-y-6 animate-fade-in pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-white/[0.06]">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-white tracking-tight flex items-center gap-3">
            <Users className="w-6 h-6 text-orange-400" />
            Clientes
            <span className="text-xs px-2.5 py-1 rounded-full bg-orange-500/15 text-orange-300 font-semibold border border-orange-500/25">
              {clientes.length}
            </span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Alunos com registro financeiro real no SGE (venda, adesão ou conta a receber), por
            turma. Vem direto da sincronização automática — nome e turma não são editáveis aqui;
            telefone e e-mail podem ser completados na mão quando o SGE não trouxe esse dado.
            {semEmail > 0 && (
              <span className="text-amber-400"> {semEmail} sem e-mail cadastrado.</span>
            )}
          </p>
        </div>
      </div>

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
            options={SORT_OPTIONS}
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

      <div className="hidden md:block bg-[#0f1419] border border-white/[0.06] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-white/[0.02] border-b border-white/[0.06]">
              <tr className="text-[11px] uppercase tracking-wider text-slate-400">
                <th className="py-3 px-4 font-semibold">Cliente</th>
                <th className="py-3 px-4 font-semibold">Turma</th>
                <th className="py-3 px-4 font-semibold">Telefone</th>
                <th className="py-3 px-4 font-semibold">E-mail</th>
                <th className="py-3 px-4 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors"
                >
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-orange-500/20 border border-orange-500/30 text-orange-300 flex items-center justify-center text-[11px] font-bold shrink-0">
                        {c.nome.substring(0, 2).toUpperCase()}
                      </div>
                      <span className="font-semibold text-white">{c.nome}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-orange-300 text-[11px] font-semibold">
                    {c.turmaNome || <span className="text-slate-500">Sem turma vinculada</span>}
                  </td>
                  <td className="py-3 px-4 text-slate-300" onClick={(e) => e.stopPropagation()}>
                    <InlineEditText
                      value={c.telefone}
                      onSave={(v) => updateCliente(c.id, { telefone: v })}
                    />
                  </td>
                  <td className="py-3 px-4 text-slate-300" onClick={(e) => e.stopPropagation()}>
                    <InlineEditText
                      value={c.email}
                      type="email"
                      onSave={(v) => updateCliente(c.id, { email: v })}
                    />
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-400 capitalize">{c.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && filtered.length === 0 && (
          <div className="py-12 text-center text-slate-400 text-sm">
            Nenhum cliente encontrado com os filtros atuais.
          </div>
        )}
        {loading && <div className="py-12 text-center text-slate-400 text-sm">Carregando...</div>}
      </div>

      <div className="md:hidden space-y-3">
        {filtered.map((c) => (
          <div key={c.id} className="bg-[#111820] border border-white/[0.06] rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-orange-500/20 border border-orange-500/30 text-orange-300 flex items-center justify-center text-xs font-bold shrink-0">
                {c.nome.substring(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-white text-sm truncate">{c.nome}</p>
                <p className="text-[11px] text-orange-300 truncate">
                  {c.turmaNome || 'Sem turma vinculada'}
                </p>
              </div>
            </div>
            <div className="text-xs text-slate-300 space-y-1 pt-2 border-t border-white/[0.04]">
              <div className="flex items-center gap-1.5">
                <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                <InlineEditText value={c.telefone} onSave={(v) => updateCliente(c.id, { telefone: v })} />
              </div>
              <div className="flex items-center gap-1.5">
                <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                <InlineEditText value={c.email} type="email" onSave={(v) => updateCliente(c.id, { email: v })} />
              </div>
            </div>
          </div>
        ))}
        {!loading && filtered.length === 0 && (
          <div className="py-12 text-center text-slate-400 text-sm">Nenhum cliente encontrado.</div>
        )}
      </div>
    </div>
  )
}
