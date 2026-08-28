import { useCallback, useEffect, useMemo, useState } from 'react'
import { UserPlus, TrendingUp, DollarSign, Percent, ArrowUp, ArrowDown } from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { supabase } from '@/lib/supabase/client'
import { fetchAllRows } from '@/utils/fetchAllRows'
import EmpresaFilterBar from '@/components/EmpresaFilterBar'
import { SortControl, sortByField, type SortDirection } from '@/components/SortControl'
import { useAcesso } from '@/context/AcessoContext'

function normalizar(s?: string | null): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

/** Empresas conhecidas (marcas internas). O texto da turma vindo do SGE sempre
 * começa com esse prefixo, ex.: "AIF Medicina FASA turma 7 2027.2 Itabuna". */
const EMPRESA_PREFIXES = ['AIF-SSA', 'AIF-V', 'AIF', 'AFF', 'SFF', 'AIM']

function extractEmpresaFromTurma(turma: string | null): string | null {
  if (!turma) return null
  const primeiro = turma.trim().split(/\s+/)[0]
  return EMPRESA_PREFIXES.includes(primeiro) ? primeiro : null
}

interface Adesao {
  id: number
  codigo_sge: string
  data_adesao: string
  cliente: string | null
  plano: string | null
  valor: number
  status: string
  turma: string | null
}

type Periodo = 'mes' | 'trimestre' | 'semestre' | 'ano' | 'personalizado'

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function calcularPeriodo(periodo: Periodo, anoBase: number, mesBase: number): { ini: string; fim: string } {
  if (periodo === 'mes') {
    return { ini: toISO(new Date(anoBase, mesBase, 1)), fim: toISO(new Date(anoBase, mesBase + 1, 0)) }
  }
  if (periodo === 'trimestre') {
    const inicioTri = Math.floor(mesBase / 3) * 3
    return {
      ini: toISO(new Date(anoBase, inicioTri, 1)),
      fim: toISO(new Date(anoBase, inicioTri + 3, 0)),
    }
  }
  if (periodo === 'semestre') {
    const inicioSem = mesBase < 6 ? 0 : 6
    return {
      ini: toISO(new Date(anoBase, inicioSem, 1)),
      fim: toISO(new Date(anoBase, inicioSem + 6, 0)),
    }
  }
  return { ini: toISO(new Date(anoBase, 0, 1)), fim: toISO(new Date(anoBase, 11, 31)) }
}

/** Desloca um período um ano pra trás, pra comparação ano a ano. */
function periodoAnoAnterior(ini: string, fim: string): { ini: string; fim: string } {
  const di = new Date(`${ini}T00:00:00`)
  const df = new Date(`${fim}T00:00:00`)
  di.setFullYear(di.getFullYear() - 1)
  df.setFullYear(df.getFullYear() - 1)
  return { ini: toISO(di), fim: toISO(df) }
}

