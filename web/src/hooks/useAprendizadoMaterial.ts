import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import type { AprendizadoMaterial } from '@/types/crm'
import type { Database } from '@/lib/supabase/types'
import { reportSupabaseError } from '@/utils/reportError'

type Row = Database['public']['Tables']['aprendizado_material']['Row']

function mapRow(r: Row): AprendizadoMaterial {
  return {
    id: r.id,
    categoria: (r.categoria as AprendizadoMaterial['categoria']) || 'treinamento',
    titulo: r.titulo || 'Sem título',
    curso: r.curso || undefined,
    faculdade: r.faculdade || undefined,
    conteudo: r.conteudo || undefined,
    url: r.url || undefined,
    resumo: r.resumo || undefined,
    licoes: r.licoes || undefined,
    pontosFortes: r.pontos_fortes || undefined,
    pontosAtencao: r.pontos_atencao || undefined,
    taticas: r.taticas || undefined,
    sentimento: r.sentimento || undefined,
    analisadoEm: r.analisado_em || undefined,
    createdAt: r.created_at,
  }
}

export function useAprendizadoMaterial() {
  const { user, isAuthenticated, loading: authLoading } = useAuth()
  const [materiais, setMateriais] = useState<AprendizadoMaterial[]>([])
  const [loading, setLoading] = useState(true)

  const refreshMateriais = useCallback(async () => {
    if (!isAuthenticated) {
      setMateriais([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('aprendizado_material')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      setMateriais((data || []).map(mapRow))
    } catch (e) {
      console.warn('Erro ao carregar aprendizado_material:', e)
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated])

  useEffect(() => {
    if (authLoading) return
    refreshMateriais()
  }, [authLoading, refreshMateriais])

  const addMaterial = useCallback(
    async (m: Partial<AprendizadoMaterial>): Promise<AprendizadoMaterial | null> => {
      if (!isAuthenticated) return null
      try {
        const { data, error } = await supabase
          .from('aprendizado_material')
          .insert({
            categoria: m.categoria || 'treinamento',
            titulo: m.titulo || 'Sem título',
            curso: m.curso || null,
            faculdade: m.faculdade || null,
            conteudo: m.conteudo || null,
            url: m.url || null,
            resumo: m.resumo || null,
            licoes: m.licoes || null,
            pontos_fortes: m.pontosFortes || null,
            pontos_atencao: m.pontosAtencao || null,
            taticas: m.taticas || null,
            sentimento: m.sentimento || null,
            analisado_em: m.analisadoEm || null,
            updated_by: user?.id || null,
          })
          .select('*')
          .single()
        if (error) throw error
        const mapped = mapRow(data)
        setMateriais((prev) => [mapped, ...prev])
        return mapped
      } catch (e) {
        console.warn('Erro ao salvar material de aprendizado:', e)
        reportSupabaseError('Salvar material de aprendizado', e)
        return null
      }
    },
    [isAuthenticated, user],
  )

  const updateMaterial = useCallback(
    async (id: string, updates: Partial<AprendizadoMaterial>): Promise<void> => {
      if (!isAuthenticated) return
      try {
        const { error } = await supabase
          .from('aprendizado_material')
          .update({
            categoria: updates.categoria,
            titulo: updates.titulo,
            curso: updates.curso ?? undefined,
            faculdade: updates.faculdade ?? undefined,
            conteudo: updates.conteudo ?? undefined,
            url: updates.url ?? undefined,
            resumo: updates.resumo ?? undefined,
            licoes: updates.licoes ?? undefined,
            pontos_fortes: updates.pontosFortes ?? undefined,
            pontos_atencao: updates.pontosAtencao ?? undefined,
            taticas: updates.taticas ?? undefined,
            sentimento: updates.sentimento ?? undefined,
            analisado_em: updates.analisadoEm ?? undefined,
          })
          .eq('id', id)
        if (error) throw error
        setMateriais((prev) => prev.map((m) => (m.id === id ? { ...m, ...updates } : m)))
      } catch (e) {
        console.warn('Erro ao atualizar material de aprendizado:', e)
        reportSupabaseError('Atualizar material de aprendizado', e)
      }
    },
    [isAuthenticated],
  )

  const deleteMaterial = useCallback(
    async (id: string): Promise<void> => {
      if (!isAuthenticated) return
      try {
        const { error } = await supabase.from('aprendizado_material').delete().eq('id', id)
        if (error) throw error
        setMateriais((prev) => prev.filter((m) => m.id !== id))
      } catch (e) {
        console.warn('Erro ao excluir material de aprendizado:', e)
        reportSupabaseError('Excluir material de aprendizado', e)
      }
    },
    [isAuthenticated],
  )

  return { materiais, loading, addMaterial, updateMaterial, deleteMaterial, refreshMateriais }
}
