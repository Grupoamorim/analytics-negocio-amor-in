import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Trophy,
  CheckCircle2,
  Circle,
  AlertTriangle,
  ChevronDown,
  Plus,
  MessageCircle,
  Trash2,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useMetasMarcos, marcoEstaAtrasado, type MetaMarco, type MarcoDecisao } from '@/hooks/useMetasMarcos'
import { useMetasNegocio, METRICA_LABEL, rotuloPeriodoMeta, type MetricaMeta } from '@/hooks/useMetasNegocio'
import SectionTitle from './SectionTitle'

const PONTOS_POR_NIVEL = 100

const NOVO_VAZIO = {
  titulo: '',
  descricao: '',
  prazo: '',
  metrica: '' as MetricaMeta | '',
  metaNegocioId: '',
}

function fmtData(d: string | null): string {
  if (!d) return ''
  const [ano, mes, dia] = d.split('-')
  return `${dia}/${mes}/${ano}`
}

export default function PainelConquistas() {
  const { toast } = useToast()
  const { marcos, loading, salvar, remover, marcarConcluido, registrarExplicacao, aplicarDecisao } = useMetasMarcos()
  const { metas } = useMetasNegocio()
  const navigate = useNavigate()

  const [mostrarForm, setMostrarForm] = useState(false)
  const [novo, setNovo] = useState(NOVO_VAZIO)
  const [salvando, setSalvando] = useState(false)
  const [abertos, setAbertos] = useState<Record<string, boolean>>({})
  const [rascunhoExplicacao, setRascunhoExplicacao] = useState<Record<string, string>>({})
  const [rascunhoNovoPrazo, setRascunhoNovoPrazo] = useState<Record<string, string>>({})
  const [decidindo, setDecidindo] = useState<string | null>(null)

  const ativos = useMemo(() => marcos.filter((m) => m.status !== 'cancelado'), [marcos])
  const concluidos = ativos.filter((m) => m.status === 'concluido')
  const xp = concluidos.reduce((acc, m) => acc + m.pontos, 0)
  const nivel = Math.floor(xp / PONTOS_POR_NIVEL) + 1
  const progressoNivel = xp % PONTOS_POR_NIVEL

  const metasVigentes = useMemo(
    () => [...metas].sort((a, b) => b.ano - a.ano || a.escopo.localeCompare(b.escopo)),
    [metas],
  )

  function estaAberto(m: MetaMarco): boolean {
    return m.id in abertos ? abertos[m.id] : marcoEstaAtrasado(m)
  }

  async function handleCriar(e: React.FormEvent) {
    e.preventDefault()
    if (!novo.titulo.trim() || !novo.descricao.trim()) {
      toast({ title: 'Preencha título e descrição', variant: 'destructive' })
      return
    }
    setSalvando(true)
    try {
      await salvar({
        titulo: novo.titulo.trim(),
        descricao: novo.descricao.trim(),
        prazo: novo.prazo || null,
        metrica: novo.metrica || null,
        metaNegocioId: novo.metaNegocioId || null,
        origem: 'manual',
      })
      toast({ title: 'Marco criado' })
      setNovo(NOVO_VAZIO)
      setMostrarForm(false)
    } catch (err: any) {
      toast({ title: 'Erro ao salvar', description: err.message, variant: 'destructive' })
    } finally {
      setSalvando(false)
    }
  }

  async function handleDecisao(m: MetaMarco, decisao: MarcoDecisao) {
    if (decisao === 'realocado') {
      const novaData = rascunhoNovoPrazo[m.id]
      if (!novaData) {
        toast({ title: 'Escolha o novo prazo antes de realocar', variant: 'destructive' })
        return
      }
      await aplicarDecisao(m.id, 'realocado', novaData)
      toast({ title: 'Marco realocado' })
      return
    }
    const msg =
      decisao === 'descartado'
        ? `Descartar o marco "${m.titulo}"? Ele sai da trilha ativa.`
        : `Marcar "${m.titulo}" como substituído por outro objetivo? Ele sai da trilha ativa — crie o novo marco em seguida.`
    if (!confirm(msg)) return
    setDecidindo(m.id)
    try {
      await aplicarDecisao(m.id, decisao)
      if (decisao === 'substituido') setMostrarForm(true)
      toast({ title: decisao === 'descartado' ? 'Marco descartado' : 'Marco marcado como substituído' })
    } finally {
      setDecidindo(null)
    }
  }

  function irParaConsultor(m: MetaMarco) {
    const explicacao = rascunhoExplicacao[m.id] ?? m.explicacao ?? ''
    navigate('/consultor-metas', {
      state: { tipo: 'marco', id: m.id, titulo: m.titulo, prazo: m.prazo, explicacao },
    })
  }

  function StatusIcon({ m }: { m: MetaMarco }) {
    if (m.status === 'concluido') return <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
    if (marcoEstaAtrasado(m)) return <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
    return <Circle className="w-4 h-4 text-slate-500 shrink-0" />
  }

  return (
    <div className="bg-[#111820] border border-white/[0.06] rounded-xl p-6 shadow-lg space-y-4">
      <SectionTitle
        ajuda="Trilha de conquistas rumo às metas do negócio — marcos criados na mão ou propostos pelo Consultor de Metas. Marque como Feito ao concluir; marcos com prazo vencido pedem uma decisão (realocar, descartar ou repensar)."
        right={
          <button
            type="button"
            onClick={() => setMostrarForm((v) => !v)}
            className="inline-flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold rounded-lg px-3 py-1.5 whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" /> Novo marco
          </button>
        }
      >
        Conquistas & Marcos
      </SectionTitle>

      <div className="flex items-center gap-3 p-3 rounded-lg bg-orange-500/[0.06] border border-orange-500/20">
        <Trophy className="w-6 h-6 text-amber-400 shrink-0" />
        <div className="flex-1">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="font-semibold text-white">Nível {nivel}</span>
            <span className="text-slate-400">
              {progressoNivel}/{PONTOS_POR_NIVEL} XP · {concluidos.length} marco{concluidos.length === 1 ? '' : 's'} concluído{concluidos.length === 1 ? '' : 's'}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full transition-all"
              style={{ width: `${(progressoNivel / PONTOS_POR_NIVEL) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {mostrarForm && (
        <form onSubmit={handleCriar} className="bg-[#0a0f14] border border-white/[0.08] rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-xs text-slate-400 flex flex-col gap-1">
              Título
              <input
                type="text"
                value={novo.titulo}
                onChange={(e) => setNovo((prev) => ({ ...prev, titulo: e.target.value }))}
                className="bg-[#111820] border border-white/[0.1] rounded-lg px-2 py-2 text-slate-200 text-xs"
              />
            </label>
            <label className="text-xs text-slate-400 flex flex-col gap-1">
              Prazo (opcional)
              <input
                type="date"
                value={novo.prazo}
                onChange={(e) => setNovo((prev) => ({ ...prev, prazo: e.target.value }))}
                className="bg-[#111820] border border-white/[0.1] rounded-lg px-2 py-2 text-slate-200 text-xs"
              />
            </label>
            <label className="text-xs text-slate-400 flex flex-col gap-1">
              Métrica relacionada (opcional)
              <select
                value={novo.metrica}
                onChange={(e) => setNovo((prev) => ({ ...prev, metrica: e.target.value as MetricaMeta | '' }))}
                className="bg-[#111820] border border-white/[0.1] rounded-lg px-2 py-2 text-slate-200 text-xs"
              >
                <option value="">Nenhuma</option>
                {Object.entries(METRICA_LABEL).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-slate-400 flex flex-col gap-1">
              Vincular a uma meta cadastrada (opcional)
              <select
                value={novo.metaNegocioId}
                onChange={(e) => setNovo((prev) => ({ ...prev, metaNegocioId: e.target.value }))}
                className="bg-[#111820] border border-white/[0.1] rounded-lg px-2 py-2 text-slate-200 text-xs"
              >
                <option value="">Nenhuma</option>
                {metasVigentes.map((m) => (
                  <option key={m.id} value={m.id}>
                    {METRICA_LABEL[m.metrica]} — {rotuloPeriodoMeta(m)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="text-xs text-slate-400 flex flex-col gap-1">
            Descrição — o que precisa ser feito
            <textarea
              value={novo.descricao}
              onChange={(e) => setNovo((prev) => ({ ...prev, descricao: e.target.value }))}
              rows={3}
              className="bg-[#111820] border border-white/[0.1] rounded-lg px-3 py-2 text-slate-200 text-xs resize-y"
            />
          </label>
          <button
            type="submit"
            disabled={salvando}
            className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-xs font-semibold rounded-lg px-3 py-2"
          >
            {salvando ? 'Salvando...' : 'Criar marco'}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Carregando...</p>
      ) : ativos.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhum marco ainda — crie um ou peça sugestões ao Consultor de Metas.</p>
      ) : (
        <div className="relative pl-4 space-y-3 before:content-[''] before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-px before:bg-white/[0.08]">
          {ativos.map((m) => {
            const atrasado = marcoEstaAtrasado(m)
            const aberto = estaAberto(m)
            return (
              <div key={m.id} className="relative">
                <div
                  className={`absolute -left-4 top-3 w-3.5 h-3.5 rounded-full border-2 ${
                    m.status === 'concluido'
                      ? 'bg-emerald-500 border-emerald-400'
                      : atrasado
                        ? 'bg-amber-500 border-amber-400'
                        : 'bg-[#111820] border-slate-600'
                  }`}
                />
                <div
                  className={`border rounded-lg p-3 space-y-2 ${
                    atrasado ? 'border-amber-500/30 bg-amber-500/[0.04]' : 'border-white/[0.08] bg-white/[0.02]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setAbertos((prev) => ({ ...prev, [m.id]: !aberto }))}
                    className="w-full flex items-center gap-2 text-left"
                  >
                    <ChevronDown className={`w-3.5 h-3.5 text-slate-500 shrink-0 transition-transform ${aberto ? '' : '-rotate-90'}`} />
                    <StatusIcon m={m} />
                    <span className={`text-sm font-semibold flex-1 truncate ${m.status === 'concluido' ? 'text-slate-400 line-through' : 'text-white'}`}>
                      {m.titulo}
                    </span>
                    {m.prazo && (
                      <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded shrink-0 ${
                        atrasado ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-white/[0.06] text-slate-400 border border-white/[0.08]'
                      }`}>
                        {atrasado ? 'Atrasado — ' : ''}
                        {fmtData(m.prazo)}
                      </span>
                    )}
                    {m.origem === 'ia' && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-300 border border-orange-500/25 font-mono shrink-0">
                        IA
                      </span>
                    )}
                  </button>

                  {aberto && (
                    <div className="pl-6 space-y-2">
                      <p className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">{m.descricao}</p>
                      {m.riscoRealista && (
                        <p className="text-[11px] text-amber-200/80 italic border-l-2 border-amber-500/30 pl-2">
                          Ponderação da IA ao propor: {m.riscoRealista}
                        </p>
                      )}
                      {m.metrica && (
                        <p className="text-[11px] text-slate-500">Métrica: {METRICA_LABEL[m.metrica]}</p>
                      )}

                      <div className="flex items-center gap-3">
                        <label className="inline-flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={m.status === 'concluido'}
                            onChange={(e) => marcarConcluido(m.id, e.target.checked)}
                            className="w-3.5 h-3.5 accent-orange-500"
                          />
                          Feito
                        </label>
                        <button
                          type="button"
                          onClick={() => confirm(`Remover o marco "${m.titulo}"?`) && remover(m.id)}
                          className="text-slate-500 hover:text-rose-400 ml-auto"
                          title="Remover"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {atrasado && (
                        <div className="mt-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 space-y-2">
                          <p className="text-xs text-amber-200 font-semibold">
                            O prazo passou e esse marco não foi concluído. O que aconteceu?
                          </p>
                          <textarea
                            value={rascunhoExplicacao[m.id] ?? m.explicacao ?? ''}
                            onChange={(e) => setRascunhoExplicacao((prev) => ({ ...prev, [m.id]: e.target.value }))}
                            onBlur={(e) => e.target.value.trim() && registrarExplicacao(m.id, e.target.value.trim())}
                            rows={2}
                            placeholder="Explique o que aconteceu..."
                            className="w-full bg-[#0a0f14] border border-white/[0.1] rounded-lg px-2 py-1.5 text-slate-200 text-xs resize-y"
                          />
                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => irParaConsultor(m)}
                              className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-orange-300 bg-orange-500/10 border border-orange-500/25 rounded-lg px-2.5 py-1.5 hover:bg-orange-500/20"
                            >
                              <MessageCircle className="w-3.5 h-3.5" /> Discutir com o Consultor de Metas
                            </button>
                            <span className="text-[10px] text-slate-500">ou decida direto:</span>
                            <input
                              type="date"
                              value={rascunhoNovoPrazo[m.id] ?? ''}
                              onChange={(e) => setRascunhoNovoPrazo((prev) => ({ ...prev, [m.id]: e.target.value }))}
                              className="bg-[#0a0f14] border border-white/[0.1] rounded-lg px-1.5 py-1 text-slate-200 text-[11px]"
                            />
                            <button
                              type="button"
                              disabled={decidindo === m.id}
                              onClick={() => handleDecisao(m, 'realocado')}
                              className="text-[11px] font-semibold text-emerald-300 hover:underline disabled:opacity-50"
                            >
                              Realocar
                            </button>
                            <button
                              type="button"
                              disabled={decidindo === m.id}
                              onClick={() => handleDecisao(m, 'descartado')}
                              className="text-[11px] font-semibold text-slate-400 hover:underline disabled:opacity-50"
                            >
                              Descartar
                            </button>
                            <button
                              type="button"
                              disabled={decidindo === m.id}
                              onClick={() => handleDecisao(m, 'substituido')}
                              className="text-[11px] font-semibold text-rose-300 hover:underline disabled:opacity-50"
                            >
                              Pensar em outro objetivo
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
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
