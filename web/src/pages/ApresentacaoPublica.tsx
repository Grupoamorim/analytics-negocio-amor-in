import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Instagram } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'

const ORANGE = '#f97316'

interface Pacote {
  nome: string
  valor: number
  parcelas: number
  itens: string[]
}
interface Dados {
  titulo: string
  nomeTurma: string
  empresa: string
  mensagem: string | null
  fotos: string[]
  pacotes: Pacote[]
}

function brl(v: number) {
  return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function ApresentacaoPublica() {
  const { token } = useParams<{ token: string }>()
  const [dados, setDados] = useState<Dados | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [i, setI] = useState(0)

  useEffect(() => {
    if (!token) return
    supabase.functions
      .invoke('apresentacao-publica', { body: { token } })
      .then(({ data, error }) => {
        if (error || data?.error) {
          setErro(data?.error || 'Apresentação indisponível')
          return
        }
        setDados(data as Dados)
      })
      .catch(() => setErro('Não foi possível carregar a apresentação'))
  }, [token])

  if (erro)
    return (
      <div className="min-h-screen bg-[#0a0f14] flex items-center justify-center text-slate-400 text-sm px-6 text-center">
        {erro}
      </div>
    )
  if (!dados)
    return (
      <div className="min-h-screen bg-[#0a0f14] flex items-center justify-center text-slate-500 text-sm">
        Carregando…
      </div>
    )

  // slides: capa, [fotos], pacotes..., contato
  const temFotos = dados.fotos.length > 0
  const slides: ('capa' | 'fotos' | 'contato' | { pacote: Pacote })[] = [
    'capa',
    ...(temFotos ? (['fotos'] as const) : []),
    ...dados.pacotes.map((p) => ({ pacote: p })),
    'contato',
  ]
  const total = slides.length
  const ir = (n: number) => setI(Math.max(0, Math.min(total - 1, n)))
  const atual = slides[i]

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-2xl aspect-[4/3] sm:aspect-[16/10] bg-[#0d1117] border border-white/10 rounded-2xl p-6 sm:p-10 flex flex-col overflow-hidden">
          <div className="text-[10px] tracking-[0.3em] text-slate-500 uppercase">
            {dados.empresa} · Amor In Formaturas
          </div>

          {atual === 'capa' && (
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <h1 className="text-2xl sm:text-4xl font-bold">{dados.nomeTurma || dados.titulo}</h1>
              <div className="w-16 h-px bg-white/20 my-5" />
              <div className="text-xs sm:text-sm text-slate-400 uppercase tracking-[0.2em]">
                Apresentação de Pacotes
              </div>
              {dados.mensagem && (
                <p className="mt-6 text-sm text-slate-300 max-w-md whitespace-pre-wrap">{dados.mensagem}</p>
              )}
            </div>
          )}

          {atual === 'fotos' && (
            <div className="flex-1 overflow-y-auto py-4">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-3">Nossas fotos</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {dados.fotos.map((url) => (
                  <img
                    key={url}
                    src={url}
                    alt=""
                    className="w-full aspect-square object-cover rounded-lg border border-white/10"
                  />
                ))}
              </div>
            </div>
          )}

          {typeof atual === 'object' && 'pacote' in atual && (
            <div className="flex-1 flex flex-col justify-center">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-1">Pacote</div>
              <h2 className="text-3xl sm:text-4xl font-bold mb-4" style={{ color: ORANGE }}>
                {atual.pacote.nome}
              </h2>
              {atual.pacote.itens.length > 0 && (
                <ul className="space-y-1.5 mb-5 text-sm text-slate-200">
                  {atual.pacote.itens.map((it, k) => (
                    <li key={k} className="flex items-center gap-2">
                      <span
                        className="w-1 h-1 rounded-full flex-shrink-0"
                        style={{ background: ORANGE }}
                      />
                      {it}
                    </li>
                  ))}
                </ul>
              )}
              <div className="text-2xl sm:text-3xl font-bold">{brl(atual.pacote.valor)}</div>
              <div className="text-sm text-slate-400 mt-1">
                {atual.pacote.parcelas}x de{' '}
                {brl(atual.pacote.parcelas > 0 ? atual.pacote.valor / atual.pacote.parcelas : atual.pacote.valor)}
              </div>
            </div>
          )}

          {atual === 'contato' && (
            <div className="flex-1 flex flex-col items-center justify-center text-center gap-3">
              <h2 className="text-xl font-bold">Contato</h2>
              <div className="flex items-center justify-center gap-2 text-sm text-slate-300">
                <Instagram className="w-4 h-4" style={{ color: ORANGE }} /> @amorinformaturas
              </div>
              <div className="text-sm text-slate-400">adm@lucasamorim.com.br</div>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-center gap-3 pb-6">
        <button
          type="button"
          onClick={() => ir(i - 1)}
          disabled={i === 0}
          className="p-2 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <span className="text-xs text-slate-500">
          {i + 1} / {total}
        </span>
        <button
          type="button"
          onClick={() => ir(i + 1)}
          disabled={i === total - 1}
          className="p-2 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  )
}
