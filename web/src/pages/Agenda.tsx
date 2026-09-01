import { useEffect, useMemo, useState } from 'react'
import { CalendarClock, ExternalLink, X } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { useAcesso } from '@/context/AcessoContext'
import ResponsavelFilterBar from '@/components/ResponsavelFilterBar'
import { SortControl, sortByField, type SortDirection } from '@/components/SortControl'

interface ReuniaoRow {
  id: string
  titulo: string
  tipo_reuniao: string
  modalidade: string
  inicio: string
  fim: string
  responsavel: string | null
  status: string
  gcal_html_link: string | null
  turma_id: string | null
}

const MODALIDADE_LABEL: Record<string, string> = {
  'PR-F': 'Presencial Fora',
  'PR-S': 'Presencial Estúdio',
  ON: 'Online',
}

const SORT_OPTIONS = [
  { value: 'inicio', label: 'Data' },
  { value: 'titulo', label: 'Título' },
  { value: 'responsavel', label: 'Responsável' },
  { value: 'tipo_reuniao', label: 'Tipo' },
]

function extrairCampo(r: ReuniaoRow, campo: string): unknown {
  if (campo === 'inicio') return new Date(r.inicio).getTime()
  return (r as any)[campo]
}

export default function Agenda() {
  const { toast } = useToast()
  const { minhaVisao, filtroPessoalAtivo } = useAcesso()
  const [reunioes, setReunioes] = useState<ReuniaoRow[]>([])
  const [carregando, setCarregando] = useState(true)
  const [mostrarPassadas, setMostrarPassadas] = useState(false)
  const [sortKey, setSortKey] = useState('inicio')
  const [sortDir, setSortDir] = useState<SortDirection>('asc')
  const [cancelandoId, setCancelandoId] = useState<string | null>(null)

  async function carregar() {
    setCarregando(true)
    // reunioes_agendadas é nova e ainda não está no types.ts gerado — cast como o resto do projeto faz.
    const { data } = await (supabase as any)
      .from('reunioes_agendadas')
      .select('id, titulo, tipo_reuniao, modalidade, inicio, fim, responsavel, status, gcal_html_link, turma_id')
      .order('inicio', { ascending: true })
    setReunioes((data as ReuniaoRow[]) || [])
    setCarregando(false)
  }

  useEffect(() => {
    carregar()
  }, [])

  const filtradas = useMemo(() => {
    const agora = Date.now()
    let lista = reunioes.filter((r) => r.status !== 'cancelada')
    if (!mostrarPassadas) lista = lista.filter((r) => new Date(r.fim).getTime() >= agora - 3600_000)
    if (filtroPessoalAtivo) {
      lista = lista.filter((r) => minhaVisao({ nomes: [r.responsavel] }))
    }
    return sortByField(lista, sortKey, sortDir, extrairCampo)
  }, [reunioes, mostrarPassadas, filtroPessoalAtivo, minhaVisao, sortKey, sortDir])

  async function cancelar(r: ReuniaoRow) {
    if (!confirm(`Cancelar "${r.titulo}"? O evento sai da agenda AMOR IN GESTÃO.`)) return
    setCancelandoId(r.id)
    try {
      const { data: s } = await supabase.auth.getSession()
      const token = s.session?.access_token
      const { data, error } = await supabase.functions.invoke('agendar-reuniao', {
        body: { acao: 'cancelar', id: r.id },
        headers: { Authorization: `Bearer ${token}` },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      toast({ title: 'Reunião cancelada' })
      setReunioes((prev) => prev.map((x) => (x.id === r.id ? { ...x, status: 'cancelada' } : x)))
    } catch (e: any) {
      toast({ title: 'Erro ao cancelar', description: e.message, variant: 'destructive' })
    } finally {
      setCancelandoId(null)
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <CalendarClock className="w-5 h-5 text-orange-400" />
        <h1 className="text-lg font-semibold text-white">Agenda</h1>
      </div>
      <p className="text-xs text-slate-400 -mt-2">
        Reuniões agendadas pelas turmas. Também aparecem na agenda <strong>AMOR IN GESTÃO</strong> do
        Google, compartilhada com todo mundo.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <ResponsavelFilterBar />
        <SortControl
          options={SORT_OPTIONS}
          field={sortKey}
          direction={sortDir}
          onFieldChange={setSortKey}
          onDirectionToggle={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
        />
        <label className="flex items-center gap-1.5 text-xs text-slate-300">
          <input
            type="checkbox"
            checked={mostrarPassadas}
            onChange={(e) => setMostrarPassadas(e.target.checked)}
            className="accent-orange-500"
          />
          Mostrar passadas
        </label>
      </div>

      {carregando ? (
        <p className="text-sm text-slate-400">Carregando…</p>
      ) : filtradas.length === 0 ? (
        <p className="text-sm text-slate-400">Nenhuma reunião {mostrarPassadas ? '' : 'futura '}agendada.</p>
      ) : (
        <div className="space-y-2">
          {filtradas.map((r) => {
            const ini = new Date(r.inicio)
            const passada = new Date(r.fim).getTime() < Date.now()
            return (
              <div
                key={r.id}
                className={`rounded-xl border border-white/[0.06] bg-[#111820] p-3 flex items-start gap-3 ${
                  passada ? 'opacity-60' : ''
                }`}
              >
                <div className="text-center shrink-0 w-14">
                  <div className="text-[10px] uppercase text-slate-500">
                    {ini.toLocaleDateString('pt-BR', { month: 'short' })}
                  </div>
                  <div className="text-xl font-bold text-white leading-none">{ini.getDate()}</div>
                  <div className="text-[11px] text-slate-400">
                    {ini.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-slate-200 break-words">{r.titulo}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap gap-x-3">
                    <span>{MODALIDADE_LABEL[r.modalidade] || r.modalidade}</span>
                    {r.responsavel && <span>· {r.responsavel}</span>}
                    <span>
                      ·{' '}
                      {ini.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {r.gcal_html_link && (
                    <a
                      href={r.gcal_html_link}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-slate-400 hover:text-orange-400 inline-flex items-center gap-1"
                    >
                      <ExternalLink className="w-3 h-3" /> Google
                    </a>
                  )}
                  {!passada && (
                    <button
                      type="button"
                      onClick={() => cancelar(r)}
                      disabled={cancelandoId === r.id}
                      className="text-[11px] text-slate-500 hover:text-red-400 inline-flex items-center gap-1"
                    >
                      <X className="w-3 h-3" /> {cancelandoId === r.id ? '…' : 'Cancelar'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
