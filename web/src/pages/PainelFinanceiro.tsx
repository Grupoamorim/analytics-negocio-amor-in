import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import {
  DollarSign,
  Scale,
  AlertTriangle,
  Wallet,
  CreditCard,
  UserPlus,
  ArrowUpRight,
} from 'lucide-react'
import EmpresaFilterBar from '@/components/EmpresaFilterBar'
import PeriodoFiltroBar from '@/components/PeriodoFiltroBar'
import { usePeriodoFiltro } from '@/hooks/usePeriodoFiltro'
import { useCRM } from '@/context/CRMContext'
import { useFinanceiroDashboard } from '@/hooks/useFinanceiroDashboard'
import KpiCard from '@/components/dashboard/KpiCard'
import SectionTitle from '@/components/dashboard/SectionTitle'
import AIInsightsButton from '@/components/AIInsightsButton'

const brl = (v: number) => `R$ ${Math.round(v).toLocaleString('pt-BR')}`
const brlK = (v: number) => `R$ ${(v / 1000).toFixed(0)}k`
const variacao = (atual: number, anterior: number): number | null =>
  anterior > 0 ? ((atual - anterior) / anterior) * 100 : null

const RECEITA = '#34D399'
const CUSTO = '#F87171'

export default function PainelFinanceiro() {
  const { leads = [] } = useCRM()
  const [selectedEmpresas, setSelectedEmpresas] = useState<string[]>([])
  const f = usePeriodoFiltro('mes')

  const empresaOptions = useMemo(() => {
    const s = new Set<string>()
    leads.forEach((l) => l.empresa && s.add(l.empresa))
    return Array.from(s).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [leads])

  const { agregado: a, loading } = useFinanceiroDashboard(f.dtIni, f.dtFim, selectedEmpresas)

  const inadimplenciaPct =
    a.aReceberEmAberto > 0 ? (a.inadimplencia / a.aReceberEmAberto) * 100 : 0

  const fluxoChart = useMemo(
    () =>
      a.fluxoMensal.map((m) => {
        const [ano, mes] = m.mes.split('-')
        const nomes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
        return {
          mes: `${nomes[Number(mes) - 1]}/${ano.slice(2)}`,
          Recebido: Math.round(m.recebido),
          Previsto: Math.round(m.previsto),
        }
      }),
    [a.fluxoMensal],
  )

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-white/[0.06]">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-white tracking-tight">Painel Financeiro</h1>
          <p className="text-sm text-slate-400 mt-1">
            Caixa, inadimplência, contas a pagar e adesões — base caixa, igual DRE e Financeiro.
          </p>
        </div>
        <EmpresaFilterBar options={empresaOptions} selected={selectedEmpresas} onChange={setSelectedEmpresas} />
      </div>

      <PeriodoFiltroBar {...f} />

      <div className="flex items-center justify-between">
        <SectionTitle ajuda="Todos os valores contam pelo regime de caixa: 'recebido' é o dinheiro que efetivamente entrou (data de pagamento), não o que foi faturado. As variações comparam com o mesmo período do ano anterior.">
          Caixa do período
        </SectionTitle>
        <AIInsightsButton context="dashboard-revenue" />
      </div>

      {loading ? (
        <div className="text-center text-sm text-slate-500 py-10">Carregando dados financeiros…</div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <KpiCard
              label="Recebido no período"
              value={brl(a.recebido)}
              icon={DollarSign}
              tom="verde"
              delta={variacao(a.recebido, a.recebidoAnterior)}
              sub="vs. mesmo período do ano passado"
              ajuda="Soma do que entrou de caixa (valor pago, pela data de pagamento) dentro do período. É a receita realizada, não a faturada."
            />
            <KpiCard
              label="Resultado do período"
              value={brl(a.resultado)}
              icon={Scale}
              tom={a.resultado >= 0 ? 'verde' : 'vermelho'}
              sub={`recebido ${brlK(a.recebido)} − contas pagas ${brlK(a.contasPagas)}`}
              ajuda="Recebido menos contas efetivamente pagas no período. É uma leitura rápida de caixa (não é o lucro contábil — para isso veja a DRE)."
            />
            <KpiCard
              label="Inadimplência"
              value={brl(a.inadimplencia)}
              icon={AlertTriangle}
              tom={inadimplenciaPct > 10 ? 'vermelho' : inadimplenciaPct > 5 ? 'ambar' : 'verde'}
              sub={`${inadimplenciaPct.toFixed(1)}% do total a receber em aberto`}
              ajuda="Parcelas com status 'atrasado' (venceram e não foram pagas). Referência saudável para o setor: abaixo de 5–10% do total a receber."
            />
            <KpiCard
              label="A receber em aberto"
              value={brl(a.aReceberEmAberto)}
              icon={Wallet}
              sub="parcelas pendentes + atrasadas (todas as datas)"
              ajuda="Tudo que está contratado e ainda não foi pago. O SGE só gera as parcelas conforme elas se aproximam, então o total real de recebíveis futuros costuma ser maior."
            />
            <KpiCard
              label="Contas a pagar (30 dias)"
              value={brl(a.aPagarProx30)}
              icon={CreditCard}
              tom="ambar"
              sub="vencimentos dos próximos 30 dias"
              ajuda="Contas a pagar em aberto que vencem nos próximos 30 dias. Compare com o 'a receber em aberto' e o caixa para antecipar aperto."
            />
            <KpiCard
              label="Adesões no período"
              value={String(a.adesoesQtd)}
              icon={UserPlus}
              delta={variacao(a.adesoesQtd, a.adesoesQtdAnterior)}
              sub={`${brl(a.adesoesValor)} • ticket ${brl(a.adesoesTicket)}`}
              ajuda="Novos contratos de aluno no SGE, pela data de adesão. Ticket médio = valor total ÷ quantidade. A variação compara com o mesmo período do ano anterior (a sazonalidade do calendário acadêmico é forte)."
            />
          </div>

          {/* Fluxo de caixa */}
          <div className="bg-[#111820] border border-white/[0.06] rounded-xl p-6 shadow-lg">
            <SectionTitle
              ajuda="Verde: o que entrou de caixa em cada mês (data de pagamento). Linha: o que estava previsto pra vencer naquele mês. Recebido bem abaixo do previsto por vários meses = problema de cobrança."
              right={
                <Link to="/financeiro" className="text-xs text-orange-400 hover:underline flex items-center gap-1">
                  Abrir Financeiro <ArrowUpRight className="w-3.5 h-3.5" />
                </Link>
              }
            >
              Fluxo de caixa — últimos 12 meses
            </SectionTitle>
            {fluxoChart.every((m) => m.Recebido === 0 && m.Previsto === 0) ? (
              <div className="h-64 flex items-center justify-center text-xs text-slate-500">
                Sem movimentação registrada.
              </div>
            ) : (
              <div className="h-64 mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={fluxoChart} margin={{ left: 8, right: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="mes" stroke="#64748b" fontSize={11} />
                    <YAxis stroke="#64748b" fontSize={11} width={64} tickFormatter={(v) => `${(Number(v) / 1000).toFixed(0)}k`} />
                    <Tooltip
                      formatter={(v: number) => brl(Number(v))}
                      contentStyle={{ background: '#0a0f14', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="Recebido" fill={RECEITA} radius={[3, 3, 0, 0]} maxBarSize={38} />
                    <Line dataKey="Previsto" stroke={CUSTO} strokeWidth={2} dot={{ r: 2 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Atalhos para o detalhe */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { to: '/dre', titulo: 'DRE completo', desc: 'Receita, custos, despesas e margens por período e por turma.' },
              { to: '/projecoes', titulo: 'Projeções & Provisão', desc: 'Tendência de faturamento e provisão de caixa por turma.' },
              { to: '/adesoes', titulo: 'Adesões em detalhe', desc: 'Ritmo de adesões, comparação anual e por turma.' },
            ].map((c) => (
              <Link
                key={c.to}
                to={c.to}
                className="bg-[#111820] border border-white/[0.06] rounded-xl p-4 hover:border-orange-500/30 transition-colors"
              >
                <div className="text-sm font-semibold text-white flex items-center gap-1.5">
                  {c.titulo} <ArrowUpRight className="w-3.5 h-3.5 text-orange-400" />
                </div>
                <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">{c.desc}</p>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
