import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts'
import { Target, Sparkles, Loader2, TrendingUp, Flag } from 'lucide-react'
import SectionTitle from './SectionTitle'
import { calcularPace } from '@/utils/pace'
import type { PontoDiario } from '@/utils/pace'
import {
  intervaloDaMeta,
  rotuloPeriodoMeta,
  METRICA_LABEL,
  METRICA_UNIDADE,
  type MetaNegocio,
  type MetricaMeta,
} from '@/hooks/useMetasNegocio'
import { callGemini, getGeminiApiKey } from '@/utils/geminiApi'

function fmt(v: number, unidade: 'R$' | 'un'): string {
  if (unidade === 'R$') return `R$ ${Math.round(v).toLocaleString('pt-BR')}`
  return Math.round(v).toLocaleString('pt-BR')
}

const STATUS_STYLE: Record<string, { txt: string; cls: string }> = {
  adiantado: { txt: 'Adiantado', cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  'no ritmo': { txt: 'No ritmo', cls: 'bg-sky-500/15 text-sky-400 border-sky-500/30' },
  atrasado: { txt: 'Atrasado', cls: 'bg-rose-500/15 text-rose-400 border-rose-500/30' },
  batida: { txt: 'Meta batida', cls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' },
}

export default function PaceBand({
  titulo,
  metrica,
  meta,
  pontos,
}: {
  titulo: string
  metrica: MetricaMeta
  meta: MetaNegocio | null
  pontos: PontoDiario[]
}) {
  const unidade = METRICA_UNIDADE[metrica]
  const [analise, setAnalise] = useState<string | null>(null)
  const [carregandoIA, setCarregandoIA] = useState(false)
  const [erroIA, setErroIA] = useState<string | null>(null)

  const pace = useMemo(() => {
    if (!meta) return null
    const { ini, fim } = intervaloDaMeta(meta)
    return calcularPace(meta.valorMeta, ini, fim, pontos)
  }, [meta, pontos])

  async function analisarComIA() {
    if (!meta || !pace) return
    if (!getGeminiApiKey()) {
      setErroIA('Configure a chave do Gemini em Administração → IA.')
      return
    }
    setCarregandoIA(true)
    setErroIA(null)
    try {
      const prompt = `Você é um diretor comercial/financeiro sênior de uma empresa de fotografia de formaturas.
Analise o andamento da meta abaixo e responda em português, direto e prático, em no máximo 6 linhas:
1) uma frase dizendo se vamos bater e o tamanho do gap;
2) 3 a 4 ações concretas e priorizadas pra fechar o gap no tempo que resta.

META: ${METRICA_LABEL[metrica]} — período ${rotuloPeriodoMeta(meta)}
Valor da meta: ${fmt(meta.valorMeta, unidade)}
Realizado até hoje: ${fmt(pace.realizado, unidade)} (${(pace.indicePace * 100).toFixed(0)}% do que deveria estar a esta altura)
Onde deveríamos estar hoje (meta linear): ${fmt(pace.metaProRata, unidade)}
Projeção de fechamento no ritmo atual: ${fmt(pace.projecao, unidade)}
Falta: ${fmt(pace.faltam, unidade)} em ${pace.diasRestantes} dias
Ritmo atual: ${fmt(pace.ritmoDiarioAtual, unidade)}/dia • Ritmo necessário: ${fmt(pace.ritmoDiarioNecessario, unidade)}/dia (${fmt(pace.ritmoSemanalNecessario, unidade)}/semana)
${meta.contexto ? `\nCONTEXTO E ESTRATÉGIA DEFINIDOS PELA GESTÃO:\n"""${meta.contexto}"""` : ''}`
      const res = await callGemini(prompt)
      setAnalise(res)
    } catch (e: any) {
      setErroIA(e?.message || 'Não foi possível analisar agora.')
    } finally {
      setCarregandoIA(false)
    }
  }

  if (!meta || !pace) {
    return (
      <div className="bg-[#111820] border border-dashed border-white/[0.12] rounded-xl p-6 shadow-lg">
        <SectionTitle ajuda="Defina a meta do período (mensal, trimestral ou anual) para acompanhar o ritmo (pace) — o quanto já foi feito vs. onde deveríamos estar, e o que falta por dia/semana pra bater.">
          {titulo}
        </SectionTitle>
        <p className="mt-3 text-sm text-slate-400">
          Nenhuma meta de <strong>{METRICA_LABEL[metrica].toLowerCase()}</strong> cadastrada para o
          período atual.{' '}
          <Link to="/admin" className="text-orange-400 hover:underline">
            Cadastrar em Administração → Metas
          </Link>
        </p>
      </div>
    )
  }

  const st = STATUS_STYLE[pace.status]

  return (
    <div className="bg-[#111820] border border-white/[0.06] rounded-xl p-6 shadow-lg space-y-4">
      <SectionTitle
        ajuda="A linha reta é a meta distribuída igual ao longo do período. A área é o realizado acumulado. Se a área está abaixo da linha na marca de hoje, estamos atrás do ritmo. A projeção assume que o ritmo atual se mantém até o fim."
        right={
          <span className={`text-[11px] font-semibold px-2 py-1 rounded-full border ${st.cls}`}>
            {st.txt}
          </span>
        }
      >
        {titulo} — {rotuloPeriodoMeta(meta)}
      </SectionTitle>

      {/* Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MiniCard
          icon={Flag}
          label="Realizado / Meta"
          valor={`${fmt(pace.realizado, unidade)}`}
          sub={`de ${fmt(pace.meta, unidade)} • ${(pace.indicePace * 100).toFixed(0)}% do ritmo`}
          tom={pace.indicePace >= 0.92 ? 'verde' : 'vermelho'}
        />
        <MiniCard
          icon={TrendingUp}
          label="Projeção de fechamento"
          valor={fmt(pace.projecao, unidade)}
          sub={pace.projecao >= pace.meta ? 'acima da meta no ritmo atual' : 'abaixo da meta no ritmo atual'}
          tom={pace.projecao >= pace.meta ? 'verde' : 'vermelho'}
        />
        <MiniCard
          icon={Target}
          label="Falta"
          valor={fmt(pace.faltam, unidade)}
          sub={`em ${pace.diasRestantes} dias`}
          tom="neutro"
        />
        <MiniCard
          icon={TrendingUp}
          label="Ritmo necessário"
          valor={`${fmt(pace.ritmoSemanalNecessario, unidade)}/sem`}
          sub={`atual ${fmt(pace.ritmoDiarioAtual * 7, unidade)}/sem`}
          tom={pace.ritmoDiarioNecessario <= pace.ritmoDiarioAtual * 1.1 ? 'verde' : 'vermelho'}
        />
      </div>

      {/* Gráfico */}
      <div className="h-60">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={pace.serie} margin={{ left: 8, right: 8 }}>
            <defs>
              <linearGradient id={`pace-${metrica}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#34D399" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#34D399" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="label" stroke="#64748b" fontSize={10} interval="preserveStartEnd" minTickGap={24} />
            <YAxis
              stroke="#64748b"
              fontSize={10}
              width={unidade === 'R$' ? 56 : 36}
              tickFormatter={(v) => (unidade === 'R$' ? `${(Number(v) / 1000).toFixed(0)}k` : String(v))}
            />
            <Tooltip
              formatter={(v: number) => (v == null ? '—' : fmt(Number(v), unidade))}
              contentStyle={{ background: '#0a0f14', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line dataKey="Meta" stroke="#F59E0B" strokeWidth={2} dot={false} strokeDasharray="5 4" />
            <Area
              dataKey="Realizado"
              stroke="#34D399"
              strokeWidth={2}
              fill={`url(#pace-${metrica})`}
              connectNulls={false}
            />
            <ReferenceLine
              x={pace.hojeLabel}
              stroke="#94a3b8"
              strokeDasharray="2 2"
              label={{ value: 'hoje', position: 'top', fill: '#94a3b8', fontSize: 10 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* IA */}
      <div className="border-t border-white/[0.06] pt-3">
        <button
          type="button"
          onClick={analisarComIA}
          disabled={carregandoIA}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-orange-300 bg-orange-500/10 border border-orange-500/25 rounded-lg px-3 py-1.5 hover:bg-orange-500/20 disabled:opacity-50"
        >
          {carregandoIA ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          {carregandoIA ? 'Analisando…' : 'Analisar meta com IA'}
        </button>
        {erroIA && <p className="text-[11px] text-rose-400 mt-2">{erroIA}</p>}
        {analise && (
          <div className="mt-3 p-3 rounded-lg bg-white/[0.02] border border-white/[0.06] text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">
            {analise}
          </div>
        )}
      </div>
    </div>
  )
}

function MiniCard({
  icon: Icon,
  label,
  valor,
  sub,
  tom,
}: {
  icon: typeof Target
  label: string
  valor: string
  sub: string
  tom: 'neutro' | 'verde' | 'vermelho'
}) {
  const cor = tom === 'verde' ? 'text-emerald-400' : tom === 'vermelho' ? 'text-rose-400' : 'text-white'
  return (
    <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-3">
      <div className="text-[10px] font-medium text-slate-400 flex items-center gap-1">
        <Icon className="w-3 h-3 text-orange-400" /> {label}
      </div>
      <div className={`text-lg font-bold mt-1 ${cor}`}>{valor}</div>
      <div className="text-[10px] text-slate-500 mt-0.5">{sub}</div>
    </div>
  )
}