function brl(v: number): string {
  return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

/** Detecta se a "adesão" é na verdade um evento avulso/prestação de serviço
 * (ensaio, festa, colação avulsa) e não uma adesão de formatura de verdade —
 * mesma regra usada na sincronização das turmas. */
function isPrestacaoServico(turma: string | null): boolean {
  if (!turma) return false
  return /presta[cç][aã]o de servi|eventos extras|ensaios?\s|festas?\s|administradora de fundo/i.test(
    turma,
  )
}

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  delta,
}: {
  label: string
  value: string
  sub?: string
  icon: typeof UserPlus
  delta?: number | null
}) {
  return (
    <div className="bg-[#111820] border border-white/[0.06] rounded-xl p-5 hover:border-white/[0.14] transition-all shadow-lg">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-slate-400">{label}</span>
        <div className="w-9 h-9 rounded-full flex items-center justify-center bg-orange-500/15 text-orange-400">
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
      {delta !== undefined && delta !== null && !Number.isNaN(delta) && (
        <div
          className={`flex items-center gap-1 text-xs font-medium mt-2 ${
            delta >= 0 ? 'text-emerald-400' : 'text-rose-400'
          }`}
        >
          {delta >= 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
          {Math.abs(delta).toFixed(1)}% vs. mesmo período do ano passado
        </div>
      )}
    </div>
  )
}

/** Agrupa as adesões por balde de tempo (dia ou mês), conforme o
 * tamanho do período selecionado — período de um mês agrupa por dia,
 * períodos maiores (trimestre/semestre/ano) agrupam por mês. */
function agruparPorBalde(
  adesoes: Adesao[],
  ini: string,
  fim: string,
  granularidade: 'dia' | 'mes',
): { chave: string; label: string; quantidade: number; valor: number }[] {
  const baldes = new Map<string, { label: string; quantidade: number; valor: number }>()
  const di = new Date(`${ini}T00:00:00`)
  const df = new Date(`${fim}T00:00:00`)

  if (granularidade === 'dia') {
    for (let d = new Date(di); d <= df; d.setDate(d.getDate() + 1)) {
      const chave = toISO(d)
      baldes.set(chave, { label: String(d.getDate()), quantidade: 0, valor: 0 })
    }
  } else {
    for (let d = new Date(di.getFullYear(), di.getMonth(), 1); d <= df; d.setMonth(d.getMonth() + 1)) {
      const chave = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`
      baldes.set(chave, {
        label: d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''),
        quantidade: 0,
        valor: 0,
      })
    }
  }

  for (const a of adesoes) {
    if (!a.data_adesao || a.data_adesao < ini || a.data_adesao > fim) continue
    const chave = granularidade === 'dia' ? a.data_adesao.slice(0, 10) : a.data_adesao.slice(0, 7)
    const balde = baldes.get(chave)
    if (balde) {
      balde.quantidade += 1
      balde.valor += Number(a.valor || 0)
    }
  }

  return Array.from(baldes.entries()).map(([chave, b]) => ({ chave, ...b }))
}

type TurmaRef = {
  curso: string | null
  faculdade: string | null
  turma: string | null
  closer: string | null
  sdr: string | null
  user_id: string | null
}

export default function Adesoes() {
  const [adesoes, setAdesoes] = useState<Adesao[]>([])
  const [loading, setLoading] = useState(true)

  // Filtro pessoal "Responsável" — casa o texto da turma da adesão (vindo do SGE)
  // com uma turma cadastrada e o closer/SDR dela.
  const { minhaVisao, filtroPessoalAtivo } = useAcesso()
  const [turmasRef, setTurmasRef] = useState<TurmaRef[]>([])
  useEffect(() => {
    supabase
      .from('turmas')
      .select('curso, faculdade, turma, closer, sdr, user_id')
      .then(({ data }) => setTurmasRef((data as TurmaRef[]) || []))
  }, [])

  const adesaoVisivel = useCallback(
    (turmaTexto: string | null) => {
      if (!filtroPessoalAtivo || !turmaTexto) return true
      const t = normalizar(turmaTexto)
      const candidatas = turmasRef.filter((r) => {
        const curso = normalizar(r.curso)
        const fac = normalizar(r.faculdade)
        const num = String(r.turma || '').match(/\d+/)?.[0] || ''
        return (
          !!curso &&
          t.includes(curso) &&
          !!fac &&
          t.includes(fac) &&
          (!num || t.includes(`turma ${num}`))
        )
      })
      if (candidatas.length === 0) return true // não bate com turma cadastrada → aparece pra todos
      return candidatas.some((r) => minhaVisao({ nomes: [r.closer, r.sdr], ownerId: r.user_id }))
    },
    [filtroPessoalAtivo, turmasRef, minhaVisao],
  )
  const [periodo, setPeriodo] = useState<Periodo>('mes')
  const hoje = new Date()
  const inicial = calcularPeriodo('mes', hoje.getFullYear(), hoje.getMonth())
  const [dtIni, setDtIni] = useState(inicial.ini)
  const [dtFim, setDtFim] = useState(inicial.fim)
  const [incluirPrestacaoServico, setIncluirPrestacaoServico] = useState(false)

  // Filtro por empresa (AIF, AFF, SFF, AIM...) — nenhum selecionado = todas.
  const [selectedEmpresas, setSelectedEmpresas] = useState<string[]>([])

  // Ordenação das listas
  const TURMA_SORT_OPTIONS = [
    { value: 'quantidade', label: 'Quantidade' },
    { value: 'valor', label: 'Valor' },
    { value: 'turma', label: 'Turma (A-Z)' },
  ]
  const ADESAO_SORT_OPTIONS = [
    { value: 'data_adesao', label: 'Data' },
    { value: 'valor', label: 'Valor' },
    { value: 'turma', label: 'Turma (A-Z)' },
    { value: 'plano', label: 'Plano' },
  ]
  const [sortFieldTurma, setSortFieldTurma] = useState('quantidade')
  const [sortDirTurma, setSortDirTurma] = useState<SortDirection>('desc')
  const [sortFieldAdesoes, setSortFieldAdesoes] = useState('data_adesao')
  const [sortDirAdesoes, setSortDirAdesoes] = useState<SortDirection>('desc')
  const empresaOptions = useMemo(() => {
    const set = new Set<string>()
    adesoes.forEach((a) => {
      const emp = extractEmpresaFromTurma(a.turma)
      if (emp) set.add(emp)
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [adesoes])

  function selecionarPeriodo(p: Periodo) {
    setPeriodo(p)
    if (p !== 'personalizado') {
      const { ini, fim } = calcularPeriodo(p, hoje.getFullYear(), hoje.getMonth())
      setDtIni(ini)
      setDtFim(fim)
    }
  }

  useEffect(() => {
    async function load() {
      setLoading(true)
      // PostgREST corta em 1000 linhas por resposta — com o histórico de 2025
      // importado a tabela passa disso, então precisa paginar pra não perder
      // as adesões mais recentes (que ficam no fim da ordenação ascendente).
      const data = await fetchAllRows<Adesao>(() =>
        supabase
          .from('sge_adesoes')
          .select('id, codigo_sge, data_adesao, cliente, plano, valor, status, turma')
          .not('data_adesao', 'is', null)
          .order('data_adesao', { ascending: true }),
      )
      setAdesoes(data)
      setLoading(false)
    }
    load()
  }, [])

  const analise = useMemo(() => {
    const anoAnterior = periodoAnoAnterior(dtIni, dtFim)
    const semServico = (a: Adesao) => incluirPrestacaoServico || !isPrestacaoServico(a.turma)
    const dentroEmpresa = (a: Adesao) =>
      selectedEmpresas.length === 0 || selectedEmpresas.includes(extractEmpresaFromTurma(a.turma) || '')
    const doResponsavel = (a: Adesao) => adesaoVisivel(a.turma)

    const noPeriodoTodos = adesoes.filter(
      (a) =>
        a.status !== 'cancelado' &&
        a.data_adesao >= dtIni &&
        a.data_adesao <= dtFim &&
        dentroEmpresa(a) &&
        doResponsavel(a),
    )
    const noPeriodo = noPeriodoTodos.filter(semServico)
    const noPeriodoAnterior = adesoes.filter(
      (a) =>
        a.status !== 'cancelado' &&
        a.data_adesao >= anoAnterior.ini &&
        a.data_adesao <= anoAnterior.fim &&
        semServico(a) &&
        dentroEmpresa(a) &&
        doResponsavel(a),
    )

    const prestacaoServicoNoPeriodo = noPeriodoTodos.filter((a) => isPrestacaoServico(a.turma))
    const qtdPrestacaoServico = prestacaoServicoNoPeriodo.length
    const valorPrestacaoServico = prestacaoServicoNoPeriodo.reduce(
      (acc, a) => acc + Number(a.valor || 0),
      0,
    )

    const totalAdesoes = noPeriodo.length
    const totalValor = noPeriodo.reduce((acc, a) => acc + Number(a.valor || 0), 0)
    const ticketMedio = totalAdesoes ? totalValor / totalAdesoes : 0

    const totalAnoAnterior = noPeriodoAnterior.length
    const valorAnoAnterior = noPeriodoAnterior.reduce((acc, a) => acc + Number(a.valor || 0), 0)

    const deltaQuantidade = totalAnoAnterior
      ? ((totalAdesoes - totalAnoAnterior) / totalAnoAnterior) * 100
      : null
    const deltaValor = valorAnoAnterior
      ? ((totalValor - valorAnoAnterior) / valorAnoAnterior) * 100
      : null

    const adesoesFiltradas = adesoes.filter((a) => semServico(a) && dentroEmpresa(a) && doResponsavel(a))
    const granularidade: 'dia' | 'mes' = periodo === 'mes' ? 'dia' : 'mes'
    const baldesAtual = agruparPorBalde(adesoesFiltradas, dtIni, dtFim, granularidade)
    const baldesAnterior = agruparPorBalde(
      adesoesFiltradas,
      anoAnterior.ini,
      anoAnterior.fim,
      granularidade,
    )

    const grafico = baldesAtual.map((b, i) => ({
      label: b.label,
      'Este período': b.quantidade,
      'Mesmo período ano passado': baldesAnterior[i]?.quantidade || 0,
    }))

    const porTurma: Record<string, { turma: string; quantidade: number; valor: number }> = {}
    for (const a of noPeriodo) {
      const nome = a.turma || 'Sem turma'
      if (!porTurma[nome]) porTurma[nome] = { turma: nome, quantidade: 0, valor: 0 }
      porTurma[nome].quantidade += 1
      porTurma[nome].valor += Number(a.valor || 0)
    }

    return {
      totalAdesoes,
      totalValor,
      ticketMedio,
      totalAnoAnterior,
      deltaQuantidade,
      deltaValor,
      grafico,
      noPeriodo: [...noPeriodo].sort((a, b) => b.data_adesao.localeCompare(a.data_adesao)),
      porTurma: Object.values(porTurma).sort((a, b) => b.quantidade - a.quantidade),
      qtdPrestacaoServico,
      valorPrestacaoServico,
    }
  }, [adesoes, dtIni, dtFim, periodo, incluirPrestacaoServico, selectedEmpresas, adesaoVisivel])

  const porTurmaOrdenado = useMemo(
    () => sortByField(analise.porTurma, sortFieldTurma, sortDirTurma, (t, f) => (t as any)[f]),
    [analise.porTurma, sortFieldTurma, sortDirTurma],
  )
  const noPeriodoOrdenado = useMemo(
    () => sortByField(analise.noPeriodo, sortFieldAdesoes, sortDirAdesoes, (a, f) => (a as any)[f]),
    [analise.noPeriodo, sortFieldAdesoes, sortDirAdesoes],
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Adesões</h1>
          <p className="text-sm text-slate-400 mt-1">
            Quantidade de adesões por dia, mês, trimestre, semestre e ano — com comparativo automático
            contra o mesmo período do ano passado. Dados acumulados direto do SGE.
          </p>
        </div>
        <EmpresaFilterBar
          options={empresaOptions}
          selected={selectedEmpresas}
          onChange={setSelectedEmpresas}
        />
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

        <label className="flex items-center gap-1.5 ml-auto text-xs text-slate-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={incluirPrestacaoServico}
            onChange={(e) => setIncluirPrestacaoServico(e.target.checked)}
            className="accent-orange-500"
          />
          Incluir Prestação de Serviços (ensaios, festas, eventos avulsos)
        </label>
      </div>

      {!loading && !incluirPrestacaoServico && analise.qtdPrestacaoServico > 0 && (
        <div className="text-xs text-slate-400 bg-white/[0.02] border border-white/[0.06] rounded-lg px-3 py-2">
          {analise.qtdPrestacaoServico} venda(s) de Prestação de Serviço ({brl(analise.valorPrestacaoServico)})
          neste período não estão contadas acima — são ensaios/festas avulsas, não adesões de formatura.
          Marque a caixa acima pra incluí-las.
        </div>
      )}

      {loading ? (
        <div className="p-8 text-center text-slate-400 text-sm">Carregando...</div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              label="Adesões no Período"
              value={String(analise.totalAdesoes)}
              sub={`${analise.totalAnoAnterior} no mesmo período do ano passado`}
              icon={UserPlus}
              delta={analise.deltaQuantidade}
            />
            <KpiCard
              label="Valor Total"
              value={brl(analise.totalValor)}
              icon={DollarSign}
              delta={analise.deltaValor}
            />
            <KpiCard label="Ticket Médio" value={brl(analise.ticketMedio)} icon={TrendingUp} />
            <KpiCard
              label="Variação Anual"
              value={
                analise.deltaQuantidade === null ? '—' : `${analise.deltaQuantidade >= 0 ? '+' : ''}${analise.deltaQuantidade.toFixed(1)}%`
              }
              sub="em quantidade de adesões"
              icon={Percent}
            />
          </div>

          <div className="bg-[#111820] border border-white/[0.06] rounded-xl p-5">
            <h2 className="text-sm font-semibold text-white mb-4">
              Adesões por {periodo === 'mes' ? 'dia' : 'mês'} — este período vs. ano passado
            </h2>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={analise.grafico}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                <XAxis dataKey="label" stroke="#94a3b8" fontSize={12} />
                <YAxis stroke="#94a3b8" fontSize={12} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#111820',
                    border: '1px solid #ffffff1a',
                    borderRadius: 8,
                    color: '#f8fafc',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Este período" fill="#f97316" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Mesmo período ano passado" fill="#475569" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-[#111820] border border-white/[0.06] rounded-xl p-5">
              <div className="flex items-center justify-between mb-4 gap-2">
                <h2 className="text-sm font-semibold text-white">Adesões por Turma no Período</h2>
                <SortControl
                  options={TURMA_SORT_OPTIONS}
                  field={sortFieldTurma}
                  direction={sortDirTurma}
                  onFieldChange={setSortFieldTurma}
                  onDirectionToggle={() => setSortDirTurma((d) => (d === 'asc' ? 'desc' : 'asc'))}
                  triggerClassName="w-[140px]"
                />
              </div>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {porTurmaOrdenado.length === 0 && (
                  <p className="text-xs text-slate-500">Nenhuma adesão registrada neste período.</p>
                )}
                {porTurmaOrdenado.map((t) => (
                  <div
                    key={t.turma}
                    className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.04] text-sm"
                  >
                    <span className="text-slate-200 truncate pr-2">{t.turma}</span>
                    <span className="flex items-center gap-3 flex-shrink-0">
                      <span className="text-orange-400 font-semibold">{t.quantidade}</span>
                      <span className="text-slate-400 text-xs">{brl(t.valor)}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-[#111820] border border-white/[0.06] rounded-xl p-5">
              <div className="flex items-center justify-between mb-4 gap-2">
                <h2 className="text-sm font-semibold text-white">Últimas Adesões</h2>
                <SortControl
                  options={ADESAO_SORT_OPTIONS}
                  field={sortFieldAdesoes}
                  direction={sortDirAdesoes}
                  onFieldChange={setSortFieldAdesoes}
                  onDirectionToggle={() => setSortDirAdesoes((d) => (d === 'asc' ? 'desc' : 'asc'))}
                  triggerClassName="w-[140px]"
                />
              </div>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {noPeriodoOrdenado.length === 0 && (
                  <p className="text-xs text-slate-500">Nenhuma adesão registrada neste período.</p>
                )}
                {noPeriodoOrdenado.slice(0, 50).map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.04] text-sm"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="text-slate-200 truncate">{a.turma || 'Sem turma'}</div>
                      <div className="text-[11px] text-slate-500">
                        {new Date(`${a.data_adesao}T00:00:00`).toLocaleDateString('pt-BR')}
                        {a.plano ? ` • ${a.plano}` : ''}
                      </div>
                    </div>
                    <span className="text-emerald-400 font-semibold text-xs flex-shrink-0">
                      {brl(Number(a.valor || 0))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
