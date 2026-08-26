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
  const payload: Record<string, unknown> = {}
  if (patch.duracaoAnos !== undefined) payload.duracao_anos = patch.duracaoAnos
  if (patch.observacoes !== undefined) payload.observacoes = patch.observacoes
  const { error } = await supabase.from('duracao_cursos').update(payload).eq('id', id)
  if (error) throw error
}

export async function removerDuracaoCurso(id: string): Promise<void> {
  const { error } = await supabase.from('duracao_cursos').delete().eq('id', id)
  if (error) throw error
}
