// Planilha de alunos por turma fechada (Adesões > Turmas Fechadas).
// CRUD de `planilha_alunos` + reconciliação automática com `clientes` (SGE)
// pra detectar sozinho quem já fechou, sem precisar de contato manual.
import { supabase } from '@/lib/supabase/client'
import { fetchAllRows } from '@/utils/fetchAllRows'

const db = supabase as any

export type StatusAluno = 'pendente' | 'enviado' | 'sem_resposta' | 'negou' | 'fechado'

export interface PlanilhaAluno {
  id: string
  turmaId: string
  nome: string
  telefone: string | null
  status: StatusAluno
  fechou: boolean
  fechouEm: string | null
  fechouOrigem: 'sge_auto' | 'manual' | null
  contatoId: string | null
  chatWaId: string | null
  observacao: string | null
  createdAt: string
  updatedAt: string
}

function mapRow(r: any): PlanilhaAluno {
  return {
    id: r.id,
    turmaId: r.turma_id,
    nome: r.nome,
    telefone: r.telefone,
    status: r.status,
    fechou: !!r.fechou,
    fechouEm: r.fechou_em,
    fechouOrigem: r.fechou_origem,
    contatoId: r.contato_id,
    chatWaId: r.chat_wa_id,
    observacao: r.observacao,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export function normalizarTelefone(s?: string | null): string {
  return (s || '').replace(/\D/g, '')
}

/** Compara dois telefones tolerando DDI/DDD variando (compara os últimos 8 dígitos, o número local). */
export function telefonesBatem(a?: string | null, b?: string | null): boolean {
  const da = normalizarTelefone(a)
  const db_ = normalizarTelefone(b)
  if (!da || !db_) return false
  if (da === db_) return true
  const suf = 8
  return da.length >= suf && db_.length >= suf && da.slice(-suf) === db_.slice(-suf)
}

export function normalizarNome(s?: string | null): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function listarPlanilhaAlunos(turmaId: string): Promise<PlanilhaAluno[]> {
  const rows = await fetchAllRows<any>(() =>
    db.from('planilha_alunos').select('*').eq('turma_id', turmaId).order('nome'),
  )
  return rows.map(mapRow)
}

/** Todos os alunos de planilha de um conjunto de turmas — pra montar o dashboard agregado. */
export async function listarPlanilhaAlunosPorTurmas(turmaIds: string[]): Promise<PlanilhaAluno[]> {
  if (turmaIds.length === 0) return []
  const rows = await fetchAllRows<any>(() =>
    db.from('planilha_alunos').select('*').in('turma_id', turmaIds),
  )
  return rows.map(mapRow)
}

export interface AlunoImportado {
  nome: string
  telefone: string
}

/** Importa alunos da planilha subida — ignora quem já está cadastrado (mesmo telefone) nessa turma. */
export async function importarAlunos(
  turmaId: string,
  alunos: AlunoImportado[],
): Promise<{ importados: number; ignorados: number }> {
  const existentes = await listarPlanilhaAlunos(turmaId)
  const telefonesExistentes = new Set(existentes.map((a) => normalizarTelefone(a.telefone)).filter(Boolean))

  const novos = alunos.filter((a) => {
    const tel = normalizarTelefone(a.telefone)
    if (tel && telefonesExistentes.has(tel)) return false
    return !!a.nome?.trim()
  })
  if (novos.length === 0) return { importados: 0, ignorados: alunos.length }

  const { error } = await db.from('planilha_alunos').insert(
    novos.map((a) => ({
      turma_id: turmaId,
      nome: a.nome.trim(),
      telefone: normalizarTelefone(a.telefone) || null,
    })),
  )
  if (error) throw error
  return { importados: novos.length, ignorados: alunos.length - novos.length }
}

export async function atualizarStatusAluno(id: string, status: StatusAluno): Promise<void> {
  const patch: Record<string, unknown> = { status }
  if (status === 'fechado') {
    patch.fechou = true
    patch.fechou_em = new Date().toISOString()
    patch.fechou_origem = 'manual'
  }
  const { error } = await db.from('planilha_alunos').update(patch).eq('id', id)
  if (error) throw error
}

export async function vincularContatoAluno(
  id: string,
  dados: { contatoId?: string | null; chatWaId?: string | null },
): Promise<void> {
  const patch: Record<string, unknown> = {}
  if (dados.contatoId !== undefined) patch.contato_id = dados.contatoId
  if (dados.chatWaId !== undefined) patch.chat_wa_id = dados.chatWaId
  const { data: atual } = await db.from('planilha_alunos').select('status').eq('id', id).maybeSingle()
  if (atual?.status === 'pendente') patch.status = 'enviado'
  const { error } = await db.from('planilha_alunos').update(patch).eq('id', id)
  if (error) throw error
}

export async function removerAluno(id: string): Promise<void> {
  const { error } = await db.from('planilha_alunos').delete().eq('id', id)
  if (error) throw error
}

interface ClienteSGE {
  nome: string | null
  telefone: string | null
  created_at: string
}

/**
 * Cruza a planilha da turma com `clientes` (alimentado pelo SGE) — quem bate
 * por telefone ou nome já fechou, mesmo sem ter passado pelo contato manual
 * via WhatsApp. Roda toda vez que a planilha de uma turma é aberta.
 */
export async function reconciliarComSGE(turmaId: string): Promise<number> {
  const [alunos, { data: clientesRaw }] = await Promise.all([
    listarPlanilhaAlunos(turmaId),
    db.from('clientes').select('nome, telefone, created_at').eq('turma_id', turmaId),
  ])
  const clientes: ClienteSGE[] = clientesRaw || []
  if (clientes.length === 0) return 0

  const pendentes = alunos.filter((a) => !a.fechou)
  if (pendentes.length === 0) return 0

  let atualizados = 0
  for (const aluno of pendentes) {
    const match = clientes.find(
      (c) => telefonesBatem(c.telefone, aluno.telefone) || normalizarNome(c.nome) === normalizarNome(aluno.nome),
    )
    if (!match) continue
    const { error } = await db
      .from('planilha_alunos')
      .update({
        fechou: true,
        fechou_em: match.created_at || new Date().toISOString(),
        fechou_origem: 'sge_auto',
        status: 'fechado',
      })
      .eq('id', aluno.id)
    if (!error) atualizados++
  }
  return atualizados
}
