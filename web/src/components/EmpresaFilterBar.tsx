import { Building2, X } from 'lucide-react'

/**
 * Barra de filtro por empresa (AIF, AFF, SFF, AIM etc.) — chips multi-select.
 * Nenhum selecionado = mostra todas. Selecionar uma ou mais soma os resultados
 * daquelas empresas; selecionar todas individualmente permite comparar.
 */
interface EmpresaFilterBarProps {
  options: string[]
  selected: string[]
  onChange: (next: string[]) => void
  className?: string
}

export default function EmpresaFilterBar({
  options,
  selected,
  onChange,
  className,
}: EmpresaFilterBarProps) {
  if (options.length === 0) return null

  const toggle = (empresa: string) => {
    onChange(selected.includes(empresa) ? selected.filter((e) => e !== empresa) : [...selected, empresa])
  }

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className || ''}`}>
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 mr-0.5">
        <Building2 className="w-3.5 h-3.5 text-orange-400" />
        Empresa:
      </span>
      {options.map((empresa) => {
        const active = selected.includes(empresa)
        return (
          <button
            key={empresa}
            type="button"
            onClick={() => toggle(empresa)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all ${
              active
                ? 'bg-orange-600 text-white border-transparent shadow-sm'
                : 'text-slate-400 border-white/[0.08] bg-[#0a0f14] hover:text-white hover:border-white/20'
            }`}
          >
            {empresa}
          </button>
        )
      })}
      {selected.length > 0 && (
        <button
          type="button"
          onClick={() => onChange([])}
          className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-white transition-colors ml-1"
        >
          <X className="w-3 h-3" /> Limpar
        </button>
      )}
    </div>
  )
}
