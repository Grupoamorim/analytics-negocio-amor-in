import { useEffect, useMemo, useState } from 'react'
import { Gauge, Clock, TrendingUp, MessageSquareOff } from 'lucide-react'
import { useCRM } from '@/context/CRMContext'
import { supabase } from '@/lib/supabase/client'
import {
  calcularMetricasComerciais,
  type EpisodioSemResposta,
} from '@/utils/metricasComerciais'

const db = supabase as any

function Card({
  icon: Icon,
  label,
  valor,
  sub,
}: {
  icon: typeof Gauge
  label: string
  valor: string
  sub?: string
}) {
  return (
    <div className="bg-[#0a0f14] border border-white/[0.06] rounded-lg p-3">
      <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mb-1">
        <Icon className="w-3.5 h-3.5" /> {label}
      </div>
      <p className="text-lg font-bold text-white leading-none">{valor}</p>
      {sub && <p className="text-[10px] text-slate-500 mt-1">{sub}</p>}
    </div>
  )
}

export default function MetricasComerciaisPanel({ compact = false }: { compact?: boolean }) {
  const { deals, funilEventos } = useCRM()
  const [episodios, setEpisodios] = useState<EpisodioSemResposta[]>([])

  useEffect(() => {
    db.from('sem_resposta_episodios')
      .select('deal_id, stage_id, iniciou_em, encerrou_em, dias, encerrou_por')
      .then(({ data }: any) => {
        setEpisodios(
          (data || []).map((r: any) => ({
            dealId: r.deal_id,
            stageId: r.stage_id,
            iniciouEm: r.iniciou_em,
            encerrouEm: r.encerrou_em,
            dias: r.dias,
            encerrouPor: r.encerrou_por,
          })),
        )
      })
  }, [])

  const m = useMemo(
    () => calcularMetricasComerciais(deals, funilEventos, episodios),
    [deals, funilEventos, episodios],
  )

  const pct = (v: number | null) => (v == null ? '—' : `${Math.round(v * 100)}%`)
  const dias = (v: number | null) => (v == null ? '—' : `${v} d`)

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Card
          icon={Clock}
          label="Prazo médio até fechar"
          valor={dias(m.prazoMedioFechamentoDias)}
          sub={`${m.ganhos} turmas ganhas`}
        />
        <Card icon={TrendingUp} label="Taxa de conversão" valor={pct(m.winRate)} sub={`${m.ganhos}G · ${m.perdidos}P`} />
        <Card
          icon={MessageSquareOff}
          label="Sem resposta agora"
          valor={String(m.semResposta.agora)}
          sub={m.semResposta.taxaAgora != null ? `${pct(m.semResposta.taxaAgora)} das ativas` : undefined}
        />
        <Card
          icon={Gauge}
          label="Turmas ativas no funil"
          valor={String(m.totalAtivas)}
          sub={
            m.semResposta.episodiosEncerrados
              ? `sem-resposta dura ~${m.semResposta.diasMedioEpisodio}d`
              : undefined
          }
        />
      </div>

      {!compact && (
        <div className="overflow-x-auto bg-[#0a0f14] border border-white/[0.06] rounded-lg">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-500 text-left">
                <th className="p-2.5 font-medium">Fase</th>
                <th className="p-2.5 font-medium text-right">Agora</th>
                <th className="p-2.5 font-medium text-right">Tempo médio na fase</th>
                <th className="p-2.5 font-medium text-right">Passam da fase</th>
              </tr>
            </thead>
            <tbody>
              {m.fases.map((f) => (
                <tr key={f.stageId} className="border-t border-white/[0.05] text-slate-300">
                  <td className="p-2.5 font-medium text-white">{f.nome}</td>
                  <td className="p-2.5 text-right">{f.turmasAgora}</td>
                  <td className="p-2.5 text-right">{dias(f.tempoMedioDias)}</td>
                  <td className="p-2.5 text-right">
                    <span className="font-semibold text-emerald-400">{pct(f.conversaoParaProxima)}</span>
                    {f.amostraConversao > 0 && (
                      <span className="text-slate-500"> · {f.amostraConversao}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[10px] text-slate-500 p-2">
            Tudo automático, a partir do histórico de fases das turmas. "Passam da fase" = das turmas
            que chegaram naquela fase, quantas avançaram.
          </p>
        </div>
      )}
    </div>
  )
}
