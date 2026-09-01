import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase/client'
import SlideDeck, { type DeckData } from '@/components/apresentacao/SlideDeck'

export default function ApresentacaoPublica() {
  const { token } = useParams<{ token: string }>()
  const [data, setData] = useState<DeckData | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    supabase.functions
      .invoke('apresentacao-publica', { body: { token } })
      .then(({ data: d, error }) => {
        if (error || d?.error) {
          setErro(d?.error || 'Apresentação indisponível')
          return
        }
        setData({
          nomeTurma: d.nomeTurma || d.titulo,
          subtitulo: 'Apresentação',
          mensagem: d.mensagem,
          logoUrl: d.logoUrl || null,
          fotos: d.fotos || [],
          pacotes: d.pacotes || [],
          confidencial: false,
        })
      })
      .catch(() => setErro('Não foi possível carregar a apresentação'))
  }, [token])

  if (erro)
    return (
      <div className="min-h-screen bg-[#0a0f14] flex items-center justify-center text-slate-400 text-sm px-6 text-center">
        {erro}
      </div>
    )
  if (!data)
    return (
      <div className="min-h-screen bg-[#0a0f14] flex items-center justify-center text-slate-500 text-sm">
        Carregando…
      </div>
    )

  return <SlideDeck data={data} />
}
