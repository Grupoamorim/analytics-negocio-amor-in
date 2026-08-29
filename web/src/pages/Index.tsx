import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Users,
  Trophy,
  Target,
  GraduationCap,
  TrendingUp,
  Gauge,
  ArrowUpRight,
  Building2,
  BookOpen,
  AlertTriangle,
} from 'lucide-react'
import { useCRM } from '@/context/CRMContext'
import EmpresaFilterBar from '@/components/EmpresaFilterBar'
import PeriodoFiltroBar from '@/components/PeriodoFiltroBar'
import { usePeriodoFiltro } from '@/hooks/usePeriodoFiltro'
import { SortControl, sortByField, type SortDirection } from '@/components/SortControl'
import KpiCard from '@/components/dashboard/KpiCard'
import SectionTitle from '@/components/dashboard/SectionTitle'
import InfoHint from '@/components/dashboard/InfoHint'
import PaceBand from '@/components/dashboard/PaceBand'
import AIInsightsButton from '@/components/AIInsightsButton'
import { useMetasNegocio } from '@/hooks/useMetasNegocio'
import { getTurmaDisplayName, FUNNEL_STAGE_BY_ID, daysInCurrentStage } from '@/types/crm'
import {
  funilAberto,
  desfechos,
  alunosFechadosNoPeriodo,
  rankingPorResponsavel,
  rankingPorFaculdade,
  rankingPorCurso,
  motivosDePerda,
  forecastPonderado,
  responsavelDaTurma,
  turmaEmAtendimento,
  pctSemResponsavel,
  distribuicao,
  pontosComerciais,
  type LinhaRanking,
} from '@/utils/comercialMetrics'

const brl = (v: number) => `R$ ${Math.round(v).toLocaleString('pt-BR')}`
const pct = (v: number) => `${v.toFixed(0)}%`

/** Dias sem movimento: usa o histórico de estágio quando existe, senão a última edição. */
function diasSemMovimento(deal: { stageHistory?: unknown[]; updatedAt: string }): number {
  const hist = (deal.stageHistory as { enteredAt: string }[] | undefined) || []
  if (hist.length > 0) return daysInCurrentStage(deal as never)
  const t = new Date(deal.updatedAt).getTime()
  return Number.isNaN(t) ? 0 : Math.floor((Date.now() - t) / 86400000)
}

