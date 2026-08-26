// Motivos padronizados de perda de turma no Funil, usados no card ao marcar
// "Perdeu" — vira dado analisável (ex: quantas perdemos por preço vs
// concorrente) em vez de texto livre. Gerenciado em Administração > Funil.
import { supabase } from '@/lib/supabase/client'

export interface MotivoPerda {
  id: string
  motivo: string
  ativo: boolean
  createdAt: string
}

function mapRow(row: { id: string; motivo: string; ativo: boolean; created_at: string }): MotivoPerda {
  return { id: row.id, motivo: row.motivo, ativo: row.ativo, createdAt: row.created_at }
}

/** Usado no Funil — só os motivos ativos, em ordem alfabética ("Outro" sempre por último). */
export async function fetchMotivosPerdaAtivos(): Promise<string[]> {
  const { data, error } = await supabase
    .from('motivos_perda')
    .select('motivo')
    .eq('ativo', true)
    .order('motivo')
  if (error || !data) return []
  const motivos = data.map((r) => r.motivo)
  motivos.sort((a, b) => (a === 'Outro' ? 1 : b === 'Outro' ? -1 : a.localeCompare(b, 'pt-BR')))
  return motivos
}

/** Usado no Admin — lista completa (ativos e inativos) para gerenciar. */
export async function listarMotivosPerda(): Promise<MotivoPerda[]> {
  const { data, error } = await supabase.from('motivos_perda').select('*').order('motivo')
  if (error || !data) return []
  return data.map(mapRow)
}

export async function adicionarMotivoPerda(motivo: string): Promise<void> {
  const m = motivo.trim()
  if (!m) return
  const { error } = await supabase.from('motivos_perda').insert({ motivo: m })
  if (error) throw error
}

export async function atualizarMotivoPerda(
  id: string,
  patch: Partial<Pick<MotivoPerda, 'motivo' | 'ativo'>>,
): Promise<void> {
  const { error } = await supabase.from('motivos_perda').update(patch).eq('id', id)
  if (error) throw error
}

export async function removerMotivoPerda(id: string): Promise<void> {
  const { error } = await supabase.from('motivos_perda').delete().eq('id', id)
  if (error) throw error
}
