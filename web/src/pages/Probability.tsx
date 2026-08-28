import { useState, useMemo } from 'react'
import {
  TrendingUp,
  RefreshCw,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  BookOpen,
  Gauge,
  GraduationCap,
  Building2,
  Info,
} from 'lucide-react'
import { useCRM } from '@/context/CRMContext'
import { useToast } from '@/hooks/use-toast'
import AIInsightsButton from '@/components/AIInsightsButton'
import { SortControl, sortByField, type SortDirection } from '@/components/SortControl'
import {
  FUNNEL_STAGES,
  FUNNEL_STAGE_BY_ID,
  getTurmaDisplayName,
  type Deal,
  type Transcript,
  type AprendizadoEstudo,
} from '@/types/crm'
import { computeDealProbability, MOTOR_WEIGHTS, probColor } from '@/utils/funnelProbability'
import {
  computeEstudoAgregado,
  montarCorpusParaIA,
  gerarEstudoIA,
  type EstudoEscopo,
} from '@/utils/aprendizadoEngine'
import { getGeminiApiKey, getGeminiModel } from '@/utils/geminiApi'

type Tab = 'geral' | 'motor' | 'aprendizado' | 'relatorio'

const stageNome = (id?: string) => (id ? FUNNEL_STAGE_BY_ID[id]?.name || id : '—')

