// Duração (em anos) de cada curso, usada pelo job automático de conclusão de
// turma (collectors/turma_conclusao.py) pra calcular o Ano de Formatura da
// turma seguinte quando uma turma conclui. Gerenciado em Administração >
// Turmas. Ver CLAUDE.md para a fórmula completa.
import { supabase } from '@/lib/supabase/client'

export interface DuracaoCurso {
  id: string
  curso: string
  faculdade: string // '' = vale para qualquer faculdade desse curso
  duracaoAnos: number
  observacoes: string | null
  createdAt: string
}

function mapRow(row: {
  id: string
  curso: string
  faculdade: string
  duracao_anos: number
  observacoes: string | null
  created_at: string
}): DuracaoCurso {
  return {
    id: row.id,
    curso: row.curso,
    faculdade: row.faculdade || '',
    duracaoAnos: row.duracao_anos,
    observacoes: row.observacoes,
    createdAt: row.created_at,
  }
}

export async function listarDuracaoCursos(): Promise<DuracaoCurso[]> {
  const { data, error } = await supabase.from('duracao_cursos').select('*').order('curso')
  if (error || !data) return []
  return data.map(mapRow)
}

export async function adicionarDuracaoCurso(
  curso: string,
  faculdade: string,
  duracaoAnos: number,
): Promise<void> {
  const c = curso.trim()
  if (!c || !duracaoAnos) return
  const { error } = await supabase
    .from('duracao_cursos')
    .insert({ curso: c, faculdade: faculdade.trim(), duracao_anos: duracaoAnos })
  if (error) throw error
}

export async function atualizarDuracaoCurso(
  id: string,
  patch: Partial<Pick<DuracaoCurso, 'duracaoAnos' | 'observacoes'>>,
): Promise<void> {
  const payload: { duracao_anos?: number; observacoes?: string | null } = {}
  if (patch.duracaoAnos !== undefined) payload.duracao_anos = patch.duracaoAnos
  if (patch.observacoes !== undefined) payload.observacoes = patch.observacoes
  const { error } = await supabase.from('duracao_cursos').update(payload).eq('id', id)
  if (error) throw error
}

export async function removerDuracaoCurso(id: string): Promise<void> {
  const { error } = await supabase.from('duracao_cursos').delete().eq('id', id)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Em que semestre do curso a turma está HOJE
// ---------------------------------------------------------------------------

const normCurso = (s: string) => s.trim().toLowerCase()

/** Duração (anos) do curso da turma: casa faculdade específica primeiro, senão a regra geral. */
export function acharDuracaoAnos(
  cursos: DuracaoCurso[],
  curso?: string | null,
  faculdade?: string | null,
): number | null {
  if (!curso) return null
  const c = normCurso(curso)
  const f = normCurso(faculdade || '')
  const espec = cursos.find((d) => normCurso(d.curso) === c && d.faculdade && normCurso(d.faculdade) === f)
  if (espec) return espec.duracaoAnos
  const geral = cursos.find((d) => normCurso(d.curso) === c && !d.faculdade)
  return geral?.duracaoAnos ?? null
}

/** Semestre acadêmico de uma data (1º = jan–jun, 2º = jul–dez). */
export function semestreAcademico(hoje = new Date()): { ano: number; sem: 1 | 2 } {
  return { ano: hoje.getFullYear(), sem: hoje.getMonth() + 1 <= 6 ? 1 : 2 }
}

/** "2028.1" | "2028/2" | "2028-1" -> { ano, sem }. */
export function parseAnoFormatura(s?: string | null): { ano: number; sem: 1 | 2 } | null {
  const m = String(s || '').match(/(\d{4})\s*[./-]\s*([12])/)
  return m ? { ano: Number(m[1]), sem: Number(m[2]) as 1 | 2 } : null
}

/**
 * Em qual semestre do curso a turma está hoje.
 * Ex.: Direito (5 anos = 10 semestres) que forma em 2028.1, hoje em 2026.2 → 7º de 10.
 * Retorna null quando não dá pra saber (sem ano de formatura válido ou sem
 * duração cadastrada — não inventamos duração de curso).
 */
export function semestreDaTurma(
  anoFormatura: string | null | undefined,
  duracaoAnos: number | null | undefined,
  hoje = new Date(),
): { atual: number; total: number; formado: boolean; naoIniciado: boolean } | null {
  const grad = parseAnoFormatura(anoFormatura)
  if (!grad || !duracaoAnos || duracaoAnos <= 0) return null
  const total = Math.round(duracaoAnos * 2)
  const agora = semestreAcademico(hoje)
  const faltam = (grad.ano - agora.ano) * 2 + (grad.sem - agora.sem)
  const atual = total - faltam
  return {
    atual: Math.min(Math.max(atual, 1), total),
    total,
    formado: atual > total,
    naoIniciado: atual < 1,
  }
}

/** Texto curto pra coluna/badge, ex "7º/10", "Formado", "—". */
export function semestreDaTurmaLabel(
  anoFormatura: string | null | undefined,
  duracaoAnos: number | null | undefined,
  hoje = new Date(),
): string {
  const s = semestreDaTurma(anoFormatura, duracaoAnos, hoje)
  if (!s) return '—'
  if (s.formado) return 'Formado'
  if (s.naoIniciado) return 'A iniciar'
  return `${s.atual}º/${s.total}`
}
