import { UserRound } from 'lucide-react'

interface LastEditedByProps {
  email?: string
  updatedAt?: string
  className?: string
}

/** Mostra "Editado por fulano@email — 23/08/2026 14:32" quando há dado de
 * auditoria; não renderiza nada em registros antigos que ainda não têm
 * updated_by preenchido (evita inventar um responsável que não existe). */
export default function LastEditedBy({ email, updatedAt, className = '' }: LastEditedByProps) {
  if (!email && !updatedAt) return null

  const dataFormatada = updatedAt
    ? new Date(updatedAt).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[11px] text-slate-500 ${className}`}
      title={email && dataFormatada ? `Editado por ${email} em ${dataFormatada}` : undefined}
    >
      <UserRound className="w-3 h-3 flex-shrink-0" />
      {email ? <span className="text-slate-400">{email}</span> : null}
      {email && dataFormatada ? <span>·</span> : null}
      {dataFormatada}
    </span>
  )
}
