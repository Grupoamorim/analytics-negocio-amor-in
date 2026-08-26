interface InlineEditTextProps {
  value: string
  onSave: (value: string) => void
  placeholder?: string
  type?: string
  className?: string
}

/**
 * Campo de texto editável no lugar: clica, edita, sai do campo (blur) e
 * salva sozinho — sem passo extra de "Editar" nem modal. Usado em tabelas
 * de itens (Contatos, Captação etc.) que antes exigiam abrir um formulário
 * pra mudar um campo só.
 */
export default function InlineEditText({
  value,
  onSave,
  placeholder,
  type = 'text',
  className = '',
}: InlineEditTextProps) {
  return (
    <input
      key={value}
      type={type}
      defaultValue={value}
      placeholder={placeholder || '—'}
      onBlur={(e) => {
        const next = e.target.value.trim()
        if (next !== value) onSave(next)
      }}
      onClick={(e) => e.stopPropagation()}
      className={`w-full bg-transparent border-b border-transparent hover:border-white/20 focus:border-orange-500 focus:outline-none px-0.5 py-0.5 placeholder-slate-500 transition-colors ${className}`}
    />
  )
}
