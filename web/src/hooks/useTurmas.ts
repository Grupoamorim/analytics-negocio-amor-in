import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import type { Lead, LeadStatus, LeadSource } from '@/types/crm'
import type { Database } from '@/lib/supabase/types'

type TurmaRow = Database['public']['Tables']['turmas']['Row']
type TurmaInsert = Database['public']['Tables']['turmas']['Insert']
type TurmaUpdate = Database['public']['Tables']['turmas']['Update']

const LOCAL_STORAGE_KEY = 'crm_leads'

function mapRowToLead(row: TurmaRow): Lead {
  return {
    id: row.id,
    curso: row.curso,
    faculdade: row.faculdade,
    turma: row.turma || 'Turma 0',
    anoFormatura: row.ano_formatura || '2027.1',
    cidade: row.cidade || '',
    status: (row.funil_status as LeadStatus) || 'Novo',
    source: (row.como_conheceu || 'Ativa') as LeadSource,
    potentialValue:
      row.funil_status === 'Convertido'
        ? 65000
        : row.funil_status === 'Qualificado'
          ? 48000
          : 35000,
    ownerId: row.user_id || 'm-1',
    empresa: row.empresa || 'AFF',
    tipoServico: row.tipo_servico || 'Formatura',
    comoConheceu: row.como_conheceu || 'Passiva',
    closer: row.closer || '',
    concorrentes: row.concorrentes || '',
    observacoes: row.observacoes || '',
    notes: row.observacoes || '',
    sdr: row.sdr || '',
    primeiroContatoEm: row.primeiro_contato || '',
    dataCadastro: row.data_cadastro || '',
    dataFechamento: row.fechamento_contrato || '',
    linkProposta: row.proposta_link || '',
    contatoNome: row.contato_nome || '',
    contatoTelefone: row.contato_telefone || '',
    totalAlunos: row.total_alunos || 0,
    alunosFechados: row.alunos_fechados || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapLeadToInsert(lead: Partial<Lead>, userId: string): TurmaInsert {
  const payload: TurmaInsert = {
    user_id: userId,
    empresa: lead.empresa || 'AFF',
    curso: lead.curso || '',
    faculdade: lead.faculdade || '',
    turma: lead.turma || 'Turma 0',
    ano_formatura: lead.anoFormatura || '',
    cidade: lead.cidade || '',
    funil_status: lead.status || 'Novo',
    contato_nome: lead.contatoNome || null,
    contato_telefone: lead.contatoTelefone || null,
    sdr: lead.sdr || null,
    closer: lead.closer || null,
    observacoes: lead.observacoes || lead.notes || null,
    concorrentes: lead.concorrentes || null,
    tipo_servico: lead.tipoServico || null,
    como_conheceu: lead.comoConheceu || lead.source || null,
    proposta_link: lead.linkProposta || null,
    total_alunos: lead.totalAlunos || 0,
    alunos_fechados: lead.alunosFechados || 0,
    data_cadastro: lead.dataCadastro || null,
    primeiro_contato: lead.primeiroContatoEm || null,
    fechamento_contrato: lead.dataFechamento || null,
  }

  // Only pass UUID if it's a valid uuid format
  if (lead.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(lead.id)) {
    payload.id = lead.id
  }

  return payload
}

export function useTurmas() {
  const { user, isAuthenticated, loading: authLoading } = useAuth()
  const [turmas, setTurmas] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Carregar turmas do Supabase (Fonte Primária quando autenticado)
  const fetchTurmas = useCallback(async () => {
    if (!isAuthenticated || !user) {
      setTurmas([])
      return
    }

    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('turmas')
        .select('*')
        .order('created_at', { ascending: false })

      if (err) throw err

      const mapped = (data || []).map(mapRowToLead)
      setTurmas(mapped)
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(mapped))
    } catch (e: any) {
      console.warn('Erro ao carregar turmas do Supabase:', e)
      setError(e.message || 'Erro ao sincronizar com Supabase')
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated, user])

  useEffect(() => {
    if (authLoading) return

    if (isAuthenticated) {
      fetchTurmas()
    } else {
      setTurmas([])
      setLoading(false)
    }
  }, [isAuthenticated, authLoading, fetchTurmas])

  const addTurma = async (leadData: Omit<Lead, 'id'>): Promise<Lead> => {
    if (isAuthenticated && user) {
      try {
        const payload = mapLeadToInsert(leadData, user.id)
        const { data, error: err } = await supabase.from('turmas').insert(payload).select().single()
        if (err) throw err
        if (data) {
          const created = mapRowToLead(data)
          setTurmas((prev) => {
            const updated = [created, ...prev.filter((l) => l.id !== created.id)]
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated))
            return updated
          })
          return created
        }
      } catch (e: any) {
        console.warn('Erro ao salvar turma no Supabase, salvando em cache local:', e)
        setError(e.message)
      }
    }

    // Fallback offline / não autenticado
    const tempId = `turma-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
    const newLead: Lead = {
      ...leadData,
      id: tempId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    setTurmas((prev) => {
      const updated = [newLead, ...prev]
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated))
      return updated
    })

    return newLead
  }

  const updateTurma = async (id: string, updates: Partial<Lead>): Promise<void> => {
    // 1. Atualizar Supabase primeiro se autenticado
    if (isAuthenticated && user) {
      try {
        const updatePayload: TurmaUpdate = {}
        if (updates.curso !== undefined) updatePayload.curso = updates.curso
        if (updates.faculdade !== undefined) updatePayload.faculdade = updates.faculdade
        if (updates.turma !== undefined) updatePayload.turma = updates.turma
        if (updates.anoFormatura !== undefined) updatePayload.ano_formatura = updates.anoFormatura
        if (updates.cidade !== undefined) updatePayload.cidade = updates.cidade
        if (updates.status !== undefined) updatePayload.funil_status = updates.status
        if (updates.empresa !== undefined) updatePayload.empresa = updates.empresa
        if (updates.tipoServico !== undefined) updatePayload.tipo_servico = updates.tipoServico
        if (updates.comoConheceu !== undefined) updatePayload.como_conheceu = updates.comoConheceu
        if (updates.closer !== undefined) updatePayload.closer = updates.closer
        if (updates.sdr !== undefined) updatePayload.sdr = updates.sdr
        if (updates.concorrentes !== undefined) updatePayload.concorrentes = updates.concorrentes
        if (updates.observacoes !== undefined) updatePayload.observacoes = updates.observacoes
        if (updates.notes !== undefined && updates.observacoes === undefined)
          updatePayload.observacoes = updates.notes
        if (updates.primeiroContatoEm !== undefined)
          updatePayload.primeiro_contato = updates.primeiroContatoEm
        if (updates.dataCadastro !== undefined) updatePayload.data_cadastro = updates.dataCadastro
        if (updates.dataFechamento !== undefined)
          updatePayload.fechamento_contrato = updates.dataFechamento
        if (updates.linkProposta !== undefined) updatePayload.proposta_link = updates.linkProposta
        if (updates.contatoNome !== undefined) updatePayload.contato_nome = updates.contatoNome
        if (updates.contatoTelefone !== undefined)
          updatePayload.contato_telefone = updates.contatoTelefone
        if (updates.totalAlunos !== undefined) updatePayload.total_alunos = updates.totalAlunos
        if (updates.alunosFechados !== undefined)
          updatePayload.alunos_fechados = updates.alunosFechados

        const { error: err } = await supabase.from('turmas').update(updatePayload).eq('id', id)
        if (err) throw err
      } catch (e: any) {
        console.warn('Erro ao atualizar turma no Supabase:', e)
        setError(e.message)
      }
    }

    // 2. Atualizar estado e cache local
    setTurmas((prev) => {
      const updated = prev.map((l) =>
        l.id === id ? { ...l, ...updates, updatedAt: new Date().toISOString() } : l,
      )
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated))
      return updated
    })
  }

  const deleteTurma = async (id: string): Promise<void> => {
    if (isAuthenticated) {
      try {
        const { error: err } = await supabase.from('turmas').delete().eq('id', id)
        if (err) throw err
      } catch (e: any) {
        console.warn('Erro ao excluir turma do Supabase:', e)
        setError(e.message)
      }
    }

    setTurmas((prev) => {
      const updated = prev.filter((l) => l.id !== id)
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated))
      return updated
    })
  }

  return {
    turmas,
    loading,
    error,
    addTurma,
    updateTurma,
    deleteTurma,
    refreshTurmas: fetchTurmas,
  }
}
