// Clientes reais (quem já tem registro financeiro no SGE - venda, adesão ou
// conta a receber) por turma. Populada automaticamente por
// sync_normalized_from_sge() no Supabase - não é criada/editada em massa
// por aqui, só telefone/e-mail podem ser completados na mão quando o SGE
// não trouxe esse dado (usado como base pro app de seleção de fotos).
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import type { Database } from '@/lib/supabase/types'
import { reportSupabaseError } from '@/utils/reportError'

type ClienteRow = Database['public']['Tables']['clientes']['Row']

export interface Cliente {
  id: string
  nome: string
  email: string
  telefone: string
  turmaId: string | null
  status: string
  codigoSGE: string | null
  createdAt: string
}

function mapRow(row: ClienteRow): Cliente {
  return {
    id: row.id,
    nome: row.nome || 'Sem nome',
    email: row.email || '',
    telefone: row.telefone || '',
    turmaId: row.turma_id,
    status: row.status || 'ativo',
    codigoSGE: row.codigo_sge,
    createdAt: row.created_at,
  }
}

export function useClientes() {
  const { isAuthenticated, loading: authLoading } = useAuth()
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(true)

  const refreshClientes = useCallback(async () => {
    if (!isAuthenticated) {
      setClientes([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('clientes')
        .select('*')
        .order('nome', { ascending: true })
      if (error) throw error
      setClientes((data || []).map(mapRow))
    } catch (e) {
      console.warn('Erro ao carregar clientes:', e)
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated])

  useEffect(() => {
    if (authLoading) return
    refreshClientes()
  }, [authLoading, refreshClientes])

  const updateCliente = useCallback(
    async (id: string, updates: Partial<Pick<Cliente, 'email' | 'telefone'>>): Promise<void> => {
      try {
        const { error } = await supabase
          .from('clientes')
          .update({ email: updates.email, telefone: updates.telefone })
          .eq('id', id)
        if (error) throw error
        setClientes((prev) => prev.map((c) => (c.id === id ? { ...c, ...updates } : c)))
      } catch (e) {
        console.warn('Erro ao atualizar cliente:', e)
        reportSupabaseError('Atualizar cliente', e)
      }
    },
    [],
  )

  return { clientes, loading, updateCliente, refreshClientes }
}
