import { useEffect, useMemo, useState } from 'react'
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { Rocket } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import EmpresaFilterBar from '@/components/EmpresaFilterBar'
import { fetchAllRows } from '@/utils/fetchAllRows'

interface FaturamentoMensal {
  mes: string
  faturamento_bruto: number
  recebido: number
}

interface PagamentoRaw {
  valor: number
  valor_pago: number
  status: string
  data_vencimento: string | null
  data_pagamento: string | null
  turmas?: { empresa: string | null } | null
}

function brl(v: number): string {
  return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

export default function Projecoes() {
  const [pagamentos, setPagamentos] = useState<PagamentoRaw[]>([])
  const [loading, setLoading] = useState(true)
  const [mesesProjetar, setMesesProjetar] = useState(3)

  // Filtro por empresa (AIF, AFF, SFF, AIM...) — nenhum selecionado = todas.
  const [selectedEmpresas, setSelectedEmpresas] = useState<string[]>([])
  const empresaOptions = useMemo(() => {
    const set = new Set<string>()
    pagamentos.forEach((p) => p.turmas?.empresa && set.add(p.turmas.empresa))
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [pagamentos])

  useEffect(() => {
    async function load() {
      setLoading(true)
      const data = await fetchAllRows<PagamentoRaw>(() =>
        supabase
          .from('pagamentos')
          .select('valor, valor_pago, status, data_vencimento, data_pagamento, turmas(empresa), id')
          .neq('status', 'cancelado')
          .order('id') as any,
      )
      setPagamentos(data)
      setLoading(false)
    }
    load()
  }, [])

  // Reconstrói o mesmo agrupamento mensal da view vw_faturamento_mensal
  // (faturamento por mês de vencimento + recebido por mês de pagamento),
  // já respeitando o filtro de empresa selecionado.
  const historico = useMemo<FaturamentoMensal[]>(() => {
    const filtrados =
      selectedEmpresas.length === 0
        ? pagamentos
        : pagamentos.filter((p) => p.turmas?.empresa && selectedEmpresas.includes(p.turmas.empresa))

    const porMes: Record<string, { faturamento_bruto: number; recebido: number }> = {}
    for (const p of filtrados) {
      if (p.data_vencimento) {
        const mes = p.data_vencimento.slice(0, 7)
        if (!porMes[mes]) porMes[mes] = { faturamento_bruto: 0, recebido: 0 }
        porMes[mes].faturamento_bruto += Number(p.valor || 0)
      }
      if (p.status === 'pago' && p.data_pagamento) {
        const mes = p.data_pagamento.slice(0, 7)
        if (!porMes[mes]) porMes[mes] = { faturamento_bruto: 0, recebido: 0 }
        porMes[mes].recebido += Number(p.valor_pago || 0)
      }
    }
    return Object.entries(porMes)
      .map(([mes, v]) => ({ mes, ...v }))
      .sort((a, b) => a.mes.localeCompare(b.mes))
  }, [pagamentos, selectedEmpresas])

  const chartData = useMemo(() => {
    // Nosso negócio fecha pacotes com anos de antecedência (a formatura pode
    // ser só daqui a 5 anos), então o histórico vem cheio de parcelas já
    // agendadas bem no futuro. Pra projeção fazer sentido, a regressão usa
    // só os meses já passados (real) - os meses futuros aparecem à parte,
    // como "Já Contratado" (o que já está agendado de verdade no sistema,
    // não uma estimativa).
    const mesAtual = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
    const historicoReal = historico.filter((h) => h.mes <= mesAtual)
    const historicoFuturo = historico.filter((h) => h.mes > mesAtual)

    if (historicoReal.length < 2) return []

    // Regressão linear simples sobre o faturamento bruto mensal real
    const y = historicoReal.map((h) => Number(h.faturamento_bruto || 0))
    const n = y.length
    const xMean = (n - 1) / 2
    const yMean = y.reduce((a, b) => a + b, 0) / n
    let num = 0
    let den = 0
    y.forEach((yi, xi) => {
      num += (xi - xMean) * (yi - yMean)
      den += (xi - xMean) ** 2
    })
    const slope = den === 0 ? 0 : num / den
    const intercept = yMean - slope * xMean

    const base = historicoReal.map((h) => ({
      mes: h.mes,
      real: Number(h.faturamento_bruto || 0),
      projecao: undefined as number | undefined,
      jaContratado: undefined as number | undefined,
    }))

    const futuroPorMes = new Map(historicoFuturo.map((h) => [h.mes, Number(h.faturamento_bruto || 0)]))
    const lastDate = new Date(`${historicoReal[historicoReal.length - 1].mes}-01`)
    for (let i = 0; i < mesesProjetar; i++) {
      const x = n + i
      const projDate = new Date(lastDate)
      projDate.setMonth(projDate.getMonth() + i + 1)
      const mesLabel = `${projDate.getFullYear()}-${String(projDate.getMonth() + 1).padStart(2, '0')}`
      base.push({
        mes: mesLabel,
        real: undefined,
        projecao: Math.max(0, slope * x + intercept),
        jaContratado: futuroPorMes.get(mesLabel),
      })
    }
    return base
  }, [historico, mesesProjetar])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Rocket className="w-6 h-6 text-orange-400" /> Projeções
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Projeção de faturamento por tendência linear, com base no histórico real
          </p>
        </div>
        <EmpresaFilterBar
          options={empresaOptions}
          selected={selectedEmpresas}
          onChange={setSelectedEmpresas}
        />
      </div>

      <div className="flex items-center gap-3">
        <span className="text-xs text-slate-400">Meses a projetar</span>
        <input
          type="range"
          min={1}
          max={12}
          value={mesesProjetar}
          onChange={(e) => setMesesProjetar(Number(e.target.value))}
          className="w-48 accent-orange-500"
        />
        <span className="text-sm font-semibold text-white">{mesesProjetar}</span>
      </div>

      <div className="bg-[#111820] border border-white/[0.06] rounded-xl p-5">
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm">Carregando...</div>
        ) : chartData.length < 3 ? (
          <div className="p-8 text-center text-slate-400 text-sm">
            São necessários pelo menos 3 meses de histórico já fechado (não contando parcelas
            agendadas pro futuro) para projetar. Continue usando o sistema — os dados já estão sendo
            coletados a cada hora.
          </div>
        ) : (
          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="mes" stroke="#64748b" fontSize={12} />
                <YAxis stroke="#64748b" fontSize={12} tickFormatter={(v) => brl(v)} width={90} />
                <Tooltip
                  formatter={(v: number) => brl(Number(v))}
                  contentStyle={{ background: '#0a0f14', border: '1px solid rgba(255,255,255,0.1)' }}
                />
                <Legend />
                <Bar dataKey="real" name="Faturamento Real" fill="#F97316" radius={[4, 4, 0, 0]} />
                <Bar dataKey="jaContratado" name="Já Contratado (agendado no SGE)" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                <Line
                  dataKey="projecao"
                  name="Projeção (tendência)"
                  stroke="#10B981"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  dot={{ r: 4 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  )
}
