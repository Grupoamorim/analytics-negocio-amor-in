import { Info } from 'lucide-react'

/**
 * Ícone (i) discreto com tooltip no hover — explica PARA QUE SERVE aquele
 * indicador e COMO ele é calculado. Usado em todos os cards e faixas do
 * Dashboard para que qualquer pessoa entenda o número sem depender de doc.
 */
export default function InfoHint({
  children,
  title,
  align = 'left',
}: {
  children: React.ReactNode
  title?: string
  align?: 'left' | 'right'
}) {
  return (
    <span className="relative group inline-flex">
      <button
        type="button"
        className="text-slate-500 hover:text-slate-300 transition-colors"
        aria-label={title || 'Sobre este indicador'}
      >
        <Info className="w-3.5 h-3.5" />
      </button>
      <span
        className={`pointer-events-none absolute top-full mt-2 z-40 w-[260px] hidden group-hover:block ${
          align === 'right' ? 'right-0' : 'left-0'
        }`}
      >
        <span className="block rounded-lg border border-white/10 bg-[#0a0f14] shadow-2xl p-3">
          {title && (
            <span className="block text-[11px] font-semibold text-white mb-1">{title}</span>
          )}
          <span className="block text-[11px] text-slate-300 leading-relaxed">{children}</span>
        </span>
      </span>
    </span>
  )
}
