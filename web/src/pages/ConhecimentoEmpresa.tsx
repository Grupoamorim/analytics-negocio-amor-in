import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, Plus, Pencil, Trash2, ChevronDown, Bot, User } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import {
  useConhecimentoEmpresa,
  type ConhecimentoEmpresa as Registro,
  type PeriodoTipoConhecimento,
} from '@/hooks/useConhecimentoEmpresa'

const PERIODOS: { value: PeriodoTipoConhecimento; label: string }[] = [
  { value: 'geral', label: 'Geral (sem período)' },
  { value: 'mensal', label: 'Mensal' },
  { value: 'trimestral', label: 'Trimestral' },
  { value: 'semestral', label: 'Semestral' },
  { value: 'anual', label: 'Anual' },
]

const ORDEM_TIPO: Record<PeriodoTipoConhecimento, number> = {
  anual: 0,
  trimestral: 1,
  semestral: 2,
  mensal: 3,
  geral: 4,
}

function rotuloPeriodo(r: Registro): string {
  if (r.periodoTipo === 'geral') return 'Geral'
  if (r.periodoTipo === 'anual') return `Ano ${r.ano}`
  if (r.periodoTipo === 'trimestral') return `T${r.periodoValor}/${r.ano}`
  if (r.periodoTipo === 'semestral') return `S${r.periodoValor}/${r.ano}`
  const NOMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  return `${NOMES[(r.periodoValor || 1) - 1]}/${r.ano}`
}

const NOVO_VAZIO = { ano: new Date().getFullYear(), periodoTipo: 'geral' as PeriodoTipoConhecimento, periodoValor: null as number | null, titulo: '', conteudo: '' }

