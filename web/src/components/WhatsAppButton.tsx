// Botão de atalho pra chamar um contato direto no WhatsApp — usado em Contatos, Turmas (contato
// principal) e no Funil (card/detalhe do deal). Some sozinho quando não há telefone válido.
import { MessageCircle } from 'lucide-react'
import { linkWhatsApp } from '@/utils/whatsapp'

export default function WhatsAppButton({
  telefone,
  className = '',
  size = 'w-4 h-4',
  title = 'Chamar no WhatsApp',
}: {
  telefone?: string | null
  className?: string
  size?: string
  title?: string
}) {
  const link = linkWhatsApp(telefone)
  if (!link) return null
  return (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      title={title}
      className={`inline-flex items-center justify-center text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 rounded-md transition-colors shrink-0 ${className}`}
    >
      <MessageCircle className={size} />
    </a>
  )
}
