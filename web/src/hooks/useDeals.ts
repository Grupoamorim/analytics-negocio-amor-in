import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { type Deal, type DealStage, type StageHistoryEntry, daysBetween } from '@/types/crm'
import type { Database } from '@/lib/supabase/types'

type DealRow = Database['public']['Tables']['deals']['Row']
type DealInsert = Database['public']['Tables']['deals']['Insert']
type DealUpdate = Database['public']['Tables']['deals']['Update']

const LOCAL_STORAGE_KEY = 'crm_deals'

const STAGE_NAME_TO_ID: Record<string, string> = {
  prospeccao: 'stage-1',
  'qualificacao-contato': 'stage-2',
  'reuniao-comissao': 'stage-3',
  'reuniao-turma': 'stage-4',
  adesao: 'stage-5',
  'fechou-ou-perdeu': 'stage-6',
  // fallbacks caso já venha como stage-X
  'stage-1': 'stage-1',
  'stage-2': 'stage-2',
  'stage-3': 'stage-3',
  'stage-4': 'stage-4',
  'stage-5': 'stage-5',
  'stage-6': 'stage-6',
}

/**
 * O checklist do deal é sempre um mapa { itemId: completed }. Dados antigos
 * (de antes da correção do bug de "clique não reflete") podem ter ficado
 * salvos como array de objetos {id, text, completed} — normaliza os dois
 * formatos pro mesmo mapa, pra não perder o progresso já marcado.
 */
function normalizeChecklist(raw: unknown): Record<string, boolean> {
  if (!raw) return {}
  if (Array.isArray(raw)) {
    const map: Record<string, boolean> = {}
    for (const item of raw) {
      if (typeof item === 'string') map[item] = true
      else if (item && typeof item === 'object' && 'id' in (item as any)) {
        map[(item as any).id] = !!(item as any).completed
      }
    }
    return map
  }
  if (typeof raw === 'object') return raw as Record<string, boolean>
  return {}
}

function getSafeLocalStorageDeals(): Deal[] {
  try {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY)
    if (!stored) return []
    const parsed = JSON.parse(stored)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function buildStageHistory(
  transitions:
    | Array<{ from_stage?: string | null; to_stage: string; changed_at: string }>
    | undefined,
  currentStageId: string,
  createdAtIso: string,
): StageHistoryEntry[] {
  if (!transitions || transitions.length === 0) {
    return [{ stage: currentStageId, enteredAt: createdAtIso, daysInStage: 0 }]
  }

  // Ordena por changed_at ascendente
  const sorted = [...transitions].sort(
    (a, b) => new Date(a.changed_at).getTime() - new Date(b.changed_at).getTime(),
  )

  const history: StageHistoryEntry[] = []

  // Se a primeira transição não começar no momento da criação ou for de outro estágio inicial,
  // verificamos se o primeiro `from_stage` deve figurar como primeiro item
  const first = sorted[0]
  if (first.from_stage) {
    const firstStageId = STAGE_NAME_TO_ID[first.from_stage] || first.from_stage
    const days = daysBetween(createdAtIso, first.changed_at)
    history.push({
      stage: firstStageId,
      enteredAt: createdAtIso,
      daysInStage: days,
    })
  }

  // Percorre as transições e calcula daysInStage entre transições consecutivas
  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i]
    const next = sorted[i + 1]
    const stageId = STAGE_NAME_TO_ID[current.to_stage] || current.to_stage
    const enteredAt = current.changed_at
    const daysInStage = next ? daysBetween(current.changed_at, next.changed_at) : 0

    history.push({
      stage: stageId,
      enteredAt,
      daysInStage,
    })
  }

  return history.length > 0
    ? history
    : [{ stage: currentStageId, enteredAt: createdAtIso, daysInStage: 0 }]
}

