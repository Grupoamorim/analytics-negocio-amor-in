import { useEffect, useMemo, useState } from 'react'
import { MessageSquare } from 'lucide-react'
import { fetchTodasConversas, type ConversaMsg } from '@/utils/conversas'
import {
  metricasRoteiros,
  baldesDisponiveis,
  type Periodo,
} from '@/utils/conversasMetricas'
import { FUNNEL_STAGES, type Deal } from '@/types/crm'

const PERIODOS: { v: Periodo; l: string }[] = [
  { v: 'mes', l: 'Mês' },
  { v: 'trimestre', l: 'Trimestre' },
  { v: 'semestre', l: 'Semestre' },
  { v: 'ano', l: 'Ano' },
]

export default function ConversasMetricasPanel({ deals }: { deals: Deal[] }) {
  const [msgs, setMsgs] = useState<ConversaMsg[]>([])
  const [carregando, setCarregando] = useState(true)
  const [periodo, setPeriodo] = useState<Periodo>('trimestre')
  const [balde, setBalde] = useState<string>('')
  const [stageId, setStageId] = useState<string>('')

  useEffect(() => {
    fetchTodasConversas()
      .then(setMsgs)
      .catch(() => setMsgs([]))
      .finally(() => setCarregando(false))
  }, [])

  const baldes = useMemo(() => baldesDisponiveis(msgs, periodo), [msgs, periodo])
  useEffect(() => {
    setBalde((b) => (baldes.includes(b) ? b : ''))
  }, [baldes])

  const linhas = useMemo(
    () =>
      metricasRoteiros(msgs, deals, {
        periodo,
        balde: balde || undefined,
        stageId: stageId || undefined,
      }).slice(0, 20),
    [msgs, deals, periodo, balde, stageId],
  )

  return (
    <div className="bg-[#111820] border border-white/[0.06] rounded-xl p-5">
      <h3 className="font-semibold text-white text-sm flex items-center gap-2 mb-1">
        <MessageSquare className="w-4 h-4 text-orange-400" /> Mensagens de WhatsApp que mais convertem
      </h3>
      <p className="text-xs text-slate-400 mb-3">
        Roteiros que <b>nós enviamos</b> agrupados pelo texto, cruzados com o desfecho da turma.
        Sem IA — contagem real. Amostra: {msgs.length} mensagens arquivadas.
      </p>

      <div className="flex flex-wrap gap-1.5 mb-3">
        <select
          value={periodo}
          onChange={(e) => setPeriodo(e.target.value as Periodo)}
          className="h-8 text-xs bg-[#0a0f14] border border-white/10 rounded px-2 text-slate-200"
        >
          {PERIODOS.map((p) => (
            <option key={p.v} value={p.v}>
              Por {p.l.toLowerCase()}
            </option>
          ))}
        </select>
        <select
          value={balde}
          onChange={(e) => setBalde(e.target.value)}
          className="h-8 text-xs bg-[#0a0f14] border border-white/10 rounded px-2 text-slate-200"
        >
          <option value="">Todo o período</option>
          {baldes.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
        <select
          value={stageId}
          onChange={(e) => setStageId(e.target.value)}
          className="h-8 text-xs bg-[#0a0f14] border border-white/10 rounded px-2 text-slate-200"
        >
          <option value="">Todas as fases</option>
          {FUNNEL_STAGES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {carregando ? (
        <p className="text-sm text-slate-500">Carregando…</p>
      ) : linhas.length === 0 ? (
        <p className="text-sm text-slate-500">
          Ainda sem mensagens arquivadas o suficiente. Instale a extensão do Chrome nos
          navegadores dos vendedores.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-500 text-left">
                <th className="pb-1.5 font-medium">Roteiro</th>
                <th className="pb-1.5 font-medium text-right">Turmas</th>
                <th className="pb-1.5 font-medium text-right">Fecharam</th>
                <th className="pb-1.5 font-medium text-right">Conversão</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l, i) => (
                <tr key={i} className="border-t border-white/[0.05]">
                  <td className="py-1.5 pr-3 text-slate-300 max-w-md">
                    <span className="line-clamp-2">{l.roteiro}</span>
                  </td>
                  <td className="py-1.5 text-right text-slate-400">{l.amostraTurmas}</td>
                  <td className="py-1.5 text-right text-slate-400">{l.turmasFechadas}</td>
                  <td className="py-1.5 text-right font-semibold text-emerald-400">
                    {Math.round(l.taxaConversao * 100)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[10px] text-slate-500 mt-2">
            Conversão = turmas que fecharam ÷ turmas que receberam aquele roteiro. Com poucas
            turmas por roteiro o número ainda é só indicativo.
          </p>
        </div>
      )}
    </div>
  )
}
