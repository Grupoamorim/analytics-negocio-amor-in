import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
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
import { Target, TrendingUp, Flag, History, AlertTriangle, MessageCircle } from 'lucide-react'
import SectionTitle from './SectionTitle'
import { calcularPace, addAnos } from '@/utils/pace'
import type { PontoDiario } from '@/utils/pace'
import {
  intervaloDaMeta,
  rotuloPeriodoMeta,
  METRICA_LABEL,
  METRICA_UNIDADE,
  type MetaNegocio,
  type MetricaMeta,
  type MetaDecisao,
} from '@/hooks/useMetasNegocio'
import { useAcesso } from '@/context/AcessoContext'
import BotaoAnaliseIA from '@/components/BotaoAnaliseIA'

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
  periodoOverride,
  metaPendenteDecisao,
  onRegistrarExplicacao,
  onAplicarDecisao,
}: {
  titulo: string
  metrica: MetricaMeta
  meta: MetaNegocio | null
  pontos: PontoDiario[]
  /** Quando presente, mostra o pace desse período em vez do vigente-hoje derivado de `meta`
   * (usado pra "pré-visualizar" um trimestre/mês/ano escolhido no filtro). `meta` continua
   * opcional aqui — só serve de fonte do `contexto` pro prompt de IA, quando existir. */
  periodoOverride?: {
    ini: string
    fim: string
    rotulo: string
    valorMeta: number
    valorMetaPessimista?: number | null
    valorMetaOtimista?: number | null
    temMeta: boolean
  }
  /** A meta "vigente" (`meta`) nunca pode estar com o período encerrado — por isso essa é uma
   * busca separada (ver `metaVencidaSemDecisao`): a meta mais recente dessa métrica cujo período
   * já acabou, não foi batida, e ainda não teve uma decisão registrada. Só ela habilita a caixa
   * de "período encerrou sem bater" abaixo do gráfico — pode ser um período diferente do que está
   * sendo exibido no gráfico agora. */
  metaPendenteDecisao?: MetaNegocio | null
  onRegistrarExplicacao?: (id: string, texto: string) => Promise<void>
  onAplicarDecisao?: (id: string, decisao: MetaDecisao) => Promise<void>
}) {
  const unidade = METRICA_UNIDADE[metrica]
  const { isAdmin } = useAcesso()
  const navigate = useNavigate()
  const [rascunhoExplicacao, setRascunhoExplicacao] = useState('')
  const [decidindo, setDecidindo] = useState(false)

  const temMeta = periodoOverride ? periodoOverride.temMeta : !!meta
  const rotulo = periodoOverride ? periodoOverride.rotulo : meta ? rotuloPeriodoMeta(meta) : ''

  const pace = useMemo(() => {
    if (!temMeta) return null
    if (periodoOverride) {
      return calcularPace(periodoOverride.valorMeta, periodoOverride.ini, periodoOverride.fim, pontos)
    }
    const { ini, fim } = intervaloDaMeta(meta!)
    return calcularPace(meta!.valorMeta, ini, fim, pontos)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta, pontos, periodoOverride, temMeta])

  // Cenários pessimista/otimista — mesmo período da meta padrão, só a linha (não tem "realizado"
  // nem status próprios). Ficam de fora do gráfico enquanto não forem cadastrados (não inventamos
  // valor pra eles).
  const valorPessimista = periodoOverride ? periodoOverride.valorMetaPessimista ?? null : meta?.valorMetaPessimista ?? null
  const valorOtimista = periodoOverride ? periodoOverride.valorMetaOtimista ?? null : meta?.valorMetaOtimista ?? null

  const pacePessimista = useMemo(() => {
    if (!temMeta || valorPessimista == null) return null
    const { ini, fim } = periodoOverride ? periodoOverride : intervaloDaMeta(meta!)
    return calcularPace(valorPessimista, ini, fim, pontos)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [temMeta, valorPessimista, meta, pontos, periodoOverride])

  const paceOtimista = useMemo(() => {
    if (!temMeta || valorOtimista == null) return null
    const { ini, fim } = periodoOverride ? periodoOverride : intervaloDaMeta(meta!)
    return calcularPace(valorOtimista, ini, fim, pontos)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [temMeta, valorOtimista, meta, pontos, periodoOverride])

  // Mesmo período, um ano atrás — pra comparar meta x resultado atual x resultado do
  // ano passado ao mesmo tempo. hojeISO = fim do período deslocado pra não cortar
  // nenhum dia como "ainda não realizado" (o ano passado já acabou inteiro).
  const paceAnoAnterior = useMemo(() => {
    if (!temMeta) return null
    const { ini, fim } = periodoOverride
      ? { ini: periodoOverride.ini, fim: periodoOverride.fim }
      : intervaloDaMeta(meta!)
    const iniAnt = addAnos(ini, -1)
    const fimAnt = addAnos(fim, -1)
    return calcularPace(0, iniAnt, fimAnt, pontos, fimAnt)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta, pontos, periodoOverride, temMeta])

  // Série do gráfico com as 3 linhas alinhadas por posição no período (dia 1 do
  // período atual x dia 1 do mesmo período ano passado etc.), não por data.
  const serieComparativa = useMemo(() => {
    if (!pace) return []
    return pace.serie.map((p, i) => ({
      ...p,
      'Ano Anterior': paceAnoAnterior?.serie[i]?.Realizado ?? null,
      'Meta Pessimista': pacePessimista?.serie[i]?.Meta ?? null,
      'Meta Otimista': paceOtimista?.serie[i]?.Meta ?? null,
    }))
  }, [pace, paceAnoAnterior, pacePessimista, paceOtimista])

  // Comparação "ao mesmo tempo": realizado até agora vs. o que já tínhamos feito
  // no mesmo trecho do período, um ano atrás (mesma fração decorrida).
  const realizadoAnoAnteriorMesmoPonto = useMemo(() => {
    if (!pace || !paceAnoAnterior) return null
    const idx = Math.min(
      Math.round(pace.fracaoDecorrida * (paceAnoAnterior.serie.length - 1)),
      paceAnoAnterior.serie.length - 1,
    )
    return paceAnoAnterior.serie[idx]?.Realizado ?? null
  }, [pace, paceAnoAnterior])

  const deltaVsAnoAnterior =
    realizadoAnoAnteriorMesmoPonto !== null && realizadoAnoAnteriorMesmoPonto > 0 && pace
      ? ((pace.realizado - realizadoAnoAnteriorMesmoPonto) / realizadoAnoAnteriorMesmoPonto) * 100
      : null

  // Pace do período da meta VENCIDA sem decisão (pode ser um período diferente do que está sendo
  // exibido no gráfico agora — ver comentário do prop `metaPendenteDecisao`).
  const paceVencida = useMemo(() => {
    if (!metaPendenteDecisao) return null
    const { ini, fim } = intervaloDaMeta(metaPendenteDecisao)
    return calcularPace(metaPendenteDecisao.valorMeta, ini, fim, pontos)
  }, [metaPendenteDecisao, pontos])
  const precisaDecisao = isAdmin && !!metaPendenteDecisao && !!paceVencida

  async function irParaConsultor() {
    if (!metaPendenteDecisao || !paceVencida) return
    navigate('/consultor-metas', {
      state: {
        tipo: 'meta',
        id: metaPendenteDecisao.id,
        titulo: `${METRICA_LABEL[metrica]} — ${rotuloPeriodoMeta(metaPendenteDecisao)}`,
        resumo: `meta ${fmt(paceVencida.meta, unidade)}, realizado ${fmt(paceVencida.realizado, unidade)} (${(paceVencida.indicePace * 100).toFixed(0)}% do ritmo)`,
        explicacao: rascunhoExplicacao || metaPendenteDecisao.explicacao || '',
      },
    })
  }

  async function handleDecisaoMeta(decisao: MetaDecisao) {
    if (!metaPendenteDecisao || !onAplicarDecisao) return
    setDecidindo(true)
    try {
      await onAplicarDecisao(metaPendenteDecisao.id, decisao)
    } finally {
      setDecidindo(false)
    }
  }

  const promptMetaIA = () => {
    const p = pace!
    return `Você é um diretor comercial/financeiro sênior de uma empresa de fotografia de formaturas.
Analise o andamento da meta abaixo e responda em português, direto e prático, em no máximo 6 linhas:
1) uma frase dizendo se vamos bater e o tamanho do gap;
2) 3 a 4 ações concretas e priorizadas pra fechar o gap no tempo que resta.

Convenção de trimestre: o sistema usa T1-T4. Se o contexto abaixo mencionar "Q1"-"Q4" (nomenclatura em inglês, comum em documentos de planejamento), trate como sinônimo do mesmo trimestre (ex: Q3 = T3, terceiro trimestre).

META: ${METRICA_LABEL[metrica]} — período ${rotulo}
Valor da meta: ${fmt(p.meta, unidade)}
Realizado até hoje: ${fmt(p.realizado, unidade)} (${(p.indicePace * 100).toFixed(0)}% do que deveria estar a esta altura)
Onde deveríamos estar hoje (meta linear): ${fmt(p.metaProRata, unidade)}
Projeção de fechamento no ritmo atual: ${fmt(p.projecao, unidade)}
Falta: ${fmt(p.faltam, unidade)} em ${p.diasRestantes} dias
Ritmo atual: ${fmt(p.ritmoDiarioAtual, unidade)}/dia • Ritmo necessário: ${fmt(p.ritmoDiarioNecessario, unidade)}/dia (${fmt(p.ritmoSemanalNecessario, unidade)}/semana)
${meta?.contexto ? `\nCONTEXTO E ESTRATÉGIA DEFINIDOS PELA GESTÃO:\n"""${meta.contexto}"""` : ''}`
  }

  if (!temMeta || !pace) {
    return (
      <div className="bg-[#111820] border border-dashed border-white/[0.12] rounded-xl p-6 shadow-lg">
        <SectionTitle ajuda="Defina a meta do período (mensal, trimestral ou anual) para acompanhar o ritmo (pace) — o quanto já foi feito vs. onde deveríamos estar, e o que falta por dia/semana pra bater.">
          {titulo}
        </SectionTitle>
        <p className="mt-3 text-sm text-slate-400">
          Nenhuma meta de <strong>{METRICA_LABEL[metrica].toLowerCase()}</strong> cadastrada para o
          período {periodoOverride ? `escolhido (${periodoOverride.rotulo})` : 'atual'}.{' '}
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
        ajuda="A linha laranja tracejada é a meta padrão distribuída igual ao longo do período (as linhas mais claras/escuras da mesma cor, quando aparecem, são os cenários pessimista e otimista). A área verde é o realizado acumulado. A linha roxa é o realizado no mesmo período do ano passado (dia a dia, alinhado pela posição no período, não pela data). Se a área está abaixo da linha da meta na marca de hoje, estamos atrás do ritmo."
        right={
          <div className="flex items-center gap-2">
            <BotaoAnaliseIA compact label="Analisar meta com IA" promptBuilder={promptMetaIA} />
            <span className={`text-[11px] font-semibold px-2 py-1 rounded-full border ${st.cls}`}>
              {st.txt}
            </span>
          </div>
        }
      >
        {titulo} — {rotulo}
      </SectionTitle>

      {/* Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
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
        <MiniCard
          icon={History}
          label="vs. Ano Anterior"
          valor={deltaVsAnoAnterior === null ? '—' : `${deltaVsAnoAnterior >= 0 ? '+' : ''}${deltaVsAnoAnterior.toFixed(0)}%`}
          sub={
            realizadoAnoAnteriorMesmoPonto === null
              ? 'sem dado no mesmo período do ano passado'
              : `no mesmo trecho, ano passado: ${fmt(realizadoAnoAnteriorMesmoPonto, unidade)}`
          }
          tom={deltaVsAnoAnterior === null ? 'neutro' : deltaVsAnoAnterior >= 0 ? 'verde' : 'vermelho'}
        />
      </div>

      {/* Gráfico */}
      <div className="h-60">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={serieComparativa} margin={{ left: 8, right: 8 }}>
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
            {pacePessimista && (
              <Line
                dataKey="Meta Pessimista"
                stroke="#FDE68A"
                strokeWidth={1.5}
                dot={false}
                strokeDasharray="5 4"
                connectNulls
              />
            )}
            <Line dataKey="Meta" name="Meta padrão" stroke="#F59E0B" strokeWidth={2} dot={false} strokeDasharray="5 4" />
            {paceOtimista && (
              <Line
                dataKey="Meta Otimista"
                stroke="#B45309"
                strokeWidth={1.5}
                dot={false}
                strokeDasharray="5 4"
                connectNulls
              />
            )}
            <Line
              dataKey="Ano Anterior"
              stroke="#8B5CF6"
              strokeWidth={2}
              dot={false}
              strokeDasharray="2 3"
              connectNulls
            />
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

      {precisaDecisao && metaPendenteDecisao && (
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 space-y-2">
          <p className="text-xs text-amber-200 font-semibold flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> A meta de {rotuloPeriodoMeta(metaPendenteDecisao)} encerrou sem bater. O que aconteceu?
          </p>
          <textarea
            value={rascunhoExplicacao || metaPendenteDecisao.explicacao || ''}
            onChange={(e) => setRascunhoExplicacao(e.target.value)}
            onBlur={(e) =>
              onRegistrarExplicacao && e.target.value.trim() && onRegistrarExplicacao(metaPendenteDecisao.id, e.target.value.trim())
            }
            rows={2}
            placeholder="Explique o que aconteceu..."
            className="w-full bg-[#0a0f14] border border-white/[0.1] rounded-lg px-2 py-1.5 text-slate-200 text-xs resize-y"
          />
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={irParaConsultor}
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-orange-300 bg-orange-500/10 border border-orange-500/25 rounded-lg px-2.5 py-1.5 hover:bg-orange-500/20"
            >
              <MessageCircle className="w-3.5 h-3.5" /> Discutir com o Consultor de Metas
            </button>
            <span className="text-[10px] text-slate-500">ou decida direto:</span>
            <button
              type="button"
              disabled={decidindo}
              onClick={() => handleDecisaoMeta('realocado')}
              className="text-[11px] font-semibold text-emerald-300 hover:underline disabled:opacity-50"
              title="Marca como realocado — depois cadastre a meta do novo período em Administração → Metas"
            >
              Realocar
            </button>
            <button
              type="button"
              disabled={decidindo}
              onClick={() => handleDecisaoMeta('descartado')}
              className="text-[11px] font-semibold text-slate-400 hover:underline disabled:opacity-50"
            >
              Descartar
            </button>
            <button
              type="button"
              disabled={decidindo}
              onClick={() => handleDecisaoMeta('repensado')}
              className="text-[11px] font-semibold text-rose-300 hover:underline disabled:opacity-50"
              title="Marca como repensado — crie o novo objetivo em Conquistas & Marcos"
            >
              Pensar em outro objetivo
            </button>
          </div>
          <p className="text-[10px] text-slate-500">
            Realocar: cadastre a meta do novo período em{' '}
            <Link to="/admin" className="text-orange-400 hover:underline">
              Administração → Metas
            </Link>
            . Pensar em outro objetivo: crie o novo marco no Painel de Conquistas, logo abaixo.
          </p>
        </div>
      )}
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
