// Catálogo de itens possíveis de um pacote (clicável ao montar o pacote de
// uma turma) e templates padrão (Luxo/Moderno/Clássico/Básico) que só
// pré-preenchem os itens de um pacote novo a partir do catálogo. Editável em
// Administração > Turmas > Pacotes.
import { supabase } from '@/lib/supabase/client'

export interface ItemCatalogo {
  id: string
  nome: string
  ordem: number
  ativo: boolean
}

export interface TemplatePacote {
  id: string
  nome: string
  itens: string[]
  ordem: number
  ativo: boolean
}

function mapItem(row: { id: string; nome: string; ordem: number; ativo: boolean }): ItemCatalogo {
  return { id: row.id, nome: row.nome, ordem: row.ordem, ativo: row.ativo }
}

function mapTemplate(row: {
  id: string
  nome: string
  itens: string[] | null
  ordem: number
  ativo: boolean
}): TemplatePacote {
  return { id: row.id, nome: row.nome, itens: row.itens || [], ordem: row.ordem, ativo: row.ativo }
}

/** Usado ao montar um pacote — só os itens/templates ativos, em ordem. */
export async function fetchCatalogoAtivo(): Promise<ItemCatalogo[]> {
  const { data, error } = await supabase
    .from('pacote_itens_catalogo')
    .select('*')
    .eq('ativo', true)
    .order('ordem')
  if (error || !data) return []
  return data.map(mapItem)
}

export async function fetchTemplatesAtivos(): Promise<TemplatePacote[]> {
  const { data, error } = await supabase
    .from('pacote_templates')
    .select('*')
    .eq('ativo', true)
    .order('ordem')
  if (error || !data) return []
  return data.map(mapTemplate)
}

/** Usado no Admin — lista completa (ativos e inativos) pra gerenciar. */
export async function listarCatalogo(): Promise<ItemCatalogo[]> {
  const { data, error } = await supabase.from('pacote_itens_catalogo').select('*').order('ordem')
  if (error || !data) return []
  return data.map(mapItem)
}

export async function listarTemplates(): Promise<TemplatePacote[]> {
  const { data, error } = await supabase.from('pacote_templates').select('*').order('ordem')
  if (error || !data) return []
  return data.map(mapTemplate)
}

export async function adicionarItemCatalogo(nome: string): Promise<void> {
  const n = nome.trim()
  if (!n) return
  const { error } = await supabase.from('pacote_itens_catalogo').insert({ nome: n })
  if (error) throw error
}

export async function atualizarItemCatalogo(
  id: string,
  patch: Partial<Pick<ItemCatalogo, 'nome' | 'ativo'>>,
): Promise<void> {
  const { error } = await supabase.from('pacote_itens_catalogo').update(patch).eq('id', id)
  if (error) throw error
}

export async function removerItemCatalogo(id: string): Promise<void> {
  const { error } = await supabase.from('pacote_itens_catalogo').delete().eq('id', id)
  if (error) throw error
}

export async function adicionarTemplate(nome: string): Promise<void> {
  const n = nome.trim()
  if (!n) return
  const { error } = await supabase.from('pacote_templates').insert({ nome: n, itens: [] })
  if (error) throw error
}

export async function atualizarTemplate(
  id: string,
  patch: Partial<Pick<TemplatePacote, 'nome' | 'itens' | 'ativo'>>,
): Promise<void> {
  const { error } = await supabase
    .from('pacote_templates')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function removerTemplate(id: string): Promise<void> {
  const { error } = await supabase.from('pacote_templates').delete().eq('id', id)
  if (error) throw error
}
