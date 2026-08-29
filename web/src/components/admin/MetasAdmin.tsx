import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { Target, Trash2, Pencil } from 'lucide-react'
import {
  useMetasNegocio,
  METRICA_LABEL,
  rotuloPeriodoMeta,
  type MetricaMeta,
  type EscopoMeta,
  type MetaNegocio,
} from '@/hooks/useMetasNegocio'

const NOMES_MES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

export default function MetasAdmin() {
  const { toast } = useToast()
  const { metas, loading, salvar, remover } = useMetasNegocio()

  const anoAtual = new Date().getFullYear()
  const [editId, setEditId] = useState<string | null>(null)
  const [metrica, setMetrica] = useState<MetricaMeta>('receita')
  const [escopo, setEscopo] = useState<EscopoMeta>('mensal')
  const [ano, setAno] = useState(anoAtual)
  const [periodo, setPeriodo] = useState(new Date().getMonth() + 1)
  const [valor, setValor] = useState('')
  const [contexto, setContexto] = useState('')
  const [salvando, setSalvando] = useState(false)

  const anos = useMemo(() => [anoAtual - 1, anoAtual, anoAtual + 1, anoAtual + 2], [anoAtual])

  function resetForm() {
    setEditId(null)
    setMetrica('receita')
    setEscopo('mensal')
    setAno(anoAtual)
    setPeriodo(new Date().getMonth() + 1)
    setValor('')
    setContexto('')
  }

  function carregarParaEdicao(m: MetaNegocio) {
    setEditId(m.id)
    setMetrica(m.metrica)
    setEscopo(m.escopo)
    setAno(m.ano)
    setPeriodo(m.periodo || 1)
    setValor(String(m.valorMeta))
    setContexto(m.contexto)
  }

  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault()
    const v = Number(String(valor).replace(/\./g, '').replace(',', '.'))
    if (!Number.isFinite(v) || v < 0) {
      toast({ title: 'Valor inválido', variant: 'destructive' })
      return
    }
    setSalvando(true)
    try {
      await salvar({
        id: editId || undefined,
        metrica,
        escopo,
        ano,
        periodo: escopo === 'anual' ? 0 : periodo,
        valorMeta: v,
        contexto,
      })
      toast({ title: editId ? 'Meta atualizada' : 'Meta cadastrada' })
      resetForm()
    } catch (err: any) {
      toast({ title: 'Erro ao salvar', description: err.message, variant: 'destructive' })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-[#111820] border border-white/[0.06] rounded-xl p-5">
        <h2 className="text-sm font-semibold text-white mb-1 flex items-center gap-2">
          <Target className="w-4 h-4 text-orange-400" /> Metas do Negócio
        </h2>
        <p className="text-xs text-slate-400 mb-4">
          Defina metas de receita, adesões, contratos ou alunos por mês, trimestre (T1–T4) ou ano. O
          texto de contexto/estratégia é usado pela IA no painel para dizer o que fazer pra bater a
          meta. A meta mais específica que cobre a data manda (mês &gt; trimestre &gt; ano).
        </p>

        <form onSubmit={handleSalvar} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <label className="text-xs text-slate-400 flex flex-col gap-1">
            Métrica
            <select
              value={metrica}
              onChange={(e) => setMetrica(e.target.value as MetricaMeta)}
              className="bg-[#0a0f14] border border-white/[0.1] rounded-lg px-2 py-2 text-slate-200 text-xs"
            >
              {(Object.keys(METRICA_LABEL) as MetricaMeta[]).map((m) => (
                <option key={m} value={m}>
                  {METRICA_LABEL[m]}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs text-slate-400 flex flex-col gap-1">
            Escopo
            <select
              value={escopo}
              onChange={(e) => setEscopo(e.target.value as EscopoMeta)}
              className="bg-[#0a0f14] border border-white/[0.1] rounded-lg px-2 py-2 text-slate-200 text-xs"
            >
              <option value="mensal">Mensal</option>
              <option value="trimestral">Trimestral</option>
              <option value="anual">Anual</option>
            </select>
          </label>

          <div className="flex gap-2">
            <label className="text-xs text-slate-400 flex flex-col gap-1 flex-1">
              Ano
              <select
                value={ano}
                onChange={(e) => setAno(Number(e.target.value))}
                className="bg-[#0a0f14] border border-white/[0.1] rounded-lg px-2 py-2 text-slate-200 text-xs"
              >
                {anos.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </label>
            {escopo === 'mensal' && (
              <label className="text-xs text-slate-400 flex flex-col gap-1 flex-1">
                Mês
                <select
                  value={periodo}
                  onChange={(e) => setPeriodo(Number(e.target.value))}
                  className="bg-[#0a0f14] border border-white/[0.1] rounded-lg px-2 py-2 text-slate-200 text-xs"
                >
                  {NOMES_MES.map((n, i) => (
                    <option key={n} value={i + 1}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {escopo === 'trimestral' && (
              <label className="text-xs text-slate-400 flex flex-col gap-1 flex-1">
                Trimestre
                <select
                  value={periodo}
                  onChange={(e) => setPeriodo(Number(e.target.value))}
                  className="bg-[#0a0f14] border border-white/[0.1] rounded-lg px-2 py-2 text-slate-200 text-xs"
                >
                  {[1, 2, 3, 4].map((t) => (
                    <option key={t} value={t}>
                      T{t}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <label className="text-xs text-slate-400 flex flex-col gap-1">
            Valor da meta {metrica === 'receita' ? '(R$)' : '(quantidade)'}
            <input
              type="text"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder={metrica === 'receita' ? 'Ex: 150000' : 'Ex: 40'}
              className="bg-[#0a0f14] border border-white/[0.1] rounded-lg px-3 py-2 text-slate-200 text-xs"
            />
          </label>

          <label className="text-xs text-slate-400 flex flex-col gap-1 sm:col-span-2 lg:col-span-3">
            Contexto / estratégia (a IA usa isso pra orientar as ações)
            <textarea
              value={contexto}
              onChange={(e) => setContexto(e.target.value)}
              rows={3}
              placeholder="Ex: Meta puxada pelas turmas de Medicina de FASA e UESB que fecham este trimestre. Prioridade: reunião de turma agendada até dia 15, follow-up de proposta 2x/semana. Concorrente X está agressivo em preço na UNEX."
              className="bg-[#0a0f14] border border-white/[0.1] rounded-lg px-3 py-2 text-slate-200 text-xs resize-y"
            />
          </label>

          <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-3">
            <Button
              type="submit"
              disabled={salvando || !valor}
              className="bg-orange-500 hover:bg-orange-600 text-white text-xs"
            >
              {salvando ? 'Salvando…' : editId ? 'Atualizar meta' : 'Cadastrar meta'}
            </Button>
            {editId && (
              <button type="button" onClick={resetForm} className="text-xs text-slate-400 hover:text-white">
                Cancelar edição
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="bg-[#111820] border border-white/[0.06] rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-3">Metas cadastradas</h3>
        {loading ? (
          <div className="text-sm text-slate-400">Carregando…</div>
        ) : metas.length === 0 ? (
          <div className="text-sm text-slate-500">Nenhuma meta cadastrada ainda.</div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-500 text-[10px] uppercase border-b border-white/[0.06]">
                <th className="py-2 pr-3">Métrica</th>
                <th className="py-2 px-2">Período</th>
                <th className="py-2 px-2 text-right">Meta</th>
                <th className="py-2 px-2">Contexto</th>
                <th className="py-2 pl-2 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {metas.map((m) => (
                <tr key={m.id} className="hover:bg-white/[0.02]">
                  <td className="py-2.5 pr-3 text-slate-200">{METRICA_LABEL[m.metrica]}</td>
                  <td className="py-2.5 px-2 text-slate-300">{rotuloPeriodoMeta(m)}</td>
                  <td className="py-2.5 px-2 text-right text-white font-semibold">
                    {m.metrica === 'receita'
                      ? `R$ ${m.valorMeta.toLocaleString('pt-BR')}`
                      : m.valorMeta.toLocaleString('pt-BR')}
                  </td>
                  <td className="py-2.5 px-2 text-slate-500 max-w-[280px] truncate" title={m.contexto}>
                    {m.contexto || '—'}
                  </td>
                  <td className="py-2.5 pl-2 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => carregarParaEdicao(m)}
                      className="text-slate-400 hover:text-orange-400 p-1"
                      title="Editar"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm('Remover esta meta?')) remover(m.id)
                      }}
                      className="text-slate-400 hover:text-rose-400 p-1"
                      title="Remover"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
