import { useState, useMemo } from 'react'
import {
  Plus,
  X,
  Trophy,
  TrendingDown,
  BookOpen,
  Sparkles,
  Trash2,
  Loader2,
  ChevronDown,
} from 'lucide-react'
import { useAprendizadoMaterial } from '@/hooks/useAprendizadoMaterial'
import { useToast } from '@/hooks/use-toast'
import { analisarMaterialAprendizado } from '@/utils/aprendizadoEngine'
import { getGeminiApiKey, getGeminiModel } from '@/utils/geminiApi'
import type { AprendizadoCategoria, AprendizadoMaterial } from '@/types/crm'

const CATEGORIAS: { id: AprendizadoCategoria; label: string; icon: typeof Trophy; cor: string }[] = [
  { id: 'turma_ganha', label: 'Turmas Ganhas', icon: Trophy, cor: 'text-emerald-400' },
  { id: 'turma_perdida', label: 'Turmas Perdidas', icon: TrendingDown, cor: 'text-rose-400' },
  { id: 'treinamento', label: 'Treinamentos e Aulas', icon: BookOpen, cor: 'text-orange-400' },
]

export default function AprendizadoMaterialPanel() {
  const { materiais, addMaterial, updateMaterial, deleteMaterial } = useAprendizadoMaterial()
  const { toast } = useToast()

  const [modalOpen, setModalOpen] = useState(false)
  const [categoria, setCategoria] = useState<AprendizadoCategoria>('turma_ganha')
  const [titulo, setTitulo] = useState('')
  const [curso, setCurso] = useState('')
  const [faculdade, setFaculdade] = useState('')
  const [url, setUrl] = useState('')
  const [texto, setTexto] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [expandido, setExpandido] = useState<string | null>(null)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)

  const porCategoria = useMemo(() => {
    const m: Record<string, AprendizadoMaterial[]> = {}
    for (const c of CATEGORIAS) m[c.id] = []
    for (const item of materiais) (m[item.categoria] ||= []).push(item)
    return m
  }, [materiais])

  const resetForm = () => {
    setTitulo('')
    setCurso('')
    setFaculdade('')
    setUrl('')
    setTexto('')
    setCategoria('turma_ganha')
  }

  const handleSalvar = async () => {
    if (!titulo.trim()) {
      toast({ title: 'Dê um título ao material', variant: 'destructive' })
      return
    }
    setSalvando(true)
    try {
      const criado = await addMaterial({
        categoria,
        titulo: titulo.trim(),
        curso: curso.trim() || undefined,
        faculdade: faculdade.trim() || undefined,
        conteudo: texto.trim() || undefined,
        url: url.trim() || undefined,
      })
      setModalOpen(false)
      resetForm()

      if (criado && texto.trim()) {
        const key = getGeminiApiKey()
        if (key) {
          toast({ title: 'Material salvo', description: 'Analisando com IA...' })
          try {
            const a = await analisarMaterialAprendizado(
              categoria,
              titulo.trim(),
              texto.trim(),
              key,
              getGeminiModel(),
            )
            await updateMaterial(criado.id, {
              resumo: a.resumo,
              licoes: a.licoes,
              pontosFortes: a.pontosFortes,
              pontosAtencao: a.pontosAtencao,
              taticas: a.taticas,
              sentimento: a.sentimento,
              analisadoEm: new Date().toISOString(),
            })
            toast({ title: 'Análise concluída', description: titulo.trim() })
          } catch (e: any) {
            toast({ title: 'Falha na análise IA', description: e.message, variant: 'destructive' })
          }
        } else {
          toast({
            title: 'Material salvo (sem análise)',
            description: 'Configure a chave do Gemini em Administração → IA para analisar.',
          })
        }
      } else {
        toast({ title: 'Material salvo' })
      }
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-sm text-slate-400">
          Material de estudo <span className="text-slate-200 font-medium">solto</span> — não vinculado
          a nenhuma turma do funil. Gravações de negociações ganhas e perdidas feitas fora do processo,
          e aulas/treinamentos internos, para a IA aprender e alimentar os relatórios por curso.
        </p>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold shadow-lg shadow-orange-500/20 whitespace-nowrap"
        >
          <Plus className="w-4 h-4" /> Adicionar material
        </button>
      </div>

      {CATEGORIAS.map((c) => (
        <div key={c.id} className="rounded-xl border border-white/[0.06] bg-[#111820] overflow-hidden">
          <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-2">
            <c.icon className={`w-4 h-4 ${c.cor}`} />
            <h3 className="text-sm font-semibold text-white">{c.label}</h3>
            <span className="text-xs text-slate-500">({porCategoria[c.id]?.length || 0})</span>
          </div>
          {(porCategoria[c.id]?.length || 0) === 0 ? (
            <p className="px-4 py-4 text-xs text-slate-500">Nada adicionado ainda.</p>
          ) : (
            <ul className="divide-y divide-white/[0.04]">
              {porCategoria[c.id].map((m) => (
                <li key={m.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => setExpandido(expandido === m.id ? null : m.id)}
                      className="flex-1 text-left"
                    >
                      <div className="text-sm text-white font-medium flex items-center gap-2">
                        {m.titulo}
                        <ChevronDown
                          className={`w-3.5 h-3.5 text-slate-500 transition-transform ${
                            expandido === m.id ? 'rotate-180' : ''
                          }`}
                        />
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {[m.curso, m.faculdade].filter(Boolean).join(' · ') || 'Sem curso/faculdade'}
                        {m.analisadoEm ? ' · analisado pela IA' : ' · não analisado'}
                      </div>
                    </button>
                    <div className="flex items-center gap-1">
                      {m.url && (
                        <a
                          href={m.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-orange-400 hover:underline"
                        >
                          link
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => setConfirmDel(m.id)}
                        className="text-slate-500 hover:text-rose-400 p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  {expandido === m.id && (
                    <div className="mt-3 space-y-2 text-xs">
                      {m.resumo && <Bloco titulo="Resumo" texto={m.resumo} />}
                      {m.licoes && <Bloco titulo="Lições" texto={m.licoes} />}
                      {m.taticas && <Bloco titulo="Táticas para reaproveitar" texto={m.taticas} />}
                      {m.pontosFortes && <Bloco titulo="Pontos fortes" texto={m.pontosFortes} />}
                      {m.pontosAtencao && <Bloco titulo="Pontos de atenção" texto={m.pontosAtencao} />}
                      {!m.analisadoEm && (
                        <p className="text-slate-500 italic">
                          Ainda não analisado pela IA (material salvo sem texto ou sem chave do Gemini).
                        </p>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}

      {/* Modal adicionar */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-[560px] max-h-[90vh] bg-[#111820] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-white/[0.08] flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Adicionar material de aprendizado</h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Categoria</label>
                <div className="grid grid-cols-3 gap-2">
                  {CATEGORIAS.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setCategoria(c.id)}
                      className={`p-2 rounded-lg border text-[11px] font-semibold flex flex-col items-center gap-1 ${
                        categoria === c.id
                          ? 'border-orange-500 bg-orange-500/10 text-white'
                          : 'border-white/10 text-slate-400'
                      }`}
                    >
                      <c.icon className={`w-4 h-4 ${c.cor}`} />
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
              <Campo label="Título" value={titulo} onChange={setTitulo} placeholder="Ex: Negociação turma Direito UESB 2024" />
              <div className="grid grid-cols-2 gap-3">
                <Campo label="Curso (opcional)" value={curso} onChange={setCurso} />
                <Campo label="Faculdade (opcional)" value={faculdade} onChange={setFaculdade} />
              </div>
              <Campo label="Link (opcional)" value={url} onChange={setUrl} placeholder="Fathom, YouTube, Drive..." />
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Transcrição / texto (para a IA analisar)
                </label>
                <textarea
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  rows={6}
                  className="w-full bg-[#0a0f14] border border-white/10 rounded-lg p-2 text-xs text-white"
                  placeholder="Cole aqui a transcrição da reunião ou o conteúdo da aula..."
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-white/[0.08] flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white rounded-lg border border-white/[0.08]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSalvar}
                disabled={salvando}
                className="px-5 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-500 rounded-lg disabled:opacity-50 flex items-center gap-2"
              >
                {salvando ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                Salvar e analisar
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="bg-[#111820] border border-white/10 rounded-2xl p-6 max-w-sm w-full space-y-4">
            <p className="text-sm text-slate-200">Excluir este material de aprendizado?</p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDel(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-400 border border-white/[0.08] rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteMaterial(confirmDel)
                  setConfirmDel(null)
                }}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 rounded-lg"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Bloco({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="p-2 rounded bg-white/[0.02] border border-white/[0.05]">
      <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-0.5">
        {titulo}
      </div>
      <p className="text-slate-300 whitespace-pre-wrap leading-relaxed">{texto}</p>
    </div>
  )
}

function Campo({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-300 mb-1">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-[#0a0f14] border border-white/10 rounded-lg p-2 text-xs text-white"
      />
    </div>
  )
}
