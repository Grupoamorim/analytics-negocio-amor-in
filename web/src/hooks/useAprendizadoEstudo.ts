import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import type { AprendizadoEstudo, ObjecaoContagem } from '@/types/crm'
import type { Database } from '@/lib/supabase/types'

type Row = Database['public']['Tables']['aprendizado_estudo']['Row']

function mapRow(r: Row): AprendizadoEstudo {
  return {
    id: r.id,
    escopo: (r.escopo as AprendizadoEstudo['escopo']) || 'geral',
    curso: r.curso || undefined,
    faculdade: r.faculdade || undefined,
    amostraTurmas: r.amostra_turmas ?? 0,
    amostraReunioes: r.amostra_reunioes ?? 0,
    taxaFechamento: r.taxa_fechamento ?? undefined,
    taxaAvancoPorPortao: (r.taxa_avanco_por_portao as Record<string, number>) || undefined,
    tempoMedioPorEstagio: (r.tempo_medio_por_estagio as Record<string, number>) || undefined,
    objecoesComuns: (r.objecoes_comuns as ObjecaoContagem[]) || undefined,
    pontosFortesComuns: (r.pontos_fortes_comuns as ObjecaoContagem[]) || undefined,
    motivosPerdaComuns: (r.motivos_perda_comuns as ObjecaoContagem[]) || undefined,
    oQueFunciona: r.o_que_funciona || undefined,
    oQueEvitar: r.o_que_evitar || undefined,
    pitchRecomendado: r.pitch_recomendado || undefined,
    estruturaApresentacao: r.estrutura_apresentacao || undefined,
    preferenciasFormandos: r.preferencias_formandos || undefined,
    geradoEm: r.gerado_em || undefined,
    geradoPor: (r.gerado_por as 'regras' | 'gemini' | null) || undefined,
  }
}

export function useAprendizadoEstudo() {
  const { isAuthenticated, loading: authLoading } = useAuth()
  const [estudos, setEstudos] = useState<AprendizadoEstudo[]>([])
  const [loading, setLoading] = useState(true)

  const refreshEstudos = useCallback(async () => {
    if (!isAuthenticated) {
      setEstudos([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const { data, error } = await supabase.from('aprendizado_estudo').select('*')
      if (error) throw error
      setEstudos((data || []).map(mapRow))
    } catch (e) {
      console.warn('Erro ao carregar aprendizado_estudo:', e)
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated])

  useEffect(() => {
    if (authLoading) return
    refreshEstudos()
  }, [authLoading, refreshEstudos])

  /** Insere ou atualiza o estudo do recorte (chave: escopo + curso + faculdade). */
  const upsertEstudo = useCallback(
    async (estudo: AprendizadoEstudo): Promise<void> => {
      if (!isAuthenticated) return
      const payload = {
        escopo: estudo.escopo,
        curso: estudo.curso || '',
        faculdade: estudo.faculdade || '',
        amostra_turmas: estudo.amostraTurmas,
        amostra_reunioes: estudo.amostraReunioes,
        taxa_fechamento: estudo.taxaFechamento ?? null,
        taxa_avanco_por_portao: estudo.taxaAvancoPorPortao ?? null,
        tempo_medio_por_estagio: estudo.tempoMedioPorEstagio ?? null,
        objecoes_comuns: estudo.objecoesComuns ?? null,
        pontos_fortes_comuns: estudo.pontosFortesComuns ?? null,
        motivos_perda_comuns: estudo.motivosPerdaComuns ?? null,
        o_que_funciona: estudo.oQueFunciona ?? null,
        o_que_evitar: estudo.oQueEvitar ?? null,
        pitch_recomendado: estudo.pitchRecomendado ?? null,
        estrutura_apresentacao: estudo.estruturaApresentacao ?? null,
        preferencias_formandos: estudo.preferenciasFormandos ?? null,
        gerado_em: estudo.geradoEm ?? new Date().toISOString(),
        gerado_por: estudo.geradoPor ?? 'regras',
        updated_at: new Date().toISOString(),
      }
      try {
        const { error } = await supabase
          .from('aprendizado_estudo')
          .upsert(payload, { onConflict: 'escopo,curso,faculdade' })
        if (error) throw error
        await refreshEstudos()
      } catch (e) {
        console.warn('Erro ao salvar estudo:', e)
        throw e
      }
    },
    [isAuthenticated, refreshEstudos],
  )

  return { estudos, loading, upsertEstudo, refreshEstudos }
}
