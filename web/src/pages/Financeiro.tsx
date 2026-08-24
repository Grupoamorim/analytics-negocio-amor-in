import { useEffect, useMemo, useState } from 'react'
import { Wallet, CheckCircle2, FileWarning, AlertTriangle, FileText } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { supabase } from '@/lib/supabase/client'
import EmpresaFilterBar from '@/components/EmpresaFilterBar'
import PeriodoFiltroBar from '@/components/PeriodoFiltroBar'
import { SortControl, sortByField, type SortDirection } from '@/components/SortControl'
import { usePeriodoFiltro } from '@/hooks/usePeriodoFiltro'
import { fetchAllRows } from '@/utils/fetchAllRows'

interface TotaisNegocio {
  total_faturado: number
  total_recebido: number
  total_a_receber: number
  total_inadimplente: number
  total_custos: number
}

interface Pagamento {
  id: string
  valor: number
  valor_pago: number
  status: string
  data_vencimento: string
  data_pagamento: string | null
  turma_id: string | null
  empresa: string | null
}

interface ContaPagar {
  id: string
  descricao: string
  fornecedor: string
  categoria: string
  valor: number
  status: string
  data_vencimento: string
  turma_id: string | null
  empresa: string | null
}

function brl(v: number | undefined | null): string {
  return `R$ ${(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function KpiCard({
  label,
  value,
  icon: Icon,
  tone = 'orange',
}: {
  label: string
  value: string
  icon: typeof Wallet
  tone?: 'orange' | 'green' | 'red' | 'yellow'
}) {
  const toneClasses: Record<string, string> = {
    orange: 'bg-orange-500/15 text-orange-400',
    green: 'bg-emerald-500/15 text-emerald-400',
    red: 'bg-rose-500/15 text-rose-400',
    yellow: 'bg-amber-500/15 text-amber-400',
  }
  return (
    <div className="bg-[#111820] border border-white/[0.06] rounded-xl p-5 hover:border-white/[0.14] hover:-translate-y-1 transition-all duration-200 shadow-lg">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-slate-400">{label}</span>
        <div className={`w-9 h-9 rounded-full flex items-center justify-center ${toneClasses[tone]}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <div className="text-2xl lg:text-3xl font-bold text-white tracking-tight">{value}</div>
    </div>
  )
}

