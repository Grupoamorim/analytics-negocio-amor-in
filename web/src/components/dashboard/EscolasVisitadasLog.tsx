import { useState } from 'react'
import { School, Plus, Trash2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useAcesso } from '@/context/AcessoContext'
import type { EscolaVisitada } from '@/hooks/useEscolasVisitadas'

const HOJE = new Date().toISOString().slice(0, 10)

/** Lançamento manual de visitas a escolas (Family Day) — não existe fonte automática pra isso,
 * então quem está prospectando registra aqui mesmo, na tela onde acompanha a meta. Recebe os dados
 * já carregados pelo `useEscolasVisitadas()` do componente pai (que também usa `visitas` pra
 * calcular o pace/retrospectiva), pra não duplicar a busca. */
export default function EscolasVisitadasLog({
  visitas,
  loading,
  adicionar,
  remover,
}: {
  visitas: EscolaVisitada[]
  loading: boolean
  adicionar: (v: {
    data: string
    escola: string
    cidade?: string
    cursoAlvo?: string
    responsavel?: string
    observacao?: string
  }) => Promise<void>
  remover: (id: string) => Promise<void>
}) {
  const { toast } = useToast()
  const { isAdmin } = useAcesso()

  const [data, setData] = useState(HOJE)
  const [escola, setEscola] = useState('')
  const [cidade, setCidade] = useState('')
  const [cursoAlvo, setCursoAlvo] = useState('')
  const [observacao, setObservacao] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault()
    if (!escola.trim()) {
      toast({ title: 'Informe o nome da escola', variant: 'destructive' })
      return
    }
    setSalvando(true)
    try {
      await adicionar({ data, escola: escola.trim(), cidade: cidade.trim(), cursoAlvo: cursoAlvo.trim(), observacao: observacao.trim() })
      toast({ title: 'Visita registrada' })
      setEscola('')
      setCidade('')
      setCursoAlvo('')
      setObservacao('')
    } catch (err: any) {
      toast({ title: 'Erro ao registrar', description: err.message, variant: 'destructive' })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="bg-[#111820] border border-white/[0.06] rounded-xl p-5 space-y-4">
      <h3 className="text-sm font-semibold text-white flex items-center gap-2">
        <School className="w-4 h-4 text-orange-400" /> Registrar visita a escola
      </h3>

      <form onSubmit={handleSalvar} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <label className="text-xs text-slate-400 flex flex-col gap-1">
          Data
          <input
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            className="bg-[#0a0f14] border border-white/[0.1] rounded-lg px-2 py-2 text-slate-200 text-xs"
          />
        </label>
        <label className="text-xs text-slate-400 flex flex-col gap-1">
          Escola
          <input
            type="text"
            value={escola}
            onChange={(e) => setEscola(e.target.value)}
            placeholder="Ex: Colégio X"
            className="bg-[#0a0f14] border border-white/[0.1] rounded-lg px-2 py-2 text-slate-200 text-xs"
          />
        </label>
        <label className="text-xs text-slate-400 flex flex-col gap-1">
          Cidade
          <input
            type="text"
            value={cidade}
            onChange={(e) => setCidade(e.target.value)}
            className="bg-[#0a0f14] border border-white/[0.1] rounded-lg px-2 py-2 text-slate-200 text-xs"
          />
        </label>
        <label className="text-xs text-slate-400 flex flex-col gap-1">
          Curso-alvo (opcional)
          <input
            type="text"
            value={cursoAlvo}
            onChange={(e) => setCursoAlvo(e.target.value)}
            className="bg-[#0a0f14] border border-white/[0.1] rounded-lg px-2 py-2 text-slate-200 text-xs"
          />
        </label>
        <label className="text-xs text-slate-400 flex flex-col gap-1 sm:col-span-2 lg:col-span-3">
          Observação (opcional)
          <input
            type="text"
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder="Ex: coordenador topou receber proposta"
            className="bg-[#0a0f14] border border-white/[0.1] rounded-lg px-2 py-2 text-slate-200 text-xs"
          />
        </label>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={salvando}
            className="w-full inline-flex items-center justify-center gap-1.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-xs font-semibold rounded-lg px-3 py-2"
          >
            <Plus className="w-3.5 h-3.5" /> {salvando ? 'Salvando...' : 'Registrar'}
          </button>
        </div>
      </form>

      {!loading && visitas.length > 0 && (
        <div className="divide-y divide-white/[0.04] pt-2 border-t border-white/[0.06]">
          {visitas.slice(0, 8).map((v) => (
            <div key={v.id} className="flex items-center gap-3 py-2 text-xs">
              <span className="text-slate-500 whitespace-nowrap">{v.data.split('-').reverse().join('/')}</span>
              <span className="text-slate-200 font-medium flex-1 truncate">
                {v.escola}
                {v.cidade && <span className="text-slate-500"> · {v.cidade}</span>}
              </span>
              {v.cursoAlvo && <span className="text-slate-500 truncate max-w-[140px]">{v.cursoAlvo}</span>}
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => remover(v.id)}
                  className="text-slate-500 hover:text-rose-400"
                  title="Remover"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
