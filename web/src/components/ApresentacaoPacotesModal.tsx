import { useState } from 'react'
import { X, ChevronLeft, ChevronRight, Printer, Instagram, Phone, Mail } from 'lucide-react'
import type { Lead } from '@/types/crm'
import { getFullTurmaName } from '@/types/crm'
import type { PacoteTurma } from '@/utils/pacotesTurma'
import type { SGELink } from '@/utils/sgeIntegration'

const ORANGE = '#f97316'

function brl(v: number): string {
  return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

interface ApresentacaoPacotesModalProps {
  lead: Lead
  pacotes: PacoteTurma[]
  sgeLink?: SGELink | null
  onClose: () => void
}

export default function ApresentacaoPacotesModal({
  lead,
  pacotes,
  sgeLink,
  onClose,
}: ApresentacaoPacotesModalProps) {
  const pacotesOrdenados = [...pacotes].sort((a, b) => b.valor - a.valor)
  const totalSlides = 1 + pacotesOrdenados.length + 1
  const [index, setIndex] = useState(0)

  const irPara = (i: number) => setIndex(Math.max(0, Math.min(totalSlides - 1, i)))

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #apresentacao-print-area, #apresentacao-print-area * { visibility: visible; }
          #apresentacao-print-area { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
        }
      `}</style>

      <button
        type="button"
        onClick={onClose}
        className="no-print absolute top-4 right-4 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"
      >
        <X className="w-5 h-5" />
      </button>
      <button
        type="button"
        onClick={() => window.print()}
        className="no-print absolute top-4 right-16 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"
        title="Baixar / Imprimir PDF"
      >
        <Printer className="w-5 h-5" />
      </button>

      <div id="apresentacao-print-area" className="w-full h-full flex items-center justify-center">
        {index === 0 && <SlideCapa lead={lead} />}
        {index > 0 && index <= pacotesOrdenados.length && (
          <SlidePacote pacote={pacotesOrdenados[index - 1]} />
        )}
        {index === totalSlides - 1 && <SlideContato lead={lead} sgeLink={sgeLink} />}
      </div>

      {!!totalSlides && (
        <div className="no-print absolute bottom-4 left-0 right-0 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => irPara(index - 1)}
            disabled={index === 0}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white disabled:opacity-30"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-1.5">
            {Array.from({ length: totalSlides }).map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => irPara(i)}
                className={`h-1.5 rounded-full transition-all ${
                  i === index ? 'w-5 bg-orange-400' : 'w-1.5 bg-white/20 hover:bg-white/40'
                }`}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => irPara(index + 1)}
            disabled={index === totalSlides - 1}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white disabled:opacity-30"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  )
}

function SlideShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full max-w-[960px] aspect-[16/9] mx-4 bg-[#0a0a0a] text-white flex flex-col p-10 sm:p-14 relative overflow-hidden border border-white/10">
      <div className="absolute top-0 left-0 right-0 h-1" style={{ background: ORANGE }} />
      {children}
      <div className="flex items-center justify-between pt-4 mt-auto text-[10px] tracking-[0.15em] text-slate-500 uppercase">
        <span>Amor In Formaturas</span>
        <span>Confidencial</span>
      </div>
    </div>
  )
}

function SlideCapa({ lead }: { lead: Lead }) {
  return (
    <SlideShell>
      <div className="flex-1 flex flex-col items-center justify-center text-center">
        <div className="text-[11px] tracking-[0.3em] text-slate-400 uppercase mb-4">
          Amor In Formaturas
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold">{getFullTurmaName(lead)}</h1>
        <div className="w-16 h-px bg-white/20 my-6" />
        <div className="text-sm text-slate-400 uppercase tracking-[0.2em]">Orçamento de Pacotes</div>
      </div>
    </SlideShell>
  )
}

function SlidePacote({ pacote }: { pacote: PacoteTurma }) {
  const parcela = pacote.parcelas > 0 ? pacote.valor / pacote.parcelas : pacote.valor
  return (
    <SlideShell>
      <div className="flex-1 flex flex-col justify-center">
        <div className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-1">Pacote</div>
        <h2 className="text-4xl sm:text-5xl font-bold mb-6" style={{ color: ORANGE }}>
          {pacote.nome}
        </h2>
        {pacote.itens.length > 0 && (
          <ul className="space-y-1.5 mb-6 text-sm text-slate-200">
            {pacote.itens.map((item, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: ORANGE }} />
                {item}
              </li>
            ))}
          </ul>
        )}
        <div className="text-3xl font-bold">{brl(pacote.valor)}</div>
        <div className="text-sm text-slate-400 mt-1">
          {pacote.parcelas}x de {brl(parcela)}
        </div>
      </div>
    </SlideShell>
  )
}

function SlideContato({ lead, sgeLink }: { lead: Lead; sgeLink?: SGELink | null }) {
  return (
    <SlideShell>
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
        {sgeLink && (
          <div className="mt-4 text-xs text-slate-500 uppercase tracking-[0.2em]">
            Código da Turma: <span className="text-white font-mono">{sgeLink.sgeProjectCode}</span>
          </div>
        )}
      </div>
    </SlideShell>
  )
}
