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
import { ChevronDown, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import EmpresaFilterBar from '@/components/EmpresaFilterBar'
import PeriodoFiltroBar from '@/components/PeriodoFiltroBar'
import { usePeriodoFiltro } from '@/hooks/usePeriodoFiltro'
import { fetchAllRows } from '@/utils/fetchAllRows'

interface TurmaResumo {
  nome: string
  empresa: string | null
  curso: string | null
  faculdade: string | null
  turma: string | null
  ano_formatura: string | null
  cidade: string | null
}

interface Pagamento {
  id: string
  valor: number
  status: string
  data_vencimento: string
  data_pagamento: string | null
  turma_id: string | null
  turmas?: (TurmaResumo & { tipo_servico: string | null }) | null
}

interface ContaPagar {
  id: string
  descricao: string
  fornecedor: string
  categoria: string
  valor: number
  status: string
  data_vencimento: string
  data_pagamento: string | null
  grupo_dre?: string | null
  turma_id: string | null
  turmas?: TurmaResumo | null
}

/** Nome completo da turma pro detalhamento do DRE — diferente do nome curto
 * usado em badges/tabelas, aqui o Lucas quer ver tudo (empresa, curso,
 * faculdade, turma, ano/fase e cidade), sem truncar nada. */
function nomeCompletoTurma(t: TurmaResumo | null | undefined): string {
  if (!t) return 'Sem turma vinculada'
  const partes = [t.empresa, t.curso, t.faculdade, t.turma, t.ano_formatura, t.cidade].filter(Boolean)
  return partes.length > 0 ? partes.join(' ') : t.nome || 'Sem turma vinculada'
}

const REGRAS_DRE: [string, string[]][] = [
  ['Impostos e Taxas sobre Vendas', ['imposto', 'tribut', 'iss', 'icms', 'simples nacional', 'das ', 'darf', 'nota fiscal', 'pis', 'cofins']],
  ['Custos Diretos (Produção/Serviços)', ['fotograf', 'filmagem', 'video', 'produc', 'material', 'insumo', 'equipamento', 'fornecedor', 'freelancer', 'diagram', 'impress', 'album', 'edicao', 'estudio', 'formatura', 'festa', 'convite', 'brinde', 'cenografia', 'som e luz', 'buffet', 'grafica']],
  ['Despesas Comerciais e Marketing', ['marketing', 'publicidade', 'anuncio', 'comissao', 'vendedor', 'trafego', 'ads', 'divulga', 'social media', 'agencia de']],
  ['Despesas com Pessoal e Administrativas', ['salario', 'folha', 'pro-labore', 'administrat', 'escritorio', 'aluguel', 'agua', 'energia', 'luz', 'internet', 'telefone', 'celular', 'contabil', 'contador', 'software', 'assinatura', 'sistema', 'limpeza', 'papelaria']],
  ['Despesas Financeiras', ['juros', 'tarifa banc', 'emprestimo', 'financiamento', 'iof', 'anuidade']],
]
const GRUPOS_ORDEM = [...REGRAS_DRE.map((r) => r[0]), 'Outras Despesas Operacionais']

// Fornecedores confirmados manualmente (investigação com o Lucas em 24/08/2026) cuja
// natureza real diverge do que a classificação por palavra-chave adivinharia:
// - Cartão Itaú/Sicoob: fatura de cartão mistura vários gastos operacionais diferentes,
//   não é "despesa financeira" de verdade (juros/tarifa) — fica em Outras até termos o
//   detalhamento item a item da fatura.
// - SICOOB/Banco Itaú (fornecedor = a própria instituição): aí sim é despesa financeira
//   (tarifa, parcela de financiamento).
// - Lucas Amorim - PF: pró-labore/comissões do sócio.
const FORNECEDOR_OVERRIDES: Record<string, string> = {
  'cartao itau': 'Outras Despesas Operacionais',
  'cartao sicoob': 'Outras Despesas Operacionais',
  sicoob: 'Despesas Financeiras',
  'banco itau': 'Despesas Financeiras',
  'lucas amorim - pf': 'Despesas com Pessoal e Administrativas',
}

function normalizar(txt: string | null | undefined): string {
  if (!txt) return ''
  return txt
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

function classificar(c: ContaPagar): string {
  if (c.grupo_dre && GRUPOS_ORDEM.includes(c.grupo_dre)) return c.grupo_dre
  const fornecedorNorm = normalizar(c.fornecedor)
  if (fornecedorNorm && FORNECEDOR_OVERRIDES[fornecedorNorm]) return FORNECEDOR_OVERRIDES[fornecedorNorm]
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

export default function DRE() {
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([])
  const [contasPagar, setContasPagar] = useState<ContaPagar[]>([])
  const [loading, setLoading] = useState(true)

  const periodoFiltro = usePeriodoFiltro('ano')
  const { dtIni, dtFim } = periodoFiltro

  // Filtro por empresa (AIF, AFF, SFF, AIM...) — nenhum selecionado = todas.
  const [selectedEmpresas, setSelectedEmpresas] = useState<string[]>([])
  const empresaOptions = useMemo(() => {
    const set = new Set<string>()
    pagamentos.forEach((p) => p.turmas?.empresa && set.add(p.turmas.empresa))
    contasPagar.forEach((c) => c.turmas?.empresa && set.add(c.turmas.empresa))
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [pagamentos, contasPagar])

  // Linha do DRE expandida no momento (mostra o detalhamento por turma/fornecedor).
  const [linhaAberta, setLinhaAberta] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [pg, cp] = await Promise.all([
        fetchAllRows<Pagamento>(() =>
          supabase
            .from('pagamentos')
            .select('id, valor, status, data_vencimento, data_pagamento, turma_id, turmas(nome, tipo_servico, empresa, curso, faculdade, turma, ano_formatura, cidade)')
            .neq('status', 'cancelado')
            .order('id'),
        ),
        fetchAllRows<ContaPagar>(() =>
          supabase
            .from('contas_pagar')
            .select('id, descricao, fornecedor, categoria, valor, status, data_vencimento, data_pagamento, grupo_dre, turma_id, turmas(nome, empresa, curso, faculdade, turma, ano_formatura, cidade)')
            .neq('status', 'cancelado')
            .order('id'),
        ),
      ])
      setPagamentos(pg)
      setContasPagar(cp)
      setLoading(false)
    }
    load()
  }, [])

  const {
    linhas,
    margens,
    composicao,
    custoPorTurma,
    usaCustoDireto,
    receitaFormaturas,
    receitaPrestacaoServicos,
    detalhesPorLinha,
  } = useMemo(() => {
    // Base de caixa: conta o que realmente entrou/saiu no período (data de crédito
    // da receita / data de pagamento da despesa), não a data de vencimento —
    // confirmado com o Lucas em 24/08/2026 batendo contra o relatório real do SGE
    // (vencimento sozinho subestimava tudo, já que muita parcela atrasada só é
    // recebida/paga bem depois do vencimento original).
    const dentroPeriodo = (d: string | null) => !!d && (!dtIni || d >= dtIni) && (!dtFim || d <= dtFim)
    const dentroEmpresa = (empresa: string | null | undefined) =>
      selectedEmpresas.length === 0 || (!!empresa && selectedEmpresas.includes(empresa))

    const receitasPeriodo = pagamentos.filter(
      (p) => dentroPeriodo(p.data_pagamento) && dentroEmpresa(p.turmas?.empresa),
    )
    const receitaBruta = receitasPeriodo.reduce((acc, p) => acc + Number(p.valor || 0), 0)

    // Receita por tipo: Formaturas x Prestação de Serviços (ensaios, festas, eventos avulsos)
    const receitaPrestacaoServicos = receitasPeriodo
      .filter((p) => p.turmas?.tipo_servico === 'Prestação de Serviço')
      .reduce((acc, p) => acc + Number(p.valor || 0), 0)
    const receitaFormaturas = receitaBruta - receitaPrestacaoServicos

    const despesasPeriodo = contasPagar.filter(
      (c) => dentroPeriodo(c.data_pagamento) && dentroEmpresa(c.turmas?.empresa),
    )
    const totaisGrupo: Record<string, number> = {}
    for (const c of despesasPeriodo) {
      const g = classificar(c)
      totaisGrupo[g] = (totaisGrupo[g] || 0) + Number(c.valor || 0)
    }

    // Detalhamento de cada linha do DRE, por turma e por fornecedor/descrição —
    // alimenta as setinhas de expandir de cada linha na tela.
    type Detalhe = { turma: string; valor: number }[]
    const agrupar = (itens: { valor: number; nome: string }[], top = 15): Detalhe => {
      const mapa = new Map<string, number>()
      for (const it of itens) mapa.set(it.nome, (mapa.get(it.nome) || 0) + it.valor)
      const ordenado = Array.from(mapa.entries())
        .map(([turma, valor]) => ({ turma, valor }))
        .sort((a, b) => b.valor - a.valor)
      if (ordenado.length <= top) return ordenado
      const principais = ordenado.slice(0, top)
      const restoValor = ordenado.slice(top).reduce((acc, o) => acc + o.valor, 0)
      return [...principais, { turma: `Outras (${ordenado.length - top})`, valor: restoValor }]
    }

    const detalhesPorLinha: Record<string, { porTurma: Detalhe; porFornecedor: Detalhe }> = {
      receita: {
        porTurma: agrupar(
          receitasPeriodo.map((p) => ({ valor: Number(p.valor || 0), nome: nomeCompletoTurma(p.turmas) })),
        ),
        porFornecedor: [],
      },
    }
    for (const grupo of GRUPOS_ORDEM) {
      const itensGrupo = despesasPeriodo.filter((c) => classificar(c) === grupo)
      detalhesPorLinha[grupo] = {
        porTurma: agrupar(
          itensGrupo.map((c) => ({
            valor: Number(c.valor || 0),
            nome: nomeCompletoTurma(c.turmas),
          })),
        ),
        porFornecedor: agrupar(
          itensGrupo.map((c) => ({
            valor: Number(c.valor || 0),
            nome: c.fornecedor || c.descricao || 'Sem fornecedor',
          })),
        ),
      }
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
      { label: 'Receita Operacional Bruta', valor: receitaBruta, nivel: 0, destaque: false, key: 'receita' },
      { label: '(–) Impostos e Taxas sobre Vendas', valor: -impostos, nivel: 1, destaque: false, key: 'Impostos e Taxas sobre Vendas' },
      { label: '(=) Receita Operacional Líquida', valor: receitaLiquida, nivel: 0, destaque: true, key: null },
      { label: '(–) Custos Diretos (Produção/Serviços)', valor: -custosDiretos, nivel: 1, destaque: false, key: 'Custos Diretos (Produção/Serviços)' },
      { label: '(=) Lucro Bruto', valor: lucroBruto, nivel: 0, destaque: true, key: null },
      { label: '(–) Despesas Comerciais e Marketing', valor: -despComerciais, nivel: 1, destaque: false, key: 'Despesas Comerciais e Marketing' },
      { label: '(–) Despesas com Pessoal e Administrativas', valor: -despAdmin, nivel: 1, destaque: false, key: 'Despesas com Pessoal e Administrativas' },
      { label: '(–) Despesas Financeiras', valor: -despFinanceiras, nivel: 1, destaque: false, key: 'Despesas Financeiras' },
      { label: '(–) Outras Despesas Operacionais', valor: -outras, nivel: 1, destaque: false, key: 'Outras Despesas Operacionais' },
      { label: '(=) Resultado Líquido do Período', valor: resultadoOperac, nivel: 0, destaque: true, key: null },
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
      const nome = nomeCompletoTurma(p.turmas)
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

    return {
      linhas,
      margens,
      composicao,
      custoPorTurma,
      usaCustoDireto,
      receitaFormaturas,
      receitaPrestacaoServicos,
      detalhesPorLinha,
    }
  }, [pagamentos, contasPagar, dtIni, dtFim, selectedEmpresas])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">DRE</h1>
          <p className="text-sm text-slate-400 mt-1">
            Demonstrativo de Resultado — classificação automática das despesas
          </p>
        </div>
        <EmpresaFilterBar
          options={empresaOptions}
          selected={selectedEmpresas}
          onChange={setSelectedEmpresas}
        />
      </div>
      {selectedEmpresas.length > 0 && (
        <p className="text-[11px] text-amber-400/80 bg-amber-500/[0.06] border border-amber-500/20 rounded-lg px-3 py-2">
          A maioria das contas a pagar ainda não tem turma vinculada no SGE, então as despesas
          deste DRE filtrado tendem a ficar subestimadas — a receita já reflete a empresa
          selecionada corretamente.
        </p>
      )}

      <PeriodoFiltroBar {...periodoFiltro} />

      {loading ? (
        <div className="p-8 text-center text-slate-400 text-sm">Carregando...</div>
      ) : (
        <>
          <div className="bg-[#111820] border border-white/[0.06] rounded-xl p-5">
            <p className="text-[11px] text-slate-500 mb-2">
              Clique na seta de uma linha para ver o detalhamento por turma e por fornecedor.
            </p>
            {linhas.map((l, i) => {
              const detalhe = l.key ? detalhesPorLinha[l.key] : undefined
              const aberta = !!l.key && linhaAberta === l.key
              const temDetalhe = !!detalhe && (detalhe.porTurma.length > 0 || detalhe.porFornecedor.length > 0)
              return (
                <div key={i} style={{ marginLeft: l.nivel * 20 }}>
                  <div
                    className={`flex items-center justify-between px-3 py-2 rounded-lg ${
                      l.destaque ? 'bg-orange-500/10 my-1' : ''
                    } ${temDetalhe ? 'cursor-pointer hover:bg-white/[0.03]' : ''}`}
                    onClick={() => temDetalhe && l.key && setLinhaAberta(aberta ? null : l.key)}
                  >
                    <span className="flex items-center gap-1.5">
                      {temDetalhe ? (
                        aberta ? (
                          <ChevronDown className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                        )
                      ) : (
                        <span className="w-3.5 flex-shrink-0" />
                      )}
                      <span className={`text-sm ${l.destaque ? 'font-bold text-white' : 'text-slate-300'}`}>
                        {l.label}
                      </span>
                    </span>
                    <span
                      className={`text-sm font-mono ${l.destaque ? 'font-bold' : ''} ${
                        l.valor >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {brl(l.valor)}
                    </span>
                  </div>

                  {aberta && detalhe && (
                    <div className="ml-6 mb-2 mt-1 p-3 rounded-lg bg-white/[0.02] border border-white/[0.05] grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5 font-semibold">
                          Por turma
                        </p>
                        {detalhe.porTurma.length === 0 ? (
                          <p className="text-xs text-slate-500">Sem lançamentos no período.</p>
                        ) : (
                          <div className="space-y-1">
                            {detalhe.porTurma.map((d, idx) => (
                              <div key={idx} className="flex items-center justify-between text-xs">
                                <span className="text-slate-300 truncate pr-2">{d.turma}</span>
                                <span className="text-slate-400 font-mono flex-shrink-0">{brl(d.valor)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      {detalhe.porFornecedor.length > 0 && (
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5 font-semibold">
                            Por fornecedor / descrição
                          </p>
                          <div className="space-y-1">
                            {detalhe.porFornecedor.map((d, idx) => (
                              <div key={idx} className="flex items-center justify-between text-xs">
                                <span className="text-slate-300 truncate pr-2">{d.turma}</span>
                                <span className="text-slate-400 font-mono flex-shrink-0">{brl(d.valor)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
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

          {receitaPrestacaoServicos > 0 && (
            <div className="bg-[#111820] border border-white/[0.06] rounded-xl p-5">
              <h3 className="text-sm font-semibold text-white mb-1">Receita por Tipo</h3>
              <p className="text-xs text-slate-400 mb-4">
                Formaturas (turmas) x Prestação de Serviços (ensaios, festas e eventos avulsos, sem
                turma vinculada a um curso/faculdade).
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-white/[0.02] border border-white/[0.05]">
                  <span className="text-xs text-slate-400">Formaturas</span>
                  <div className="text-xl font-bold text-emerald-400 mt-1">{brl(receitaFormaturas)}</div>
                </div>
                <div className="p-4 rounded-lg bg-white/[0.02] border border-white/[0.05]">
                  <span className="text-xs text-slate-400">Prestação de Serviços</span>
                  <div className="text-xl font-bold text-orange-400 mt-1">
                    {brl(receitaPrestacaoServicos)}
                  </div>
                </div>
              </div>
            </div>
          )}

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
                    <Bar dataKey="receita" name="Receita" fill="#34D399" radius={[4, 4, 0, 0]} />
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
