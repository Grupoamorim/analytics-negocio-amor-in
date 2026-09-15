import { useEffect, useRef } from 'react'
import { Sparkles, Loader2, X } from 'lucide-react'
import { useAnaliseItemIA } from '@/hooks/useAnaliseItemIA'

/**
 * Botão "Analisar com IA" reaproveitável em qualquer card/seção do sistema — mesmo padrão do
 * PaceBand: sob clique, manda um prompt específico daquele item pro Gemini e mostra o retorno
 * (feedback + proposta de ação) num card flutuante abaixo do botão. Nunca dispara sozinho.
 *
 * Pensado pra ficar ao lado do título/nome da seção (ex: `<h2>Título <BotaoAnaliseIA .../></h2>`)
 * — o wrapper é `inline-block relative`, então flui junto com o texto/título em qualquer
 * container (flex, inline, tabela...), e o resultado aparece como um card flutuante (`absolute`)
 * centralizado embaixo do botão, sem empurrar o layout ao redor.
 */
export default function BotaoAnaliseIA({
  promptBuilder,
  label = 'Analisar com IA',
  compact = false,
  className = '',
}: {
  promptBuilder: () => string
  label?: string
  /** Ícone sozinho (sem texto), pra caber ao lado de nomes/títulos mais apertados (ex: linha de tabela, card de negociação). */
  compact?: boolean
  className?: string
}) {
  const { analise, carregando, erro, analisar, limpar, mensagemPensando } = useAnaliseItemIA(promptBuilder)
  const containerRef = useRef<HTMLSpanElement>(null)
  const aberto = !!(erro || analise)

  // Fecha ao clicar fora do card flutuante — sem isso ele ficava aberto pra sempre até analisar
  // de novo, sem jeito nenhum de dispensar.
  useEffect(() => {
    if (!aberto) return
    function handleClickFora(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        limpar()
      }
    }
    document.addEventListener('mousedown', handleClickFora)
    return () => document.removeEventListener('mousedown', handleClickFora)
  }, [aberto, limpar])

  return (
    <span ref={containerRef} className={`relative inline-block align-middle ${className}`}>
      <button
        type="button"
        onClick={analisar}
        disabled={carregando}
        title={compact ? label : undefined}
        className={
          compact
            ? 'inline-flex items-center justify-center gap-1 text-orange-300 bg-orange-500/10 border border-orange-500/25 rounded-full w-6 h-6 shrink-0 hover:bg-orange-500/20 disabled:opacity-50'
            : 'inline-flex items-center gap-1.5 text-xs font-semibold text-orange-300 bg-orange-500/10 border border-orange-500/25 rounded-lg px-3 py-1.5 hover:bg-orange-500/20 disabled:opacity-50 shrink-0'
        }
      >
        {carregando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
        {!compact && (carregando ? mensagemPensando : label)}
      </button>
      {aberto && (
        <div className="absolute z-20 top-full mt-2 left-1/2 -translate-x-1/2 w-80 max-w-[90vw]">
          <button
            type="button"
            onClick={limpar}
            title="Fechar"
            className="absolute -top-2 -right-2 z-10 flex items-center justify-center w-5 h-5 rounded-full bg-[#1e2732] border border-white/15 text-slate-400 hover:text-white hover:bg-[#2a3441]"
          >
            <X className="w-3 h-3" />
          </button>
          {erro && (
            <p className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/25 text-[11px] text-rose-300">
              {erro}
            </p>
          )}
          {analise && (
            <div className="p-3 rounded-lg bg-[#161d26] border border-white/10 shadow-xl text-xs text-slate-300 whitespace-pre-wrap leading-relaxed text-left">
              {analise}
            </div>
          )}
        </div>
      )}
    </span>
  )
}
