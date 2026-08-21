import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import type { CallTranscript } from '@/types/crm'
import { INITIAL_TRANSCRIPTS } from '@/data/seedData'
import type { Database } from '@/lib/supabase/types'

type TranscricaoRow = Database['public']['Tables']['transcricoes']['Row']
type TranscricaoInsert = Database['public']['Tables']['transcricoes']['Insert']

const LOCAL_STORAGE_KEY = 'crm_transcripts'

function mapRowToTranscript(row: TranscricaoRow): CallTranscript {
  return {
    id: row.id,
    title: row.titulo || 'Transcrição de Chamada',
    fileName: row.titulo || 'audio.mp3',
    leadId: row.turma_id || undefined,
    company: '',
    contactName: '',
    meetingType: (row.tipo as any) || 'Reunião Comissão',
    fathomUrl: row.url || undefined,
    sourceType: 'manual_upload',
    date: row.created_at ? row.created_at.split('T')[0] : '',
    durationMinutes: 15,
    wordCount: row.conteudo ? row.conteudo.split(/\s+/).length : 0,
    content: row.conteudo || '',
    analyzed: !!row.resumo,
    probabilityScore: row.probabilidade || 0,
    signals: [],
    needCoverageScore: 70,
    timingScore: 70,
    decisionPowerScore: 70,
    perceivedValueScore: 70,
    insights: [],
  }
}

function mapTranscriptToInsert(transcript: Partial<CallTranscript>): TranscricaoInsert {
  const payload: TranscricaoInsert = {
    turma_id: transcript.leadId || '',
    titulo: transcript.title || 'Transcrição',
    conteudo: transcript.content || null,
    url: transcript.fathomUrl || null,
    tipo: transcript.meetingType || 'online',
    probabilidade: transcript.probabilityScore || 0,
    sentimento: transcript.geminiAnalysis?.sentimento || null,
    resumo: transcript.geminiAnalysis?.resumo || null,
    proximo_passo: transcript.geminiAnalysis?.recomendacao || null,
  }

  if (
    transcript.id &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(transcript.id)
  ) {
    payload.id = transcript.id
  }

  return payload
}

