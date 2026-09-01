import { useMemo, useState } from 'react'
import { Info } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { supabase } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { getFullTurmaName } from '@/types/crm'
import type { Lead } from '@/types/crm'

const MODALIDADES = [
  { valor: 'PR-F', label: 'Presencial Fora', desc: 'Reunião presencial fora do estúdio (na faculdade, num espaço da comissão etc.).' },
  { valor: 'PR-S', label: 'Presencial Estúdio', desc: 'Reunião presencial no nosso estúdio.' },
  { valor: 'ON', label: 'Online', desc: 'Reunião online (Google Meet, Zoom etc.).' },
] as const

const TIPOS = ['Comissão', 'Turma', 'Turma B', 'Turma C', 'Matutino', 'Noturno']

function toLocalInput(d: Date) {
  const off = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - off).toISOString().slice(0, 16)
}

export default function AgendarReuniaoModal({
  lead,
  open,
  onOpenChange,
  onAgendada,
}: {
  lead: Lead
  open: boolean
  onOpenChange: (v: boolean) => void
  onAgendada?: () => void
}) {
  const { toast } = useToast()
  const [tipo, setTipo] = useState('Comissão')
  const [modalidade, setModalidade] = useState<string>('PR-F')
  const [textoExtra, setTextoExtra] = useState('')
  const [quando, setQuando] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    d.setHours(10, 0, 0, 0)
    return toLocalInput(d)
  })
  const [duracao, setDuracao] = useState(60)
  const [responsavel, setResponsavel] = useState(lead.closer || lead.sdr || '')
  const [salvando, setSalvando] = useState(false)

  const nomeTurma = getFullTurmaName(lead)
  const tituloPreview = useMemo(() => {
    const extra = textoExtra.trim()
    return `Apresentação ${extra ? extra + ' ' : ''}${tipo} ${nomeTurma} (${modalidade})`
  }, [textoExtra, tipo, nomeTurma, modalidade])

  async function agendar() {
    if (!quando) return
    setSalvando(true)
    try {
      const { data: s } = await supabase.auth.getSession()
      const token = s.session?.access_token
      if (!token) throw new Error('Sessão expirada, faça login de novo.')

      const inicio = new Date(quando)
      const fim = new Date(inicio.getTime() + duracao * 60000)

      const { data, error } = await supabase.functions.invoke('agendar-reuniao', {
        body: {
          acao: 'criar',
          turma_id: lead.id,
          tipo_reuniao: tipo,
          modalidade,
          texto_extra: textoExtra.trim() || null,
          inicio: inicio.toISOString(),
          fim: fim.toISOString(),
          responsavel: responsavel.trim() || null,
        },
        headers: { Authorization: `Bearer ${token}` },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)

      toast({
        title: 'Reunião agendada',
        description: data?.reuniao?.gcal_html_link
          ? 'Criada na agenda AMOR IN GESTÃO.'
          : 'Salva no sistema (a agenda do Google ainda não está conectada).',
      })
      onAgendada?.()
      onOpenChange(false)
    } catch (e: any) {
      toast({
        title: 'Erro ao agendar',
        description: e.message || 'Não foi possível agendar a reunião.',
        variant: 'destructive',
      })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Agendar reunião</DialogTitle>
          <p className="text-xs text-slate-500">{nomeTurma}</p>
        </DialogHeader>

        <div className="space-y-3 text-xs">
          <div>
            <label className="text-slate-500 block mb-1">Tipo</label>
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              className="w-full bg-[#0a0f14] border border-white/10 rounded-lg px-2 py-2 text-slate-200"
            >
              {TIPOS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-slate-500 mb-1 flex items-center gap-1">
              Modalidade
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-help text-slate-400">
                      <Info className="w-3 h-3" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs text-xs p-2.5 space-y-1 bg-[#0a0f14] border-white/10 text-white">
                    {MODALIDADES.map((m) => (
                      <div key={m.valor}>
                        <span className="font-mono font-semibold text-orange-400">({m.valor})</span>{' '}
                        <span className="font-semibold">{m.label}</span> — {m.desc}
                      </div>
                    ))}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {MODALIDADES.map((m) => (
                <button
                  key={m.valor}
                  type="button"
                  onClick={() => setModalidade(m.valor)}
                  className={`rounded-lg border px-2 py-2 text-center transition-colors ${
                    modalidade === m.valor
                      ? 'border-orange-500 bg-orange-500/15 text-orange-300'
                      : 'border-white/10 text-slate-300 hover:border-white/20'
                  }`}
                >
                  <span className="block font-mono font-bold text-[11px]">({m.valor})</span>
                  <span className="block text-[10px] leading-tight">{m.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-slate-500 block mb-1">
              Texto a mais no título <span className="text-slate-600">(opcional)</span>
            </label>
            <input
              value={textoExtra}
              onChange={(e) => setTextoExtra(e.target.value)}
              placeholder="ex: 2ª rodada, com pais…"
              className="w-full bg-[#0a0f14] border border-white/10 rounded-lg px-2 py-2 text-slate-200 placeholder-slate-600"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-slate-500 block mb-1">Quando</label>
              <input
                type="datetime-local"
                value={quando}
                onChange={(e) => setQuando(e.target.value)}
                className="w-full bg-[#0a0f14] border border-white/10 rounded-lg px-2 py-2 text-slate-200"
              />
            </div>
            <div>
              <label className="text-slate-500 block mb-1">Duração (min)</label>
              <input
                type="number"
                min={15}
                step={15}
                value={duracao}
                onChange={(e) => setDuracao(Number(e.target.value) || 60)}
                className="w-full bg-[#0a0f14] border border-white/10 rounded-lg px-2 py-2 text-slate-200"
              />
            </div>
          </div>

          <div>
            <label className="text-slate-500 block mb-1">Responsável</label>
            <input
              value={responsavel}
              onChange={(e) => setResponsavel(e.target.value)}
              placeholder="closer / SDR"
              className="w-full bg-[#0a0f14] border border-white/10 rounded-lg px-2 py-2 text-slate-200 placeholder-slate-600"
            />
          </div>

          <div className="rounded-lg bg-slate-900/60 border border-white/10 p-2">
            <span className="text-slate-500 block mb-0.5">Título do evento</span>
            <span className="text-slate-200 break-words">{tituloPreview}</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={salvando}>
            Cancelar
          </Button>
          <Button
            onClick={agendar}
            disabled={salvando || !quando}
            className="bg-orange-500 hover:bg-orange-600 text-white"
          >
            {salvando ? 'Agendando…' : 'Agendar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
