import { useEffect, useMemo, useRef, useState } from 'react'
import { MessageSquare, Mic, Link2, EyeOff, RefreshCw, Search } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { SortControl, type SortDirection } from '@/components/SortControl'
import {
  fetchConversasTurma,
  fetchGruposDaTurma,
  fetchGruposPendentes,
  gruposQueBatemComTurma,
  vincularGrupo,
  ignorarGrupo,
  type ConversaMsg,
  type ConversaGrupo,
} from '@/utils/conversas'

interface LeadLike {
  id: string
  curso?: string
  faculdade?: string
  turma?: string
  anoFormatura?: string
}

const SORTS = [
  { value: 'enviadaEm', label: 'Data' },
  { value: 'autorNome', label: 'Autor' },
  { value: 'direcao', label: 'Enviada/Recebida' },
  { value: 'tipo', label: 'Tipo' },
]

export default function ConversasTurmaPanel({ lead }: { lead: LeadLike }) {
  const { toast } = useToast()
  const [msgs, setMsgs] = useState<ConversaMsg[]>([])
  const [gruposTurma, setGruposTurma] = useState<ConversaGrupo[]>([])
  const [pendentes, setPendentes] = useState<ConversaGrupo[]>([])
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<'todos' | 'dm' | 'grupo'>('todos')
  const [sortField, setSortField] = useState('enviadaEm')
  const [sortDir, setSortDir] = useState<SortDirection>('desc')
  // Pessoas/grupo vinculados a essa turma — clicável, o grupo sempre é a
  // primeira conversa (padrão pedido: mostrar quem já conversou, um a um).
  const [threadAtivo, setThreadAtivo] = useState<string | 'todos'>('todos')

  async function carregar() {
    setCarregando(true)
    try {
      const [m, gt, gp] = await Promise.all([
        fetchConversasTurma(lead.id),
        fetchGruposDaTurma(lead.id),
        fetchGruposPendentes(),
      ])
      setMsgs(m)
      setGruposTurma(gt)
      setPendentes(gp)
    } catch (e: any) {
      toast({ title: 'Erro ao carregar conversas', description: e.message, variant: 'destructive' })
    } finally {
      setCarregando(false)
    }
  }
  const autoSelecionouGrupoRef = useRef<string | null>(null)
  useEffect(() => {
    autoSelecionouGrupoRef.current = null
    setThreadAtivo('todos')
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id])

  // A primeira conversa mostrada é sempre a do grupo, quando existir — só
  // define automaticamente uma vez por turma (não atropela se o vendedor já
  // trocou pra outra pessoa ou voltou pra "Todos" de propósito).
  useEffect(() => {
    if (autoSelecionouGrupoRef.current === lead.id) return
    if (gruposTurma.length === 0) return
    autoSelecionouGrupoRef.current = lead.id
    setThreadAtivo(gruposTurma[0].grupoWaId)
  }, [gruposTurma, lead.id])

  /** Uma linha por "conversa" (o grupo + cada pessoa que já mandou/recebeu DM). */
  const threads = useMemo(() => {
    const porChat = new Map<string, { chatWaId: string; nome: string; grupo: boolean; qtd: number; ultima: string }>()
    for (const m of msgs) {
      const atual = porChat.get(m.chatWaId)
      const nome = m.origem === 'grupo' ? m.grupoNome || 'Grupo' : m.autorNome || 'Contato'
      if (!atual) {
        porChat.set(m.chatWaId, { chatWaId: m.chatWaId, nome, grupo: m.origem === 'grupo', qtd: 1, ultima: m.enviadaEm })
      } else {
        atual.qtd += 1
        if (m.enviadaEm > atual.ultima) atual.ultima = m.enviadaEm
        // prefere um nome de quem não somos nós, pra não mostrar "Nós" na lista
        if (!m.deMim && m.autorNome) atual.nome = m.autorNome
      }
    }
    const lista = Array.from(porChat.values())
    lista.sort((a, b) => (a.grupo === b.grupo ? (a.ultima < b.ultima ? 1 : -1) : a.grupo ? -1 : 1))
    return lista
  }, [msgs])

  const sugestoes = useMemo(
    () => gruposQueBatemComTurma(pendentes, lead),
    [pendentes, lead],
  )

  const filtradas = useMemo(() => {
    const b = busca.trim().toLowerCase()
    let arr = msgs.filter((m) => filtro === 'todos' || m.origem === filtro)
    if (threadAtivo !== 'todos') arr = arr.filter((m) => m.chatWaId === threadAtivo)
    if (b) arr = arr.filter((m) => (m.texto || '').toLowerCase().includes(b) || (m.autorNome || '').toLowerCase().includes(b))
    const dir = sortDir === 'asc' ? 1 : -1
    return [...arr].sort((a, b2) => {
      const va = (a as any)[sortField] ?? ''
      const vb = (b2 as any)[sortField] ?? ''
      return va < vb ? -dir : va > vb ? dir : 0
    })
  }, [msgs, filtro, busca, sortField, sortDir, threadAtivo])

  const stats = useMemo(() => {
    const enviadas = msgs.filter((m) => m.deMim).length
    const audios = msgs.filter((m) => m.tipo === 'audio').length
    return { total: msgs.length, enviadas, recebidas: msgs.length - enviadas, audios }
  }, [msgs])

  async function linkar(g: ConversaGrupo) {
    try {
      await vincularGrupo(g.grupoWaId, lead.id)
      toast({ title: 'Grupo vinculado', description: g.grupoNome })
      carregar()
    } catch (e: any) {
      toast({ title: 'Erro ao vincular', description: e.message, variant: 'destructive' })
    }
  }
  async function ignorar(g: ConversaGrupo) {
    await ignorarGrupo(g.grupoWaId)
    setPendentes((p) => p.filter((x) => x.grupoWaId !== g.grupoWaId))
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-200">
        <MessageSquare className="w-3.5 h-3.5 text-orange-500" /> Conversas do WhatsApp
        <button
          type="button"
          onClick={carregar}
          className="ml-auto text-slate-400 hover:text-orange-400"
          title="Recarregar"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${carregando ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* vincular grupos */}
      {sugestoes.length > 0 && (
        <div className="rounded-lg border border-orange-500/30 bg-orange-500/5 p-2 space-y-1.5">
          <p className="text-[11px] text-orange-600 dark:text-orange-300">
            Grupos abertos no WhatsApp que parecem ser desta turma:
          </p>
          {sugestoes.map((g) => (
            <div key={g.grupoWaId} className="flex items-center gap-2 text-xs">
              <span className="flex-1 truncate text-slate-600 dark:text-slate-300">{g.grupoNome}</span>
              <button onClick={() => linkar(g)} className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 hover:underline">
                <Link2 className="w-3 h-3" /> vincular
              </button>
              <button onClick={() => ignorar(g)} className="inline-flex items-center gap-1 text-slate-400 hover:underline">
                <EyeOff className="w-3 h-3" /> ignorar
              </button>
            </div>
          ))}
        </div>
      )}

      {gruposTurma.length === 0 && pendentes.length > 0 && sugestoes.length === 0 && (
        <details className="text-[11px] text-slate-500">
          <summary className="cursor-pointer">Vincular um grupo manualmente ({pendentes.length})</summary>
          <div className="mt-1.5 space-y-1">
            {pendentes.map((g) => (
              <div key={g.grupoWaId} className="flex items-center gap-2">
                <span className="flex-1 truncate">{g.grupoNome}</span>
                <button onClick={() => linkar(g)} className="text-emerald-600 dark:text-emerald-400 hover:underline">
                  vincular a esta turma
                </button>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* stats */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
        <span>{stats.total} mensagens</span>
        <span>{stats.enviadas} enviadas · {stats.recebidas} recebidas</span>
        <span className="inline-flex items-center gap-1"><Mic className="w-3 h-3" /> {stats.audios} áudios</span>
      </div>

      {/* conversas: o grupo sempre primeiro, depois cada pessoa que já falou com a turma */}
      {threads.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          <button
            onClick={() => setThreadAtivo('todos')}
            className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] border ${
              threadAtivo === 'todos'
                ? 'bg-orange-600 text-white border-orange-600'
                : 'text-slate-500 border-slate-200 dark:border-slate-800 hover:text-slate-300'
            }`}
          >
            Todos
          </button>
          {threads.map((t) => (
            <button
              key={t.chatWaId}
              onClick={() => setThreadAtivo(t.chatWaId)}
              title={`${t.nome} · ${t.qtd} mensagens`}
              className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] border max-w-[140px] truncate ${
                threadAtivo === t.chatWaId
                  ? 'bg-orange-600 text-white border-orange-600'
                  : 'text-slate-500 border-slate-200 dark:border-slate-800 hover:text-slate-300'
              }`}
            >
              {t.grupo ? '👥 ' : ''}
              {t.nome}
            </button>
          ))}
        </div>
      )}

      {/* filtros */}
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="relative flex-1 min-w-[140px]">
          <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar na conversa…"
            className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg pl-7 pr-2 py-1.5 text-xs"
          />
        </div>
        <div className="flex rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden text-[11px]">
          {(['todos', 'dm', 'grupo'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={`px-2 py-1.5 ${filtro === f ? 'bg-orange-600 text-white' : 'text-slate-500'}`}
            >
              {f === 'todos' ? 'Todos' : f === 'dm' ? 'Diretas' : 'Grupo'}
            </button>
          ))}
        </div>
        <SortControl
          options={SORTS}
          field={sortField}
          direction={sortDir}
          onFieldChange={setSortField}
          onDirectionToggle={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
          triggerClassName="w-[128px]"
        />
      </div>

      {/* lista */}
      {carregando ? (
        <p className="text-slate-500 text-xs">Carregando…</p>
      ) : filtradas.length === 0 ? (
        <p className="text-slate-500 text-xs">
          Nenhuma mensagem arquivada ainda. Instale a extensão do Chrome e abra o WhatsApp Web do vendedor.
        </p>
      ) : (
        <div className="max-h-80 overflow-y-auto space-y-1.5 pr-1">
          {filtradas.map((m) => (
            <div
              key={m.id}
              className={`text-xs rounded-lg px-2.5 py-1.5 border ${
                m.deMim
                  ? 'bg-emerald-500/5 border-emerald-500/20 ml-6'
                  : 'bg-slate-500/5 border-slate-500/15 mr-6'
              }`}
            >
              <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                <span className="font-medium text-slate-500 dark:text-slate-300">
                  {m.deMim ? 'Nós' : m.autorNome || 'Contato'}
                </span>
                {m.origem === 'grupo' && <span>· grupo</span>}
                {m.tipo === 'audio' && (
                  <span className="inline-flex items-center gap-0.5 text-orange-500">
                    <Mic className="w-2.5 h-2.5" /> áudio{m.transcrito ? ' transcrito' : ''}
                  </span>
                )}
                {m.tipo !== 'audio' && m.tipo !== 'texto' && <span>· {m.tipo}</span>}
                <span className="ml-auto">
                  {new Date(m.enviadaEm).toLocaleString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
              <p className="text-slate-700 dark:text-slate-200 whitespace-pre-wrap break-words mt-0.5">
                {m.texto || <span className="text-slate-400 italic">({m.tipo} sem texto)</span>}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