export default function Financeiro() {
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([])
  const [contasPagar, setContasPagar] = useState<ContaPagar[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'receber' | 'pagar' | 'fluxo'>('receber')

  // Período (Mês/Trimestre/Semestre/Ano/Até Hoje/Personalizado) — sem isso as
  // Contas a Pagar somavam tudo até 2031 (financiamentos e recorrências
  // agendadas anos à frente), um número gigante e sem uso prático no dia a dia.
  const periodoFiltro = usePeriodoFiltro('ano')
  const { dtIni, dtFim } = periodoFiltro

  // Filtro por empresa (AIF, AFF, SFF, AIM...) — nenhum selecionado = todas.
  const [selectedEmpresas, setSelectedEmpresas] = useState<string[]>([])

  // Ordenação das tabelas
  const RECEBER_SORT_OPTIONS = [
    { value: 'data_vencimento', label: 'Vencimento' },
    { value: 'status', label: 'Status' },
    { value: 'valor', label: 'Valor' },
    { value: 'valor_pago', label: 'Pago' },
  ]
  const PAGAR_SORT_OPTIONS = [
    { value: 'data_vencimento', label: 'Vencimento' },
    { value: 'fornecedor', label: 'Fornecedor' },
    { value: 'categoria', label: 'Categoria' },
    { value: 'status', label: 'Status' },
    { value: 'valor', label: 'Valor' },
  ]
  const [sortFieldReceber, setSortFieldReceber] = useState('data_vencimento')
  const [sortDirReceber, setSortDirReceber] = useState<SortDirection>('desc')
  const [sortFieldPagar, setSortFieldPagar] = useState('data_vencimento')
  const [sortDirPagar, setSortDirPagar] = useState<SortDirection>('desc')

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [pgto, cp] = await Promise.all([
        fetchAllRows<any>(() =>
          supabase
            .from('pagamentos')
            .select('id, valor, valor_pago, status, data_vencimento, data_pagamento, turma_id, turmas(empresa)')
            .neq('status', 'cancelado')
            .order('data_vencimento', { ascending: false })
            .order('id'),
        ),
        fetchAllRows<any>(() =>
          supabase
            .from('contas_pagar')
            .select(
              'id, descricao, fornecedor, categoria, valor, status, data_vencimento, turma_id, turmas(empresa)',
            )
            .neq('status', 'cancelado')
            .order('data_vencimento', { ascending: false })
            .order('id'),
        ),
      ])
      setPagamentos(pgto.map((p) => ({ ...p, empresa: p.turmas?.empresa || null })))
      setContasPagar(cp.map((c) => ({ ...c, empresa: c.turmas?.empresa || null })))
      setLoading(false)
    }
    load()
  }, [])

  const empresaOptions = useMemo(() => {
    const set = new Set<string>()
    pagamentos.forEach((p) => p.empresa && set.add(p.empresa))
    contasPagar.forEach((c) => c.empresa && set.add(c.empresa))
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [pagamentos, contasPagar])

  const dentroPeriodo = (d: string | null) => !!d && (!dtIni || d >= dtIni) && (!dtFim || d <= dtFim)

  // Só o filtro de empresa (sem período) — usado no gráfico de Fluxo de Caixa,
  // que já tem sua própria janela fixa dos últimos 12 meses e não deve ficar
  // preso ao período escolhido acima pros KPIs/tabelas.
  const pagamentosEmpresaFiltrados = useMemo(() => {
    if (selectedEmpresas.length === 0) return pagamentos
    return pagamentos.filter((p) => p.empresa && selectedEmpresas.includes(p.empresa))
  }, [pagamentos, selectedEmpresas])

  const pagamentosFiltrados = useMemo(() => {
    return pagamentos.filter(
      (p) =>
        dentroPeriodo(p.data_vencimento) &&
        (selectedEmpresas.length === 0 || (!!p.empresa && selectedEmpresas.includes(p.empresa))),
    )
  }, [pagamentos, selectedEmpresas, dtIni, dtFim])

  const contasPagarFiltradas = useMemo(() => {
    return contasPagar.filter(
      (c) =>
        dentroPeriodo(c.data_vencimento) &&
        (selectedEmpresas.length === 0 || (!!c.empresa && selectedEmpresas.includes(c.empresa))),
    )
  }, [contasPagar, selectedEmpresas, dtIni, dtFim])

  // Totais recalculados no cliente, já dentro do período selecionado acima —
  // "Recebido" conta o que entrou de caixa (data de pagamento) dentro do
  // período, independente de quando a parcela venceu originalmente; os
  // demais contam pelo vencimento (o que estava agendado/vencido nesse
  // período, pago ou não).
  const totais: TotaisNegocio = useMemo(() => {
    let total_faturado = 0
    let total_a_receber = 0
    let total_inadimplente = 0
    for (const p of pagamentosFiltrados) {
      total_faturado += Number(p.valor || 0)
      if (p.status === 'pendente' || p.status === 'atrasado') {
        total_a_receber += Number(p.valor || 0) - Number(p.valor_pago || 0)
      }
      if (p.status === 'atrasado') {
        total_inadimplente += Number(p.valor || 0) - Number(p.valor_pago || 0)
      }
    }
    let total_recebido = 0
    for (const p of pagamentos) {
      if (p.status !== 'pago' || !dentroPeriodo(p.data_pagamento)) continue
      if (selectedEmpresas.length > 0 && !(p.empresa && selectedEmpresas.includes(p.empresa))) continue
      total_recebido += Number(p.valor_pago || 0)
    }
    const total_custos = contasPagarFiltradas.reduce((acc, c) => acc + Number(c.valor || 0), 0)
    return { total_faturado, total_recebido, total_a_receber, total_inadimplente, total_custos }
  }, [pagamentos, pagamentosFiltrados, contasPagarFiltradas, selectedEmpresas, dtIni, dtFim])

  // "Recebido" conta pelo mês em que o dinheiro realmente entrou (data de
  // pagamento) — não pelo mês de vencimento original da parcela, senão uma
  // parcela atrasada paga meses depois aparece no mês errado do gráfico.
  // "Previsto" continua por vencimento, já que é o que está agendado pra
  // cada mês, pago ou não.
  const fluxoCaixa = useMemo(() => {
    const porMes: Record<string, { mes: string; recebido: number; previsto: number }> = {}
    for (const p of pagamentosEmpresaFiltrados) {
      if (p.data_vencimento) {
        const mesVenc = p.data_vencimento.slice(0, 7)
        if (!porMes[mesVenc]) porMes[mesVenc] = { mes: mesVenc, recebido: 0, previsto: 0 }
        porMes[mesVenc].previsto += Number(p.valor || 0)
      }
      if (p.status === 'pago' && p.data_pagamento) {
        const mesPgto = p.data_pagamento.slice(0, 7)
        if (!porMes[mesPgto]) porMes[mesPgto] = { mes: mesPgto, recebido: 0, previsto: 0 }
        porMes[mesPgto].recebido += Number(p.valor_pago || 0)
      }
    }
    return Object.values(porMes)
      .sort((a, b) => a.mes.localeCompare(b.mes))
      .slice(-12)
  }, [pagamentosEmpresaFiltrados])

  const pagamentosOrdenados = useMemo(
    () => sortByField(pagamentosFiltrados, sortFieldReceber, sortDirReceber, (p, f) => (p as any)[f]),
    [pagamentosFiltrados, sortFieldReceber, sortDirReceber],
  )
  const contasPagarOrdenadas = useMemo(
    () => sortByField(contasPagarFiltradas, sortFieldPagar, sortDirPagar, (c, f) => (c as any)[f]),
    [contasPagarFiltradas, sortFieldPagar, sortDirPagar],
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Financeiro</h1>
          <p className="text-sm text-slate-400 mt-1">
            Contas a pagar, a receber e inadimplência — dados ao vivo do Supabase
          </p>
        </div>
        <EmpresaFilterBar
          options={empresaOptions}
          selected={selectedEmpresas}
          onChange={setSelectedEmpresas}
        />
      </div>
      {selectedEmpresas.length > 0 && (
        <p className="text-[11px] text-slate-500 -mt-3">
          Contas a pagar sem turma vinculada não têm empresa definida e ficam de fora deste
          filtro.
        </p>
      )}

      <PeriodoFiltroBar {...periodoFiltro} />
      <p className="text-[11px] text-slate-500 -mt-3">
        Total Faturado, A Receber, Inadimplência e Contas a Pagar contam pelo vencimento dentro
        do período acima. Recebido conta pela data em que o dinheiro realmente entrou.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard label="Total Faturado" value={brl(totais?.total_faturado)} icon={FileText} tone="orange" />
        <KpiCard label="Recebido" value={brl(totais?.total_recebido)} icon={CheckCircle2} tone="green" />
        <KpiCard label="A Receber" value={brl(totais?.total_a_receber)} icon={Wallet} tone="orange" />
        <KpiCard label="Inadimplência" value={brl(totais?.total_inadimplente)} icon={AlertTriangle} tone="red" />
        <KpiCard label="Contas a Pagar" value={brl(totais?.total_custos)} icon={FileWarning} tone="yellow" />
      </div>

      <div className="bg-[#111820] border border-white/[0.06] rounded-xl overflow-hidden">
        <div className="flex border-b border-white/[0.06]">
          <button
            onClick={() => setTab('receber')}
            className={`px-4 py-3 text-sm font-medium transition-colors ${
              tab === 'receber' ? 'text-orange-400 border-b-2 border-orange-500' : 'text-slate-400 hover:text-white'
            }`}
          >
            Contas a Receber
          </button>
          <button
            onClick={() => setTab('pagar')}
            className={`px-4 py-3 text-sm font-medium transition-colors ${
              tab === 'pagar' ? 'text-orange-400 border-b-2 border-orange-500' : 'text-slate-400 hover:text-white'
            }`}
          >
            Contas a Pagar
          </button>
          <button
            onClick={() => setTab('fluxo')}
            className={`px-4 py-3 text-sm font-medium transition-colors ${
              tab === 'fluxo' ? 'text-orange-400 border-b-2 border-orange-500' : 'text-slate-400 hover:text-white'
            }`}
          >
            Fluxo de Caixa
          </button>
          {tab !== 'fluxo' && (
            <div className="ml-auto flex items-center pr-3">
              <SortControl
                options={tab === 'receber' ? RECEBER_SORT_OPTIONS : PAGAR_SORT_OPTIONS}
                field={tab === 'receber' ? sortFieldReceber : sortFieldPagar}
                direction={tab === 'receber' ? sortDirReceber : sortDirPagar}
                onFieldChange={tab === 'receber' ? setSortFieldReceber : setSortFieldPagar}
                onDirectionToggle={() =>
                  tab === 'receber'
                    ? setSortDirReceber((d) => (d === 'asc' ? 'desc' : 'asc'))
                    : setSortDirPagar((d) => (d === 'asc' ? 'desc' : 'asc'))
                }
              />
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-8 text-center text-slate-400 text-sm">Carregando...</div>
          ) : tab === 'fluxo' ? (
            <div className="p-5 h-96">
              {fluxoCaixa.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-sm">Sem dados de fluxo de caixa ainda.</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={fluxoCaixa}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="mes" stroke="#64748b" fontSize={12} />
                    <YAxis stroke="#64748b" fontSize={12} tickFormatter={(v) => brl(v)} width={90} />
                    <Tooltip
                      formatter={(v: number) => brl(Number(v))}
                      contentStyle={{ background: '#0a0f14', border: '1px solid rgba(255,255,255,0.1)' }}
                    />
                    <Legend />
                    <Line dataKey="recebido" name="Recebido" stroke="#10B981" strokeWidth={2} dot={{ r: 3 }} />
                    <Line dataKey="previsto" name="Previsto" stroke="#F97316" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          ) : tab === 'receber' ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 text-xs uppercase border-b border-white/[0.06]">
                  <th className="px-4 py-2.5">Vencimento</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5 text-right">Valor</th>
                  <th className="px-4 py-2.5 text-right">Pago</th>
                </tr>
              </thead>
              <tbody>
                {pagamentosOrdenados.slice(0, 50).map((p) => (
                  <tr key={p.id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                    <td className="px-4 py-2.5 text-slate-300">
                      {p.data_vencimento ? new Date(p.data_vencimento).toLocaleDateString('pt-BR') : '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-300">{brl(p.valor)}</td>
                    <td className="px-4 py-2.5 text-right text-emerald-400">{brl(p.valor_pago)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 text-xs uppercase border-b border-white/[0.06]">
                  <th className="px-4 py-2.5">Vencimento</th>
                  <th className="px-4 py-2.5">Fornecedor</th>
                  <th className="px-4 py-2.5">Categoria</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5 text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {contasPagarOrdenadas.slice(0, 50).map((c) => (
                  <tr key={c.id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                    <td className="px-4 py-2.5 text-slate-300">
                      {c.data_vencimento ? new Date(c.data_vencimento).toLocaleDateString('pt-BR') : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-slate-300">{c.fornecedor || c.descricao || '—'}</td>
                    <td className="px-4 py-2.5 text-slate-400">{c.categoria || '—'}</td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-300">{brl(c.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pago: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    pendente: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
    atrasado: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
  }
  return (
    <span
      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${map[status] || 'bg-slate-500/15 text-slate-400 border-slate-500/30'}`}
    >
      {status}
    </span>
  )
}