function mapRowToDeal(row: any & { updated_by_profile?: { email: string | null } | null }): Deal {
  const stageRaw = row.stage || 'prospeccao'
  const stageId = STAGE_NAME_TO_ID[stageRaw] || 'stage-1'
  const turma = row.turmas || {}
  const createdAt = row.created_at || new Date().toISOString()
  const updatedAt = row.updated_at || row.created_at || new Date().toISOString()

  // company e contactName: pegar da turma vinculada se existir no join, senão fallback seguro
  const company = turma.faculdade || turma.empresa || ''
  const contactName = turma.contato_nome || ''
  const contactPhone = turma.contato_telefone || ''
  const source = turma.como_conheceu || ''

  // Monta stageHistory com base nas transições do Supabase ou histórico direto
  let stageHistory: StageHistoryEntry[] = []
  if (Array.isArray(row.stage_transitions) && row.stage_transitions.length > 0) {
    stageHistory = buildStageHistory(row.stage_transitions, stageId, createdAt)
  } else if (Array.isArray(row.stage_history) && row.stage_history.length > 0) {
    stageHistory = row.stage_history
  } else {
    stageHistory = [{ stage: stageId, enteredAt: createdAt, daysInStage: 0 }]
  }

  return {
    id: row.id,
    leadId: row.turma_id || undefined,
    title: row.titulo || 'Sem título',
    company,
    contactName,
    contactPhone,
    contactEmail: '',
    source,
    probabilityType: 'standard',
    checklistItems: [],
    tags: [],
    value: Number(row.valor_estimado || row.value) || 0,
    stageId,
    stage: stageRaw as DealStage,
    probability: row.probabilidade ?? row.probability ?? 50,
    ownerId: row.user_id || 'm-1',
    expectedCloseDate: row.data_previsao_fechamento || '',
    contractType: (row.tipo_contrato as any) || 'Formatura Completa',
    assignedTo: row.responsavel || '',
    priority: (row.prioridade as any) || 'Média',
    notes: row.notas || '',
    checklist: normalizeChecklist(row.checklist),
    stageHistory,
    outcome: (row.outcome as any) || null,
    createdAt,
    updatedAt,
    updatedByEmail: row.updated_by_profile?.email || undefined,
  }
}

function mapDealToInsert(deal: Partial<Deal>, userId: string): DealInsert {
  const payload: DealInsert = {
    user_id: userId,
    turma_id: deal.leadId || '',
    titulo: deal.title || '',
    valor_estimado: deal.value || 0,
    stage: deal.stage || deal.stageId || 'prospeccao',
    probabilidade: deal.probability || 50,
    outcome: deal.outcome || null,
    data_previsao_fechamento: deal.expectedCloseDate || null,
    tipo_contrato: deal.contractType || null,
    responsavel: deal.assignedTo || null,
    prioridade: deal.priority || 'Média',
    notas: deal.notes || null,
    checklist: normalizeChecklist(deal.checklist),
  }

  if (deal.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(deal.id)) {
    payload.id = deal.id
  }

  return payload
}

