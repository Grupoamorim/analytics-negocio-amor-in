import { useState } from 'react'
import { callGemini, getGeminiApiKey } from '@/utils/geminiApi'
import { useTempoDecorrido, mensagemPensando } from '@/hooks/useTempoDecorrido'

/**
 * Analisa UM item específico com IA sob clique (nunca automático) — mesmo padrão do botão
 * "Analisar meta com IA" do PaceBand, generalizado pra qualquer card do sistema.
 * `promptBuilder` é chamado só no clique, pra sempre montar o prompt com o dado mais atual da tela.
 */
export function useAnaliseItemIA(promptBuilder: () => string) {
  const [analise, setAnalise] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const tempo = useTempoDecorrido(carregando)

  async function analisar() {
    if (!getGeminiApiKey()) {
      setErro('Configure a chave do Gemini em Administração → IA.')
      return
    }
    setCarregando(true)
    setErro(null)
    try {
      const res = await callGemini(promptBuilder())
      setAnalise(res)
    } catch (e: any) {
      setErro(e?.message || 'Não foi possível analisar agora.')
    } finally {
      setCarregando(false)
    }
  }

  function limpar() {
    setAnalise(null)
    setErro(null)
  }

  return {
    analise,
    carregando,
    erro,
    analisar,
    limpar,
    mensagemPensando: mensagemPensando(tempo),
  }
}
