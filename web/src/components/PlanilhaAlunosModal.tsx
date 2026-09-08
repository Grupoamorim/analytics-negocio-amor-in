// Popup da planilha de alunos de uma turma fechada (Adesões > Turmas Fechadas).
// Upload de Excel/CSV (Nome + Telefone), status por aluno (enviei / sem
// resposta / negou / fechou) e link direto pro WhatsApp. Quem já fechou fica
// com a linha verde riscada e sai da lista de trabalho por padrão (mesmo
// padrão já usado em Turmas > "Mostrar formados": o dado nunca é perdido, só
// sai da visão do dia a dia).
import { useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { X, Upload, MessageCircle, Trash2, CheckCircle2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import {
  listarPlanilhaAlunos,
  importarAlunos,
  atualizarStatusAluno,
  removerAluno,
  reconciliarComSGE,
  normalizarTelefone,
  type PlanilhaAluno,
  type StatusAluno,
} from '@/utils/planilhaAlunos'

const STATUS_OPCOES: { value: StatusAluno; label: string; className: string }[] = [
  { value: 'enviado', label: 'Mandei mensagem', className: 'text-sky-400 border-sky-500/30 bg-sky-500/10' },
  { value: 'sem_resposta', label: 'Sem resposta', className: 'text-amber-400 border-amber-500/30 bg-amber-500/10' },
  { value: 'negou', label: 'Negou', className: 'text-red-400 border-red-500/30 bg-red-500/10' },
  { value: 'fechado', label: 'Fechou', className: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' },
]

function linkWhatsApp(telefone: string | null): string | null {
  const digitos = normalizarTelefone(telefone)
  if (!digitos) return null
  const comDDI = digitos.length <= 11 ? `55${digitos}` : digitos
  return `https://wa.me/${comDDI}`
}

function linhaCabecalho(header: string): string {
  return header
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

/** Aceita várias formas de nomear as colunas na planilha subida pelo Lucas. */
function extrairAlunos(rows: Record<string, any>[]): { nome: string; telefone: string }[] {
  if (rows.length === 0) return []
  const colunas = Object.keys(rows[0])
  const colNome = colunas.find((c) => /^nome/.test(linhaCabecalho(c)))
  const colTelefone = colunas.find((c) => /telefone|celular|whatsapp|contato|fone/.test(linhaCabecalho(c)))
  if (!colNome) return []
  return rows
    .map((r) => ({
      nome: String(r[colNome] ?? '').trim(),
      telefone: colTelefone ? String(r[colTelefone] ?? '').trim() : '',
    }))
    .filter((a) => a.nome)
}

export default function PlanilhaAlunosModal({
  turmaId,
  turmaNome,
  onClose,
  onChanged,
}: {
  turmaId: string
  turmaNome: string
  onClose: () => void
  onChanged: () => void
}) {
  const { toast } = useToast()
  const [alunos, setAlunos] = useState<PlanilhaAluno[]>([])
  const [carregando, setCarregando] = useState(true)
  const [enviandoArquivo, setEnviandoArquivo] = useState(false)
  const [mostrarFechados, setMostrarFechados] = useState(false)
  const [busca, setBusca] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  async function carregar() {
    setCarregando(true)
    try {
      await reconciliarComSGE(turmaId)
      setAlunos(await listarPlanilhaAlunos(turmaId))
    } catch (e: any) {
      toast({ title: 'Erro ao carregar planilha', description: e.message, variant: 'destructive' })
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turmaId])

  async function handleArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setEnviandoArquivo(true)
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const primeiraAba = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(primeiraAba, { defval: '' })
      const extraidos = extrairAlunos(rows)
      if (extraidos.length === 0) {
        toast({
          title: 'Nenhum aluno reconhecido',
          description: 'A planilha precisa de uma coluna "Nome" (e idealmente "Telefone").',
          variant: 'destructive',
        })
        return
      }
      const { importados, ignorados } = await importarAlunos(turmaId, extraidos)
      toast({
        title: 'Planilha importada',
        description: `${importados} aluno(s) adicionado(s)${ignorados ? `, ${ignorados} já estavam na lista` : ''}.`,
      })
      await carregar()
      onChanged()
    } catch (e: any) {
      toast({ title: 'Erro ao importar planilha', description: e.message, variant: 'destructive' })
    } finally {
      setEnviandoArquivo(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function mudarStatus(aluno: PlanilhaAluno, status: StatusAluno) {
    const novoStatus = aluno.status === status ? 'pendente' : status
    setAlunos((prev) => prev.map((a) => (a.id === aluno.id ? { ...a, status: novoStatus, fechou: novoStatus === 'fechado' || a.fechou } : a)))
    try {
      await atualizarStatusAluno(aluno.id, novoStatus)
      onChanged()
    } catch (e: any) {
      toast({ title: 'Erro ao atualizar status', description: e.message, variant: 'destructive' })
      carregar()
    }
  }

  async function handleRemover(aluno: PlanilhaAluno) {
    if (!confirm(`Remover "${aluno.nome}" da planilha?`)) return
    try {
      await removerAluno(aluno.id)
      setAlunos((prev) => prev.filter((a) => a.id !== aluno.id))
      onChanged()
    } catch (e: any) {
      toast({ title: 'Erro ao remover', description: e.message, variant: 'destructive' })
    }
  }

  const fechadosCount = useMemo(() => alunos.filter((a) => a.fechou).length, [alunos])

  const visiveis = useMemo(() => {
    const b = busca.trim().toLowerCase()
    return alunos.filter((a) => {
      if (!mostrarFechados && a.fechou) return false
      if (b && !a.nome.toLowerCase().includes(b)) return false
      return true
    })
  }, [alunos, mostrarFechados, busca])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div
        className="bg-[#0a0f14] border border-white/10 rounded-xl w-full max-w-3xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-white/[0.06]">
          <div>
            <h2 className="text-sm font-semibold text-white">{turmaNome}</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {alunos.length} aluno(s) na planilha
              {fechadosCount > 0 ? ` · ${fechadosCount} já fecharam` : ''}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06]">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 flex flex-wrap items-center gap-2 border-b border-white/[0.06]">
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleArquivo}
          />
          <button
            onClick={() => inputRef.current?.click()}
            disabled={enviandoArquivo}
            className="inline-flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-medium px-3 py-2 rounded-lg disabled:opacity-50"
          >
            <Upload className="w-3.5 h-3.5" />
            {enviandoArquivo ? 'Importando…' : 'Subir planilha (Nome + Telefone)'}
          </button>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar aluno…"
            className="flex-1 min-w-[140px] bg-[#111820] border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
          {fechadosCount > 0 && (
            <label className="flex items-center gap-1.5 text-[11px] text-slate-400 whitespace-nowrap">
              <input
                type="checkbox"
                checked={mostrarFechados}
                onChange={(e) => setMostrarFechados(e.target.checked)}
                className="accent-orange-500"
              />
              Mostrar quem já fechou ({fechadosCount})
            </label>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-1.5">
          {carregando ? (
            <p className="text-xs text-slate-400">Carregando…</p>
          ) : visiveis.length === 0 ? (
            <p className="text-xs text-slate-500">
              {alunos.length === 0
                ? 'Nenhum aluno importado ainda — suba a planilha da turma acima.'
                : 'Nenhum aluno pendente aqui (todo mundo já fechou, ou o filtro de busca não achou nada).'}
            </p>
          ) : (
            visiveis.map((a) => {
              const wa = linkWhatsApp(a.telefone)
              return (
                <div
                  key={a.id}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 border ${
                    a.fechou
                      ? 'bg-emerald-500/[0.06] border-emerald-500/20'
                      : 'bg-white/[0.02] border-white/[0.06]'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div
                      className={`text-xs font-medium truncate ${
                        a.fechou ? 'text-emerald-300 line-through' : 'text-slate-200'
                      }`}
                    >
                      {a.nome}
                      {a.fechou && (
                        <CheckCircle2 className="inline w-3 h-3 ml-1.5 -mt-0.5 text-emerald-400" />
                      )}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {a.telefone || 'sem telefone'}
                      {a.fechouOrigem === 'sge_auto' && ' · detectado automático (SGE)'}
                    </div>
                  </div>
                  {!a.fechou && (
                    <div className="flex items-center gap-1 flex-wrap justify-end">
                      {wa && (
                        <a
                          href={wa}
                          target="_blank"
                          rel="noreferrer"
                          title="Abrir conversa no WhatsApp"
                          className="p-1.5 rounded-md text-emerald-400 hover:bg-emerald-500/10"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                        </a>
                      )}
                      {STATUS_OPCOES.map((op) => (
                        <button
                          key={op.value}
                          onClick={() => mudarStatus(a, op.value)}
                          className={`text-[10px] font-medium px-2 py-1 rounded-full border transition-colors ${
                            a.status === op.value
                              ? op.className
                              : 'text-slate-500 border-white/10 hover:text-slate-300'
                          }`}
                        >
                          {op.label}
                        </button>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => handleRemover(a)}
                    title="Remover da planilha"
                    className="p-1.5 rounded-md text-slate-500 hover:text-red-400 hover:bg-red-500/10"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
