import { useState } from 'react'
import { useCRM } from '@/context/CRMContext'
import { useToast } from '@/hooks/use-toast'
import {
  Deal,
  Lead,
  DEFAULT_CHECKLIST_ITEMS,
  FUNNEL_STAGE_BY_ID,
  getTurmaDisplayName,
} from '@/types/crm'

const PROPOSAL_LINK_STORAGE = 'sdr_crm_proposal_links_v1'

function loadProposalLinks(): Record<string, string> {
  try {
    const raw = localStorage.getItem(PROPOSAL_LINK_STORAGE)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

/**
 * Ações do card de turma (duplicar, apagar, avançar checklist, link de
 * proposta) usadas tanto no Funil (Pipeline.tsx) quanto no embed da extensão
 * do WhatsApp (EmbedTurma.tsx) — mesmo comportamento nos dois lugares.
 */
export function useDealActions() {
  const { deals, leads, members, stages, addLead, addDeal, deleteDeal, deleteLead, updateDeal, toggleChecklistItem, moveDealStage } =
    useCRM()
  const { toast } = useToast()
  const [proposalLinks, setProposalLinks] = useState<Record<string, string>>(() => loadProposalLinks())

  const sortedStages = [...stages].sort((a, b) => a.order - b.order)

  function proximaTurmaPara(base: Lead): string {
    const nums = leads
      .filter((l) => l.curso === base.curso && l.faculdade === base.faculdade && l.cidade === base.cidade)
      .map((l) => parseInt((l.turma || '').replace(/\D/g, ''), 10))
      .filter((n) => !isNaN(n))
    const max = nums.length ? Math.max(...nums) : 0
    return `Turma ${max + 1}`
  }

  const handleDuplicateDeal = async (deal: Deal, lead: Lead | null | undefined, onDone?: () => void) => {
    if (!lead) return
    try {
      const novoLead = await addLead({
        curso: lead.curso,
        faculdade: lead.faculdade,
        turma: proximaTurmaPara(lead),
        anoFormatura: lead.anoFormatura,
        cidade: lead.cidade,
        status: 'Novo',
        source: lead.source,
        potentialValue: lead.potentialValue,
        ownerId: lead.ownerId || members[0]?.id || '',
        empresa: lead.empresa,
        tipoServico: lead.tipoServico,
        comoConheceu: lead.comoConheceu,
        closer: '',
        concorrentes: '',
        observacoes: '',
        notes: '',
        sdr: '',
        primeiroContatoEm: '',
        dataCadastro: '',
        dataFechamento: '',
        linkProposta: '',
        contatoNome: '',
        contatoTelefone: '',
        alunosFechados: 0,
        quantidadeComissao: lead.quantidadeComissao,
        metaContratos: lead.metaContratos,
        createdAt: new Date().toISOString(),
        totalAlunos: 0,
      })
      await addDeal({
        leadId: novoLead.id,
        title: getTurmaDisplayName(novoLead),
        company: novoLead.faculdade || novoLead.empresa || '',
        contactName: '',
        contactPhone: '',
        value: deal.value,
        stageId: 'stage-1',
        probability: FUNNEL_STAGE_BY_ID['stage-1']?.defaultProbability ?? 20,
        ownerId: deal.ownerId || members[0]?.id || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      toast({
        title: 'Turma duplicada',
        description: `${getTurmaDisplayName(novoLead)} criada em Prospecção. Edite o que precisar.`,
      })
      onDone?.()
    } catch {
      toast({
        title: 'Erro ao duplicar',
        description: 'Não foi possível duplicar essa turma.',
        variant: 'destructive',
      })
    }
  }

  const handleDeleteDealAndLead = async (deal: Deal, lead: Lead | null | undefined, onDone?: () => void) => {
    const nome = lead ? getTurmaDisplayName(lead) : deal.title
    if (!confirm(`Apagar "${nome}" do funil e das Turmas? Essa ação não pode ser desfeita.`)) return
    try {
      await deleteDeal(deal.id)
      if (lead) await deleteLead(lead.id)
      toast({ title: 'Turma apagada' })
      onDone?.()
    } catch {
      toast({
        title: 'Erro ao apagar',
        description: 'Não foi possível apagar essa turma.',
        variant: 'destructive',
      })
    }
  }

  const getProposalLink = (deal: Deal): string => proposalLinks[deal.id] || deal.proposalLink || ''

  const persistProposalLink = (dealId: string, link: string) => {
    setProposalLinks((prev) => {
      const next = { ...prev }
      if (link) next[dealId] = link
      else delete next[dealId]
      localStorage.setItem(PROPOSAL_LINK_STORAGE, JSON.stringify(next))
      return next
    })
    updateDeal(dealId, { proposalLink: link })
  }

  /**
   * Marca o item do checklist e, se for o ÚLTIMO item da etapa atual, avança
   * a turma sozinha pra próxima etapa — exceto em Decisão (stage-5) e Fechou
   * ou Perdeu (stage-6), que precisam de decisão manual.
   */
  const handleToggleChecklistItem = (dealId: string, itemId: string, checked: boolean) => {
    toggleChecklistItem(dealId, itemId, checked)
    if (!checked) return
    const deal = deals.find((d) => d.id === dealId)
    if (!deal || deal.stageId === 'stage-5' || deal.stageId === 'stage-6') return
    const stageItems = DEFAULT_CHECKLIST_ITEMS.filter((it) => it.stageId === deal.stageId)
    const isLastItem = stageItems.length > 0 && stageItems[stageItems.length - 1].id === itemId
    if (!isLastItem) return
    const currentStage = sortedStages.find((s) => s.id === deal.stageId)
    const nextStage = currentStage ? sortedStages.find((s) => s.order === currentStage.order + 1) : undefined
    if (!nextStage) return
    moveDealStage(dealId, nextStage.id)
    toast({
      title: `Turma avançou para ${nextStage.name}`,
      description: `Checklist concluído — ${deal.company} agora está em ${nextStage.name}.`,
    })
  }

  return {
    sortedStages,
    getProposalLink,
    persistProposalLink,
    handleToggleChecklistItem,
    handleDuplicateDeal,
    handleDeleteDealAndLead,
  }
}
