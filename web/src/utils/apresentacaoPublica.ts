// Apresentação pública da turma: fotos + link online (público) pra mandar
// pra turma ver. Tabela `apresentacao_publica` (1 linha por turma) + bucket
// público `apresentacoes`. A página pública (/p/:token) lê via Edge Function.
import { supabase } from '@/lib/supabase/client'
import { appBaseUrl } from '@/lib/appUrl'

export interface ApresentacaoPublica {
  id: string
  turmaId: string
  token: string
  fotos: string[]
  titulo: string | null
  mensagem: string | null
  publicada: boolean
}

const db = supabase as any

function map(row: any): ApresentacaoPublica {
  return {
    id: row.id,
    turmaId: row.turma_id,
    token: row.token,
    fotos: row.fotos || [],
    titulo: row.titulo,
    mensagem: row.mensagem,
    publicada: !!row.publicada,
  }
}

/** Pega a apresentação da turma; cria se ainda não existe. */
export async function getOrCreateApresentacao(turmaId: string): Promise<ApresentacaoPublica> {
  const { data } = await db
    .from('apresentacao_publica')
    .select('*')
    .eq('turma_id', turmaId)
    .maybeSingle()
  if (data) return map(data)
  const { data: novo, error } = await db
    .from('apresentacao_publica')
    .insert({ turma_id: turmaId })
    .select()
    .single()
  if (error) throw error
  return map(novo)
}

export async function atualizarApresentacao(
  id: string,
  patch: Partial<Pick<ApresentacaoPublica, 'fotos' | 'titulo' | 'mensagem' | 'publicada'>>,
): Promise<void> {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.fotos !== undefined) payload.fotos = patch.fotos
  if (patch.titulo !== undefined) payload.titulo = patch.titulo
  if (patch.mensagem !== undefined) payload.mensagem = patch.mensagem
  if (patch.publicada !== undefined) payload.publicada = patch.publicada
  const { error } = await db.from('apresentacao_publica').update(payload).eq('id', id)
  if (error) throw error
}

/** Sobe uma foto no bucket público e devolve a URL. */
export async function uploadFotoApresentacao(turmaId: string, file: File): Promise<string> {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
  const path = `${turmaId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { error } = await supabase.storage
    .from('apresentacoes')
    .upload(path, file, { upsert: false, contentType: file.type || 'image/jpeg' })
  if (error) throw error
  const { data } = supabase.storage.from('apresentacoes').getPublicUrl(path)
  return data.publicUrl
}

export async function removerFotoApresentacao(url: string): Promise<void> {
  const m = url.match(/\/apresentacoes\/(.+)$/)
  if (m) await supabase.storage.from('apresentacoes').remove([decodeURIComponent(m[1])])
}

/** Só as fotos (pra usar no slideshow interno também). */
export async function fotosDaTurma(turmaId: string): Promise<string[]> {
  const { data } = await db
    .from('apresentacao_publica')
    .select('fotos')
    .eq('turma_id', turmaId)
    .maybeSingle()
  return (data?.fotos as string[]) || []
}

export function linkPublicoApresentacao(token: string): string {
  return `${appBaseUrl()}/p/${token}`
}
