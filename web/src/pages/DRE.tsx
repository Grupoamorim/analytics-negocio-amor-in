import { useEffect, useMemo, useState } from 'react'
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from 'recharts'
import { supabase } from '@/lib/supabase/client'

interface Pagamento {
  id: string
  valor: number
  status: string
  data_vencimento: string
  turma_id: string | null
  turmas?: { nome: string } | null
}

interface ContaPagar {
  id: string
  descricao: string
  fornecedor: string
  categoria: string
  valor: number
  status: string
  data_vencimento: string
  grupo_dre?: string | null
  turma_id: string | null
  turmas?: { nome: string } | null
}

const REGRAS_DRE: [string, string[]][] = [
  ['Impostos e Taxas sobre Vendas', ['imposto', 'tribut', 'iss', 'icms', 'simples nacional', 'das ', 'darf', 'nota fiscal', 'pis', 'cofins']],
  ['Custos Diretos (Produção/Serviços)', ['fotograf', 'filmagem', 'video', 'produc', 'material', 'insumo', 'equipamento', 'fornecedor', 'freelancer', 'diagram', 'impress', 'album', 'edicao', 'estudio', 'formatura', 'festa', 'convite', 'brinde', 'cenografia', 'som e luz', 'buffet', 'grafica']],
  ['Despesas Comerciais e Marketing', ['marketing', 'publicidade', 'anuncio', 'comissao', 'vendedor', 'trafego', 'ads', 'divulga', 'social media', 'agencia de']],
  ['Despesas com Pessoal e Administrativas', ['salario', 'folha', 'pro-labore', 'administrat', 'escritorio', 'aluguel', 'agua', 'energia', 'luz', 'internet', 'telefone', 'celular', 'contabil', 'contador', 'software', 'assinatura', 'sistema', 'limpeza', 'papelaria']],
  ['Despesas Financeiras', ['juros', 'tarifa banc', 'banco', 'cartao', 'emprestimo', 'financiamento', 'iof', 'anuidade', 'boleto']],
]
const GRUPOS_ORDEM = [...REGRAS_DRE.map((r) => r[0]), 'Outras Despesas Operacionais']

