import type { LucideIcon } from 'lucide-react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import InfoHint from './InfoHint'

type Tom = 'neutro' | 'verde' | 'vermelho' | 'ambar'

const TOM_ICONE: Record<Tom, string> = {
  neutro: 'bg-orange-500/15 text-orange-400',
  verde: 'bg-emerald-500/15 text-emerald-400',
  vermelho: 'bg-rose-500/15 text-rose-400',
  ambar: 'bg-amber-500/15 text-amber-400',
}

const TOM_VALOR: Record<Tom, string> = {
  neutro: 'text-white',
  verde: 'text-emerald-400',
  vermelho: 'text-rose-400',
  ambar: 'text-amber-400',
}

export interface KpiCardProps {
  label: string
  value: string
  sub?: string
  icon: LucideIcon
  tom?: Tom
  /** Explicação "para que serve / como é calculado" (aparece no ícone (i)). */
  ajuda: React.ReactNode
  /** Variação % vs período anterior comparável. Positivo = seta pra cima. */
  delta?: number | null
  /** Quando true, um delta negativo é "bom" (ex.: inadimplência caindo) → verde. */
  deltaInverso?: boolean
}

export default function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  tom = 'neutro',
  ajuda,
  delta,
  deltaInverso = false,
}: KpiCardProps) {
  const temDelta = delta !== undefined && delta !== null && Number.isFinite(delta)
  const deltaPositivoVisual = temDelta && (deltaInverso ? (delta as number) < 0 : (delta as number) >= 0)

  return (
    <div className="bg-[#111820] border border-white/[0.06] rounded-xl p-5 hover:border-white/[0.14] transition-all duration-200 shadow-lg">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
          {label}
          <InfoHint title={label}>{ajuda}</InfoHint>
        </span>
        <div className={`w-9 h-9 rounded-full flex items-center justify-center ${TOM_ICONE[tom]}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <div className={`text-2xl lg:text-3xl font-bold tracking-tight ${TOM_VALOR[tom]}`}>{value}</div>
      <div className="mt-2 flex items-center gap-2 text-xs">
        {temDelta && (
          <span
            className={`inline-flex items-center gap-0.5 font-semibold ${
              deltaPositivoVisual ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {(delta as number) >= 0 ? (
              <ArrowUp className="w-3.5 h-3.5" />
            ) : (
              <ArrowDown className="w-3.5 h-3.5" />
            )}
            {Math.abs(delta as number).toFixed(1)}%
          </span>
        )}
        {sub && <span className="text-slate-400 font-normal">{sub}</span>}
      </div>
    </div>
  )
}
