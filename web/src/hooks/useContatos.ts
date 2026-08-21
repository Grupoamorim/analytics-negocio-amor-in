import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import type { Contact } from '@/types/crm'
import { INITIAL_CONTACTS } from '@/data/seedData'
import type { Database } from '@/lib/supabase/types'

type ContatoRow = Database['public']['Tables']['contatos']['Row']
type ContatoInsert = Database['public']['Tables']['contatos']['Insert']
type ContatoUpdate = Database['public']['Tables']['contatos']['Update']

const LOCAL_STORAGE_KEY = 'crm_contacts'

function mapRowToContact(row: ContatoRow): Contact {
  return {
    id: row.id,
    leadId: row.turma_id || '',
    nome: row.nome,
    telefone: row.telefone || '',
    name: row.nome,
    role: 'Membro da Comissão',
    phone: row.telefone || '',
    email: row.email || '',
    isPrimary: false,
    notes: '',
    createdAt: row.created_at,
  }
}

function mapContactToInsert(contact: Partial<Contact>): ContatoInsert {
  const payload: ContatoInsert = {
    turma_id: contact.leadId || '',
    nome: contact.nome || contact.name || 'Contato',
    telefone: contact.telefone || contact.phone || null,
    email: contact.email || null,
  }

  if (
    contact.id &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(contact.id)
  ) {
    payload.id = contact.id
  }

  return payload
}

export function useContatos() {
  const { user, isAuthenticated, loading: authLoading } = useAuth()
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const isMigratingRef = useRef(false)

  const fetchContatos = useCallback(async () => {
    if (!isAuthenticated || !user) {
      try {
        const stored = localStorage.getItem(LOCAL_STORAGE_KEY)
        setContacts(stored ? JSON.parse(stored) : INITIAL_CONTACTS)
      } catch {
        setContacts(INITIAL_CONTACTS)
      }
      return
    }

    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('contatos')
        .select('*')
        .order('created_at', { ascending: false })

      if (err) throw err

      if (data && data.length > 0) {
        const mapped = data.map(mapRowToContact)
        setContacts(mapped)
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(mapped))
      } else if (!isMigratingRef.current) {
        isMigratingRef.current = true
        let toMigrate: Contact[] = []
        try {
          const stored = localStorage.getItem(LOCAL_STORAGE_KEY)
          toMigrate = stored ? JSON.parse(stored) : []
        } catch {
          toMigrate = []
        }

        // Validar turma_id se houver
        const { data: dbTurmas } = await supabase.from('turmas').select('id')
        const validTurmaIds = new Set((dbTurmas || []).map((t) => t.id))

        const validContacts = toMigrate.filter((c) => c.leadId && validTurmaIds.has(c.leadId))

        if (validContacts.length > 0) {
          const toInsert: ContatoInsert[] = validContacts.map((c) => mapContactToInsert(c))
          const { data: inserted, error: insertErr } = await supabase
            .from('contatos')
            .insert(toInsert)
            .select('*')

          if (!insertErr && inserted && inserted.length > 0) {
            const mapped = inserted.map(mapRowToContact)
            setContacts(mapped)
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(mapped))
          }
        }
        isMigratingRef.current = false
      } else {
        setContacts([])
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify([]))
      }
    } catch (e: any) {
      console.warn('Erro ao carregar contatos do Supabase, usando cache local:', e)
      setError(e.message || 'Erro ao sincronizar com Supabase')
      try {
        const stored = localStorage.getItem(LOCAL_STORAGE_KEY)
        if (stored) setContacts(JSON.parse(stored))
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
      fetchContatos()
    } else {
      try {
        const stored = localStorage.getItem(LOCAL_STORAGE_KEY)
        setContacts(stored ? JSON.parse(stored) : INITIAL_CONTACTS)
      } catch {
        setContacts(INITIAL_CONTACTS)
      }
      setLoading(false)
    }
  }, [isAuthenticated, authLoading, fetchContatos])

  const addContact = async (contactData: Omit<Contact, 'id' | 'createdAt'>): Promise<Contact> => {
    if (isAuthenticated && user) {
      try {
        const payload = mapContactToInsert(contactData)
        const { data, error: err } = await supabase
          .from('contatos')
          .insert(payload)
          .select()
          .single()
        if (err) throw err
        if (data) {
          const created = mapRowToContact(data)
          setContacts((prev) => {
            const updated = [created, ...prev.filter((c) => c.id !== created.id)]
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated))
            return updated
          })
          return created
        }
      } catch (e: any) {
        console.warn('Erro ao salvar contato no Supabase:', e)
        setError(e.message)
      }
    }

    const tempId = `contact-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
    const newContact: Contact = {
      ...contactData,
      id: tempId,
      nome: contactData.nome || contactData.name || 'Contato',
      telefone: contactData.telefone || contactData.phone || '',
      createdAt: new Date().toISOString(),
    }

    setContacts((prev) => {
      const updated = [newContact, ...prev]
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated))
      return updated
    })

    return newContact
  }

  const updateContact = async (id: string, updates: Partial<Contact>): Promise<void> => {
    if (isAuthenticated && user) {
      try {
        const updatePayload: ContatoUpdate = {}
        if (updates.leadId !== undefined) updatePayload.turma_id = updates.leadId
        if (updates.nome !== undefined) updatePayload.nome = updates.nome
        else if (updates.name !== undefined) updatePayload.nome = updates.name
        if (updates.telefone !== undefined) updatePayload.telefone = updates.telefone
        else if (updates.phone !== undefined) updatePayload.telefone = updates.phone
        if (updates.email !== undefined) updatePayload.email = updates.email

        const { error: err } = await supabase.from('contatos').update(updatePayload).eq('id', id)
        if (err) throw err
      } catch (e: any) {
        console.warn('Erro ao atualizar contato no Supabase:', e)
        setError(e.message)
      }
    }

    setContacts((prev) => {
      const updated = prev.map((c) => (c.id === id ? { ...c, ...updates } : c))
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated))
      return updated
    })
  }

  const deleteContact = async (id: string): Promise<void> => {
    if (isAuthenticated) {
      try {
        const { error: err } = await supabase.from('contatos').delete().eq('id', id)
        if (err) throw err
      } catch (e: any) {
        console.warn('Erro ao excluir contato do Supabase:', e)
        setError(e.message)
      }
    }

    setContacts((prev) => {
      const updated = prev.filter((c) => c.id !== id)
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated))
      return updated
    })
  }

  return {
    contacts,
    loading,
    error,
    addContact,
    updateContact,
    deleteContact,
    refreshContatos: fetchContatos,
  }
}