export default function Probability() {
  const {
    deals,
    leads,
    transcripts,
    funilEventos,
    estudos,
    dealProbById,
    recomputeAllProbabilities,
    upsertEstudo,
  } = useCRM()
  const { toast } = useToast()

  const [tab, setTab] = useState<Tab>('geral')
  const [recalculando, setRecalculando] = useState(false)

  const leadById = useMemo(() => new Map(leads.map((l) => [l.id, l])), [leads])

  // Deals ativos (não Fechou/Perdeu) com breakdown calculado ao vivo pelo motor
  const dealsComBreakdown = useMemo(() => {
    return deals
      .filter((d) => d.stageId !== 'stage-6' && d.stage !== 'fechou-ou-perdeu')
      .map((d) => {
        const info = dealProbById.get(d.id)
        return {
          deal: d,
          lead: d.leadId ? leadById.get(d.leadId) : undefined,
          score: info?.score ?? d.probability,
          breakdown:
            info?.breakdown ??
            ({
              base: d.probability,
              semReuniao: true,
              ajustePortao: 0,
              ajusteVelocidade: 0,
              ajusteCursoFac: 0,
              cursoFacN: 0,
              velocidadeLabel: 'saudável',
              final: d.probability,
            } as ReturnType<typeof computeDealProbability>['breakdown']),
        }
      })
  }, [deals, leadById, dealProbById])

  // Prospecção não entra na média nem no histograma (não é avaliável).
  const avaliaveis = useMemo(
    () => dealsComBreakdown.filter((x) => !x.breakdown.naoAvaliavel),
    [dealsComBreakdown],
  )

  const mediaGeral = useMemo(() => {
    if (avaliaveis.length === 0) return 0
    return Math.round(avaliaveis.reduce((a, x) => a + x.score, 0) / avaliaveis.length)
  }, [avaliaveis])

  const histogram = useMemo(() => {
    const b = { low: 0, medLow: 0, medHigh: 0, high: 0 }
    avaliaveis.forEach((x) => {
      if (x.score <= 25) b.low++
      else if (x.score <= 50) b.medLow++
      else if (x.score <= 75) b.medHigh++
      else b.high++
    })
    return b
  }, [avaliaveis])

  const ganhos = deals.filter((d) => d.outcome === 'ganho').length
  const perdidos = deals.filter((d) => d.outcome === 'perdido').length
  const reunioesAnalisadas = transcripts.filter((t) => t.analyzed || t.geminiAnalysis).length

  const handleRecalcular = async () => {
    setRecalculando(true)
    try {
      await recomputeAllProbabilities()
      toast({ title: 'Probabilidades recalculadas', description: `${deals.length} turmas.` })
    } finally {
      setRecalculando(false)
    }
  }

  const tabs: { id: Tab; label: string; icon: typeof Gauge }[] = [
    { id: 'geral', label: 'Visão Geral', icon: TrendingUp },
    { id: 'motor', label: 'Motor', icon: Gauge },
    { id: 'aprendizado', label: 'Aprendizado', icon: BookOpen },
    { id: 'relatorio', label: 'Relatório por Curso / Faculdade', icon: GraduationCap },
  ]

  return (
    <div className="space-y-6 animate-fade-in pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-white/[0.06]">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-white tracking-tight flex items-center gap-3">
            Probabilidade de Fechamento
            <AIInsightsButton context="probability" />
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Uma probabilidade só por turma: a análise da reunião manda, o funil só tempera.
          </p>
        </div>
        <button
          type="button"
          onClick={handleRecalcular}
          disabled={recalculando}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-sm font-semibold shadow-lg shadow-orange-500/20 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${recalculando ? 'animate-spin' : ''}`} />
          Recalcular todas
        </button>
      </div>

      {/* Abas */}
      <div className="flex gap-1 border-b border-white/[0.06] overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? 'border-orange-500 text-white'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'geral' && (
        <VisaoGeral
          media={mediaGeral}
          total={avaliaveis.length}
          totalFunil={dealsComBreakdown.length - avaliaveis.length}
          histogram={histogram}
          ganhos={ganhos}
          perdidos={perdidos}
          reunioes={reunioesAnalisadas}
        />
      )}
      {tab === 'motor' && <MotorTab linhas={dealsComBreakdown} />}
      {tab === 'aprendizado' && (
        <AprendizadoTab deals={deals} transcripts={transcripts} funilEventos={funilEventos} />
      )}
      {tab === 'relatorio' && (
        <RelatorioTab
          leads={leads}
          deals={deals}
          transcripts={transcripts}
          funilEventos={funilEventos}
          estudos={estudos}
          upsertEstudo={upsertEstudo}
        />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ Visão Geral */

function VisaoGeral({
  media,
  total,
  totalFunil,
  histogram,
  ganhos,
  perdidos,
  reunioes,
}: {
  media: number
  total: number
  totalFunil: number
  histogram: { low: number; medLow: number; medHigh: number; high: number }
  ganhos: number
  perdidos: number
  reunioes: number
}) {
  const dash = (media * 251.2) / 100
  return (
    <div className="space-y-6">
      <div className="bg-[#111820] border border-white/[0.06] rounded-2xl p-6 lg:p-8">
        <div className="flex flex-col lg:flex-row items-center gap-8">
          <div className="relative w-40 h-40 flex-shrink-0">
            <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
              <circle cx="50" cy="50" r="40" fill="transparent" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
              <circle
                cx="50"
                cy="50"
                r="40"
                fill="transparent"
                stroke={probColor(media)}
                strokeWidth="8"
                strokeDasharray={`${dash} 251.2`}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-4xl font-extrabold text-white">{media}%</span>
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                Média do funil
              </span>
            </div>
          </div>
          <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-4 w-full">
            <Kpi label="Turmas avaliadas (da Qualificação)" value={total} />
            <Kpi label="Reuniões analisadas" value={reunioes} />
            <Kpi label="Turmas ganhas (histórico)" value={ganhos} color="text-emerald-400" />
            <Kpi label="Turmas perdidas (histórico)" value={perdidos} color="text-rose-400" />
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-white/[0.06] space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold text-slate-300">Distribuição das probabilidades do funil</span>
            <span>
              {total} turmas{totalFunil > 0 ? ` · ${totalFunil} em Prospecção (sem probabilidade)` : ''}
            </span>
          </div>
          <div className="h-4 w-full bg-white/[0.04] rounded-full overflow-hidden flex gap-0.5 p-0.5">
            <Bar w={histogram.low} total={total} className="bg-rose-500 rounded-l-full" />
            <Bar w={histogram.medLow} total={total} className="bg-amber-500" />
            <Bar w={histogram.medHigh} total={total} className="bg-orange-500" />
            <Bar w={histogram.high} total={total} className="bg-emerald-500 rounded-r-full" />
          </div>
          <div className="flex justify-between text-[11px] text-slate-400 pt-1">
            <span>0-25% ({histogram.low})</span>
            <span>26-50% ({histogram.medLow})</span>
            <span>51-75% ({histogram.medHigh})</span>
            <span>76-100% ({histogram.high})</span>
          </div>
        </div>
      </div>

      <div className="bg-[#111820] border border-white/[0.06] rounded-xl p-5 text-sm text-slate-300 flex gap-3">
        <Info className="w-5 h-5 text-orange-400 flex-shrink-0 mt-0.5" />
        <p>
          A probabilidade de cada turma é calculada pelo motor: base na análise da reunião mais
          recente, ajustada levemente por portão de fase vencido e pela velocidade dentro da coluna
          (turma parada cai, turma rápida sobe). Veja a conta de cada turma na aba{' '}
          <span className="font-semibold text-white">Motor</span>.
        </p>
      </div>
    </div>
  )
}

function Kpi({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.05]">
      <div className="text-slate-400 text-xs mb-1">{label}</div>
      <div className={`text-2xl font-bold ${color || 'text-white'}`}>{value}</div>
    </div>
  )
}

function Bar({ w, total, className }: { w: number; total: number; className: string }) {
  return <div className={`h-full ${className}`} style={{ width: `${(w / (total || 1)) * 100}%` }} />
}

/* ------------------------------------------------------------------ Motor */

interface LinhaMotor {
  deal: Deal
  lead?: { curso: string; faculdade: string } | any
  score: number
  breakdown: ReturnType<typeof computeDealProbability>['breakdown']
}

function MotorTab({ linhas }: { linhas: LinhaMotor[] }) {
  const [field, setField] = useState('score')
  const [dir, setDir] = useState<SortDirection>('desc')

  const sorted = useMemo(
    () =>
      sortByField(linhas, field, dir, (x, f) => {
        switch (f) {
          case 'turma':
            return x.lead ? getTurmaDisplayName(x.lead) : x.deal.title
          case 'fase':
            return FUNNEL_STAGES.findIndex((s) => s.id === x.deal.stageId)
          case 'base':
            return x.breakdown.base
          case 'velocidade':
            return x.breakdown.ajusteVelocidade
          case 'score':
          default:
            return x.score
        }
      }),
    [linhas, field, dir],
  )

  return (
    <div className="space-y-5">
      <div className="bg-[#111820] border border-white/[0.06] rounded-xl p-5 space-y-3 text-sm text-slate-300">
        <h3 className="font-semibold text-white flex items-center gap-2">
          <Gauge className="w-4 h-4 text-orange-400" /> Como o número é calculado
        </h3>
        <p className="text-slate-400 text-xs leading-relaxed">
          <span className="font-semibold text-slate-200">final = base da reunião + portão de fase + velocidade + curso/faculdade</span>{' '}
          (limitado entre {MOTOR_WEIGHTS.min}% e {MOTOR_WEIGHTS.max}%). A base é a probabilidade da
          reunião mais recente (Gemini). Sem reunião analisada, a base é o padrão da fase — e o número
          fica marcado como <span className="italic">sem reunião</span>.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.05]">
            <div className="font-semibold text-slate-200 mb-1">Portão de fase vencido</div>
            <div className="text-slate-400">
              Qualif→Comissão +{MOTOR_WEIGHTS.portao['stage-2->stage-3']} · Comissão→Turma +
              {MOTOR_WEIGHTS.portao['stage-3->stage-4']} · Turma→Decisão +
              {MOTOR_WEIGHTS.portao['stage-4->stage-5']} (teto +{MOTOR_WEIGHTS.portaoMax})
            </div>
          </div>
          <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.05]">
            <div className="font-semibold text-slate-200 mb-1">Velocidade na coluna</div>
            <div className="text-slate-400">
              rápida +{MOTOR_WEIGHTS.velocidade.rapida} · saudável {MOTOR_WEIGHTS.velocidade.saudavel}{' '}
              · lenta {MOTOR_WEIGHTS.velocidade.lenta} · estagnada{' '}
              {MOTOR_WEIGHTS.velocidade.estagnada}
            </div>
          </div>
          <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.05]">
            <div className="font-semibold text-slate-200 mb-1">Curso / faculdade</div>
            <div className="text-slate-400">
              até ±{MOTOR_WEIGHTS.cursoFacMax}, proporcional à taxa histórica de fechamento e ao
              tamanho da amostra.
            </div>
          </div>
        </div>
      </div>

      <div className="bg-[#111820] border border-white/[0.06] rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-white text-sm">Turmas no funil ({linhas.length})</h3>
          <SortControl
            options={[
              { value: 'score', label: 'Probabilidade' },
              { value: 'turma', label: 'Turma' },
              { value: 'fase', label: 'Fase' },
              { value: 'base', label: 'Base (reunião)' },
              { value: 'velocidade', label: 'Velocidade' },
            ]}
            field={field}
            direction={dir}
            onFieldChange={setField}
            onDirectionToggle={() => setDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-white/[0.06] text-[11px] uppercase tracking-wider text-slate-400">
                <th className="py-2 px-2">Turma</th>
                <th className="py-2 px-2">Fase</th>
                <th className="py-2 px-2 text-right">Reunião</th>
                <th className="py-2 px-2 text-right">+Portão</th>
                <th className="py-2 px-2 text-right">±Velocidade</th>
                <th className="py-2 px-2 text-right">±Curso/Fac</th>
                <th className="py-2 px-2 text-right">Final</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {sorted.map(({ deal, lead, score, breakdown: b }) =>
                b.naoAvaliavel ? (
                  <tr key={deal.id} className="hover:bg-white/[0.02] text-slate-500">
                    <td className="py-2 px-2 max-w-[220px] truncate">
                      {lead ? getTurmaDisplayName(lead) : deal.title}
                    </td>
                    <td className="py-2 px-2">{stageNome(deal.stageId)}</td>
                    <td className="py-2 px-2 text-right" colSpan={5}>
                      — sem probabilidade (só avalia da Qualificação)
                    </td>
                  </tr>
                ) : (
                <tr key={deal.id} className="hover:bg-white/[0.02]">
                  <td className="py-2 px-2 text-white font-medium max-w-[220px] truncate">
                    {lead ? getTurmaDisplayName(lead) : deal.title}
                  </td>
                  <td className="py-2 px-2 text-slate-400">{stageNome(deal.stageId)}</td>
                  <td className="py-2 px-2 text-right text-slate-300">
                    {b.base}%{b.semReuniao && <span className="text-slate-500"> *</span>}
                  </td>
                  <td className="py-2 px-2 text-right text-emerald-400">
                    {b.ajustePortao ? `+${b.ajustePortao}` : '—'}
                  </td>
                  <td
                    className={`py-2 px-2 text-right ${
                      b.ajusteVelocidade > 0
                        ? 'text-emerald-400'
                        : b.ajusteVelocidade < 0
                          ? 'text-rose-400'
                          : 'text-slate-500'
                    }`}
                  >
                    {b.ajusteVelocidade > 0
                      ? `+${b.ajusteVelocidade}`
                      : b.ajusteVelocidade < 0
                        ? b.ajusteVelocidade
                        : '—'}
                    <span className="text-slate-500 text-[10px]"> ({b.velocidadeLabel})</span>
                  </td>
                  <td
                    className={`py-2 px-2 text-right ${
                      b.ajusteCursoFac > 0
                        ? 'text-emerald-400'
                        : b.ajusteCursoFac < 0
                          ? 'text-rose-400'
                          : 'text-slate-500'
                    }`}
                  >
                    {b.ajusteCursoFac > 0
                      ? `+${b.ajusteCursoFac}`
                      : b.ajusteCursoFac < 0
                        ? b.ajusteCursoFac
                        : '—'}
                    {b.cursoFacN > 0 && (
                      <span className="text-slate-500 text-[10px]"> (n={b.cursoFacN})</span>
                    )}
                  </td>
                  <td className="py-2 px-2 text-right font-bold" style={{ color: probColor(score) }}>
                    {score}%
                  </td>
                </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-slate-500 mt-2">* base veio do padrão da fase (turma ainda sem reunião analisada).</p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ Aprendizado */

function tally(items: string[], top = 12) {
  const map = new Map<string, { texto: string; n: number }>()
  for (const raw of items) {
    const texto = (raw || '').trim()
    if (!texto) continue
    const k = texto.toLowerCase()
    const cur = map.get(k)
    if (cur) cur.n++
    else map.set(k, { texto, n: 1 })
  }
  return [...map.values()].sort((a, b) => b.n - a.n).slice(0, top)
}

function AprendizadoTab({
  deals,
  transcripts,
  funilEventos,
}: {
  deals: Deal[]
  transcripts: Transcript[]
  funilEventos: import('@/types/crm').FunilEvento[]
}) {
  const perdidos = useMemo(() => deals.filter((d) => d.outcome === 'perdido'), [deals])
  const perdidoLeadIds = useMemo(
    () => new Set(perdidos.map((d) => d.leadId).filter(Boolean) as string[]),
    [perdidos],
  )

  const objecoesGerais = useMemo(
    () => tally(transcripts.flatMap((t) => t.geminiAnalysis?.pontosAtencao || [])),
    [transcripts],
  )
  const travamFechamento = useMemo(
    () =>
      tally([
        ...perdidos.map((d) => d.lostReason || '').filter(Boolean),
        ...transcripts
          .filter((t) => t.leadId && perdidoLeadIds.has(t.leadId))
          .flatMap((t) => t.geminiAnalysis?.pontosAtencao || []),
        ...funilEventos
          .filter((e) => e.outcome === 'perdido' && e.motivoPerda)
          .map((e) => e.motivoPerda as string),
      ]),
    [perdidos, transcripts, funilEventos, perdidoLeadIds],
  )

  const contraditorios = funilEventos.filter(
    (e) => e.observacao || e.avancouApesarProbBaixa,
  )
  const reunioesAnalisadas = transcripts.filter((t) => t.geminiAnalysis).length

  return (
    <div className="space-y-5">
      <Painel
        titulo="O que trava o avanço de fase"
        sub={`Objeções e pontos de atenção mais citados nas reuniões — amostra: ${reunioesAnalisadas} reuniões analisadas`}
        icon={AlertTriangle}
        itens={objecoesGerais}
        vazio="Nenhuma reunião analisada ainda."
      />
      <Painel
        titulo="O que trava o fechamento"
        sub={`Motivos de perda e objeções de turmas que não fecharam — amostra: ${perdidos.length} turmas perdidas`}
        icon={AlertTriangle}
        itens={travamFechamento}
        vazio={
          perdidos.length > 0
            ? `${perdidos.length} turmas perdidas, mas nenhuma com motivo registrado ainda. Registre o motivo ao marcar "Perdeu" no funil.`
            : 'Nenhuma turma perdida registrada ainda.'
        }
      />

      <div className="bg-[#111820] border border-white/[0.06] rounded-xl p-5">
        <h3 className="font-semibold text-white text-sm flex items-center gap-2 mb-1">
          <Sparkles className="w-4 h-4 text-orange-400" /> Casos que contrariaram o motor
        </h3>
        <p className="text-xs text-slate-400 mb-3">
          Onde a reunião/velocidade previu uma coisa e o resultado foi outro — é daqui que o motor
          aprende. Amostra: {contraditorios.length} eventos.
        </p>
        {contraditorios.length === 0 ? (
          <p className="text-sm text-slate-500">
            Ainda sem casos registrados. Conforme as turmas avançam e fecham, eles aparecem aqui.
          </p>
        ) : (
          <ul className="space-y-2">
            {contraditorios.slice(0, 30).map((e) => (
              <li
                key={e.id}
                className="text-xs text-slate-300 flex items-start gap-2 p-2 rounded bg-white/[0.02] border border-white/[0.05]"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-orange-400 flex-shrink-0 mt-0.5" />
                <span>
                  <span className="text-slate-400">
                    {e.curso || '—'}
                    {e.faculdade ? ` · ${e.faculdade}` : ''} —{' '}
                    {e.tipo === 'desfecho'
                      ? e.outcome === 'ganho'
                        ? 'Fechou'
                        : 'Perdeu'
                      : `${stageNome(e.fromStage)} → ${stageNome(e.toStage)}`}
                    :{' '}
                  </span>
                  {e.observacao ||
                    (e.avancouApesarProbBaixa
                      ? `avançou de fase mesmo com probabilidade baixa (${e.transcriptProbNoMomento ?? '?'}%).`
                      : '')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function Painel({
  titulo,
  sub,
  icon: Icon,
  itens,
  vazio,
}: {
  titulo: string
  sub: string
  icon: typeof AlertTriangle
  itens: { texto: string; n: number }[]
  vazio: string
}) {
  return (
    <div className="bg-[#111820] border border-white/[0.06] rounded-xl p-5">
      <h3 className="font-semibold text-white text-sm flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4 text-rose-400" /> {titulo}
      </h3>
      <p className="text-xs text-slate-400 mb-3">{sub}</p>
      {itens.length === 0 ? (
        <p className="text-sm text-slate-500">{vazio}</p>
      ) : (
        <ul className="space-y-1.5">
          {itens.map((o, i) => (
            <li key={i} className="flex items-center gap-2 text-xs text-slate-300">
              <span className="inline-flex items-center justify-center min-w-[24px] h-5 rounded bg-rose-500/15 text-rose-300 font-bold text-[10px]">
                {o.n}
              </span>
              {o.texto}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ Relatório */

function RelatorioTab({
  leads,
  deals,
  transcripts,
  funilEventos,
  estudos,
  upsertEstudo,
}: {
  leads: import('@/types/crm').Lead[]
  deals: Deal[]
  transcripts: Transcript[]
  funilEventos: import('@/types/crm').FunilEvento[]
  estudos: AprendizadoEstudo[]
  upsertEstudo: (e: AprendizadoEstudo) => Promise<void>
}) {
  const [modo, setModo] = useState<'curso' | 'faculdade'>('curso')
  const [valor, setValor] = useState('')
  const [gerando, setGerando] = useState(false)
  const { toast } = useToast()

  const cursos = useMemo(
    () => [...new Set(leads.map((l) => l.curso).filter(Boolean))].sort(),
    [leads],
  )
  const faculdades = useMemo(
    () => [...new Set(leads.map((l) => l.faculdade).filter(Boolean))].sort(),
    [leads],
  )
  const opcoes = modo === 'curso' ? cursos : faculdades

  const escopo: EstudoEscopo = useMemo(
    () =>
      modo === 'curso'
        ? { escopo: 'curso', curso: valor }
        : { escopo: 'faculdade', faculdade: valor },
    [modo, valor],
  )

  const agregado = useMemo(() => {
    if (!valor) return null
    return computeEstudoAgregado(escopo, { deals, leads, transcripts, funilEventos, materiais: [] })
  }, [escopo, valor, deals, leads, transcripts, funilEventos])

  const salvo = useMemo(
    () =>
      estudos.find(
        (e) =>
          e.escopo === escopo.escopo &&
          (escopo.curso ? e.curso === escopo.curso : true) &&
          (escopo.faculdade ? e.faculdade === escopo.faculdade : true),
      ),
    [estudos, escopo],
  )

  const handleGerar = async () => {
    if (!agregado) return
    const key = getGeminiApiKey()
    if (!key) {
      toast({
        title: 'Configure a chave do Gemini',
        description: 'Administração → IA.',
        variant: 'destructive',
      })
      return
    }
    setGerando(true)
    try {
      const corpus = montarCorpusParaIA(escopo, agregado, {
        deals,
        leads,
        transcripts,
        funilEventos,
        materiais: [],
      })
      const ia = await gerarEstudoIA(escopo, corpus, key, getGeminiModel())
      await upsertEstudo({
        ...agregado,
        ...ia,
        geradoPor: 'gemini',
        geradoEm: new Date().toISOString(),
      })
      toast({ title: 'Estudo atualizado', description: valor })
    } catch (e: any) {
      toast({ title: 'Falha ao gerar estudo', description: e.message, variant: 'destructive' })
    } finally {
      setGerando(false)
    }
  }

  const amostraPequena = (agregado?.amostraTurmas ?? 0) < 5

  return (
    <div className="space-y-5">
      <div className="bg-[#111820] border border-white/[0.06] rounded-xl p-5 flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-white/10 overflow-hidden">
          <button
            type="button"
            onClick={() => {
              setModo('curso')
              setValor('')
            }}
            className={`px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 ${
              modo === 'curso' ? 'bg-orange-600 text-white' : 'text-slate-400'
            }`}
          >
            <GraduationCap className="w-3.5 h-3.5" /> Por curso
          </button>
          <button
            type="button"
            onClick={() => {
              setModo('faculdade')
              setValor('')
            }}
            className={`px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 ${
              modo === 'faculdade' ? 'bg-orange-600 text-white' : 'text-slate-400'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" /> Por faculdade
          </button>
        </div>
        <select
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          className="bg-[#0a0f14] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white min-w-[220px]"
        >
          <option value="">Selecione {modo === 'curso' ? 'o curso' : 'a faculdade'}...</option>
          {opcoes.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        {valor && (
          <button
            type="button"
            onClick={handleGerar}
            disabled={gerando}
            className="ml-auto inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-xs font-semibold disabled:opacity-50"
          >
            <Sparkles className={`w-3.5 h-3.5 ${gerando ? 'animate-spin' : ''}`} />
            {salvo?.geradoPor === 'gemini' ? 'Atualizar estudo com IA' : 'Gerar estudo com IA'}
          </button>
        )}
      </div>

      {!valor && (
        <p className="text-sm text-slate-500 px-1">
          Escolha um curso ou faculdade para ver os números reais e o estudo de pitch / apresentação.
        </p>
      )}

      {valor && agregado && (
        <>
          {amostraPequena && (
            <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl p-3 text-xs text-amber-200 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              Amostra pequena ({agregado.amostraTurmas} turma(s) com desfecho). As recomendações vão
              ficar mais precisas conforme mais turmas fecharem.
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Kpi
              label="Turmas c/ desfecho"
              value={agregado.amostraTurmas}
            />
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.05]">
              <div className="text-slate-400 text-xs mb-1">Taxa de fechamento</div>
              <div className="text-2xl font-bold text-white">
                {agregado.taxaFechamento != null
                  ? `${Math.round(agregado.taxaFechamento * 100)}%`
                  : '—'}
              </div>
            </div>
            <Kpi label="Reuniões analisadas" value={agregado.amostraReunioes} />
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.05]">
              <div className="text-slate-400 text-xs mb-1">Tempo médio p/ fase</div>
              <div className="text-xs text-slate-200 mt-1 space-y-0.5">
                {agregado.tempoMedioPorEstagio &&
                Object.keys(agregado.tempoMedioPorEstagio).length ? (
                  Object.entries(agregado.tempoMedioPorEstagio).map(([s, d]) => (
                    <div key={s}>
                      {stageNome(s)}: {d}d
                    </div>
                  ))
                ) : (
                  <span className="text-slate-500">sem dados</span>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ListaContagem titulo="Objeções mais citadas" itens={agregado.objecoesComuns || []} />
            <ListaContagem
              titulo="Pontos fortes mais citados"
              itens={agregado.pontosFortesComuns || []}
              positivo
            />
            <ListaContagem
              titulo="Motivos de perda / lições"
              itens={agregado.motivosPerdaComuns || []}
            />
          </div>

          {salvo?.geradoPor === 'gemini' ? (
            <div className="space-y-4">
              <TextoEstudo titulo="O que funciona neste recorte" texto={salvo.oQueFunciona} />
              <TextoEstudo titulo="O que evitar" texto={salvo.oQueEvitar} />
              <TextoEstudo titulo="Pitch recomendado" texto={salvo.pitchRecomendado} destaque />
              <TextoEstudo
                titulo="Estrutura de apresentação recomendada"
                texto={salvo.estruturaApresentacao}
                destaque
              />
              <TextoEstudo
                titulo="Preferências dos formandos"
                texto={salvo.preferenciasFormandos}
              />
              <p className="text-[11px] text-slate-500">
                Estudo gerado por IA em{' '}
                {salvo.geradoEm ? new Date(salvo.geradoEm).toLocaleString('pt-BR') : '—'} a partir dos
                dados reais acima.
              </p>
            </div>
          ) : (
            <div className="bg-[#111820] border border-white/[0.06] rounded-xl p-6 text-center text-sm text-slate-400">
              Clique em <span className="font-semibold text-white">Gerar estudo com IA</span> para
              montar o pitch e a estrutura de apresentação recomendados para {valor}, a partir de todo
              o material real acima.
            </div>
          )}
        </>
      )}
    </div>
  )
}

function ListaContagem({
  titulo,
  itens,
  positivo,
}: {
  titulo: string
  itens: { texto: string; n: number }[]
  positivo?: boolean
}) {
  return (
    <div className="bg-[#111820] border border-white/[0.06] rounded-xl p-4">
      <h4 className="text-xs font-semibold text-slate-200 mb-2">{titulo}</h4>
      {itens.length === 0 ? (
        <p className="text-xs text-slate-500">Sem dados ainda.</p>
      ) : (
        <ul className="space-y-1.5">
          {itens.map((o, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-slate-300">
              <span
                className={`inline-flex items-center justify-center min-w-[22px] h-5 rounded font-bold text-[10px] ${
                  positivo ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'
                }`}
              >
                {o.n}
              </span>
              {o.texto}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function TextoEstudo({
  titulo,
  texto,
  destaque,
}: {
  titulo: string
  texto?: string
  destaque?: boolean
}) {
  if (!texto) return null
  return (
    <div
      className={`rounded-xl p-5 border ${
        destaque ? 'bg-orange-500/[0.06] border-orange-500/25' : 'bg-[#111820] border-white/[0.06]'
      }`}
    >
      <h4 className="text-sm font-semibold text-white mb-2">{titulo}</h4>
      <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">{texto}</p>
    </div>
  )
}