export function useTranscricoes() {
  const { user, isAuthenticated, loading: authLoading } = useAuth()
  const [transcripts, setTranscripts] = useState<CallTranscript[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const isMigratingRef = useRef(false)

  const fetchTranscripts = useCallback(async () => {
    if (!isAuthenticated || !user) {
      try {
        const stored = localStorage.getItem(LOCAL_STORAGE_KEY)
        setTranscripts(stored ? JSON.parse(stored) : INITIAL_TRANSCRIPTS)
      } catch {
        setTranscripts(INITIAL_TRANSCRIPTS)
      }
      return
    }

    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('transcricoes')
        .select('*')
        .order('created_at', { ascending: false })

      if (err) throw err

      if (data && data.length > 0) {
        const mapped = data.map(mapRowToTranscript)
        setTranscripts(mapped)
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(mapped))
      } else if (!isMigratingRef.current) {
        isMigratingRef.current = true
        let toMigrate: CallTranscript[] = []
        try {
          const stored = localStorage.getItem(LOCAL_STORAGE_KEY)
          toMigrate = stored ? JSON.parse(stored) : []
        } catch {
          toMigrate = []
        }

        // Buscar turmas válidas para as FKs
        const { data: dbTurmas } = await supabase.from('turmas').select('id')
        const validTurmaIds = new Set((dbTurmas || []).map((t) => t.id))

        const validTranscripts = toMigrate.filter((t) => t.leadId && validTurmaIds.has(t.leadId))

        if (validTranscripts.length > 0) {
          const toInsert: TranscricaoInsert[] = validTranscripts.map((t) =>
            mapTranscriptToInsert(t),
          )
          const { data: inserted, error: insertErr } = await supabase
            .from('transcricoes')
            .insert(toInsert)
            .select('*')

          if (!insertErr && inserted && inserted.length > 0) {
            const mapped = inserted.map(mapRowToTranscript)
            setTranscripts(mapped)
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(mapped))
          }
        }
        isMigratingRef.current = false
      } else {
        setTranscripts([])
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify([]))
      }
    } catch (e: any) {
      console.warn('Erro ao carregar transcrições do Supabase, usando cache local:', e)
      setError(e.message || 'Erro ao sincronizar com Supabase')
      try {
        const stored = localStorage.getItem(LOCAL_STORAGE_KEY)
        if (stored) setTranscripts(JSON.parse(stored))
      } catch {
        // ignora
      }
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated, user])

  useEffect(() => {
    if (authLoading) return

    if (isAuthenticated) {
      fetchTranscripts()
    } else {
      try {
        const stored = localStorage.getItem(LOCAL_STORAGE_KEY)
        setTranscripts(stored ? JSON.parse(stored) : INITIAL_TRANSCRIPTS)
      } catch {
        setTranscripts(INITIAL_TRANSCRIPTS)
      }
      setLoading(false)
    }
  }, [isAuthenticated, authLoading, fetchTranscripts])

  const addTranscript = async (
    transcriptData: Omit<CallTranscript, 'id'>,
  ): Promise<CallTranscript> => {
    if (isAuthenticated && user) {
      try {
        const payload = mapTranscriptToInsert(transcriptData)
        const { data, error: err } = await supabase
          .from('transcricoes')
          .insert(payload)
          .select()
          .single()
        if (err) throw err
        if (data) {
          const created = mapRowToTranscript(data)
          setTranscripts((prev) => {
            const updated = [created, ...prev.filter((t) => t.id !== created.id)]
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated))
            return updated
          })
          return created
        }
      } catch (e: any) {
        console.warn('Erro ao salvar transcrição no Supabase:', e)
        setError(e.message)
      }
    }

    const tempId = `transcript-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
    const newTranscript: CallTranscript = {
      ...transcriptData,
      id: tempId,
    }

    setTranscripts((prev) => {
      const updated = [newTranscript, ...prev]
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated))
      return updated
    })

    return newTranscript
  }

  const updateTranscript = async (id: string, updates: Partial<CallTranscript>): Promise<void> => {
    if (isAuthenticated && user) {
      try {
        const updatePayload: Database['public']['Tables']['transcricoes']['Update'] = {}
        if (updates.title !== undefined) updatePayload.titulo = updates.title
        if (updates.content !== undefined) updatePayload.conteudo = updates.content
        if (updates.fathomUrl !== undefined) updatePayload.url = updates.fathomUrl
        if (updates.meetingType !== undefined) updatePayload.tipo = updates.meetingType
        if (updates.probabilityScore !== undefined)
          updatePayload.probabilidade = updates.probabilityScore

        const { error: err } = await supabase
          .from('transcricoes')
          .update(updatePayload)
          .eq('id', id)
        if (err) throw err
      } catch (e: any) {
        console.warn('Erro ao atualizar transcrição no Supabase:', e)
        setError(e.message)
      }
    }

    setTranscripts((prev) => {
      const updated = prev.map((t) => (t.id === id ? { ...t, ...updates } : t))
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated))
      return updated
    })
  }

  const deleteTranscript = async (id: string): Promise<void> => {
    if (isAuthenticated) {
      try {
        const { error: err } = await supabase.from('transcricoes').delete().eq('id', id)
        if (err) throw err
      } catch (e: any) {
        console.warn('Erro ao excluir transcrição do Supabase:', e)
        setError(e.message)
      }
    }

    setTranscripts((prev) => {
      const updated = prev.filter((t) => t.id !== id)
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated))
      return updated
    })
  }

  return {
    transcripts,
    loading,
    error,
    addTranscript,
    updateTranscript,
    deleteTranscript,
    refreshTranscricoes: fetchTranscripts,
  }
}
