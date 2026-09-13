import { useEffect, useRef, useState } from 'react'

/** Segundos decorridos desde que `ativo` virou true — reseta assim que volta a false. Serve pra
 * mostrar ao usuário, em tempo real, há quanto tempo uma chamada de IA está rodando (sem isso,
 * uma resposta demorada parece travada em vez de só estar processando). */
export function useTempoDecorrido(ativo: boolean): number {
  const [segundos, setSegundos] = useState(0)
  const inicioRef = useRef<number>(0)

  useEffect(() => {
    if (!ativo) {
      setSegundos(0)
      return
    }
    inicioRef.current = Date.now()
    setSegundos(0)
    const id = setInterval(() => {
      setSegundos(Math.floor((Date.now() - inicioRef.current) / 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [ativo])

  return segundos
}

/** Mensagem que evolui com o tempo decorrido, pra deixar claro que a IA ainda está trabalhando
 * (não travada) mesmo quando demora mais que o normal. */
export function mensagemPensando(segundos: number): string {
  if (segundos < 5) return 'Pensando...'
  if (segundos < 15) return 'Analisando os dados...'
  if (segundos < 35) return 'Ainda processando, quase lá...'
  return `Ainda trabalhando nisso (${segundos}s) — às vezes demora um pouco mais, aguarde...`
}
