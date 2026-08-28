import React, { createContext, useContext, useEffect, useCallback, useMemo } from 'react'
import type {
  Lead,
  Deal,
  Contact,
  Note,
  CallTranscript,
  Activity,
  AppSettings,
  TeamMember,
  Task,
  PipelineStage,
  FunilEvento,
  AprendizadoEstudo,
} from '@/types/crm'
import { FUNNEL_STAGE_BY_ID, daysInCurrentStage, DEFAULT_CHECKLIST_ITEMS } from '@/types/crm'
import { INITIAL_ACTIVITIES, INITIAL_SETTINGS, INITIAL_STAGES, INITIAL_TASKS } from '@/data/seedData'
import { useTurmas } from '@/hooks/useTurmas'
import { useDeals } from '@/hooks/useDeals'
import { useContatos } from '@/hooks/useContatos'
import { useTranscricoes } from '@/hooks/useTranscricoes'
import { useNotas } from '@/hooks/useNotas'
import { useConfiguracoes } from '@/hooks/useConfiguracoes'
import { useMembers } from '@/hooks/useMembers'
import { useFunilEventos } from '@/hooks/useFunilEventos'
import { useAprendizadoEstudo } from '@/hooks/useAprendizadoEstudo'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase/client'
import {
  computeDealProbability,
  transcriptProbabilidade,
  type CursoFacRate,
} from '@/utils/funnelProbability'

interface CRMContextType {
  leads: Lead[]
  deals: Deal[]
  contacts: Contact[]
  notes: Note[]
  transcripts: CallTranscript[]
  activities: Activity[]
  settings: AppSettings
  members: TeamMember[]
  tasks: Task[]
  stages: PipelineStage[]
  funilEventos: FunilEvento[]
  estudos: AprendizadoEstudo[]
  loading: boolean
  error: string | null

  // Leads (Turmas)
  addLead: (lead: Omit<Lead, 'id'>) => Promise<Lead>
  updateLead: (id: string, updates: Partial<Lead>) => Promise<void>
  deleteLead: (id: string) => Promise<void>

  // Deals
  addDeal: (deal: Omit<Deal, 'id'>) => Promise<Deal>
  updateDeal: (id: string, updates: Partial<Deal>) => Promise<void>
  deleteDeal: (id: string) => Promise<void>
  moveDealStage: (dealId: string, targetStageId: string) => Promise<void>
  toggleChecklistItem: (dealId: string, checklistKey: string, checked: boolean) => Promise<void>

  // Contatos
  addContact: (contact: Omit<Contact, 'id' | 'createdAt'>) => Promise<Contact>
  updateContact: (id: string, updates: Partial<Contact>) => Promise<void>
  deleteContact: (id: string) => Promise<void>
  marcarNaoResponde: (id: string) => Promise<void>
  marcarRespondeu: (id: string) => Promise<void>

  // Notas
  addNote: (note: Omit<Note, 'id' | 'createdAt'>) => Promise<Note>
  updateNote: (id: string, updates: Partial<Note>) => Promise<void>
  deleteNote: (id: string) => Promise<void>

  // Transcripts
  addTranscript: (transcript: Omit<CallTranscript, 'id'>) => Promise<CallTranscript>
  updateTranscript: (id: string, updates: Partial<CallTranscript>) => Promise<void>
  deleteTranscript: (id: string) => Promise<void>
  reanalyzeTranscript: (id: string) => Promise<void>

  // Tasks
  addTask: (title: string, priority?: 'Alta' | 'Média' | 'Baixa', dueDate?: string) => Promise<Task>
  toggleTask: (id: string) => Promise<void>
  deleteTask: (id: string) => Promise<void>

  // Importação CSV em Lote
  importBatchEntities: (
    newLeads: Array<Omit<Lead, 'id'>>,
    newDeals: Array<Omit<Deal, 'id'>>,
    summaryText?: string,
  ) => { importedLeadsCount: number; importedDealsCount: number; storageWarning?: string }

  // Outros
  updateSettings: (updates: Partial<AppSettings>) => void
  addActivity: (activity: Omit<Activity, 'id' | 'timestamp'>) => void
  syncWithSGE: () => Promise<{ success: boolean; message: string; data?: any }>
  refreshAll: () => Promise<void>