export default function ConhecimentoEmpresa() {
  const { toast } = useToast()
  const { registros, loading, salvar, remover } = useConhecimentoEmpresa()

  const [mostrarForm, setMostrarForm] = useState(false)
  const [novo, setNovo] = useState(NOVO_VAZIO)
  const [salvando, setSalvando] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [rascunhoEdicao, setRascunhoEdicao] = useState<{ titulo: string; conteudo: string }>({ titulo: '', conteudo: '' })
  const [anosColapsados, setAnosColapsados] = useState<Record<string, boolean>>({})

  const gerais = useMemo(() => registros.filter((r) => r.periodoTipo === 'geral'), [registros])
  const porAno = useMemo(() => {
    const mapa = new Map<number, Registro[]>()
    registros
      .filter((r) => r.periodoTipo !== 'geral')
      .forEach((r) => {
        const ano = r.ano || 0
        if (!mapa.has(ano)) mapa.set(ano, [])
        mapa.get(ano)!.push(r)
      })
    for (const lista of mapa.values()) {
      lista.sort((a, b) => ORDEM_TIPO[a.periodoTipo] - ORDEM_TIPO[b.periodoTipo] || (a.periodoValor || 0) - (b.periodoValor || 0))
    }
    return Array.from(mapa.entries()).sort((a, b) => b[0] - a[0])
  }, [registros])

  const anoMaisRecente = porAno[0]?.[0]
  const anoEstaAberto = (ano: number) => (ano in anosColapsados ? !anosColapsados[ano] : ano === anoMaisRecente)

  async function handleCriar(e: React.FormEvent) {
    e.preventDefault()
    if (!novo.titulo.trim() || !novo.conteudo.trim()) {
      toast({ title: 'Preencha título e conteúdo', variant: 'destructive' })
      return
    }
    setSalvando(true)
    try {
      await salvar({
        ano: novo.periodoTipo === 'geral' ? null : novo.ano,
        periodoTipo: novo.periodoTipo,
        periodoValor: novo.periodoTipo === 'anual' || novo.periodoTipo === 'geral' ? null : novo.periodoValor,
        titulo: novo.titulo.trim(),
        conteudo: novo.conteudo.trim(),
        origem: 'manual',
      })
      toast({ title: 'Registrado' })
      setNovo(NOVO_VAZIO)
      setMostrarForm(false)
    } catch (err: any) {
      toast({ title: 'Erro ao salvar', description: err.message, variant: 'destructive' })
    } finally {
      setSalvando(false)
    }
  }

  function iniciarEdicao(r: Registro) {
    setEditandoId(r.id)
    setRascunhoEdicao({ titulo: r.titulo, conteudo: r.conteudo })
  }

  async function salvarEdicao(r: Registro) {
    setSalvando(true)
    try {
      await salvar({
        id: r.id,
        ano: r.ano,
        periodoTipo: r.periodoTipo,
        periodoValor: r.periodoValor,
        titulo: rascunhoEdicao.titulo.trim(),
        conteudo: rascunhoEdicao.conteudo.trim(),
        origem: r.origem,
      })
      setEditandoId(null)
      toast({ title: 'Atualizado' })
    } catch (err: any) {
      toast({ title: 'Erro ao atualizar', description: err.message, variant: 'destructive' })
    } finally {
      setSalvando(false)
    }
  }

  function CardRegistro({ r }: { r: Registro }) {
    const emEdicao = editandoId === r.id
    return (
      <div className="border border-white/[0.08] rounded-lg p-4 bg-white/[0.02] space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-300 border border-orange-500/25">
              {rotuloPeriodo(r)}
            </span>
            {emEdicao ? (
              <input
                type="text"
                value={rascunhoEdicao.titulo}
                onChange={(e) => setRascunhoEdicao((prev) => ({ ...prev, titulo: e.target.value }))}
                className="bg-[#0a0f14] border border-white/[0.1] rounded-lg px-2 py-1 text-slate-200 text-xs"
              />
            ) : (
              <span className="text-sm font-semibold text-white">{r.titulo}</span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-slate-500" title={r.origem === 'ia' ? 'Gerado pela IA' : 'Escrito manualmente'}>
              {r.origem === 'ia' ? <Bot className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5" />}
            </span>
            {emEdicao ? (
              <>
                <button type="button" onClick={() => salvarEdicao(r)} disabled={salvando} className="text-[11px] text-orange-400 hover:underline">
                  Salvar
                </button>
                <button type="button" onClick={() => setEditandoId(null)} className="text-[11px] text-slate-400 hover:underline">
                  Cancelar
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => iniciarEdicao(r)} className="text-slate-400 hover:text-orange-400" title="Editar">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => confirm(`Apagar "${r.titulo}"?`) && remover(r.id)}
                  className="text-slate-400 hover:text-rose-400"
                  title="Remover"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        </div>
        {emEdicao ? (
          <textarea
            value={rascunhoEdicao.conteudo}
            onChange={(e) => setRascunhoEdicao((prev) => ({ ...prev, conteudo: e.target.value }))}
            rows={4}
            className="w-full bg-[#0a0f14] border border-white/[0.1] rounded-lg px-3 py-2 text-slate-200 text-xs resize-y"
          />
        ) : (
          <p className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">{r.conteudo}</p>
        )}
        <p className="text-[10px] text-slate-600">
          Atualizado em {new Date(r.updatedAt).toLocaleString('pt-BR')}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-white/[0.06]">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-white tracking-tight flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-orange-400" /> Conhecimento da Empresa
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Tudo o que já foi registrado sobre a empresa, organizado por período — alimentado pelo{' '}
            <Link to="/consultor-metas" className="text-orange-400 hover:underline">
              Consultor de Metas
            </Link>{' '}
            ou escrito direto aqui.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setMostrarForm((v) => !v)}
          className="inline-flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold rounded-lg px-3 py-2 whitespace-nowrap"
        >
          <Plus className="w-3.5 h-3.5" /> Novo registro
        </button>
      </div>

      {mostrarForm && (
        <form onSubmit={handleCriar} className="bg-[#111820] border border-white/[0.06] rounded-xl p-5 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <label className="text-xs text-slate-400 flex flex-col gap-1 sm:col-span-2">
              Título
              <input
                type="text"
                value={novo.titulo}
                onChange={(e) => setNovo((prev) => ({ ...prev, titulo: e.target.value }))}
                className="bg-[#0a0f14] border border-white/[0.1] rounded-lg px-2 py-2 text-slate-200 text-xs"
              />
            </label>
            <label className="text-xs text-slate-400 flex flex-col gap-1">
              Período
              <select
                value={novo.periodoTipo}
                onChange={(e) => setNovo((prev) => ({ ...prev, periodoTipo: e.target.value as PeriodoTipoConhecimento }))}
                className="bg-[#0a0f14] border border-white/[0.1] rounded-lg px-2 py-2 text-slate-200 text-xs"
              >
                {PERIODOS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            {novo.periodoTipo !== 'geral' && (
              <label className="text-xs text-slate-400 flex flex-col gap-1">
                Ano
                <input
                  type="number"
                  value={novo.ano}
                  onChange={(e) => setNovo((prev) => ({ ...prev, ano: Number(e.target.value) }))}
                  className="bg-[#0a0f14] border border-white/[0.1] rounded-lg px-2 py-2 text-slate-200 text-xs"
                />
              </label>
            )}
          </div>
          {novo.periodoTipo !== 'anual' && novo.periodoTipo !== 'geral' && (
            <label className="text-xs text-slate-400 flex flex-col gap-1 max-w-[160px]">
              {novo.periodoTipo === 'mensal' ? 'Mês (1-12)' : novo.periodoTipo === 'trimestral' ? 'Trimestre (1-4)' : 'Semestre (1-2)'}
              <input
                type="number"
                value={novo.periodoValor ?? ''}
                onChange={(e) => setNovo((prev) => ({ ...prev, periodoValor: e.target.value ? Number(e.target.value) : null }))}
                className="bg-[#0a0f14] border border-white/[0.1] rounded-lg px-2 py-2 text-slate-200 text-xs"
              />
            </label>
          )}
          <label className="text-xs text-slate-400 flex flex-col gap-1">
            Conteúdo
            <textarea
              value={novo.conteudo}
              onChange={(e) => setNovo((prev) => ({ ...prev, conteudo: e.target.value }))}
              rows={4}
              className="bg-[#0a0f14] border border-white/[0.1] rounded-lg px-3 py-2 text-slate-200 text-xs resize-y"
            />
          </label>
          <button
            type="submit"
            disabled={salvando}
            className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-xs font-semibold rounded-lg px-3 py-2"
          >
            {salvando ? 'Salvando...' : 'Salvar registro'}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Carregando...</p>
      ) : registros.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhum registro ainda.</p>
      ) : (
        <div className="space-y-6">
          {gerais.length > 0 && (
            <div className="bg-[#111820] border border-white/[0.06] rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-semibold text-white">Geral (sem período)</h3>
              {gerais.map((r) => (
                <CardRegistro key={r.id} r={r} />
              ))}
            </div>
          )}

          {porAno.map(([ano, lista]) => {
            const aberto = anoEstaAberto(ano)
            return (
              <div key={ano} className="bg-[#111820] border border-white/[0.06] rounded-xl p-5 space-y-3">
                <button
                  type="button"
                  onClick={() => setAnosColapsados((prev) => ({ ...prev, [ano]: !anoEstaAberto(ano) }))}
                  className="w-full flex items-center justify-between text-left"
                >
                  <h3 className="text-sm font-semibold text-white">Ano {ano}</h3>
                  <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${aberto ? '' : '-rotate-90'}`} />
                </button>
                {aberto && <div className="space-y-3">{lista.map((r) => <CardRegistro key={r.id} r={r} />)}</div>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
