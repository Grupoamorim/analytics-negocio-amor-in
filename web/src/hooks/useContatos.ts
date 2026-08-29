import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import type { Contact } from '@/types/crm'
import { INITIAL_CONTACTS } from '@/data/seedData'
import type { Database } from '@/lib/supabase/types'
import { reportSupabaseError } from '@/utils/reportError'

type ContatoRow = Database['public']['Tables']['contatos']['Row']
type ContatoInsert = Database['public']['Tables']['contatos']['Insert']
type ContatoUpdate = Database['public']['Tables']['contatos']['Update']

const LOCAL_STORAGE_KEY = 'crm_contacts'

function mapRowToContact(
  row: ContatoRow & { updated_at?: string | null; updated_by_profile?: { email: string | null } | null },
): Contact {
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
    naoRespondeCount: row.nao_responde_count || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at || undefined,
    updatedByEmail: row.updated_by_profile?.email || undefined,
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
        .select('*, updated_by_profile:profiles!contatos_updated_by_fkey(email)')
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
        const payload = { ...mapContactToInsert(contactData), updated_by: user.id }
        const { data, error: err } = await supabase
          .from('contatos')
          .insert(payload)
          .select('*, updated_by_profile:profiles!contatos_updated_by_fkey(email)')
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
        reportSupabaseError('Criar contato', e)
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
        updatePayload.updated_by = user.id

        const { error: err } = await supabase.from('contatos').update(updatePayload).eq('id', id)
        if (err) throw err
      } catch (e: any) {
        console.warn('Erro ao atualizar contato no Supabase:', e)
        setError(e.message)
        reportSupabaseError('Atualizar contato', e)
      }
    }

    setContacts((prev) => {
      const updated = prev.map((c) =>
        c.id === id
          ? {
              ...c,
              ...updates,
              updatedAt: new Date().toISOString(),
              updatedByEmail: user?.email || c.updatedByEmail,
            }
          : c,
      )
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated))
      return updated
    })
  }

  /** Marca +1 "não respondeu" nesse contato. Ao chegar em 3, um trigger no
   * Supabase move a turma sozinha de volta pra Prospecção. */
  const marcarNaoResponde = async (id: string): Promise<void> => {
    const atual = contacts.find((c) => c.id === id)
    const novoCount = (atual?.naoRespondeCount || 0) + 1

    if (isAuthenticated && user) {
      try {
        const { error: err } = await supabase
          .from('contatos')
          .update({ nao_responde_count: novoCount, updated_by: user.id })
          .eq('id', id)
        if (err) throw err
      } catch (e: any) {
        console.warn('Erro ao marcar não responde:', e)
        setError(e.message)
        reportSupabaseError('Marcar não responde', e)
        return
      }
    }

    setContacts((prev) => {
      const updated = prev.map((c) => (c.id === id ? { ...c, naoRespondeCount: novoCount } : c))
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated))
      return updated
    })
  }

  /** Zera o contador (a pessoa respondeu) - a badge de alerta some do card. */
  const marcarRespondeu = async (id: string): Promise<void> => {
    if (isAuthenticated && user) {
      try {
        const { error: err } = await supabase
          .from('contatos')
          .update({ nao_responde_count: 0, updated_by: user.id })
          .eq('id', id)
        if (err) throw err
      } catch (e: any) {
        console.warn('Erro ao marcar respondeu:', e)
        setError(e.message)
        reportSupabaseError('Marcar respondeu', e)
        return
      }
    }

    setContacts((prev) => {
      const updated = prev.map((c) => (c.id === id ? { ...c, naoRespondeCount: 0 } : c))
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
        reportSupabaseError('Excluir contato', e)
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
    marcarNaoResponde,
    marcarRespondeu,
    refreshContatos: fetchContatos,
  }
}