export default function Index() {
  const { leads: allLeads = [], deals: allDeals = [], funilEventos = [], loading, error } = useCRM()

  const [selectedEmpresas, setSelectedEmpresas] = useState<string[]>([])
  const f = usePeriodoFiltro('ate_hoje')
  const periodo = useMemo(() => ({ ini: f.dtIni, fim: f.dtFim }), [f.dtIni, f.dtFim])

  const empresaOptions = useMemo(() => {
    const s = new Set<string>()
    allLeads.forEach((l) => l.empresa && s.add(l.empresa))
    return Array.from(s).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [allLeads])

  const leads = useMemo(() => {
    if (selectedEmpresas.length === 0) return allLeads
    return allLeads.filter((l) => l.empresa && selectedEmpresas.includes(l.empresa))
  }, [allLeads, selectedEmpresas])

  const leadIds = useMemo(() => new Set(leads.map((l) => l.id)), [leads])
  const deals = useMemo(
    () => (selectedEmpresas.length === 0 ? allDeals : allDeals.filter((d) => !d.leadId || leadIds.has(d.leadId))),
    [allDeals, selectedEmpresas, leadIds],
  )

  // --- Métricas ---------------------------------------------------------------
  const funil = useMemo(() => funilAberto(leads, deals), [leads, deals])
  const emAtendimento = useMemo(() => funil.reduce((a, s) => a + s.turmas, 0), [funil])
  const df = useMemo(() => desfechos(leads, periodo), [leads, periodo])
  const alunosPeriodo = useMemo(() => alunosFechadosNoPeriodo(leads, periodo), [leads, periodo])
  const forecast = useMemo(() => forecastPonderado(deals), [deals])
  const probMediaFunil = useMemo(() => {
    const abertos = deals.filter((d) => (d.stageId || 'stage-1') !== 'stage-6')
    if (abertos.length === 0) return 0
    return Math.round(abertos.reduce((a, d) => a + (d.probability ?? 0), 0) / abertos.length)
  }, [deals])

  const { metaVigente } = useMetasNegocio()
  const hoje = new Date().toISOString().slice(0, 10)
  const metaContratos = metaVigente('contratos', hoje) || metaVigente('alunos', hoje)
  const metaMetrica: 'contratos' | 'alunos' = metaContratos?.metrica === 'alunos' ? 'alunos' : 'contratos'
  const pontosMeta = useMemo(() => pontosComerciais(leads, metaMetrica), [leads, metaMetrica])

  const distCurso = useMemo(() => distribuicao(leads, (l) => l.curso), [leads])
  const distMarca = useMemo(() => distribuicao(leads, (l) => l.empresa || 'Sem marca'), [leads])

  const rankVend = useMemo(() => rankingPorResponsavel(leads, deals), [leads, deals])
  const rankFac = useMemo(() => rankingPorFaculdade(leads, deals), [leads, deals])
  const rankCurso = useMemo(() => rankingPorCurso(leads, deals), [leads, deals])
  const motivos = useMemo(() => motivosDePerda(leads, deals, funilEventos), [leads, deals, funilEventos])

  // Turmas em atendimento detalhadas
  const dealByLead = useMemo(() => new Map(deals.map((d) => [d.leadId, d])), [deals])
  const turmasAtivas = useMemo(() => {
    return leads
      .filter(turmaEmAtendimento)
      .map((l) => {
        const d = dealByLead.get(l.id)
        const stageId = d?.stageId && d.stageId !== 'stage-6' ? d.stageId : 'stage-1'
        return {
          lead: l,
          deal: d,
          stage: FUNNEL_STAGE_BY_ID[stageId],
          prob: d?.probability ?? 0,
          dias: d ? diasSemMovimento(d) : 0,
          responsavel: responsavelDaTurma(l),
        }
      })
  }, [leads, dealByLead])

  // --- Ordenação ------------------------------------------------------------
  const RANK_SORT = [
    { value: 'ganhas', label: 'Ganhas' },
    { value: 'emAtendimento', label: 'Em atendimento' },
    { value: 'winRate', label: 'Win rate' },
    { value: 'alunosFechados', label: 'Alunos fechados' },
    { value: 'probMedia', label: 'Prob. média' },
    { value: 'chave', label: 'Nome (A-Z)' },
  ]
  const [rankField, setRankField] = useState('ganhas')
  const [rankDir, setRankDir] = useState<SortDirection>('desc')
  const rankVendOrd = useMemo(
    () => sortByField(rankVend, rankField, rankDir, (r, k) => (r as unknown as Record<string, unknown>)[k]),
    [rankVend, rankField, rankDir],
  )

  const ATIVAS_SORT = [
    { value: 'dias', label: 'Dias parada' },
    { value: 'prob', label: 'Probabilidade' },
    { value: 'responsavel', label: 'Responsável' },
  ]
  const [ativasField, setAtivasField] = useState('dias')
  const [ativasDir, setAtivasDir] = useState<SortDirection>('desc')
  const turmasAtivasOrd = useMemo(
    () => sortByField(turmasAtivas, ativasField, ativasDir, (t, k) => (t as unknown as Record<string, unknown>)[k]),
    [turmasAtivas, ativasField, ativasDir],
  )

  const maxFunil = Math.max(...funil.map((s) => s.turmas), 1)
  const maxMotivo = Math.max(...motivos.map((m) => m.n), 1)

  return (
    <div className="space-y-8 animate-fade-in">
      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          Erro ao carregar dados: {error}
        </div>
      )}

      {/* Cabeçalho */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-white/[0.06]">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-white tracking-tight">Painel Comercial</h1>
          <p className="text-sm text-slate-400 mt-1">
            Funil, conversão e desempenho de vendas — dados ao vivo do CRM.
          </p>
        </div>
        <EmpresaFilterBar options={empresaOptions} selected={selectedEmpresas} onChange={setSelectedEmpresas} />
      </div>

      <PeriodoFiltroBar {...f} />
      <p className="text-[11px] text-slate-500 -mt-4 flex items-center gap-1.5">
        <InfoHint title="O que o período filtra">
          O período afeta só os números datados: <strong>ganhas no período</strong> e{' '}
          <strong>alunos fechados no período</strong> (pela data de fechamento do contrato). Funil
          aberto, win rate histórico e rankings são a fotografia de agora.
        </InfoHint>
        O período afeta ganhas e alunos fechados. Funil e rankings são a situação atual.
      </p>

      {/* ============ Meta & Pace ============ */}
      <PaceBand
        titulo={metaMetrica === 'alunos' ? 'Meta de alunos fechados' : 'Meta de contratos'}
        metrica={metaMetrica}
        meta={metaContratos}
        pontos={pontosMeta}
      />

      {/* ============ KPIs ============ */}
      <div className="flex items-center justify-between">
        <SectionTitle
          ajuda="Os 6 números que resumem a saúde comercial: quanto tem em jogo, o quão bem convertemos e o que já entrou no período."
        >
          Indicadores
        </SectionTitle>
        <AIInsightsButton context="dashboard-kpis" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard
          label="Turmas em atendimento"
          value={String(emAtendimento)}
          sub="no funil agora (fora ganhas/perdidas/formadas)"
          icon={GraduationCap}
          ajuda="Turmas com negociação em aberto — não conta as que já foram ganhas, perdidas ou já se formaram. É o trabalho comercial em andamento."
        />
        <KpiCard
          label="Win rate (histórico)"
          value={pct(df.winRateHistorico)}
          sub={`${df.ganhasHistorico} ganhas / ${df.perdidasHistorico} perdidas`}
          icon={Trophy}
          tom={df.winRateHistorico >= 50 ? 'verde' : 'ambar'}
          ajuda="Das turmas que tiveram desfecho, o % que fechou contrato = ganhas ÷ (ganhas + perdidas). É a régua real de eficácia comercial (ignora as que ainda estão em aberto)."
        />
        <KpiCard
          label="Ganhas no período"
          value={String(df.ganhasNoPeriodo)}
          sub={`de ${Math.round((df.coberturaDatas / 100) * df.ganhasHistorico)} turmas ganhas com data de fechamento`}
          icon={Target}
          tom="verde"
          ajuda={`Contratos fechados com data de fechamento dentro do período selecionado. Atenção: só ${df.coberturaDatas.toFixed(0)}% das turmas ganhas têm data de fechamento cadastrada — cadastre a data em Turmas para o número do período ficar completo.`}
        />
        <KpiCard
          label="Alunos fechados no período"
          value={String(alunosPeriodo.alunos)}
          sub={`${alunosPeriodo.turmas} turmas • ${alunosPeriodo.semData} ganhas sem data`}
          icon={Users}
          ajuda="Soma de alunos que assinaram contrato (dado do SGE), nas turmas cujo contrato fechou dentro do período. Turmas ganhas sem data de fechamento não entram."
        />
        <KpiCard
          label="Forecast ponderado"
          value={brl(forecast.valorPonderado)}
          sub={`bruto ${brl(forecast.valorBruto)} • ${forecast.semValor} turmas sem valor`}
          icon={TrendingUp}
          ajuda="Soma do valor de cada turma aberta multiplicado pela sua probabilidade do motor. É a receita realista esperada do funil. Hoje muitas turmas estão sem valor cadastrado — preencha em Turmas para o número ficar fiel."
        />
        <KpiCard
          label="Probabilidade média do funil"
          value={pct(probMediaFunil)}
          sub="média do motor entre as turmas abertas"
          icon={Gauge}
          ajuda="Média da probabilidade calculada pelo motor (Probabilidade) entre todas as turmas em atendimento. Caindo = funil esfriando; subindo = negociações amadurecendo."
        />
      </div>

      {/* ============ Funil aberto ============ */}
      <div className="bg-[#111820] border border-white/[0.06] rounded-xl p-6 shadow-lg">
        <SectionTitle
          ajuda="Quantas turmas em atendimento estão em cada etapa, da Prospecção à Decisão. Um funil saudável afunila de forma suave; muitos casos presos numa etapa = gargalo ali."
          right={
            <Link to="/pipeline" className="text-xs text-orange-400 hover:underline flex items-center gap-1">
              Abrir Funil <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          }
        >
          Funil aberto por etapa
        </SectionTitle>
        <div className="space-y-3 mt-4">
          {funil.map((s) => (
            <div key={s.id} className="space-y-1">
              <div className="flex justify-between items-center text-xs">
                <span className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.cor }} />
                  <span className="font-medium text-slate-200">{s.nome}</span>
                </span>
                <span className="flex items-center gap-3 text-slate-400">
                  <span className="text-white font-semibold">{s.turmas}</span> turmas
                  <span>•</span>
                  <span>{s.alunos} alunos</span>
                  <span>•</span>
                  <span>prob. {s.probMedia}%</span>
                </span>
              </div>
              <div className="w-full h-3 bg-white/[0.05] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.max(4, (s.turmas / maxFunil) * 100)}%`, backgroundColor: s.cor, opacity: 0.85 }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ============ Ranking de Vendedores ============ */}
      <div className="bg-[#111820] border border-white/[0.06] rounded-xl p-6 shadow-lg">
        <SectionTitle
          ajuda="Comparativo por closer/SDR responsável pela turma. Win rate = fechadas ÷ (fechadas + perdidas). Prob. média = leitura do motor sobre as turmas que a pessoa está tocando (quão promissora é a carteira dela). Penetração = alunos que assinaram ÷ total de alunos das turmas ganhas."
          right={
            <SortControl
              options={RANK_SORT}
              field={rankField}
              direction={rankDir}
              onFieldChange={setRankField}
              onDirectionToggle={() => setRankDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
              triggerClassName="w-[150px] bg-[#0a0f14] border-white/10 text-slate-300"
            />
          }
        >
          Ranking de Vendedores
        </SectionTitle>
        {pctSemResponsavel(leads) > 20 && (
          <p className="mt-2 text-[11px] text-amber-400/90 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
            {pctSemResponsavel(leads).toFixed(0)}% das turmas estão sem Closer/SDR cadastrado — esse
            volume cai em "Sem responsável". Preencha em Turmas para o ranking ficar fiel.
          </p>
        )}
        <div className="overflow-x-auto mt-4">
          <table className="w-full text-xs min-w-[620px]">
            <thead>
              <tr className="text-left text-slate-500 text-[10px] uppercase tracking-wider border-b border-white/[0.06]">
                <th className="py-2 pr-3">Vendedor</th>
                <th className="py-2 px-2 text-right">Em atend.</th>
                <th className="py-2 px-2 text-right">Ganhas</th>
                <th className="py-2 px-2 text-right">Perdidas</th>
                <th className="py-2 px-2 text-right">Win rate</th>
                <th className="py-2 px-2 text-right">Prob. média</th>
                <th className="py-2 pl-2 text-right">Alunos fech.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {rankVendOrd.map((r: LinhaRanking) => (
                <tr key={r.chave} className="hover:bg-white/[0.02]">
                  <td className="py-2.5 pr-3 text-slate-200 font-medium whitespace-nowrap">{r.chave}</td>
                  <td className="py-2.5 px-2 text-right text-white">{r.emAtendimento}</td>
                  <td className="py-2.5 px-2 text-right text-emerald-400 font-semibold">{r.ganhas}</td>
                  <td className="py-2.5 px-2 text-right text-rose-400">{r.perdidas}</td>
                  <td
                    className={`py-2.5 px-2 text-right font-semibold ${
                      r.winRate >= 60 ? 'text-emerald-400' : r.winRate >= 35 ? 'text-amber-400' : 'text-rose-400'
                    }`}
                  >
                    {r.ganhas + r.perdidas > 0 ? pct(r.winRate) : '—'}
                  </td>
                  <td className="py-2.5 px-2 text-right text-slate-300">
                    {r.emAtendimento > 0 ? `${r.probMedia}%` : '—'}
                  </td>
                  <td className="py-2.5 pl-2 text-right text-white">{r.alunosFechados}</td>
                </tr>
              ))}
              {rankVendOrd.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-slate-500">
                    Nenhuma turma com responsável cadastrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ============ Faculdade + Curso ============ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RankingMini titulo="Por Faculdade" icon={Building2} linhas={rankFac}
          ajuda="Onde a marca converte melhor. Win rate por faculdade ajuda a priorizar prospecção nas instituições onde já temos tração e reputação." />
        <RankingMini titulo="Por Curso" icon={BookOpen} linhas={rankCurso}
          ajuda="Quais cursos fecham mais contratos e trazem mais alunos. Cursos com muitas turmas ganhas e turmas grandes são os de maior retorno por esforço." />
      </div>

      {/* ============ Distribuição por Curso / Marca ============ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DistribuicaoCard
          titulo="Distribuição por Curso"
          ajuda={`Quantas turmas e alunos temos em cada curso — a base de mercado onde a Amor In atua. % sobre o total de ${distCurso.totalTurmas} turmas e ${distCurso.totalAlunos} alunos.`}
          dados={distCurso}
        />
        <DistribuicaoCard
          titulo="Distribuição por Marca"
          ajuda="Turmas e alunos por marca interna (AIF, AFF, AIF-V...). Mostra o peso de cada marca na carteira comercial."
          dados={distMarca}
        />
      </div>

      {/* ============ Turmas em atendimento ============ */}
      <div className="bg-[#111820] border border-white/[0.06] rounded-xl p-6 shadow-lg">
        <SectionTitle
          ajuda="Toda turma com negociação aberta, com a etapa atual, a probabilidade do motor, o responsável e há quantos dias sem movimento. Priorize as de alta probabilidade paradas há muito tempo — é dinheiro na mesa esfriando."
          right={
            <SortControl
              options={ATIVAS_SORT}
              field={ativasField}
              direction={ativasDir}
              onFieldChange={setAtivasField}
              onDirectionToggle={() => setAtivasDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
              triggerClassName="w-[150px] bg-[#0a0f14] border-white/10 text-slate-300"
            />
          }
        >
          Turmas em atendimento ({turmasAtivas.length})
        </SectionTitle>
        <div className="mt-4 space-y-2 max-h-[420px] overflow-y-auto pr-1">
          {turmasAtivasOrd.map(({ lead, stage, prob, dias, responsavel }) => {
            const alerta = stage ? dias >= stage.stagnationAlertDays : false
            return (
              <Link
                key={lead.id}
                to="/pipeline"
                className="flex items-center gap-3 p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04] hover:border-white/[0.12] transition-colors"
              >
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: stage?.color || '#64748b' }}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-white truncate">{getTurmaDisplayName(lead)}</div>
                  <div className="text-[10px] text-slate-400 truncate">
                    {stage?.name} • {responsavel}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-xs font-bold text-slate-200">{prob}%</div>
                  <div className={`text-[10px] ${alerta ? 'text-amber-400' : 'text-slate-500'}`}>
                    {dias}d parada
                  </div>
                </div>
              </Link>
            )
          })}
          {turmasAtivas.length === 0 && (
            <div className="text-center text-xs text-slate-500 py-6">Nenhuma turma em atendimento.</div>
          )}
        </div>
      </div>

      {/* ============ Motivos de perda ============ */}
      <div className="bg-[#111820] border border-white/[0.06] rounded-xl p-6 shadow-lg">
        <SectionTitle ajuda="Por que perdemos contratos, do mais frequente ao menos. É o mapa do que atacar: se 'preço' lidera, revise proposta/ancoragem; se 'sem resposta', reforce cadência de follow-up.">
          Motivos de perda
        </SectionTitle>
        <div className="mt-4 space-y-2">
          {motivos.map((m) => (
            <div key={m.motivo} className="flex items-center gap-3 text-xs">
              <span className="w-[160px] flex-shrink-0 text-slate-300 truncate">{m.motivo}</span>
              <div className="flex-1 h-3 bg-white/[0.05] rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-rose-500/70" style={{ width: `${(m.n / maxMotivo) * 100}%` }} />
              </div>
              <span className="w-8 text-right font-semibold text-white">{m.n}</span>
            </div>
          ))}
          {motivos.length === 0 && (
            <div className="text-center text-xs text-slate-500 py-4">
              Nenhum motivo de perda registrado. Cadastre o motivo ao marcar uma turma como perdida no Funil.
            </div>
          )}
        </div>
      </div>

      {loading && allLeads.length === 0 && (
        <div className="text-center text-xs text-slate-500 py-4">Carregando dados do CRM…</div>
      )}
    </div>
  )
}

function DistribuicaoCard({
  titulo,
  ajuda,
  dados,
}: {
  titulo: string
  ajuda: React.ReactNode
  dados: ReturnType<typeof distribuicao>
}) {
  return (
    <div className="bg-[#111820] border border-white/[0.06] rounded-xl p-5 shadow-lg">
      <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
        {titulo}
        <InfoHint title={titulo}>{ajuda}</InfoHint>
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[400px]">
          <thead>
            <tr className="text-left text-slate-500 text-[10px] uppercase tracking-wider border-b border-white/[0.06]">
              <th className="py-2 pr-3">Nome</th>
              <th className="py-2 px-2 text-right">Turmas</th>
              <th className="py-2 px-2 text-right">Ganhas</th>
              <th className="py-2 px-2 text-right">Alunos</th>
              <th className="py-2 pl-2 text-right">% Turmas</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {dados.linhas.slice(0, 12).map((l) => (
              <tr key={l.chave} className="hover:bg-white/[0.02]">
                <td className="py-2 pr-3 text-slate-200 truncate max-w-[150px]">{l.chave}</td>
                <td className="py-2 px-2 text-right text-white font-semibold">{l.turmas}</td>
                <td className="py-2 px-2 text-right text-emerald-400">{l.ganhas}</td>
                <td className="py-2 px-2 text-right text-slate-300">{l.alunos}</td>
                <td className="py-2 pl-2 text-right text-orange-300">{l.pctTurmas.toFixed(0)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function RankingMini({
  titulo,
  icon: Icon,
  linhas,
  ajuda,
}: {
  titulo: string
  icon: typeof Building2
  linhas: LinhaRanking[]
  ajuda: React.ReactNode
}) {
  const top = [...linhas].sort((a, b) => b.ganhas - a.ganhas || b.emAtendimento - a.emAtendimento).slice(0, 8)
  return (
    <div className="bg-[#111820] border border-white/[0.06] rounded-xl p-5 shadow-lg">
      <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-orange-400" />
        {titulo}
        <InfoHint title={titulo}>{ajuda}</InfoHint>
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[420px]">
          <thead>
            <tr className="text-left text-slate-500 text-[10px] uppercase tracking-wider border-b border-white/[0.06]">
              <th className="py-2 pr-3">Nome</th>
              <th className="py-2 px-2 text-right">Ativas</th>
              <th className="py-2 px-2 text-right">Ganhas</th>
              <th className="py-2 px-2 text-right">Win rate</th>
              <th className="py-2 pl-2 text-right">Alunos fech.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {top.map((r) => (
              <tr key={r.chave} className="hover:bg-white/[0.02]">
                <td className="py-2 pr-3 text-slate-200 truncate max-w-[160px]">{r.chave}</td>
                <td className="py-2 px-2 text-right text-white">{r.emAtendimento}</td>
                <td className="py-2 px-2 text-right text-emerald-400 font-semibold">{r.ganhas}</td>
                <td className="py-2 px-2 text-right text-slate-300">
                  {r.ganhas + r.perdidas > 0 ? `${r.winRate.toFixed(0)}%` : '—'}
                </td>
                <td className="py-2 pl-2 text-right text-slate-300">{r.alunosFechados}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
