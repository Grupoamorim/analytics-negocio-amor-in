// Persistência dos leads de captação no Supabase (banco central).
// Antes ficava só no localStorage do navegador de quem preenchia o formulário público —
// migrado para que todo cadastro externo chegue de fato ao painel da equipe.
import { supabase } from '@/lib/supabase/client'
import type { Database } from '@/lib/supabase/types'
import { CaptacaoLead, normalizeTurma } from '@/types/captacao'
import { ensureCidadeFaculdade } from '@/utils/mercadoFaculdades'

type CaptacaoLeadRow = Database['public']['Tables']['captacao_leads']['Row']
type CaptacaoLeadWrite = Database['public']['Tables']['captacao_leads']['Insert']

function mapRowToLead(row: CaptacaoLeadRow): CaptacaoLead {
  return {
    id: row.id,
    curso: row.curso || '',
    faculdade: row.faculdade || '',
    turma: row.turma || '',
    anoFormatura: row.ano_formatura || '',
    cidade: row.cidade || '',
    nome: row.nome || '',
    telefone: row.telefone || '',
    email: row.email || '',
    dataCadastro: row.data_cadastro || new Date().toISOString(),
  }
}

function mapLeadToRow(input: Partial<CaptacaoLead>): CaptacaoLeadWrite {
  const row: CaptacaoLeadWrite = {}
  if (input.curso !== undefined) row.curso = input.curso
  if (input.faculdade !== undefined) row.faculdade = input.faculdade
  if (input.turma !== undefined) row.turma = input.turma
  if (input.anoFormatura !== undefined) row.ano_formatura = input.anoFormatura
  if (input.cidade !== undefined) row.cidade = input.cidade
  if (input.nome !== undefined) row.nome = input.nome
  if (input.telefone !== undefined) row.telefone = input.telefone
  if (input.email !== undefined) row.email = input.email
  return row
}

export async function loadLeads(): Promise<CaptacaoLead[]> {
  const { data, error } = await supabase
    .from('captacao_leads')
    .select('*')
    .order('data_cadastro', { ascending: false })
  if (error || !data) return []
  return data.map(mapRowToLead)
}

export async function addLead(
  input: Omit<CaptacaoLead, 'id' | 'dataCadastro' | 'turma'> & { turma?: string },
): Promise<void> {
  const row = mapLeadToRow({ ...input, turma: normalizeTurma(input.turma) })
  const { error } = await supabase.from('captacao_leads').insert(row)
  if (error) throw error

  // Alimenta a lista de faculdades conhecidas por cidade (auto-retroalimentação).
  if (input.cidade && input.faculdade) {
    ensureCidadeFaculdade(input.cidade, input.faculdade).catch(() => {
      /* não bloqueia o cadastro se isso falhar */
    })
  }
}

export async function updateLead(id: string, patch: Partial<CaptacaoLead>): Promise<void> {
  const normalized = patch.turma !== undefined ? { ...patch, turma: normalizeTurma(patch.turma) } : patch
  const row = mapLeadToRow(normalized)
  const { error } = await supabase.from('captacao_leads').update(row).eq('id', id)
  if (error) throw error

  if (patch.cidade && patch.faculdade) {
    ensureCidadeFaculdade(patch.cidade, patch.faculdade).catch(() => {})
  }
}

export async function deleteLead(id: string): Promise<void> {
  const { error } = await supabase.from('captacao_leads').delete().eq('id', id)
  if (error) throw error
}
