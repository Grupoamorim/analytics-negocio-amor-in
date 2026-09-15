import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Wallet, Plus } from 'lucide-react'
import SectionTitle from './SectionTitle'
import { useToast } from '@/hooks/use-toast'
import { useCaixaSnapshots } from '@/hooks/useCaixaSnapshots'
import { intervaloDaMeta, rotuloPeriodoMeta, type MetaNegocio } from '@/hooks/useMetasNegocio'

const HOJE = new Date().toISOString().slice(0, 10)
const fmt = (v: number) => `R$ ${Math.round(v).toLocaleString('pt-BR')}`
const fmtData = (d: string) => d.split('-').reverse().join('/')

/** Caixa é um saldo (foto de um momento), não um fluxo somável dia a dia como receita/despesa —
 * por isso não usa PaceBand/calcularPace: mostra só o último saldo lançado vs. a meta do período,
 * sem gráfico de acumulado, mais o formulário pra lançar um novo saldo. */
export default function CaixaFimPeriodoCard({
  meta,
  metas = [],
  aplicarReajusteAutomatico,
}: {
  meta: MetaNegocio | null
  /** Todas as metas de caixa (não só a vigente) — usado só pro reajuste automático abaixo. */
  metas?: MetaNegocio[]
  aplicarReajusteAutomatico?: (id: string) => Promise<void>
}) {
  const { toast } = useToast()
  const { snapshots, adicionar, ultimoAte } = useCaixaSnapshots()

  // Reajuste automático de caixa: baseado no último saldo lançado até o fim do período (não numa
  // série diária, já que caixa é uma foto, não um fluxo) — mesmo "ratchet" das outras métricas
  // (ver `aplicarReajusteAutomatico`), só dispara pra período já encerrado e batido.
  const processandoReajusteRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!aplicarReajusteAutomatico) return
    const candidata = metas
      .filter((m) => m.metrica === 'caixa' && !m.reajusteAplicado)
      .map((m) => ({ m, iv: intervaloDaMeta(m) }))
      .filter(({ iv }) => iv.fim < HOJE)
      .sort((a, b) => (a.iv.fim < b.iv.fim ? 1 : -1))[0]
    if (!candidata) return
    const { m, iv } = candidata
    const saldoFinal = ultimoAte(iv.fim)
    if (!saldoFinal || saldoFinal.valor < m.valorMeta) return
    if (processandoReajusteRef.current.has(m.id)) return
    processandoReajusteRef.current.add(m.id)
    aplicarReajusteAutomatico(m.id)
      .then(() =>
        toast({
          title: 'Meta de caixa reajustada',
          description: `${rotuloPeriodoMeta(m)} bateu e passou a meta normal — cenários do próximo período foram reajustados automaticamente.`,
        }),
      )
      .catch(() => processandoReajusteRef.current.delete(m.id))
  }, [metas, aplicarReajusteAutomatico, ultimoAte, toast])

  const [data, setData] = useState(HOJE)
  const [valor, setValor] = useState('')
  const [observacao, setObservacao] = useState('')
  const [salvando, setSalvando] = useState(false)

  const ultimo = ultimoAte(HOJE)
  const diferenca = meta && ultimo ? ultimo.valor - meta.valorMeta : null

  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault()
    const v = Number(String(valor).replace(/\./g, '').replace(',', '.'))
    if (!Number.isFinite(v)) {
      toast({ title: 'Valor inválido', variant: 'destructive' })
      return
    }
    setSalvando(true)
    try {
      await adicionar({ data, valor: v, observacao: observacao.trim() })
      toast({ title: 'Saldo lançado' })
      setValor('')
      setObservacao('')
    } catch (err: any) {
      toast({ title: 'Erro ao lançar', description: err.message, variant: 'destructive' })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="bg-[#111820] border border-white/[0.06] rounded-xl p-6 shadow-lg space-y-4">
      <SectionTitle ajuda="Caixa é um saldo (foto de um momento), não um fluxo somável como receita — a comparação é sempre o último saldo lançado contra a meta cadastrada, sem gráfico de acumulado.">
        Caixa fim de período{meta ? ` — ${rotuloPeriodoMeta(meta)}` : ''}
      </SectionTitle>

      {!meta && (
        <p className="text-xs text-slate-500">
          Nenhuma meta de caixa cadastrada.{' '}
          <Link to="/admin" className="text-orange-400 hover:underline">
            Cadastrar em Administração → Metas
          </Link>
        </p>
      )}
      {!ultimo ? (
        <p className="text-sm text-slate-400">Nenhum saldo lançado ainda — use o formulário abaixo.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-3">
            <div className="text-[10px] font-medium text-slate-400 flex items-center gap-1">
              <Wallet className="w-3 h-3 text-orange-400" /> Último saldo lançado
            </div>
            <div className="text-lg font-bold mt-1 text-white">{fmt(ultimo.valor)}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">em {fmtData(ultimo.data)}</div>
          </div>
          {meta && (
            <>
              <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-3">
                <div className="text-[10px] font-medium text-slate-400">Meta do período</div>
                <div className="text-lg font-bold mt-1 text-white">{fmt(meta.valorMeta)}</div>
              </div>
              <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-3">
                <div className="text-[10px] font-medium text-slate-400">Diferença</div>
                <div className={`text-lg font-bold mt-1 ${diferenca !== null && diferenca >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {diferenca !== null ? `${diferenca >= 0 ? '+' : ''}${fmt(diferenca)}` : '—'}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  {diferenca !== null && diferenca >= 0 ? 'acima da meta' : 'abaixo da meta'}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      <form onSubmit={handleSalvar} className="flex flex-wrap items-end gap-2 pt-3 border-t border-white/[0.06]">
        <label className="text-xs text-slate-400 flex flex-col gap-1">
          Data
          <input
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            className="bg-[#0a0f14] border border-white/[0.1] rounded-lg px-2 py-2 text-slate-200 text-xs"
          />
        </label>
        <label className="text-xs text-slate-400 flex flex-col gap-1 flex-1 min-w-[140px]">
          Saldo em caixa (R$)
          <input
            type="text"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="Ex: 650000"
            className="bg-[#0a0f14] border border-white/[0.1] rounded-lg px-2 py-2 text-slate-200 text-xs"
          />
        </label>
        <label className="text-xs text-slate-400 flex flex-col gap-1 flex-1 min-w-[160px]">
          Observação (opcional)
          <input
            type="text"
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            className="bg-[#0a0f14] border border-white/[0.1] rounded-lg px-2 py-2 text-slate-200 text-xs"
          />
        </label>
        <button
          type="submit"
          disabled={salvando || !valor}
          className="inline-flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-xs font-semibold rounded-lg px-3 py-2"
        >
          <Plus className="w-3.5 h-3.5" /> {salvando ? 'Salvando...' : 'Lançar saldo'}
        </button>
      </form>
      {snapshots.length > 0 && (
        <p className="text-[10px] text-slate-500">
          {snapshots.length} saldo(s) lançado(s) no total — lançar de novo na mesma data substitui o
          valor anterior.
        </p>
      )}
    </div>
  )
}
