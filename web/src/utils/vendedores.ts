// Lista de vendedores/SDRs que aparece no formulário público de Captação
// (o cliente escolhe quem é o vendedor dele) e é gerenciada pelo admin em
// Administração > Vendedores/SDR.
import { supabase } from '@/lib/supabase/client'

export interface Vendedor {
  id: string
  nome: string
  ativo: boolean
  createdAt: string
}

function mapRow(row: { id: string; nome: string; ativo: boolean; created_at: string }): Vendedor {
  return { id: row.id, nome: row.nome, ativo: row.ativo, createdAt: row.created_at }
}

/** Usado no formulário público — só os vendedores ativos, em ordem alfabética. */
export async function fetchVendedoresAtivos(): Promise<string[]> {
  const { data, error } = await supabase
    .from('vendedores')
    .select('nome')
    .eq('ativo', true)
    .order('nome')
  if (error || !data) return []
  return data.map((r) => r.nome)
}

/** Usado no Admin — lista completa (ativos e inativos) para gerenciar. */
export async function listarVendedores(): Promise<Vendedor[]> {
  const { data, error } = await supabase.from('vendedores').select('*').order('nome')
  if (error || !data) return []
  return data.map(mapRow)
}

export async function adicionarVendedor(nome: string): Promise<void> {
  const n = nome.trim()
  if (!n) return
  const { error } = await supabase.from('vendedores').insert({ nome: n })
  if (error) throw error
}

export async function atualizarVendedor(id: string, patch: Partial<Pick<Vendedor, 'nome' | 'ativo'>>): Promise<void> {
  const { error } = await supabase.from('vendedores').update(patch).eq('id', id)
  if (error) throw error
}

export async function removerVendedor(id: string): Promise<void> {
  const { error } = await supabase.from('vendedores').delete().eq('id', id)
  if (error) throw error
}