export function useDeals() {
  const { user, isAuthenticated, loading: authLoading } = useAuth()
  const [deals, setDeals] = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const dealsRef = useRef<Deal[]>([])
  dealsRef.current = deals

  const fetchDeals = useCallback(async () => {
    if (!isAuthenticated || !user) {
      const fallbackDeals = getSafeLocalStorageDeals()
      setDeals(fallbackDeals)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('deals')
        .select(
          '*, turmas(id, faculdade, curso, turma, empresa, contato_nome, contato_telefone, como_conheceu), stage_transitions(id, from_stage, to_stage, changed_at), updated_by_profile:profiles!deals_updated_by_fkey(email)',
        )
        .order('created_at', { ascending: false })

      if (err) throw err

      const mapped = (data || []).map(mapRowToDeal)
      setDeals(mapped)
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(mapped))
    } catch (e: any) {
      console.warn('Erro ao carregar deals do Supabase, usando cache localStorage:', e)
      setError(e.message || 'Erro ao sincronizar com Supabase')
      const fallbackDeals = getSafeLocalStorageDeals()
      setDeals(fallbackDeals)
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated, user])

  useEffect(() => {
    if (authLoading) return

    if (isAuthenticated) {
      fetchDeals()
    } else {
      // Quando não autenticado: inicializa com localStorage / seed data seguro
      const fallbackDeals = getSafeLocalStorageDeals()
      setDeals(fallbackDeals)
      setLoading(false)
    }
  }, [isAuthenticated, authLoading, fetchDeals])

  const addDeal = async (dealData: Omit<Deal, 'id'>): Promise<Deal> => {
    if (isAuthenticated && user) {
      try {
        const payload = { ...mapDealToInsert(dealData, user.id), updated_by: user.id }
        const { data, error: err } = await supabase
          .from('deals')
          .insert(payload)
          .select(
            '*, turmas(id, faculdade, curso, turma, empresa, contato_nome, contato_telefone, como_conheceu), updated_by_profile:profiles!deals_updated_by_fkey(email)',
          )
          .single()
        if (err) throw err
        if (data) {
          // Se o deal já tinha histórico de estágios inicial, insere transições
          const initialHistory = dealData.stageHistory || []
          if (initialHistory.length > 0) {
            const transitionsToInsert = initialHistory.map((h, idx) => ({
              deal_id: data.id,
              from_stage: idx > 0 ? initialHistory[idx - 1].stage : null,
              to_stage: h.stage,
              changed_at: h.enteredAt,
            }))
            await supabase.from('stage_transitions').insert(transitionsToInsert)
          }

          const created = mapRowToDeal({
            ...data,
            stage_history: initialHistory.length > 0 ? initialHistory : undefined,
          })
          setDeals((prev) => {
            const updated = [created, ...prev.filter((d) => d.id !== created.id)]
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated))
            return updated
          })
          return created
        }
      } catch (e: any) {
        console.warn('Erro ao salvar deal no Supabase, salvando localmente:', e)
        setError(e.message)
      }
    }

    const tempId = `deal-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
    const newDeal: Deal = {
      ...dealData,
      id: tempId,
      stageHistory:
        dealData.stageHistory && dealData.stageHistory.length > 0
          ? dealData.stageHistory
          : [
              {
                stage: dealData.stageId || 'stage-1',
                enteredAt: new Date().toISOString(),
                daysInStage: 0,
              },
            ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    setDeals((prev) => {
      const updated = [newDeal, ...prev]
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated))
      return updated
    })

    return newDeal
  }

  const updateDeal = async (id: string, updates: Partial<Deal>): Promise<void> => {
    const existingDeal = dealsRef.current.find((d) => d.id === id)
    const oldStage = existingDeal?.stage || existingDeal?.stageId || 'prospeccao'
    const newStage = updates.stage || updates.stageId

    if (isAuthenticated && user) {
      try {
        const updatePayload: DealUpdate = {}
        if (updates.leadId !== undefined) updatePayload.turma_id = updates.leadId
        if (updates.title !== undefined) updatePayload.titulo = updates.title
        if (updates.value !== undefined) updatePayload.valor_estimado = updates.value
        if (updates.stage !== undefined) updatePayload.stage = updates.stage
        else if (updates.stageId !== undefined) updatePayload.stage = updates.stageId
        if (updates.probability !== undefined) updatePayload.probabilidade = updates.probability
        if (updates.outcome !== undefined) updatePayload.outcome = updates.outcome
        if (updates.expectedCloseDate !== undefined)
          updatePayload.data_previsao_fechamento = updates.expectedCloseDate
        if (updates.contractType !== undefined) updatePayload.tipo_contrato = updates.contractType
        if (updates.assignedTo !== undefined) updatePayload.responsavel = updates.assignedTo
        if (updates.priority !== undefined) updatePayload.prioridade = updates.priority
        if (updates.notes !== undefined) updatePayload.notas = updates.notes
        if (updates.checklist !== undefined) updatePayload.checklist = updates.checklist as any
        updatePayload.updated_by = user.id

        const { error: err } = await supabase.from('deals').update(updatePayload).eq('id', id)
        if (err) throw err

        // Se o stage mudou e ainda não foi inserido registro em stage_transitions, insere
        if (newStage && newStage !== oldStage) {
          await supabase.from('stage_transitions').insert({
            deal_id: id,
            from_stage: oldStage,
            to_stage: newStage,
            changed_at: new Date().toISOString(),
          })
        }
      } catch (e: any) {
        console.warn('Erro ao atualizar deal no Supabase:', e)
        setError(e.message)
      }
    }

    setDeals((prev) => {
      const nowIso = new Date().toISOString()
      const updated = prev.map((d) => {
        if (d.id !== id) return d

        let updatedHistory = updates.stageHistory || d.stageHistory || []
        const stageChanged =
          (updates.stage && updates.stage !== d.stage) ||
          (updates.stageId && updates.stageId !== d.stageId)

        if (stageChanged && !updates.stageHistory) {
          const nextStage = updates.stageId || updates.stage || 'stage-1'
          const lastEntry = updatedHistory[updatedHistory.length - 1]
          const daysInPrev = lastEntry ? daysBetween(lastEntry.enteredAt, nowIso) : 0

          const historyCopy = updatedHistory.map((h, i) =>
            i === updatedHistory.length - 1 ? { ...h, daysInStage: daysInPrev } : h,
          )

          updatedHistory = [
            ...historyCopy,
            {
              stage: nextStage,
              enteredAt: nowIso,
              daysInStage: 0,
            },
          ]
        }

        const nextStageId =
          updates.stageId ||
          (updates.stage ? STAGE_NAME_TO_ID[updates.stage] || updates.stage : d.stageId)

        return {
          ...d,
          ...updates,
          stageId: nextStageId,
          stageHistory: updatedHistory,
          updatedAt: nowIso,
          updatedByEmail: user?.email || d.updatedByEmail,
        }
      })
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated))
      return updated
    })
  }

  const deleteDeal = async (id: string): Promise<void> => {
    if (isAuthenticated) {
      try {
        const { error: err } = await supabase.from('deals').delete().eq('id', id)
        if (err) throw err
      } catch (e: any) {
        console.warn('Erro ao excluir deal do Supabase:', e)
        setError(e.message)
      }
    }

    setDeals((prev) => {
      const updated = prev.filter((d) => d.id !== id)
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated))
      return updated
    })
  }

  return {
    deals,
    loading,
    error,
    addDeal,
    updateDeal,
    deleteDeal,
    refreshDeals: fetchDeals,
  }
}
