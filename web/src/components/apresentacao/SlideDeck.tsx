// Slideshow da apresentação da turma. Usado tanto no app (modal "Ver
// Apresentação") quanto na página pública /p/:token que vai pro cliente.
// A ARTE mora toda aqui.
import { useState } from 'react'
import { ChevronLeft, ChevronRight, Instagram, Phone, Mail, Printer, X } from 'lucide-react'

export const ORANGE = '#f97316'

export interface PacoteSlide {
  nome: string
  valor: number
  parcelas: number
  itens: string[]
}

export interface DeckData {
  nomeTurma: string
  /** Subtítulo da capa. Ex: "Apresentação de Pacotes". */
  subtitulo?: string
  /** Recado curto na capa (só na versão pública). */
  mensagem?: string | null
  logoUrl?: string | null
  fotos: string[]
  pacotes: PacoteSlide[]
  codigoTurma?: string | null
  /** Mostra "Confidencial" no rodapé (versão interna). */
  confidencial?: boolean
}

function brl(v: number): string {
  return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function SlideShell({
  children,
  confidencial,
  logoUrl,
}: {
  children: React.ReactNode
  confidencial?: boolean
  logoUrl?: string | null
}) {
  return (
    <div className="w-full max-w-[960px] aspect-[16/9] mx-4 bg-[#0a0a0a] text-white flex flex-col p-8 sm:p-14 relative overflow-hidden border border-white/10">
      <div className="absolute top-0 left-0 right-0 h-1" style={{ background: ORANGE }} />
      {children}
      <div className="flex items-center justify-between pt-4 mt-auto text-[10px] tracking-[0.15em] text-slate-500 uppercase">
        <span className="flex items-center gap-2">
          {logoUrl && <img src={logoUrl} alt="" className="h-4 w-auto opacity-70" />}
          Amor In Formaturas
        </span>
        {confidencial && <span>Confidencial</span>}
      </div>
    </div>
  )
}

function SlideCapa({ d }: { d: DeckData }) {
  return (
    <SlideShell confidencial={d.confidencial} logoUrl={d.logoUrl}>
      <div className="flex-1 flex flex-col items-center justify-center text-center">
        {d.logoUrl && <img src={d.logoUrl} alt="" className="h-10 w-auto mb-6 opacity-90" />}
        <div className="text-[11px] tracking-[0.3em] text-slate-400 uppercase mb-3">
          Amor In Formaturas
        </div>
        <h1 className="text-2xl sm:text-4xl font-bold">{d.nomeTurma}</h1>
        <div className="w-16 h-px bg-white/20 my-5" />
        <div className="text-sm text-slate-400 uppercase tracking-[0.2em]">
          {d.subtitulo || 'Apresentação de Pacotes'}
        </div>
        {d.mensagem && (
          <p className="mt-6 text-sm text-slate-300 max-w-md whitespace-pre-wrap">{d.mensagem}</p>
        )}
      </div>
    </SlideShell>
  )
}

function SlideFotos({ d }: { d: DeckData }) {
  return (
    <SlideShell confidencial={d.confidencial} logoUrl={d.logoUrl}>
      <div className="flex-1 overflow-y-auto">
        <div className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-3">Nossas fotos</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {d.fotos.map((url) => (
            <img
              key={url}
              src={url}
              alt=""
              className="w-full aspect-square object-cover rounded-lg border border-white/10"
            />
          ))}
        </div>
      </div>
    </SlideShell>
  )
}