  // Motor de probabilidade / aprendizado
  dealProbById: Map<string, { score: number; breakdown: import('@/types/crm').ProbBreakdown }>
  recomputeAllProbabilities: () => Promise<void>
  closeRateFor: (curso?: string, faculdade?: string) => CursoFacRate | null
  upsertEstudo: (estudo: AprendizadoEstudo) => Promise<void>
  refreshFunilEventos: () => Promise<void>
  refreshEstudos: () => Promise<void>
}

const CRMContext = createContext<CRMContextType | undefined>(undefined)

export const CRMProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isAuthenticated } = useAuth()

  // Hooks especializados (Supabase Primário + LocalStorage secundário)
  const {
    turmas: leads,
    loading: turmasLoading,
    error: turmasError,
    addTurma,
    updateTurma,
    deleteTurma,
    refreshTurmas,
  } = useTurmas()

  const {
    deals,
    loading: dealsLoading,
    error: dealsError,
    addDeal,
    updateDeal: updateDealRaw,
    deleteDeal,
    refreshDeals,
  } = useDeals()

  const {
    contacts,
    loading: contatosLoading,
    error: contatosError,
    addContact,
    updateContact,
    deleteContact,
    marcarNaoResponde,
    marcarRespondeu,
    refreshContatos,
  } = useContatos()

  const {
    notes,
    loading: notasLoading,
    error: notasError,
    addNote,
    updateNote,
    deleteNote,
    refreshNotas,
  } = useNotas()
  const {
    transcripts,
    loading: transcricoesLoading,
    error: transcricoesError,
    addTranscript: addTranscriptRaw,
    updateTranscript: updateTranscriptRaw,
    deleteTranscript,
    refreshTranscricoes,
  } = useTranscricoes()

  const { config, loading: configLoading, saveConfig, refreshConfiguracoes } = useConfiguracoes()

  const { funilEventos, addFunilEvento, refreshFunilEventos } = useFunilEventos()
  const { estudos, upsertEstudo, refreshEstudos } = useAprendizadoEstudo()

  // Members — equipe real (profiles), não mais nomes fictícios
  const { members } = useMembers()

  // Stages
  const [stages] = React.useState<PipelineStage[]>(INITIAL_STAGES)

  // Tasks (LocalStorage com fallback limpo)
  const [tasks, setTasks] = React.useState<Task[]>(() => {
    try {
      const stored = localStorage.getItem('crm_tasks')
      return stored ? JSON.parse(stored) : INITIAL_TASKS
    } catch {
      return INITIAL_TASKS
    }
  })

  // Activities (LocalStorage / Supabase preferências)
  const [activities, setActivities] = React.useState<Activity[]>(() => {
    try {
      const stored = localStorage.getItem('crm_activities')
      return stored ? JSON.parse(stored) : INITIAL_ACTIVITIES
    } catch {
      return INITIAL_ACTIVITIES
    }
  })

  // Settings
  const [settings, setSettings] = React.useState<AppSettings>(() => {
    try {
      const stored = localStorage.getItem('crm_app_settings')
      return stored ? JSON.parse(stored) : INITIAL_SETTINGS
    } catch {
      return INITIAL_SETTINGS
    }
  })

  // Sincronizar preferências vindas do Supabase quando carregadas
  useEffect(() => {
    if (config?.preferencias?.appSettings) {
      setSettings((prev) => ({
        ...prev,
        ...config.preferencias.appSettings,
      }))
    }
  }, [config])

  const addActivity = useCallback((activity: Omit<Activity, 'id' | 'timestamp'>) => {
    const newActivity: Activity = {
      ...activity,
      id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
    }
    setActivities((prev) => {
      const updated = [newActivity, ...prev].slice(0, 100)
      try {
        localStorage.setItem('crm_activities', JSON.stringify(updated))
      } catch {
        // ignora
      }
      return updated
    })
  }, [])

  const updateSettings = useCallback(
    (updates: Partial<AppSettings>) => {
      setSettings((prev) => {
        const next = { ...prev, ...updates }
        try {
          localStorage.setItem('crm_app_settings', JSON.stringify(next))
        } catch {
          // ignora
        }
        if (isAuthenticated) {
          saveConfig({
            preferencias: {
              ...(config.preferencias || {}),
              appSettings: next,
            },
          })
        }
        return next
      })
    },
    [isAuthenticated, config, saveConfig],
  )

  // Tasks actions
  const addTask = async (
    title: string,
    priority: 'Alta' | 'Média' | 'Baixa' = 'Média',
    dueDate?: string,
  ): Promise<Task> => {
    const newTask: Task = {
      id: `task-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      title,
      completed: false,
      priority,
      dueDate: dueDate || new Date(Date.now() + 86400000).toISOString().split('T')[0],
      createdAt: new Date().toISOString(),
    }

    setTasks((prev) => {
      const updated = [newTask, ...prev]
      try {
        localStorage.setItem('crm_tasks', JSON.stringify(updated))
      } catch {
        // ignora
      }
      return updated
    })

    addActivity({
      type: 'tarefa',
      title: `Nova tarefa criada: ${title}`,
      description: `Prioridade ${priority}`,
      actorName: 'Usuário',
    })

    return newTask
  }

  const toggleTask = async (id: string): Promise<void> => {
    setTasks((prev) => {
      const updated = prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t))
      try {
        localStorage.setItem('crm_tasks', JSON.stringify(updated))
      } catch {
        // ignora
      }
      return updated
    })
  }

  const deleteTask = async (id: string): Promise<void> => {
    setTasks((prev) => {
      const updated = prev.filter((t) => t.id !== id)
      try {
        localStorage.setItem('crm_tasks', JSON.stringify(updated))
      } catch {
        // ignora
      }
      return updated
    })
  }

  // ---------------------------------------------------------------------------
  // Motor de probabilidade única + registro de aprendizado do funil
  // ---------------------------------------------------------------------------
  const leadById = useMemo(() => new Map(leads.map((l) => [l.id, l])), [leads])

  const normTxt = (s?: string) =>
    (s || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')

  /**
   * Taxa histórica de fechamento do recorte mais específico com amostra:
   * curso+faculdade (se N>=3) > curso > faculdade. Base pro tempero do motor.
   */
  const closeRateFor = useCallback(
    (curso?: string, faculdade?: string): CursoFacRate | null => {
      const tally = (pred: (l?: Lead) => boolean): CursoFacRate | null => {
        let g = 0
        let p = 0
        for (const d of deals) {
          if (d.outcome !== 'ganho' && d.outcome !== 'perdido') continue
          if (!pred(d.leadId ? leadById.get(d.leadId) : undefined)) continue
          if (d.outcome === 'ganho') g++
          else p++
        }
        return g + p > 0 ? { rate: g / (g + p), n: g + p } : null
      }
      if (curso && faculdade) {
        const r = tally(
          (l) => !!l && normTxt(l.curso) === normTxt(curso) && normTxt(l.faculdade) === normTxt(faculdade),
        )
        if (r && r.n >= 3) return r
      }
      if (curso) {
        const r = tally((l) => !!l && normTxt(l.curso) === normTxt(curso))
        if (r) return r
      }
      if (faculdade) {
        const r = tally((l) => !!l && normTxt(l.faculdade) === normTxt(faculdade))
        if (r) return r
      }
      return null
    },
    [deals, leadById],
  )

  const latestTranscriptForDeal = useCallback(
    (deal: Deal): CallTranscript | undefined => {
      if (!deal.leadId) return undefined
      return transcripts
        .filter((t) => t.leadId === deal.leadId)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]
    },
    [transcripts],
  )

  /**
   * Probabilidade ÚNICA de fechamento de cada turma, calculada AO VIVO (reunião +
   * portão de fase + velocidade + curso/faculdade). É a fonte de verdade da UI —
   * a coluna `deals.probabilidade` no banco é só cache/histórico pro job semanal.
   */
  const dealProbById = useMemo(() => {
    const m = new Map<string, ReturnType<typeof computeDealProbability>>()
    for (const d of deals) {
      const lead = d.leadId ? leadById.get(d.leadId) : undefined
      m.set(
        d.id,
        computeDealProbability({
          deal: d,
          latestTranscript: latestTranscriptForDeal(d) as any,
          cursoFacRate: closeRateFor(lead?.curso, lead?.faculdade),
        }),
      )
    }
    return m
  }, [deals, leadById, latestTranscriptForDeal, closeRateFor])

  /** Recalcula e persiste a probabilidade única de uma turma. */
  const recomputeDealProbability = useCallback(
    async (
      deal: Deal,
      opts?: { overrideTranscript?: CallTranscript },
    ): Promise<{ score: number } | null> => {
      const lead = deal.leadId ? leadById.get(deal.leadId) : undefined
      const override =
        opts?.overrideTranscript && opts.overrideTranscript.leadId === deal.leadId
          ? opts.overrideTranscript
          : undefined
      const { score, breakdown } = computeDealProbability({
        deal,
        latestTranscript: (override || latestTranscriptForDeal(deal)) as any,
        cursoFacRate: closeRateFor(lead?.curso, lead?.faculdade),
      })
      if (deal.probability === score && deal.probBreakdown?.final === breakdown.final) {
        return { score }
      }
      await updateDealRaw(deal.id, { probability: score, probBreakdown: breakdown })
      return { score }
    },
    [leadById, latestTranscriptForDeal, closeRateFor, updateDealRaw],
  )

  const recomputeAllProbabilities = useCallback(async (): Promise<void> => {
    for (const deal of deals) {
      await recomputeDealProbability(deal)
    }
    addActivity({
      type: 'ia',
      title: 'Probabilidades recalculadas',
      description: `${deals.length} turmas reprocessadas pelo motor.`,
      actorName: 'Motor de Probabilidade',
    })
  }, [deals, recomputeDealProbability])

  // Pipeline stage movement and checklist
  const moveDealStage = async (dealId: string, targetStageId: string): Promise<void> => {
    const targetDeal = deals.find((d) => d.id === dealId)
    const fromStage = targetDeal?.stageId || targetDeal?.stage || 'stage-1'
    const lead = targetDeal?.leadId ? leadById.get(targetDeal.leadId) : undefined

    await updateDealRaw(dealId, { stage: targetStageId as any, stageId: targetStageId })

    // Registro de aprendizado: transição de fase
    if (targetDeal) {
      const tProb = transcriptProbabilidade(latestTranscriptForDeal(targetDeal) as any)
      const fromMeta = FUNNEL_STAGE_BY_ID[fromStage]
      const alerta = fromMeta?.stagnationAlertDays || 7
      const diasNoEstagio = daysInCurrentStage(targetDeal)
      const targetIdx = Object.keys(FUNNEL_STAGE_BY_ID).indexOf(targetStageId)
      const fromIdx = Object.keys(FUNNEL_STAGE_BY_ID).indexOf(fromStage)
      await addFunilEvento({
        deal_id: dealId,
        turma_id: targetDeal.leadId || null,
        curso: lead?.curso || null,
        faculdade: lead?.faculdade || null,
        empresa: lead?.empresa || targetDeal.company || null,
        cidade: lead?.cidade || null,
        tipo: 'transicao',
        from_stage: fromStage,
        to_stage: targetStageId,
        dias_no_estagio_origem: alerta < 999 ? diasNoEstagio : null,
        transcript_prob_no_momento: tProb ?? null,
        prob_motor_no_momento: targetDeal.probability ?? null,
        avancou_apesar_prob_baixa: targetIdx > fromIdx && tProb !== undefined && tProb < 50,
      })
    }

    // Recalcula a probabilidade única com a nova posição
    const moved = { ...(targetDeal as Deal), stageId: targetStageId, stage: targetStageId as any }
    if (targetDeal) await recomputeDealProbability(moved)

    addActivity({
      type: 'estagio',
      title: `Turma movida para ${FUNNEL_STAGE_BY_ID[targetStageId]?.name || targetStageId}`,
      description: targetDeal?.title || 'Negócio',
      actorName: 'Usuário',
    })
  }

  /**
   * Wrapper de `updateDeal`: além de gravar, registra desfecho no aprendizado
   * quando `outcome` é definido e recalcula a probabilidade da turma.
   */
  const updateDeal = useCallback(
    async (id: string, updates: Partial<Deal>): Promise<void> => {
      const before = deals.find((d) => d.id === id)
      await updateDealRaw(id, updates)

      const outcomeChanged =
        updates.outcome !== undefined && updates.outcome !== (before?.outcome || null)
      if (outcomeChanged && before && (updates.outcome === 'ganho' || updates.outcome === 'perdido')) {
        const lead = before.leadId ? leadById.get(before.leadId) : undefined
        const tProb = transcriptProbabilidade(latestTranscriptForDeal(before) as any)
        const probAntes = before.probability ?? before.probBreakdown?.final
        let observacao: string | null = null
        if (updates.outcome === 'ganho' && typeof probAntes === 'number' && probAntes < 50) {
          observacao = `Fechou com probabilidade ${probAntes}% — motor/reunião subestimou.`
        } else if (updates.outcome === 'perdido' && typeof probAntes === 'number' && probAntes >= 60) {
          observacao = `Perdeu com probabilidade ${probAntes}% — motor/reunião superestimou.`
        }
        await addFunilEvento({
          deal_id: id,
          turma_id: before.leadId || null,
          curso: lead?.curso || null,
          faculdade: lead?.faculdade || null,
          empresa: lead?.empresa || before.company || null,
          cidade: lead?.cidade || null,
          tipo: 'desfecho',
          from_stage: before.stageId || null,
          outcome: updates.outcome,
          motivo_perda: updates.lostReason || before.lostReason || null,
          transcript_prob_no_momento: tProb ?? null,
          prob_motor_no_momento: typeof probAntes === 'number' ? probAntes : null,
          observacao,
        })
      }

      const merged = { ...(before as Deal), ...updates }
      if (before) await recomputeDealProbability(merged)
    },
    [deals, updateDealRaw, leadById, latestTranscriptForDeal, addFunilEvento, recomputeDealProbability],
  )

  const toggleChecklistItem = async (
    dealId: string,
    checklistKey: string,
    checked: boolean,
  ): Promise<void> => {
    const targetDeal = deals.find((d) => d.id === dealId)
    if (!targetDeal) return

    // O checklist é sempre um mapa { itemId: completed }. A leitura em
    // Pipeline.tsx (deal.checklist?.[it.id]) já assumia esse formato, mas
    // aqui era escrito como array — os cliques nunca refletiam na tela
    // porque a leitura por chave numa array sempre retornava undefined.
    const current: Record<string, boolean> =
      targetDeal.checklist && !Array.isArray(targetDeal.checklist)
        ? (targetDeal.checklist as Record<string, boolean>)
        : {}

    await updateDeal(dealId, { checklist: { ...current, [checklistKey]: checked } })

    // Auditoria: registra cada clique de checklist (quem + quando) pro banco.
    if (isAuthenticated && user) {
      const itemMeta = DEFAULT_CHECKLIST_ITEMS.find((it) => it.id === checklistKey)
      supabase
        .from('checklist_eventos')
        .insert({
          deal_id: dealId,
          turma_id: targetDeal.leadId || null,
          item_id: checklistKey,
          item_label: itemMeta?.label || null,
          stage: itemMeta?.stageId || targetDeal.stageId || null,
          checked,
          changed_by: user.id,
        })
        .then(({ error }) => {
          if (error) console.warn('Erro ao registrar evento de checklist:', error)
        })
    }
  }

  // Importação CSV em Lote
  const importBatchEntities = (
    newLeads: Array<Omit<Lead, 'id'>>,
    newDeals: Array<Omit<Deal, 'id'>>,
    summaryText?: string,
  ) => {
    let importedLeadsCount = 0
    let importedDealsCount = 0

    // Salvar em lote assincronamente
    ;(async () => {
      try {
        if (isAuthenticated && user) {
          // Supabase Primário
          if (newLeads.length > 0) {
            const turmasPayload = newLeads.map((l) => ({
              user_id: user.id,
              empresa: l.empresa || 'AFF',
              curso: l.curso || '',
              faculdade: l.faculdade || '',
              turma: l.turma || 'Turma 0',
              ano_formatura: l.anoFormatura || '',
              cidade: l.cidade || '',
              funil_status: l.status || 'Novo',
              contato_nome: l.contatoNome || null,
              contato_telefone: l.contatoTelefone || null,
              sdr: l.sdr || null,
              closer: l.closer || null,
              observacoes: l.observacoes || l.notes || null,
              concorrentes: l.concorrentes || null,
              tipo_servico: l.tipoServico || null,
              como_conheceu: l.comoConheceu || l.source || null,
              proposta_link: l.linkProposta || null,
              total_alunos: l.totalAlunos || 0,
              alunos_fechados: l.alunosFechados || 0,
              data_cadastro: l.dataCadastro || null,
              primeiro_contato: l.primeiroContatoEm || null,
              fechamento_contrato: l.dataFechamento || null,
            }))

            const { data: insertedTurmas, error: tErr } = await supabase
              .from('turmas')
              .insert(turmasPayload)
              .select('*')

            if (tErr) throw tErr
            if (insertedTurmas) {
              refreshTurmas()
            }
          }

          if (newDeals.length > 0) {
            // Tenta obter os IDs reais das turmas recém criadas se possível
            const dealsPayload = newDeals.map((d) => ({
              user_id: user.id,
              turma_id: d.leadId || '',
              titulo: d.title || '',
              valor_estimado: d.value || 0,
              stage: d.stage || 'prospeccao',
              probabilidade: d.probability || 50,
              outcome: d.outcome || null,
              data_previsao_fechamento: d.expectedCloseDate || null,
              tipo_contrato: d.contractType || null,
              responsavel: d.assignedTo || null,
              prioridade: d.priority || 'Média',
              notas: d.notes || null,
              checklist: (d.checklist as any) || {},
            }))

            const { data: insertedDeals, error: dErr } = await supabase
              .from('deals')
              .insert(dealsPayload)
              .select('id, turma_id')

            if (!dErr && insertedDeals) {
              const transitionsToInsert: Array<{
                deal_id: string
                from_stage: string | null
                to_stage: string
                changed_at: string
              }> = []

              insertedDeals.forEach((idDeal) => {
                const originalDeal = newDeals.find((d) => d.leadId === idDeal.turma_id)
                const hist = originalDeal?.stageHistory || []
                if (hist.length > 1) {
                  for (let i = 1; i < hist.length; i++) {
                    transitionsToInsert.push({
                      deal_id: idDeal.id,
                      from_stage: hist[i - 1].stage,
                      to_stage: hist[i].stage,
                      changed_at: hist[i].enteredAt,
                    })
                  }
                } else if (hist.length === 1) {
                  transitionsToInsert.push({
                    deal_id: idDeal.id,
                    from_stage: null,
                    to_stage: hist[0].stage,
                    changed_at: hist[0].enteredAt,
                  })
                }
              })

              if (transitionsToInsert.length > 0) {
                await supabase.from('stage_transitions').insert(transitionsToInsert)
              }
              refreshDeals()
            }
          }
        } else {
          // Offline / LocalStorage
          for (const l of newLeads) {
            await addTurma(l)
          }
          for (const d of newDeals) {
            await addDeal(d)
          }
        }
      } catch (err) {
        console.error('Erro na importação em lote:', err)
      }
    })()

    importedLeadsCount = newLeads.length
    importedDealsCount = newDeals.length

    addActivity({
      type: 'sistema',
      title: `Importação CSV concluída`,
      description:
        summaryText || `${importedLeadsCount} turmas e ${importedDealsCount} negócios importados`,
      actorName: 'Importador CSV',
    })

    return {
      importedLeadsCount,
      importedDealsCount,
    }
  }

  // Reanalisar transcrição
  const reanalyzeTranscript = async (id: string): Promise<void> => {
    addActivity({
      type: 'ia',
      title: 'Transcrição reanalisada por IA',
      description: `ID: ${id}`,
      actorName: 'Gemini AI',
    })
    const tr = transcripts.find((t) => t.id === id)
    const deal = tr?.leadId ? deals.find((d) => d.leadId === tr.leadId) : undefined
    if (deal) await recomputeDealProbability(deal, { overrideTranscript: tr })
  }

  /** Cria transcrição e já recalcula a probabilidade da turma vinculada. */
  const addTranscript = useCallback(
    async (transcript: Omit<CallTranscript, 'id'>): Promise<CallTranscript> => {
      const created = await addTranscriptRaw(transcript)
      const deal = created.leadId ? deals.find((d) => d.leadId === created.leadId) : undefined
      if (deal) await recomputeDealProbability(deal, { overrideTranscript: created })
      return created
    },
    [addTranscriptRaw, deals, recomputeDealProbability],
  )

  const updateTranscript = useCallback(
    async (id: string, updates: Partial<CallTranscript>): Promise<void> => {
      await updateTranscriptRaw(id, updates)
      const tr = transcripts.find((t) => t.id === id)
      const merged = { ...(tr as CallTranscript), ...updates }
      const deal = merged?.leadId ? deals.find((d) => d.leadId === merged.leadId) : undefined
      if (deal) await recomputeDealProbability(deal, { overrideTranscript: merged })
    },
    [updateTranscriptRaw, transcripts, deals, recomputeDealProbability],
  )

  // Sincronização SGE via Edge Function do Supabase
  const syncWithSGE = async (): Promise<{ success: boolean; message: string; data?: any }> => {
    try {
      if (!isAuthenticated || !user) {
        return {
          success: false,
          message: 'Usuário não autenticado. Faça login para sincronizar com o SGE.',
        }
      }

      const { data, error } = await supabase.functions.invoke('sincronizar-sge', {
        body: { user_id: user.id },
      })

      if (error) {
        throw error
      }

      if (data?.error) {
        return {
          success: false,
          message: data.error,
        }
      }

      // Atualiza estado local
      await refreshTurmas()
      await refreshDeals()

      const summary = data?.summary
      const msg = summary
        ? `Sincronização concluída: ${summary.total_vendas_sge} vendas analisadas, ${summary.turmas_vinculadas} novas vinculadas, ${summary.auto_win} fechadas automaticamente.`
        : 'Sincronização com SGE concluída com sucesso!'

      addActivity({
        type: 'sge',
        title: 'Sincronização SGE concluída',
        description: msg,
        actorName: 'SGE Integration',
      })

      return {
        success: true,
        message: msg,
        data: summary,
      }
    } catch (err: any) {
      const errorMsg = err.message || 'Falha na sincronização com SGE'
      return {
        success: false,
        message: errorMsg,
      }
    }
  }

  const refreshAll = async () => {
    await Promise.all([
      refreshTurmas(),
      refreshDeals(),
      refreshContatos(),
      refreshNotas(),
      refreshTranscricoes(),
      refreshConfiguracoes(),
      refreshFunilEventos(),
      refreshEstudos(),
    ])
  }

  const loading =
    turmasLoading ||
    dealsLoading ||
    contatosLoading ||
    notasLoading ||
    transcricoesLoading ||
    configLoading
  const error = turmasError || dealsError || contatosError || notasError || transcricoesError

  const value: CRMContextType = {
    leads,
    deals,
    contacts,
    notes,
    transcripts,
    activities,
    settings,
    members,
    tasks,
    stages,
    funilEventos,
    estudos,
    loading,
    error,

    addLead: addTurma,
    updateLead: updateTurma,
    deleteLead: deleteTurma,

    addDeal,
    updateDeal,
    deleteDeal,
    moveDealStage,
    toggleChecklistItem,

    addContact,
    updateContact,
    deleteContact,
    marcarNaoResponde,
    marcarRespondeu,

    addNote,
    updateNote,
    deleteNote,

    addTranscript,
    updateTranscript,
    deleteTranscript,
    reanalyzeTranscript,

    addTask,
    toggleTask,
    deleteTask,

    importBatchEntities,

    updateSettings,
    addActivity,
    syncWithSGE,
    refreshAll,

    dealProbById,
    recomputeAllProbabilities,
    closeRateFor,
    upsertEstudo,
    refreshFunilEventos,
    refreshEstudos,
  }

  return <CRMContext.Provider value={value}>{children}</CRMContext.Provider>
}

export const useCRM = () => {
  const context = useContext(CRMContext)
  if (!context) {
    throw new Error('useCRM deve ser usado dentro de um CRMProvider')
  }
  return context
}