function normalizar(txt: string | null | undefined): string {
  if (!txt) return ''
  return txt
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

function classificar(c: ContaPagar): string {
  if (c.grupo_dre && GRUPOS_ORDEM.includes(c.grupo_dre)) return c.grupo_dre
  const base = normalizar(`${c.categoria || ''} ${c.descricao || ''} ${c.fornecedor || ''}`)
  for (const [grupo, palavras] of REGRAS_DRE) {
    if (palavras.some((p) => base.includes(normalizar(p)))) return grupo
  }
  return 'Outras Despesas Operacionais'
}

function brl(v: number): string {
  return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const CHART_COLORS = ['#F97316', '#EA580C', '#FB923C', '#FDBA74', '#10B981', '#64748B']

type Periodo = 'mes' | 'trimestre' | 'semestre' | 'ano' | 'personalizado'

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** Calcula De/Até para um período pré-definido, ancorado em hoje. Isso evita
 * que o DRE misture parcelas já contratadas para daqui a 5 anos (normal no
 * nosso negócio - a formatura pode ser marcada com anos de antecedência)
 * com o resultado do período que o usuário quer analisar agora. */
function calcularPeriodo(periodo: Periodo): { ini: string; fim: string } {
  const hoje = new Date()
  const ano = hoje.getFullYear()
  const mes = hoje.getMonth()

  if (periodo === 'mes') {
    return { ini: toISO(new Date(ano, mes, 1)), fim: toISO(new Date(ano, mes + 1, 0)) }
  }
  if (periodo === 'trimestre') {
    const inicioTri = Math.floor(mes / 3) * 3
    return { ini: toISO(new Date(ano, inicioTri, 1)), fim: toISO(new Date(ano, inicioTri + 3, 0)) }
  }
  if (periodo === 'semestre') {
    const inicioSem = mes < 6 ? 0 : 6
    return { ini: toISO(new Date(ano, inicioSem, 1)), fim: toISO(new Date(ano, inicioSem + 6, 0)) }
  }
  // 'ano'
  return { ini: toISO(new Date(ano, 0, 1)), fim: toISO(new Date(ano, 11, 31)) }
}

export default function DRE() {
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([])
  const [contasPagar, setContasPagar] = useState<ContaPagar[]>([])
  const [loading, setLoading] = useState(true)
  const [periodo, setPeriodo] = useState<Periodo>('ano')
  const anoInicial = calcularPeriodo('ano')
  const [dtIni, setDtIni] = useState(anoInicial.ini)
  const [dtFim, setDtFim] = useState(anoInicial.fim)

  function selecionarPeriodo(p: Periodo) {
    setPeriodo(p)
    if (p !== 'personalizado') {
      const { ini, fim } = calcularPeriodo(p)
      setDtIni(ini)
      setDtFim(fim)
    }
  }

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [pgtoRes, cpRes] = await Promise.all([
        supabase
          .from('pagamentos')
          .select('id, valor, status, data_vencimento, turma_id, turmas(nome)')
          .neq('status', 'cancelado'),
        supabase
          .from('contas_pagar')
          .select('id, descricao, fornecedor, categoria, valor, status, data_vencimento, grupo_dre, turma_id, turmas(nome)')
          .neq('status', 'cancelado'),
      ])
      const pg = (pgtoRes.data || []) as Pagamento[]
      const cp = (cpRes.data || []) as ContaPagar[]
      setPagamentos(pg)
      setContasPagar(cp)
      setLoading(false)
    }
    load()
  }, [])

  const { linhas, margens, composicao, custoPorTurma, usaCustoDireto } = useMemo(() => {
    const dentroPeriodo = (d: string) => (!dtIni || d >= dtIni) && (!dtFim || d <= dtFim)

    const receitasPeriodo = pagamentos.filter((p) => dentroPeriodo(p.data_vencimento))
    const receitaBruta = receitasPeriodo.reduce((acc, p) => acc + Number(p.valor || 0), 0)

    const despesasPeriodo = contasPagar.filter((c) => dentroPeriodo(c.data_vencimento))
    const totaisGrupo: Record<string, number> = {}
    for (const c of despesasPeriodo) {
      const g = classificar(c)
      totaisGrupo[g] = (totaisGrupo[g] || 0) + Number(c.valor || 0)
    }

    const impostos = totaisGrupo['Impostos e Taxas sobre Vendas'] || 0
    const custosDiretos = totaisGrupo['Custos Diretos (Produção/Serviços)'] || 0
    const despComerciais = totaisGrupo['Despesas Comerciais e Marketing'] || 0
    const despAdmin = totaisGrupo['Despesas com Pessoal e Administrativas'] || 0
    const despFinanceiras = totaisGrupo['Despesas Financeiras'] || 0
    const outras = totaisGrupo['Outras Despesas Operacionais'] || 0

    const receitaLiquida = receitaBruta - impostos
    const lucroBruto = receitaLiquida - custosDiretos
    const despesasOperac = despComerciais + despAdmin + despFinanceiras + outras
    const resultadoOperac = lucroBruto - despesasOperac

    const linhas = [
      { label: 'Receita Operacional Bruta', valor: receitaBruta, nivel: 0, destaque: false },
      { label: '(–) Impostos e Taxas sobre Vendas', valor: -impostos, nivel: 1, destaque: false },
      { label: '(=) Receita Operacional Líquida', valor: receitaLiquida, nivel: 0, destaque: true },
      { label: '(–) Custos Diretos (Produção/Serviços)', valor: -custosDiretos, nivel: 1, destaque: false },
      { label: '(=) Lucro Bruto', valor: lucroBruto, nivel: 0, destaque: true },
      { label: '(–) Despesas Comerciais e Marketing', valor: -despComerciais, nivel: 1, destaque: false },
      { label: '(–) Despesas com Pessoal e Administrativas', valor: -despAdmin, nivel: 1, destaque: false },
      { label: '(–) Despesas Financeiras', valor: -despFinanceiras, nivel: 1, destaque: false },
      { label: '(–) Outras Despesas Operacionais', valor: -outras, nivel: 1, destaque: false },
      { label: '(=) Resultado Líquido do Período', valor: resultadoOperac, nivel: 0, destaque: true },
    ]

    const margens = {
      bruta: receitaBruta ? (lucroBruto / receitaBruta) * 100 : 0,
      operacional: receitaBruta ? (resultadoOperac / receitaBruta) * 100 : 0,
    }

    const composicao = GRUPOS_ORDEM.map((g) => ({ name: g, value: totaisGrupo[g] || 0 })).filter(
      (g) => g.value > 0,
    )

    // Custo por turma: direto quando os lançamentos trazem turma_id vinculado;
    // senão, rateio proporcional à participação de cada turma na receita.
    const receitaPorTurma: Record<string, { nome: string; receita: number }> = {}
    for (const p of receitasPeriodo) {
      if (!p.turma_id) continue
      const nome = p.turmas?.nome || p.turma_id
      if (!receitaPorTurma[p.turma_id]) receitaPorTurma[p.turma_id] = { nome, receita: 0 }
      receitaPorTurma[p.turma_id].receita += Number(p.valor || 0)
    }

    const custoDiretoPorTurma: Record<string, number> = {}
    let totalCustoDireto = 0
    for (const c of despesasPeriodo) {
      if (!c.turma_id) continue
      custoDiretoPorTurma[c.turma_id] = (custoDiretoPorTurma[c.turma_id] || 0) + Number(c.valor || 0)
      totalCustoDireto += Number(c.valor || 0)
    }

    const usaCustoDireto = totalCustoDireto > 0
    const totalDespesasPeriodo = impostos + custosDiretos + despesasOperac

    const custoPorTurma = Object.entries(receitaPorTurma)
      .map(([turmaId, { nome, receita }]) => {
        const custo = usaCustoDireto
          ? custoDiretoPorTurma[turmaId] || 0
          : receitaBruta > 0
            ? (receita / receitaBruta) * totalDespesasPeriodo
            : 0
        return { turma: nome, receita, custo, resultado: receita - custo }
      })
      .sort((a, b) => b.receita - a.receita)
      .slice(0, 12)

    return { linhas, margens, composicao, custoPorTurma, usaCustoDireto }
  }, [pagamentos, contasPagar, dtIni, dtFim])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">DRE</h1>
          <p className="text-sm text-slate-400 mt-1">
            Demonstrativo de Resultado — classificação automática das despesas
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {(
          [
            ['mes', 'Mês'],
            ['trimestre', 'Trimestre'],
            ['semestre', 'Semestre'],
            ['ano', 'Ano'],
            ['personalizado', 'Personalizado'],
          ] as [Periodo, string][]
        ).map(([p, label]) => (
          <button
            key={p}
            onClick={() => selecionarPeriodo(p)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
              periodo === p
                ? 'bg-orange-500/15 text-orange-400 border-orange-500/30'
                : 'text-slate-400 border-white/[0.08] hover:text-white hover:bg-white/[0.05]'
            }`}
          >
            {label}
          </button>
        ))}

        {periodo === 'personalizado' && (
          <>
            <label className="text-xs text-slate-400">
              De{' '}
              <input
                type="date"
                value={dtIni}
                onChange={(e) => setDtIni(e.target.value)}
                className="ml-1 bg-[#111820] border border-white/[0.1] rounded-lg px-2 py-1.5 text-slate-200 text-sm"
              />
            </label>
            <label className="text-xs text-slate-400">
              Até{' '}
              <input
                type="date"
                value={dtFim}
                onChange={(e) => setDtFim(e.target.value)}
                className="ml-1 bg-[#111820] border border-white/[0.1] rounded-lg px-2 py-1.5 text-slate-200 text-sm"
              />
            </label>
          </>
        )}

        {periodo !== 'personalizado' && (
          <span className="text-xs text-slate-500">
            {new Date(`${dtIni}T00:00:00`).toLocaleDateString('pt-BR')} até{' '}
            {new Date(`${dtFim}T00:00:00`).toLocaleDateString('pt-BR')}
          </span>
        )}
      </div>

      {loading ? (
        <div className="p-8 text-center text-slate-400 text-sm">Carregando...</div>
      ) : (
        <>
          <div className="bg-[#111820] border border-white/[0.06] rounded-xl p-5">
            {linhas.map((l, i) => (
              <div
                key={i}
                className={`flex items-center justify-between px-3 py-2 rounded-lg ${
                  l.destaque ? 'bg-orange-500/10 my-1' : ''
                }`}
                style={{ marginLeft: l.nivel * 20 }}
              >
                <span className={`text-sm ${l.destaque ? 'font-bold text-white' : 'text-slate-300'}`}>
                  {l.label}
                </span>
                <span
                  className={`text-sm font-mono ${l.destaque ? 'font-bold' : ''} ${
                    l.valor >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {brl(l.valor)}
                </span>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-[#111820] border border-white/[0.06] rounded-xl p-5">
              <span className="text-xs font-medium text-slate-400">Margem Bruta</span>
              <div className="text-2xl font-bold text-white mt-1">{margens.bruta.toFixed(1)}%</div>
            </div>
            <div className="bg-[#111820] border border-white/[0.06] rounded-xl p-5">
              <span className="text-xs font-medium text-slate-400">Margem Operacional</span>
              <div className="text-2xl font-bold text-white mt-1">{margens.operacional.toFixed(1)}%</div>
            </div>
          </div>

          {composicao.length > 0 && (
            <div className="bg-[#111820] border border-white/[0.06] rounded-xl p-5">
              <h3 className="text-sm font-semibold text-white mb-4">Composição das Despesas</h3>
              <div className="flex flex-col sm:flex-row items-center gap-6">
                <div className="w-full sm:w-64 h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={composicao} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90}>
                        {composicao.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(v: number) => brl(v)}
                        contentStyle={{ background: '#0a0f14', border: '1px solid rgba(255,255,255,0.1)' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 space-y-2 w-full">
                  {composicao.map((g, i) => (
                    <div key={g.name} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 text-slate-300">
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                        />
                        {g.name}
                      </span>
                      <span className="text-slate-400">{brl(g.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {custoPorTurma.length > 0 && (
            <div className="bg-[#111820] border border-white/[0.06] rounded-xl p-5">
              <h3 className="text-sm font-semibold text-white mb-1">Custo por Turma</h3>
              <p className="text-xs text-slate-400 mb-4">
                {usaCustoDireto
                  ? 'Custos com a turma identificada diretamente nos lançamentos sincronizados do SGE.'
                  : 'Os lançamentos de contas a pagar ainda não trazem a turma vinculada a cada despesa — o custo abaixo é estimado por rateio proporcional à receita de cada turma.'}
              </p>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={custoPorTurma}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="turma" stroke="#64748b" fontSize={11} angle={-30} textAnchor="end" height={70} />
                    <YAxis stroke="#64748b" fontSize={12} tickFormatter={(v) => brl(v)} width={90} />
                    <Tooltip
                      formatter={(v: number) => brl(Number(v))}
                      contentStyle={{ background: '#0a0f14', border: '1px solid rgba(255,255,255,0.1)' }}
                    />
                    <Legend />
                    <Bar dataKey="receita" name="Receita" fill="#F97316" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="custo" name="Custo" fill="#F87171" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
