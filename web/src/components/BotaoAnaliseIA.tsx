import { Sparkles, Loader2 } from 'lucide-react'
import { useAnaliseItemIA } from '@/hooks/useAnaliseItemIA'

/**
 * Botão "Analisar com IA" reaproveitável em qualquer card/seção do sistema — mesmo padrão do
 * PaceBand: sob clique, manda um prompt específico daquele item pro Gemini e mostra o retorno
 * (feedback + proposta de ação) num card abaixo do botão. Nunca dispara sozinho.
 */
export default function BotaoAnaliseIA({
  promptBuilder,
  label = 'Analisar com IA',
  className = '',
}: {
  promptBuilder: () => string
  label?: string
  className?: string
}) {
  const { analise, carregando, erro, analisar, mensagemPensando } = useAnaliseItemIA(promptBuilder)

  return (
    <div className={className}>
      <button
        type="button"
        onClick={analisar}
        disabled={carregando}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-orange-300 bg-orange-500/10 border border-orange-500/25 rounded-lg px-3 py-1.5 hover:bg-orange-500/20 disabled:opacity-50"
      >
        {carregando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
        {carregando ? mensagemPensando : label}
      </button>
      {erro && <p className="text-[11px] text-rose-400 mt-2">{erro}</p>}
      {analise && (
        <div className="mt-3 p-3 rounded-lg bg-white/[0.02] border border-white/[0.06] text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">
          {analise}
        </div>
      )}
    </div>
  )
}
