import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import type { Note } from '@/types/crm'
import { INITIAL_NOTES } from '@/data/seedData'
import type { Database } from '@/lib/supabase/types'

type NotaRow = Database['public']['Tables']['notas']['Row']
type NotaInsert = Database['public']['Tables']['notas']['Insert']

const LOCAL_STORAGE_KEY = 'crm_notes'

function mapRowToNote(
  row: NotaRow & { updated_by_profile?: { email: string | null } | null },
): Note {
  return {
    id: row.id,
    leadId: row.turma_id || '',
    dealId: undefined,
    authorId: row.updated_by || '',
    author: row.updated_by_profile?.email || 'Usuário',
    content: row.conteudo,
    type: 'Outro',
    date: row.created_at || new Date().toISOString(),
    createdAt: row.created_at,
  }
}

function mapNoteToInsert(note: Partial<Note>): NotaInsert {
  const payload: NotaInsert = {
    turma_id: note.leadId || '',
    titulo: note.type || 'Anotação',
    conteudo: note.content || '',
  }

  if (note.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(note.id)) {
    payload.id = note.id
  }

  return payload
}

export function useNotas() {
  const { user, isAuthenticated, loading: authLoading } = useAuth()
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const isMigratingRef = useRef(false)

  const fetchNotas = useCallback(async () => {
    if (!isAuthenticated || !user) {
      try {
        const stored = localStorage.getItem(LOCAL_STORAGE_KEY)
        setNotes(stored ? JSON.parse(stored) : INITIAL_NOTES)
      } catch {
        setNotes(INITIAL_NOTES)
      }
      return
    }

    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('notas')
        .select('*, updated_by_profile:profiles!notas_updated_by_fkey(email)')
        .order('created_at', { ascending: false })

      if (err) throw err

      if (data && data.length > 0) {
        const mapped = data.map(mapRowToNote)
        setNotes(mapped)
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(mapped))
      } else if (!isMigratingRef.current) {
        isMigratingRef.current = true
        let toMigrate: Note[] = []
        try {
          const stored = localStorage.getItem(LOCAL_STORAGE_KEY)
          toMigrate = stored ? JSON.parse(stored) : []
        } catch {
          toMigrate = []
        }

        // Buscar turmas válidas para a FK
        const { data: dbTurmas } = await supabase.from('turmas').select('id')
        const validTurmaIds = new Set((dbTurmas || []).map((t) => t.id))

        const validNotes = toMigrate.filter((n) => n.leadId && validTurmaIds.has(n.leadId))

        if (validNotes.length > 0) {
          const toInsert: NotaInsert[] = validNotes.map((n) => mapNoteToInsert(n))
          const { data: inserted, error: insertErr } = await supabase
            .from('notas')
            .insert(toInsert)
            .select('*')

          if (!insertErr && inserted && inserted.length > 0) {
            const mapped = inserted.map(mapRowToNote)
            setNotes(mapped)
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(mapped))
          }
        }
        isMigratingRef.current = false
      } else {
        setNotes([])
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify([]))
      }
    } catch (e: any) {
      console.warn('Erro ao carregar notas do Supabase, usando cache local:', e)
      setError(e.message || 'Erro ao sincronizar com Supabase')
      try {
        const stored = localStorage.getItem(LOCAL_STORAGE_KEY)
        if (stored) setNotes(JSON.parse(stored))
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
      fetchNotas()
    } else {
      try {
        const stored = localStorage.getItem(LOCAL_STORAGE_KEY)
        setNotes(stored ? JSON.parse(stored) : INITIAL_NOTES)
      } catch {
        setNotes(INITIAL_NOTES)
      }
      setLoading(false)
    }
  }, [isAuthenticated, authLoading, fetchNotas])

  const addNote = async (noteData: Omit<Note, 'id' | 'createdAt'>): Promise<Note> => {
    if (isAuthenticated && user) {
      try {
        const payload = { ...mapNoteToInsert(noteData), updated_by: user.id }
        const { data, error: err } = await supabase
          .from('notas')
          .insert(payload)
          .select('*, updated_by_profile:profiles!notas_updated_by_fkey(email)')
          .single()
        if (err) throw err
        if (data) {
          const created = mapRowToNote(data)
          setNotes((prev) => {
            const updated = [created, ...prev.filter((n) => n.id !== created.id)]
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated))
            return updated
          })
          return created
        }
      } catch (e: any) {
        console.warn('Erro ao salvar nota no Supabase:', e)
        setError(e.message)
      }
    }

    const tempId = `note-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
    const newNote: Note = {
      ...noteData,
      id: tempId,
      createdAt: new Date().toISOString(),
    }

    setNotes((prev) => {
      const updated = [newNote, ...prev]
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated))
      return updated
    })

    return newNote
  }

  const updateNote = async (id: string, updates: Partial<Note>): Promise<void> => {
    if (isAuthenticated && user) {
      try {
        const updatePayload: Database['public']['Tables']['notas']['Update'] = {}
        if (updates.content !== undefined) updatePayload.conteudo = updates.content
        if (updates.type !== undefined) updatePayload.titulo = updates.type
        if (updates.leadId !== undefined) updatePayload.turma_id = updates.leadId
        updatePayload.updated_by = user.id

        const { error: err } = await supabase.from('notas').update(updatePayload).eq('id', id)
        if (err) throw err
      } catch (e: any) {
        console.warn('Erro ao atualizar nota no Supabase:', e)
        setError(e.message)
      }
    }

    setNotes((prev) => {
      const updated = prev.map((n) =>
        n.id === id ? { ...n, ...updates, author: user?.email || n.author } : n,
      )
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated))
      return updated
    })
  }

  const deleteNote = async (id: string): Promise<void> => {
    if (isAuthenticated) {
      try {
        const { error: err } = await supabase.from('notas').delete().eq('id', id)
        if (err) throw err
      } catch (e: any) {
        console.warn('Erro ao excluir nota do Supabase:', e)
        setError(e.message)
      }
    }

    setNotes((prev) => {
      const updated = prev.filter((n) => n.id !== id)
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated))
      return updated
    })
  }

  return {
    notes,
    loading,
    error,
    addNote,
    updateNote,
    deleteNote,
    refreshNotas: fetchNotas,
  }
}
