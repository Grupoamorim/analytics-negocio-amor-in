import { useState } from 'react'

const OUTRO = '__outro__'

interface DropdownComOutroProps {
  label: string
  value: string
  options: string[]
  onSave: (value: string) => void
  /** 'boxed' = campo com moldura (fundo escuro, usado no Funil). 'underline' = só sublinhado (usado em Turmas). */
  variant?: 'boxed' | 'underline'
  placeholder?: string
  /** Esconde o <label> visual (usado quando o campo já tem contexto, ex: título). */
  showLabel?: boolean
  /** Sobrescreve a classe do select/input — útil pra igualar um estilo de título grande. */
  fieldClassName?: string
}

/**
 * Select com a base real de valores já cadastrados (evita erro de
 * digitação / variação de nome pro mesmo curso, faculdade ou cidade) +
 * opção "Outro" pra cadastrar um valor novo quando ainda não existe na
 * base. Mesmo padrão já usado no formulário público de Captação.
 */
export default function DropdownComOutro({
  label,
  value,
  options,
  onSave,
  variant = 'boxed',
  placeholder = 'Selecione...',
  showLabel = true,
  fieldClassName,
}: DropdownComOutroProps) {
  const conhecido = !value || options.includes(value)
  const [modoOutro, setModoOutro] = useState(!conhecido)

  const selectClass =
    fieldClassName ||
    (variant === 'boxed'
      ? 'w-full bg-[#111820] border border-white/10 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-orange-500'
      : 'w-full bg-transparent border-b border-transparent hover:border-slate-300 dark:hover:border-slate-700 focus:border-orange-500 font-semibold text-slate-800 dark:text-slate-200 focus:outline-none px-0.5 py-1')
  const labelClass =
    variant === 'boxed'
      ? 'block text-[9px] text-slate-500 mb-0.5 uppercase tracking-wide'
      : 'block text-slate-500 mb-0.5'

  if (modoOutro) {
    return (
      <div>
        {showLabel && <label className={labelClass}>{label}</label>}
        <div className="flex items-center gap-1">
          <input
            key={value}
            autoFocus
            type="text"
            defaultValue={value}
            onBlur={(e) => {
              const v = e.target.value.trim()
              if (v && v !== value) onSave(v)
            }}
            placeholder={placeholder}
            className={selectClass}
          />
          {options.length > 0 && (
            <button
              type="button"
              title="Escolher da lista"
              onClick={() => setModoOutro(false)}
              className="text-slate-400 hover:text-white text-[10px] shrink-0"
            >
              ▾
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div>
      {showLabel && <label className={labelClass}>{label}</label>}
      <select
        value={value}
        onChange={(e) => {
          if (e.target.value === OUTRO) {
            setModoOutro(true)
            return
          }
          onSave(e.target.value)
        }}
        className={selectClass}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        <option value={OUTRO}>Outro (não está na lista)</option>
      </select>
    </div>
  )
}
