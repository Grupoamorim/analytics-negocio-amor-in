import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import type { FunilEvento } from '@/types/crm'
import type { Database } from '@/lib/supabase/types'

type Row = Database['public']['Tables']['funil_eventos']['Row']
type Insert = Database['public']['Tables']['funil_eventos']['Insert']

function mapRow(r: Row): FunilEvento {
  return {
    id: r.id,
    dealId: r.deal_id || undefined,
    turmaId: r.turma_id || undefined,
    curso: r.curso || undefined,
    faculdade: r.faculdade || undefined,
    empresa: r.empresa || undefined,
    cidade: r.cidade || undefined,
    tipo: (r.tipo as 'transicao' | 'desfecho') || 'transicao',
    fromStage: r.from_stage || undefined,
    toStage: r.to_stage || undefined,
    diasNoEstagioOrigem: r.dias_no_estagio_origem ?? undefined,
    transcriptProbNoMomento: r.transcript_prob_no_momento ?? undefined,
    probMotorNoMomento: r.prob_motor_no_momento ?? undefined,
    avancouApesarProbBaixa: !!r.avancou_apesar_prob_baixa,
    outcome: (r.outcome as 'ganho' | 'perdido' | null) || undefined,
    motivoPerda: r.motivo_perda || undefined,
    observacao: r.observacao || undefined,
    createdAt: r.created_at,
  }
}

export function useFunilEventos() {
  const { isAuthenticated, loading: authLoading } = useAuth()
  const [funilEventos, setFunilEventos] = useState<FunilEvento[]>([])
  const [loading, setLoading] = useState(true)

  const refreshFunilEventos = useCallback(async () => {
    if (!isAuthenticated) {
      setFunilEventos([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('funil_eventos')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      setFunilEventos((data || []).map(mapRow))
    } catch (e) {
      console.warn('Erro ao carregar funil_eventos:', e)
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated])

  useEffect(() => {
    if (authLoading) return
    refreshFunilEventos()
  }, [authLoading, refreshFunilEventos])

  const addFunilEvento = useCallback(
    async (evento: Insert): Promise<void> => {
      if (!isAuthenticated) return
      try {
        const { data, error } = await supabase
          .from('funil_eventos')
          .insert(evento)
          .select('*')
          .single()
        if (error) throw error
        if (data) setFunilEventos((prev) => [mapRow(data), ...prev])
      } catch (e) {
        console.warn('Erro ao registrar evento do funil:', e)
      }
    },
    [isAuthenticated],
  )

  return { funilEventos, loading, addFunilEvento, refreshFunilEventos }
}
