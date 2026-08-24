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
import { Rocket, PiggyBank, Pencil, Save, X } from 'lucide-react'
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

interface TurmaProvisao {
  id: string
  ano_formatura: string | null
  cidade: string | null
  total_alunos: number | null
  funil_status: string | null
  empresa: string | null
  curso: string | null
  faculdade: string | null
}

interface ParametroCusto {
  id: string
  ano: number
  formandos_min: number
  formandos_max: number
  cidade: string | null
  custo_direto_aluno: number
  venda_prevista_aluno: number
}

function brl2(v: number): string {
  return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
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

  // ── Provisão Financeira: quanto custo direto ainda falta honrar com as
  // turmas já fechadas (Convertido), por ano de formatura, pra saber quanto
  // manter em caixa. Baseado nos parâmetros reais de custo/venda por aluno
  // (planilha "CUSTO - AIF", cadastrados em parametros_custo_turma).
  const [turmasProvisao, setTurmasProvisao] = useState<TurmaProvisao[]>([])
  const [parametros, setParametros] = useState<ParametroCusto[]>([])
  const [loadingProvisao, setLoadingProvisao] = useState(true)

  const carregarProvisao = async () => {
    setLoadingProvisao(true)
    const [tu, pc] = await Promise.all([
      fetchAllRows<TurmaProvisao>(() =>
        supabase
          .from('turmas')
          .select('id, ano_formatura, cidade, total_alunos, funil_status, empresa, curso, faculdade')
          .order('id') as any,
      ),
      fetchAllRows<ParametroCusto>(() =>
        supabase
          .from('parametros_custo_turma')
          .select('id, ano, formandos_min, formandos_max, cidade, custo_direto_aluno, venda_prevista_aluno')
          .order('ano') as any,
      ),
    ])
    setTurmasProvisao(tu)
    setParametros(pc)
    setLoadingProvisao(false)
  }

  useEffect(() => {
    carregarProvisao()
  }, [])

  function extrairAnoFormatura(anoFormatura: string | null): number | null {
    if (!anoFormatura) return null
    const n = parseInt(anoFormatura.split('.')[0], 10)
    return Number.isFinite(n) ? n : null
  }

  function acharParametro(
    ano: number,
    alunos: number,
    cidade: string | null,
  ): { param: ParametroCusto; estimativa: boolean } | null {
    const doAno = parametros.filter((p) => p.ano === ano)
    if (doAno.length === 0) return null
    const naFaixa = doAno.filter((p) => alunos >= p.formandos_min && alunos <= p.formandos_max)
    const candidatos = naFaixa.length > 0 ? naFaixa : doAno
    // Prioridade: mesma cidade > "Conquista" como estimativa > qualquer um.
    const daCidade = cidade ? candidatos.find((p) => p.cidade === cidade) : undefined
    if (daCidade) return { param: daCidade, estimativa: false }
    const conquista = candidatos.find((p) => p.cidade === 'Conquista')
    if (conquista) return { param: conquista, estimativa: true }
    return { param: candidatos[0], estimativa: true }
  }

  const provisao = useMemo(() => {
    const porAno: Record<
      number,
      { ano: number; turmas: number; alunos: number; custo: number; venda: number; temEstimativa: boolean }
    > = {}
    let turmasSemParametro = 0

    const anoAtual = new Date().getFullYear()
    const turmasFechadas = turmasProvisao.filter((t) => t.funil_status === 'Convertido')

    for (const t of turmasFechadas) {
      const ano = extrairAnoFormatura(t.ano_formatura)
      const alunos = t.total_alunos || 0
      // Só provisiona pra frente: formaturas do ano atual em diante. Turma cuja
      // formatura já passou não é mais um custo a reservar caixa, é histórico.
      if (!ano || ano < anoAtual || alunos <= 0) continue
      const achado = acharParametro(ano, alunos, t.cidade)
      if (!achado) {
        turmasSemParametro++
        continue
      }
      if (!porAno[ano]) porAno[ano] = { ano, turmas: 0, alunos: 0, custo: 0, venda: 0, temEstimativa: false }
      porAno[ano].turmas += 1
      porAno[ano].alunos += alunos
      porAno[ano].custo += alunos * achado.param.custo_direto_aluno
      porAno[ano].venda += alunos * achado.param.venda_prevista_aluno
      if (achado.estimativa) porAno[ano].temEstimativa = true
    }

    const linhas = Object.values(porAno).sort((a, b) => a.ano - b.ano)
    const totalCusto = linhas.reduce((acc, l) => acc + l.custo, 0)
    const totalVenda = linhas.reduce((acc, l) => acc + l.venda, 0)
    const totalTurmas = linhas.reduce((acc, l) => acc + l.turmas, 0)
    return { linhas, totalCusto, totalVenda, totalTurmas, turmasSemParametro }
  }, [turmasProvisao, parametros])

  // Edição inline dos parâmetros de custo/venda por aluno (reajuste anual).
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [rascunho, setRascunho] = useState<{ custo: string; venda: string }>({ custo: '', venda: '' })
  const [salvandoParametro, setSalvandoParametro] = useState(false)

  function iniciarEdicao(p: ParametroCusto) {
    setEditandoId(p.id)
    setRascunho({ custo: String(p.custo_direto_aluno), venda: String(p.venda_prevista_aluno) })
  }

  async function salvarParametro(id: string) {
    setSalvandoParametro(true)
    const custo = Number(rascunho.custo.replace(',', '.'))
    const venda = Number(rascunho.venda.replace(',', '.'))
    const { error } = await supabase
      .from('parametros_custo_turma')
      .update({ custo_direto_aluno: custo, venda_prevista_aluno: venda, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (!error) {
      await carregarProvisao()
    }
    setEditandoId(null)
    setSalvandoParametro(false)
  }

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

      {/* Provisão Financeira: custo direto que ainda falta honrar com as
          turmas já fechadas, por ano de formatura, do ano atual em diante. */}
      <div className="bg-[#111820] border border-white/[0.06] rounded-xl p-5">
        <div className="flex items-center gap-2 mb-1">
          <PiggyBank className="w-5 h-5 text-orange-400" />
          <h3 className="text-base font-semibold text-white">Provisão Financeira</h3>
        </div>
        <p className="text-xs text-slate-400 mb-4">
          Quanto custo direto (fotógrafo, auxiliar, edição) ainda falta reservar em caixa pras
          turmas já fechadas, por ano de formatura — do ano atual em diante. Baseado no
          custo/aluno cadastrado abaixo, aplicado à quantidade real de alunos de cada turma.
        </p>

        {loadingProvisao ? (
          <div className="p-8 text-center text-slate-400 text-sm">Carregando...</div>
        ) : provisao.linhas.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">
            Nenhuma turma fechada com formatura a partir de {new Date().getFullYear()}.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto -mx-1 px-1">
              <table className="w-full text-sm min-w-[520px]">
                <thead>
                  <tr className="text-left text-slate-500 text-[11px] uppercase tracking-wider border-b border-white/[0.06]">
                    <th className="py-2 pr-3 font-semibold">Ano Formatura</th>
                    <th className="py-2 px-3 font-semibold text-right">Turmas</th>
                    <th className="py-2 px-3 font-semibold text-right">Alunos</th>
                    <th className="py-2 px-3 font-semibold text-right">Custo a Provisionar</th>
                    <th className="py-2 pl-3 font-semibold text-right">Receita Prevista</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {provisao.linhas.map((l) => (
                    <tr key={l.ano} className="hover:bg-white/[0.02]">
                      <td className="py-2.5 pr-3 text-slate-200 font-medium">
                        {l.ano}
                        {l.temEstimativa && (
                          <span
                            className="ml-1.5 text-[10px] text-amber-400/80"
                            title="Alguma turma nesse ano usou o parâmetro de Conquista como estimativa (cidade sem dado próprio ainda)"
                          >
                            ~estimado
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-300">{l.turmas}</td>
                      <td className="py-2.5 px-3 text-right text-slate-300">{l.alunos}</td>
                      <td className="py-2.5 px-3 text-right text-rose-400 font-semibold">{brl2(l.custo)}</td>
                      <td className="py-2.5 pl-3 text-right text-emerald-400 font-semibold">{brl2(l.venda)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-white/[0.08] font-bold">
                    <td className="py-2.5 pr-3 text-white">Total</td>
                    <td className="py-2.5 px-3 text-right text-white">{provisao.totalTurmas}</td>
                    <td className="py-2.5 px-3 text-right text-white">
                      {provisao.linhas.reduce((acc, l) => acc + l.alunos, 0)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-rose-400">{brl2(provisao.totalCusto)}</td>
                    <td className="py-2.5 pl-3 text-right text-emerald-400">{brl2(provisao.totalVenda)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {provisao.turmasSemParametro > 0 && (
              <p className="text-[11px] text-amber-400/80 bg-amber-500/[0.06] border border-amber-500/20 rounded-lg px-3 py-2 mt-3">
                {provisao.turmasSemParametro} turma(s) fechada(s) com formatura futura ficaram de
                fora por falta de parâmetro de custo cadastrado pro ano/tamanho delas.
              </p>
            )}
          </>
        )}
      </div>

      {/* Parâmetros de custo/venda por aluno — editável, pra reajustar ano a
          ano sem precisar mexer em código. */}
      <div className="bg-[#111820] border border-white/[0.06] rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-1">Custo e Venda Prevista por Aluno</h3>
        <p className="text-xs text-slate-400 mb-4">
          Valores por tamanho de turma e ano (fonte: planilha de orçamento). Clique no lápis pra
          reajustar quando atualizar os números.
        </p>
        <div className="overflow-x-auto -mx-1 px-1">
          <table className="w-full text-xs min-w-[560px]">
            <thead>
              <tr className="text-left text-slate-500 text-[10px] uppercase tracking-wider border-b border-white/[0.06]">
                <th className="py-2 pr-3 font-semibold">Ano</th>
                <th className="py-2 px-3 font-semibold">Turma</th>
                <th className="py-2 px-3 font-semibold">Cidade</th>
                <th className="py-2 px-3 font-semibold text-right">Custo/Aluno</th>
                <th className="py-2 px-3 font-semibold text-right">Venda/Aluno</th>
                <th className="py-2 pl-3 font-semibold text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {parametros.map((p) => (
                <tr key={p.id} className="hover:bg-white/[0.02]">
                  <td className="py-2 pr-3 text-slate-200">{p.ano}</td>
                  <td className="py-2 px-3 text-slate-300">
                    {p.formandos_min === p.formandos_max
                      ? `${p.formandos_min} formandos`
                      : `${p.formandos_min}-${p.formandos_max} formandos`}
                  </td>
                  <td className="py-2 px-3 text-slate-400">{p.cidade || '—'}</td>
                  {editandoId === p.id ? (
                    <>
                      <td className="py-2 px-3 text-right">
                        <input
                          type="text"
                          value={rascunho.custo}
                          onChange={(e) => setRascunho((r) => ({ ...r, custo: e.target.value }))}
                          className="w-24 bg-[#0a0f14] border border-white/[0.15] rounded px-2 py-1 text-right text-slate-200"
                        />
                      </td>
                      <td className="py-2 px-3 text-right">
                        <input
                          type="text"
                          value={rascunho.venda}
                          onChange={(e) => setRascunho((r) => ({ ...r, venda: e.target.value }))}
                          className="w-24 bg-[#0a0f14] border border-white/[0.15] rounded px-2 py-1 text-right text-slate-200"
                        />
                      </td>
                      <td className="py-2 pl-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            disabled={salvandoParametro}
                            onClick={() => salvarParametro(p.id)}
                            className="p-1.5 text-emerald-400 hover:bg-white/[0.05] rounded disabled:opacity-50"
                            title="Salvar"
                          >
                            <Save className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setEditandoId(null)}
                            className="p-1.5 text-slate-400 hover:bg-white/[0.05] rounded"
                            title="Cancelar"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="py-2 px-3 text-right text-rose-400 font-mono">
                        {brl2(p.custo_direto_aluno)}
                      </td>
                      <td className="py-2 px-3 text-right text-emerald-400 font-mono">
                        {brl2(p.venda_prevista_aluno)}
                      </td>
                      <td className="py-2 pl-3 text-right">
                        <button
                          onClick={() => iniciarEdicao(p)}
                          className="p-1.5 text-slate-400 hover:text-white hover:bg-white/[0.05] rounded"
                          title="Editar"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