function SlidePacote({ d, pacote }: { d: DeckData; pacote: PacoteSlide }) {
  const parcela = pacote.parcelas > 0 ? pacote.valor / pacote.parcelas : pacote.valor
  return (
    <SlideShell confidencial={d.confidencial} logoUrl={d.logoUrl}>
      <div className="flex-1 flex flex-col justify-center">
        <div className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-1">Pacote</div>
        <h2 className="text-3xl sm:text-5xl font-bold mb-5" style={{ color: ORANGE }}>
          {pacote.nome}
        </h2>
        {pacote.itens.length > 0 && (
          <ul className="space-y-1.5 mb-5 text-sm text-slate-200">
            {pacote.itens.map((item, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: ORANGE }} />
                {item}
              </li>
            ))}
          </ul>
        )}
        <div className="text-2xl sm:text-3xl font-bold">{brl(pacote.valor)}</div>
        <div className="text-sm text-slate-400 mt-1">
          {pacote.parcelas}x de {brl(parcela)}
        </div>
      </div>
    </SlideShell>
  )
}

function SlideContato({ d }: { d: DeckData }) {
  return (
    <SlideShell confidencial={d.confidencial} logoUrl={d.logoUrl}>
      <div className="flex-1 flex flex-col items-center justify-center text-center gap-4">
        <h2 className="text-2xl font-bold">Contato</h2>
        <div className="space-y-2 text-sm text-slate-300">
          <div className="flex items-center justify-center gap-2">
            <Instagram className="w-4 h-4" style={{ color: ORANGE }} /> @amorinformaturas
          </div>
          <div className="flex items-center justify-center gap-2">
            <Phone className="w-4 h-4" style={{ color: ORANGE }} /> Grupo Lucas Amorim
          </div>
          <div className="flex items-center justify-center gap-2">
            <Mail className="w-4 h-4" style={{ color: ORANGE }} /> adm@lucasamorim.com.br
          </div>
        </div>
        {d.codigoTurma && (
          <div className="mt-4 text-xs text-slate-500 uppercase tracking-[0.2em]">
            Código da Turma: <span className="text-white font-mono">{d.codigoTurma}</span>
          </div>
        )}
      </div>
    </SlideShell>
  )
}

export default function SlideDeck({
  data,
  onClose,
  showPrint,
}: {
  data: DeckData
  onClose?: () => void
  showPrint?: boolean
}) {
  const pacotes = [...data.pacotes].sort((a, b) => b.valor - a.valor)
  const temFotos = data.fotos.length > 0
  const total = 1 + (temFotos ? 1 : 0) + pacotes.length + 1
  const [i, setI] = useState(0)
  const ir = (n: number) => setI(Math.max(0, Math.min(total - 1, n)))

  const idxFotos = temFotos ? 1 : -1
  const idxContato = total - 1

  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #deck-print, #deck-print * { visibility: visible; }
          #deck-print { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
        }
      `}</style>

      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="no-print absolute top-4 right-4 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"
        >
          <X className="w-5 h-5" />
        </button>
      )}
      {showPrint && (
        <button
          type="button"
          onClick={() => window.print()}
          title="Baixar / Imprimir PDF"
          className="no-print absolute top-4 right-16 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"
        >
          <Printer className="w-5 h-5" />
        </button>
      )}

      <div id="deck-print" className="w-full flex-1 flex items-center justify-center">
        {i === 0 && <SlideCapa d={data} />}
        {i === idxFotos && <SlideFotos d={data} />}
        {i > idxFotos && i < idxContato && (
          <SlidePacote d={data} pacote={pacotes[i - 1 - (temFotos ? 1 : 0)]} />
        )}
        {i === idxContato && <SlideContato d={data} />}
      </div>

      <div className="no-print flex items-center justify-center gap-3 pb-6">
        <button
          type="button"
          onClick={() => ir(i - 1)}
          disabled={i === 0}
          className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white disabled:opacity-30"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-1.5">
          {Array.from({ length: total }).map((_, k) => (
            <button
              key={k}
              type="button"
              onClick={() => ir(k)}
              className={`h-1.5 rounded-full transition-all ${
                k === i ? 'w-5 bg-orange-400' : 'w-1.5 bg-white/20 hover:bg-white/40'
              }`}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => ir(i + 1)}
          disabled={i === total - 1}
          className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white disabled:opacity-30"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  )
}
