import React, { useState, useMemo, useEffect } from 'react'
import {
  X,
  GraduationCap,
  MapPin,
  User,
  DollarSign,
  ExternalLink,
  Link2,
  CheckSquare,
  StickyNote,
  CheckCircle2,
  Circle,
  Calendar,
  Info,
  Clock,
  TrendingUp,
  TrendingDown,
  Plus,
  Search,
  Pencil,
  Copy,
  Trash2,
  Save,
  Image as ImageIcon,
  Users,
  Target,
  LinkIcon,
  Package,
  Presentation,
  Sparkles,
  ClipboardCopy,
  Check,
} from 'lucide-react'
import { useCRM } from '@/context/CRMContext'
import {
  Deal,
  DealOutcome,
  Lead,
  TeamMember,
  PipelineStage,
  getTurmaDisplayName,
  DEFAULT_CHECKLIST_ITEMS,
  FUNNEL_STAGE_BY_ID,
  daysInCurrentStage,
  currentStageEnteredAt,
  formatBRDate,
  Transcript,
} from '@/types/crm'
import { useToast } from '@/hooks/use-toast'
import AIInsightsButton from '@/components/AIInsightsButton'
import EmpresaFilterBar from '@/components/EmpresaFilterBar'
import LastEditedBy from '@/components/LastEditedBy'
import { getSGELinkForLead } from '@/utils/sgeIntegration'
import { fetchMotivosPerdaAtivos } from '@/utils/motivosPerda'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import {
  PacoteTurma,
  listarPacotes,
  adicionarPacote,
  removerPacote,
  gerarMensagemPacotes,
} from '@/utils/pacotesTurma'
import ApresentacaoPacotesModal from '@/components/ApresentacaoPacotesModal'

const PROPOSAL_LINK_STORAGE = 'sdr_crm_proposal_links_v1'

/** Lê o mapa de links de proposta salvos no localStorage (fallback do deal). */
function loadProposalLinks(): Record<string, string> {
  try {
    const raw = localStorage.getItem(PROPOSAL_LINK_STORAGE)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

const FUNNEL_STAGES_ORDER = Object.keys(FUNNEL_STAGE_BY_ID)

/** Estágios a partir dos quais a proposta aparece (stage-2 em diante). */
function isProposalStage(stageId: string): boolean {
  const order = FUNNEL_STAGES_ORDER.indexOf(stageId)
  return order >= 1 // stage-2 (Qualificação/Contato) em diante
}

export default function Pipeline() {
  const {
    deals,
    leads,
    members,
    stages,
    transcripts,
    moveDealStage,
    updateDeal,
    deleteDeal,
    toggleChecklistItem,
    addDeal,
    addLead,
    updateLead,
    deleteLead,
  } = useCRM()
  const { toast } = useToast()

  const [draggingDealId, setDraggingDealId] = useState<string | null>(null)
  const [dragOverStageId, setDragOverStageId] = useState<string | null>(null)
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null)
  const [creatingForStageId, setCreatingForStageId] = useState<string | null>(null)
  const [creatingSearch, setCreatingSearch] = useState('')
  const [creatingBusy, setCreatingBusy] = useState(false)
  const [proposalLinks, setProposalLinks] = useState<Record<string, string>>(() =>
    loadProposalLinks(),
  )
  // highlightDealId: usado quando o usuário vem de uma notificação do Dashboard.
  const [highlightDealId, setHighlightDealId] = useState<string | null>(
    () => (window as any).__pipelineHighlightDealId || null,
  )

  const leadById = useMemo(() => new Map(leads.map((l) => [l.id, l])), [leads])
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members])

  // Filtro por empresa (AIF, AFF, SFF, AIM...) — nenhum selecionado = todas.
  const [selectedEmpresas, setSelectedEmpresas] = useState<string[]>([])
  const empresaOptions = useMemo(() => {
    const set = new Set<string>()
    leads.forEach((l) => l.empresa && set.add(l.empresa))
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [leads])
  const filteredDeals = useMemo(() => {
    return deals.filter((d) => {
      // Turma já formada (ano de formatura passou) some do Funil — não tem mais
      // o que prospectar/negociar nela.
      const lead = d.leadId ? leadById.get(d.leadId) : null
      if (lead?.concluida) return false
      if (selectedEmpresas.length === 0) return true
      return !!lead && selectedEmpresas.includes(lead.empresa || 'AFF')
    })
  }, [deals, leadById, selectedEmpresas])

  const sortedStages = useMemo(() => [...stages].sort((a, b) => a.order - b.order), [stages])

  // Turmas que ainda não têm nenhuma oportunidade criada no funil
  const leadsSemFunil = useMemo(() => {
    const usados = new Set(deals.map((d) => d.leadId).filter(Boolean))
    return leads.filter((l) => !usados.has(l.id))
  }, [leads, deals])

  const leadsFiltradosParaCriar = useMemo(() => {
    const q = creatingSearch.trim().toLowerCase()
    if (!q) return leadsSemFunil
    return leadsSemFunil.filter((l) =>
      `${getTurmaDisplayName(l)} ${l.faculdade} ${l.curso} ${l.cidade}`.toLowerCase().includes(q),
    )
  }, [leadsSemFunil, creatingSearch])

  const handleCreateDealFromLead = async (lead: Lead, stageId: string) => {
    setCreatingBusy(true)
    try {
      await addDeal({
        leadId: lead.id,
        title: getTurmaDisplayName(lead),
        company: lead.faculdade || lead.empresa || '',
        contactName: lead.contatoNome || '',
        contactPhone: lead.contatoTelefone || '',
        value: lead.potentialValue || 0,
        stageId,
        probability: FUNNEL_STAGE_BY_ID[stageId]?.defaultProbability ?? 20,
        ownerId: members[0]?.id || 'm-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      toast({
        title: 'Turma adicionada ao funil',
        description: `${getTurmaDisplayName(lead)} entrou em ${stages.find((s) => s.id === stageId)?.name}.`,
      })
      setCreatingForStageId(null)
      setCreatingSearch('')
    } catch {
      toast({
        title: 'Erro ao criar',
        description: 'Não foi possível adicionar a turma ao funil.',
        variant: 'destructive',
      })
    } finally {
      setCreatingBusy(false)
    }
  }

  function proximaTurmaPara(base: Lead): string {
    const nums = leads
      .filter((l) => l.curso === base.curso && l.faculdade === base.faculdade && l.cidade === base.cidade)
      .map((l) => parseInt((l.turma || '').replace(/\D/g, ''), 10))
      .filter((n) => !isNaN(n))
    const max = nums.length ? Math.max(...nums) : 0
    return `Turma ${max + 1}`
  }

  const handleDuplicateDeal = async (deal: Deal, lead: Lead | null | undefined) => {
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
        ownerId: deal.ownerId || members[0]?.id || 'm-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      toast({
        title: 'Turma duplicada',
        description: `${getTurmaDisplayName(novoLead)} criada em Prospecção. Edite o que precisar.`,
      })
      setSelectedDealId(null)
    } catch {
      toast({
        title: 'Erro ao duplicar',
        description: 'Não foi possível duplicar essa turma.',
        variant: 'destructive',
      })
    }
  }

  const handleDeleteDealAndLead = async (deal: Deal, lead: Lead | null | undefined) => {
    const nome = lead ? getTurmaDisplayName(lead) : deal.title
    if (!confirm(`Apagar "${nome}" do funil e das Turmas? Essa ação não pode ser desfeita.`)) return
    try {
      await deleteDeal(deal.id)
      if (lead) await deleteLead(lead.id)
      toast({ title: 'Turma apagada' })
      setSelectedDealId(null)
    } catch {
      toast({
        title: 'Erro ao apagar',
        description: 'Não foi possível apagar essa turma.',
        variant: 'destructive',
      })
    }
  }

  const getProposalLink = (deal: Deal): string => {
    return proposalLinks[deal.id] || deal.proposalLink || ''
  }

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

  // --- Drag and Drop ---
  const handleDragStart = (e: React.DragEvent, dealId: string) => {
    setDraggingDealId(dealId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', dealId)
  }

  const handleDragOver = (e: React.DragEvent, stageId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragOverStageId !== stageId) setDragOverStageId(stageId)
  }

  const handleDrop = (e: React.DragEvent, stageId: string) => {
    e.preventDefault()
    const dealId = e.dataTransfer.getData('text/plain') || draggingDealId
    setDragOverStageId(null)
    setDraggingDealId(null)
    if (!dealId) return
    const deal = deals.find((d) => d.id === dealId)
    const stage = stages.find((s) => s.id === stageId)
    if (deal && stage && deal.stageId !== stageId) {
      moveDealStage(dealId, stageId)
      if (stageId === 'stage-6') {
        // Última etapa do funil: abre o card na hora pra marcar Fechou/Perdeu
        // (e o motivo, se perdeu) — garante que esse dado nunca fica em branco.
        setSelectedDealId(dealId)
      } else {
        toast({
          title: `Turma movida para ${stage.name}`,
          description: `${deal.company} agora está em ${stage.name}.`,
        })
      }
    }
  }

  const handleDragEnd = () => {
    setDraggingDealId(null)
    setDragOverStageId(null)
  }

  const selectedDeal = selectedDealId ? deals.find((d) => d.id === selectedDealId) : null
  const selectedLead = selectedDeal?.leadId ? leadById.get(selectedDeal.leadId) : null

  return (
    <div className="space-y-6 animate-fade-in pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-white/[0.06]">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-white tracking-tight flex items-center gap-3">
            Funil Amor In
            <span className="text-xs px-2.5 py-1 rounded-full bg-orange-500/15 text-orange-300 font-semibold border border-orange-500/25">
              {filteredDeals.length} Turmas
            </span>
            <AIInsightsButton context="pipeline" />
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Arraste as turmas entre os 6 estágios do funil. Cada card representa uma turma.
          </p>
        </div>
        <EmpresaFilterBar
          options={empresaOptions}
          selected={selectedEmpresas}
          onChange={setSelectedEmpresas}
        />
      </div>

      {/* Kanban */}
      <div className="overflow-x-auto pb-4 -mx-2 px-2">
        <div className="flex gap-4 min-w-max">
          {sortedStages.map((stage) => {
            const stageDeals = filteredDeals.filter((d) => {
              if (d.stageId !== stage.id) return false
              // Prospecção nunca mostra turma que já tem resultado (ganhou/perdeu)
              // registrado — evita card "zumbi" que não reflete mais o funil ativo.
              if (stage.id === 'stage-1' && (d.outcome === 'ganho' || d.outcome === 'perdido')) {
                return false
              }
              return true
            })
            const stageTotalVal = stageDeals.reduce((acc, d) => acc + (d.value || 0), 0)
            const isDragOver = dragOverStageId === stage.id
            const meta = FUNNEL_STAGE_BY_ID[stage.id]
            return (
              <div
                key={stage.id}
                onDragOver={(e) => handleDragOver(e, stage.id)}
                onDrop={(e) => handleDrop(e, stage.id)}
                className={`w-[300px] flex-shrink-0 rounded-xl border transition-colors ${
                  isDragOver
                    ? 'border-orange-500/60 bg-orange-500/[0.04]'
                    : 'border-white/[0.06] bg-[#0f1419]'
                }`}
              >
                {/* Header da coluna */}
                <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between sticky top-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: stage.color }}
                    />
                    <h3 className="font-semibold text-sm text-white truncate">{stage.name}</h3>
                    {/* Ícone de informação (i) com tooltip */}
                    <div className="relative group flex-shrink-0">
                      <button
                        type="button"
                        className="text-slate-500 hover:text-slate-300 transition-colors"
                        aria-label={`Informações sobre ${stage.name}`}
                      >
                        <Info className="w-3.5 h-3.5" />
                      </button>
                      <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-30 w-[260px] hidden group-hover:block">
                        <div className="rounded-lg border border-white/10 bg-[#0a0f14] shadow-2xl p-3 text-left">
                          <div className="flex items-center gap-2 mb-1.5">
                            <span
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: stage.color }}
                            />
                            <span className="text-xs font-bold text-white">{stage.name}</span>
                          </div>
                          {meta && (
                            <>
                              <p className="text-[11px] text-slate-300 mb-2 leading-relaxed">
                                {meta.description}
                              </p>
                              <div className="text-[10px] text-slate-400 mb-1 font-semibold uppercase tracking-wide">
                                O que fazer:
                              </div>
                              <ul className="space-y-1 mb-2">
                                {meta.tasks.map((t, i) => (
                                  <li
                                    key={i}
                                    className="text-[10px] text-slate-300 flex items-start gap-1.5 leading-tight"
                                  >
                                    <span className="text-slate-500 mt-0.5">•</span> {t}
                                  </li>
                                ))}
                              </ul>
                              <div className="text-[10px] text-amber-300/90 flex items-center gap-1 pt-1 border-t border-white/[0.06]">
                                <Clock className="w-3 h-3" />
                                Alerta após {meta.stagnationAlertDays} dias sem ação
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/[0.06] text-slate-300 flex-shrink-0">
                      {stageDeals.length}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="text-[10px] text-slate-400 font-semibold">
                      R$ {(stageTotalVal / 1000).toFixed(0)}k
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setCreatingForStageId(stage.id)
                        setCreatingSearch('')
                      }}
                      title={`Adicionar turma em ${stage.name}`}
                      aria-label={`Adicionar turma em ${stage.name}`}
                      className="p-1 rounded-md text-slate-400 hover:text-orange-300 hover:bg-orange-500/10 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Cards */}
                <div className="p-3 space-y-3 min-h-[120px]">
                  {stageDeals.map((deal) => {
                    const lead = deal.leadId ? leadById.get(deal.leadId) : undefined
                    const owner = memberById.get(deal.ownerId)
                    const link = getProposalLink(deal)
                    const showProposal = isProposalStage(deal.stageId)
                    const stageItems = DEFAULT_CHECKLIST_ITEMS.filter(
                      (it) => it.stageId === stage.id,
                    )
                    const doneCount = stageItems.filter((it) => deal.checklist?.[it.id]).length
                    const days = daysInCurrentStage(deal)
                    const enteredAt = currentStageEnteredAt(deal)
                    const isStagnant =
                      meta && days >= meta.stagnationAlertDays && stage.id !== 'stage-6'
                    const isHighlight = highlightDealId === deal.id

                    // Urgência: quanto mais perto (ou além) do limite de dias parado no estágio,
                    // mais quente a cor — independente da cor "comercial" da etapa.
                    const alertDays = meta?.stagnationAlertDays ?? 999
                    const urgencyRatio = stage.id === 'stage-6' ? 0 : alertDays > 0 ? days / alertDays : 0
                    const urgencyColor =
                      urgencyRatio >= 1 ? '#f87171' : urgencyRatio >= 0.6 ? '#fbbf24' : '#34d399'

                    // Buscar transcrição mais recente para obter a probabilidade da IA
                    const latestTranscript = deal.leadId
                      ? transcripts
                          .filter((t) => t.leadId === deal.leadId)
                          .sort(
                            (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
                          )[0]
                      : undefined

                    const transcriptProb =
                      latestTranscript?.geminiAnalysis?.probabilidade ??
                      latestTranscript?.probabilityScore

                    return (
                      <div
                        key={deal.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, deal.id)}
                        onDragEnd={handleDragEnd}
                        onClick={() => {
                          setSelectedDealId(deal.id)
                          setHighlightDealId(null)
                        }}
                        className={`group bg-[#111820] rounded-lg border p-3 cursor-pointer hover:border-orange-500/40 hover:shadow-lg hover:shadow-orange-500/5 transition-all ${
                          draggingDealId === deal.id ? 'opacity-40' : ''
                        } ${
                          isHighlight
                            ? 'border-orange-500 ring-2 ring-orange-500/40'
                            : 'border-white/[0.08]'
                        }`}
                        style={{
                          borderTop: `3px solid ${stage.color}`,
                          borderLeft: `4px solid ${urgencyColor}`,
                        }}
                        title={
                          stage.id === 'stage-6'
                            ? undefined
                            : urgencyRatio >= 1
                              ? 'Urgente: tempo neste estágio já passou do alerta'
                              : urgencyRatio >= 0.6
                                ? 'Atenção: se aproximando do limite de tempo neste estágio'
                                : 'Dentro do prazo saudável neste estágio'
                        }
                      >
                        {/* Nome da turma + outcome badge */}
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div
                              className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0"
                              style={{
                                backgroundColor: `${stage.color}22`,
                                border: `1px solid ${stage.color}55`,
                                color: stage.color,
                              }}
                            >
                              <GraduationCap className="w-3.5 h-3.5" />
                            </div>
                            <div className="min-w-0">
                              <div className="font-semibold text-white text-xs leading-tight truncate">
                                {lead ? getTurmaDisplayName(lead) : deal.title}
                              </div>
                              <div className="text-[10px] text-slate-400 truncate">
                                {lead?.faculdade || deal.company}
                                {lead?.curso ? ` • ${lead.curso}` : ''}
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1 flex-shrink-0">
                            <span className="font-bold text-emerald-400 text-xs">
                              R$ {(deal.value / 1000).toFixed(0)}k
                            </span>
                            {stage.id === 'stage-6' && (
                              <span
                                className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold flex items-center gap-0.5 ${
                                  deal.outcome === 'ganho'
                                    ? 'bg-emerald-500/20 text-emerald-300'
                                    : deal.outcome === 'perdido'
                                      ? 'bg-red-500/20 text-red-300'
                                      : 'bg-slate-500/20 text-slate-300'
                                }`}
                              >
                                {deal.outcome === 'ganho' && <TrendingUp className="w-2.5 h-2.5" />}
                                {deal.outcome === 'perdido' && (
                                  <TrendingDown className="w-2.5 h-2.5" />
                                )}
                                {deal.outcome === 'ganho'
                                  ? 'Ganhou'
                                  : deal.outcome === 'perdido'
                                    ? 'Perdeu'
                                    : 'A definir'}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Detalhes */}
                        <div className="space-y-1 mb-2 text-[10px] text-slate-400">
                          {lead?.cidade && (
                            <div className="flex items-center gap-1">
                              <MapPin className="w-3 h-3" /> {lead.cidade}
                            </div>
                          )}
                          {owner && (
                            <div className="flex items-center gap-1">
                              <User className="w-3 h-3" /> {owner.name}
                            </div>
                          )}
                        </div>

                        {/* Probabilidade calculada por Transcrição */}
                        <div className="mb-2 flex items-center justify-between text-[10px] px-2 py-1 rounded bg-white/[0.03] border border-white/[0.05]">
                          <span className="text-slate-400 flex items-center gap-1">
                            <TrendingUp className="w-3 h-3 text-orange-400" />
                            Probabilidade:
                          </span>
                          {transcriptProb !== undefined ? (
                            <span
                              className={`font-bold ${
                                transcriptProb >= 70
                                  ? 'text-emerald-400'
                                  : transcriptProb >= 45
                                    ? 'text-amber-400'
                                    : 'text-rose-400'
                              }`}
                            >
                              {transcriptProb}% de chance de avançar
                            </span>
                          ) : (
                            <span className="text-slate-500 italic">Sem análise</span>
                          )}
                        </div>

                        {/* Tempo no estágio (cor reflete urgência) */}
                        <div
                          className="flex items-center gap-1 text-[10px] mb-2 text-slate-400"
                          style={stage.id === 'stage-6' ? undefined : { color: urgencyColor }}
                        >
                          <Clock className="w-3 h-3" />
                          <span className="font-semibold">{days} dias</span>
                          <span className="text-slate-500">neste estágio</span>
                          <span className="text-slate-600">•</span>
                          <span className="text-slate-500">desde {formatBRDate(enteredAt)}</span>
                        </div>

                        {/* Checklist progress */}
                        {stageItems.length > 0 && (
                          <div className="mb-2">
                            <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                              <span className="flex items-center gap-1">
                                <CheckSquare className="w-3 h-3" /> Checklist
                              </span>
                              <span className="font-semibold text-slate-300">
                                {doneCount}/{stageItems.length}
                              </span>
                            </div>
                            <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{
                                  width: `${(doneCount / stageItems.length) * 100}%`,
                                  backgroundColor: stage.color,
                                }}
                              />
                            </div>
                          </div>
                        )}

                        {/* Link da proposta: visível a partir de Qualificação/Contato */}
                        {showProposal && link && (
                          <a
                            href={link}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center gap-1.5 text-[10px] text-orange-300 hover:text-orange-200 bg-orange-500/10 border border-orange-500/20 rounded px-2 py-1 transition-colors"
                          >
                            <ExternalLink className="w-3 h-3" /> Ver Proposta
                          </a>
                        )}
                      </div>
                    )
                  })}

                  {stageDeals.length === 0 && (
                    <div className="text-center text-[11px] text-slate-500 py-6 border border-dashed border-white/[0.06] rounded-lg">
                      Arraste uma turma para cá
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Modal de detalhes da turma/deal */}
      {selectedDeal && (
        <DealDetailModal
          deal={selectedDeal}
          lead={selectedLead}
          owner={selectedDeal.ownerId ? memberById.get(selectedDeal.ownerId) : undefined}
          stages={sortedStages}
          proposalLink={getProposalLink(selectedDeal)}
          onProposalLinkChange={(link) => persistProposalLink(selectedDeal.id, link)}
          onToggleChecklist={(key, checked) => toggleChecklistItem(selectedDeal.id, key, checked)}
          onUpdateDeal={(updates) => updateDeal(selectedDeal.id, updates)}
          onUpdateLead={(updates) => selectedLead && updateLead(selectedLead.id, updates)}
          onDuplicate={() => handleDuplicateDeal(selectedDeal, selectedLead)}
          onDelete={() => handleDeleteDealAndLead(selectedDeal, selectedLead)}
          onClose={() => setSelectedDealId(null)}
        />
      )}

      {/* Modal: adicionar turma existente ao funil numa etapa específica */}
      {creatingForStageId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
          onClick={() => setCreatingForStageId(null)}
        >
          <div
            className="w-full max-w-md bg-[#111820] border border-white/[0.08] rounded-2xl shadow-2xl p-5 space-y-4 max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">
                Adicionar turma em{' '}
                <span className="text-orange-300">
                  {stages.find((s) => s.id === creatingForStageId)?.name}
                </span>
              </h3>
              <button
                type="button"
                onClick={() => setCreatingForStageId(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                autoFocus
                value={creatingSearch}
                onChange={(e) => setCreatingSearch(e.target.value)}
                placeholder="Buscar turma, faculdade, curso ou cidade..."
                className="w-full pl-8 pr-3 py-2 text-xs rounded-lg bg-[#0a0f14] border border-white/[0.08] text-white placeholder:text-slate-500 focus:outline-none focus:border-orange-500/50"
              />
            </div>

            <div className="overflow-y-auto space-y-1.5 flex-1">
              {leadsFiltradosParaCriar.length === 0 && (
                <p className="text-xs text-slate-500 text-center py-6">
                  Nenhuma turma disponível. Todas já estão no funil ou nenhuma corresponde à busca.
                </p>
              )}
              {leadsFiltradosParaCriar.map((lead) => (
                <button
                  key={lead.id}
                  type="button"
                  disabled={creatingBusy}
                  onClick={() => handleCreateDealFromLead(lead, creatingForStageId)}
                  className="w-full text-left px-3 py-2 rounded-lg bg-white/[0.02] hover:bg-orange-500/10 border border-white/[0.06] hover:border-orange-500/30 transition-colors disabled:opacity-50"
                >
                  <div className="text-xs font-semibold text-white truncate">
                    {getTurmaDisplayName(lead)}
                  </div>
                  <div className="text-[10px] text-slate-400 truncate">
                    {lead.faculdade}
                    {lead.curso ? ` • ${lead.curso}` : ''}
                    {lead.cidade ? ` • ${lead.cidade}` : ''}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Modal de detalhes do card (checklist + link da proposta + detalhes + histórico)
// ---------------------------------------------------------------------------
interface DealDetailModalProps {
  deal: Deal
  lead?: Lead
  owner?: TeamMember
  stages: PipelineStage[]
  proposalLink: string
  onProposalLinkChange: (link: string) => void
  onToggleChecklist: (key: string, checked: boolean) => void
  onUpdateDeal: (updates: Partial<Deal>) => void
  onUpdateLead: (updates: Partial<Lead>) => void
  onDuplicate: () => void
  onDelete: () => void
  onClose: () => void
}

const EMPRESAS_TURMA = ['AFF', 'AIF', 'AIF-SSA', 'AIF-V', 'AIM', 'SFF']

function DealDetailModal({
  deal,
  lead,
  owner,
  stages,
  proposalLink,
  onProposalLinkChange,
  onToggleChecklist,
  onUpdateDeal,
  onUpdateLead,
  onDuplicate,
  onDelete,
  onClose,
}: DealDetailModalProps) {
  const { toast } = useToast()
  const { user } = useAuth()
  const [linkInput, setLinkInput] = useState(proposalLink)
  const [editingNotes, setEditingNotes] = useState(false)
  const [notesDraft, setNotesDraft] = useState(deal.notes || '')
  const [motivosPerda, setMotivosPerda] = useState<string[]>([])
  const motivoJaSalvo = deal.lostReason || ''
  const [motivoSelecionado, setMotivoSelecionado] = useState(motivoJaSalvo)
  const [motivoOutroDraft, setMotivoOutroDraft] = useState('')
  useEffect(() => {
    fetchMotivosPerdaAtivos().then((motivos) => {
      setMotivosPerda(motivos)
      if (motivoJaSalvo && !motivos.includes(motivoJaSalvo)) {
        setMotivoSelecionado('Outro')
        setMotivoOutroDraft(motivoJaSalvo)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const stage = stages.find((s) => s.id === deal.stageId)
  const turmaName = lead ? getTurmaDisplayName(lead) : deal.title
  const sgeLink = lead ? getSGELinkForLead(lead.id) : null

  const showProposal = isProposalStage(deal.stageId)
  const days = daysInCurrentStage(deal)
  const enteredAt = currentStageEnteredAt(deal)

  // Edição de valor do negócio
  const [editingValue, setEditingValue] = useState(false)
  const [valueDraft, setValueDraft] = useState(String(deal.value || 0))

  // Edição das informações da turma (dados do Lead)
  const [editingTurma, setEditingTurma] = useState(false)
  const [turmaDraft, setTurmaDraft] = useState({
    curso: lead?.curso || '',
    faculdade: lead?.faculdade || '',
    turma: lead?.turma || '',
    anoFormatura: lead?.anoFormatura || '',
    cidade: lead?.cidade || '',
    empresa: lead?.empresa || 'AFF',
    quantidadeComissao: String(lead?.quantidadeComissao ?? ''),
    metaContratos: String(lead?.metaContratos ?? ''),
  })
  const [savingTurma, setSavingTurma] = useState(false)
  const [uploadingFoto, setUploadingFoto] = useState(false)

  const handleSaveValue = () => {
    const n = Number(valueDraft.replace(/\./g, '').replace(',', '.'))
    onUpdateDeal({ value: isNaN(n) ? deal.value : n })
    setEditingValue(false)
  }

  const handleSaveTurma = async () => {
    setSavingTurma(true)
    try {
      onUpdateLead({
        curso: turmaDraft.curso.trim(),
        faculdade: turmaDraft.faculdade.trim(),
        turma: turmaDraft.turma.trim() || 'Turma 0',
        anoFormatura: turmaDraft.anoFormatura.trim(),
        cidade: turmaDraft.cidade.trim(),
        empresa: turmaDraft.empresa,
        quantidadeComissao: turmaDraft.quantidadeComissao ? Number(turmaDraft.quantidadeComissao) : undefined,
        metaContratos: turmaDraft.metaContratos ? Number(turmaDraft.metaContratos) : undefined,
      })
      toast({ title: 'Turma atualizada' })
      setEditingTurma(false)
    } finally {
      setSavingTurma(false)
    }
  }

  const handleSelectFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !lead || !user) return
    setUploadingFoto(true)
    try {
      const path = `${lead.id}/${Date.now()}.${file.name.split('.').pop() || 'jpg'}`
      const { error: uploadErr } = await supabase.storage.from('turmas-fotos').upload(path, file, {
        upsert: true,
      })
      if (uploadErr) throw uploadErr
      const { data } = supabase.storage.from('turmas-fotos').getPublicUrl(path)
      onUpdateLead({ fotoUrl: `${data.publicUrl}?v=${Date.now()}` })
      toast({ title: 'Foto da turma atualizada' })
    } catch (err: any) {
      toast({
        title: 'Erro ao enviar foto',
        description: err.message || 'Tente novamente.',
        variant: 'destructive',
      })
    } finally {
      setUploadingFoto(false)
    }
  }

  // Pacotes de fotografia da turma + geração de mensagem de WhatsApp
  const [pacotes, setPacotes] = useState<PacoteTurma[]>([])
  const [loadingPacotes, setLoadingPacotes] = useState(true)
  const [novoPacote, setNovoPacote] = useState({ nome: '', valor: '', parcelas: '', itens: '' })
  const [salvandoPacote, setSalvandoPacote] = useState(false)
  const [mensagemGerada, setMensagemGerada] = useState<string | null>(null)
  const [gerandoMensagem, setGerandoMensagem] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const [mostrarApresentacao, setMostrarApresentacao] = useState(false)

  useEffect(() => {
    if (!lead) return
    listarPacotes(lead.id).then((p) => {
      setPacotes(p)
      setLoadingPacotes(false)
    })
  }, [lead?.id])

  // Ticket médio = média do valor dos pacotes cadastrados; Valor Esperado =
  // Ticket Médio x Meta de Contratos. Sempre calculado, nunca digitado — e o
  // resultado já vira o Valor do negócio automaticamente.
  const ticketMedio = pacotes.length > 0 ? pacotes.reduce((acc, p) => acc + p.valor, 0) / pacotes.length : 0
  const valorEsperado = ticketMedio * (lead?.metaContratos || 0)
  useEffect(() => {
    if (!lead?.metaContratos || pacotes.length === 0) return
    if (Math.round(valorEsperado) === Math.round(deal.value || 0)) return
    onUpdateDeal({ value: Math.round(valorEsperado) })
  }, [valorEsperado, lead?.metaContratos, pacotes.length])

  const handleAdicionarPacote = async () => {
    if (!lead || !novoPacote.nome.trim() || !novoPacote.valor.trim()) return
    setSalvandoPacote(true)
    try {
      const criado = await adicionarPacote(lead.id, {
        nome: novoPacote.nome.trim(),
        valor: Number(novoPacote.valor.replace(',', '.')) || 0,
        parcelas: Number(novoPacote.parcelas) || 1,
        itens: novoPacote.itens
          .split('\n')
          .map((i) => i.trim())
          .filter(Boolean),
        ordem: pacotes.length,
      })
      setPacotes((prev) => [...prev, criado])
      setNovoPacote({ nome: '', valor: '', parcelas: '', itens: '' })
      setMensagemGerada(null)
    } finally {
      setSalvandoPacote(false)
    }
  }

  const handleRemoverPacote = async (id: string) => {
    await removerPacote(id)
    setPacotes((prev) => prev.filter((p) => p.id !== id))
    setMensagemGerada(null)
  }

  const handleGerarMensagem = async () => {
    if (!lead || pacotes.length === 0) return
    setGerandoMensagem(true)
    try {
      const texto = await gerarMensagemPacotes(lead, pacotes, sgeLink)
      setMensagemGerada(texto)
    } finally {
      setGerandoMensagem(false)
    }
  }

  const handleCopiarMensagem = () => {
    if (!mensagemGerada) return
    navigator.clipboard.writeText(mensagemGerada)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  // Checklist de TODOS os estágios.
  const itemsByStage = useMemo(() => {
    const map = new Map<string, typeof DEFAULT_CHECKLIST_ITEMS>()
    DEFAULT_CHECKLIST_ITEMS.forEach((it) => {
      const arr = map.get(it.stageId) || []
      arr.push(it)
      map.set(it.stageId, arr)
    })
    return map
  }, [])

  const setOutcome = (outcome: DealOutcome) => {
    onUpdateDeal({ outcome })
    toast({
      title: outcome === 'ganho' ? 'Turma marcada como Ganhou' : 'Turma marcada como Perdeu',
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-[680px] max-h-[90vh] bg-[#111820] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/[0.08] flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-3 min-w-0">
            {lead?.fotoUrl ? (
              <img
                src={lead.fotoUrl}
                alt={turmaName}
                className="w-10 h-10 rounded-lg object-cover flex-shrink-0 border border-white/10"
              />
            ) : (
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{
                  backgroundColor: `${stage?.color || '#F97316'}22`,
                  border: `1px solid ${stage?.color || '#F97316'}55`,
                  color: stage?.color || '#FDBA74',
                }}
              >
                <GraduationCap className="w-5 h-5" />
              </div>
            )}
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-white truncate">{turmaName}</h3>
              <p className="text-xs text-slate-400 truncate">
                {lead?.faculdade || deal.company}
                {lead?.curso ? ` • ${lead.curso}` : ''}
                {lead?.cidade ? ` • ${lead.cidade}` : ''}
                {stage ? ` • ${stage.name}` : ''}
              </p>
              <div className="flex items-center gap-2 flex-wrap mt-0.5">
                <LastEditedBy email={deal.updatedByEmail} updatedAt={deal.updatedAt} />
                {sgeLink && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    <LinkIcon className="w-2.5 h-2.5" /> SGE {sgeLink.sgeProjectCode}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              type="button"
              onClick={onDuplicate}
              title="Duplicar turma"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06]"
            >
              <Copy className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onDelete}
              title="Apagar turma"
              className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06]"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          {/* Detalhes da turma */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {editingValue ? (
              <div className="p-2.5 rounded-lg bg-[#0a0f14] border border-orange-500/40">
                <div className="flex items-center gap-1 text-[10px] text-slate-400 mb-1">
                  <DollarSign className="w-3.5 h-3.5" /> Valor
                </div>
                <div className="flex items-center gap-1">
                  <input
                    autoFocus
                    type="text"
                    inputMode="decimal"
                    value={valueDraft}
                    onChange={(e) => setValueDraft(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveValue()}
                    className="w-full bg-[#111820] border border-white/10 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-orange-500"
                  />
                  <button type="button" onClick={handleSaveValue} className="text-emerald-400 flex-shrink-0">
                    <Save className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setValueDraft(String(deal.value || 0))
                  setEditingValue(true)
                }}
                className="p-2.5 rounded-lg bg-[#0a0f14] border border-white/[0.06] hover:border-orange-500/40 text-left group"
              >
                <div className="flex items-center justify-between text-[10px] text-slate-400 mb-0.5">
                  <span className="flex items-center gap-1">
                    <DollarSign className="w-3.5 h-3.5" /> Valor
                  </span>
                  <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <div className="text-xs font-semibold text-white truncate">
                  R$ {deal.value.toLocaleString('pt-BR')}
                </div>
              </button>
            )}
            <DetailCard
              icon={<MapPin className="w-3.5 h-3.5" />}
              label="Cidade"
              value={lead?.cidade || '—'}
            />
            <DetailCard
              icon={<User className="w-3.5 h-3.5" />}
              label="Responsável"
              value={owner?.name || '—'}
            />
            <DetailCard
              icon={<Calendar className="w-3.5 h-3.5" />}
              label="Próx. Ação"
              value={deal.nextActionDate || '—'}
            />
          </div>

          {/* Editar Informações da Turma */}
          {lead && (
            <div className="p-3 rounded-lg bg-[#0a0f14] border border-white/[0.06] space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-semibold text-slate-200">
                  <Pencil className="w-3.5 h-3.5 text-orange-400" /> Informações da Turma
                </div>
                {!editingTurma ? (
                  <button
                    type="button"
                    onClick={() => {
                      setTurmaDraft({
                        curso: lead.curso || '',
                        faculdade: lead.faculdade || '',
                        turma: lead.turma || '',
                        anoFormatura: lead.anoFormatura || '',
                        cidade: lead.cidade || '',
                        empresa: lead.empresa || 'AFF',
                        quantidadeComissao: String(lead.quantidadeComissao ?? ''),
                        metaContratos: String(lead.metaContratos ?? ''),
                      })
                      setEditingTurma(true)
                    }}
                    className="text-[10px] text-orange-300 hover:text-orange-200"
                  >
                    Editar
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingTurma(false)}
                      className="text-[10px] text-slate-400 hover:text-white"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveTurma}
                      disabled={savingTurma}
                      className="text-[10px] font-semibold text-white bg-orange-600 hover:bg-orange-500 rounded px-2 py-1"
                    >
                      {savingTurma ? 'Salvando...' : 'Salvar'}
                    </button>
                  </div>
                )}
              </div>

              {editingTurma ? (
                <div className="grid grid-cols-2 gap-2">
                  <MiniField
                    label="Empresa"
                    select
                    options={EMPRESAS_TURMA}
                    value={turmaDraft.empresa}
                    onChange={(v) => setTurmaDraft((d) => ({ ...d, empresa: v }))}
                  />
                  <MiniField
                    label="Turma"
                    value={turmaDraft.turma}
                    onChange={(v) => setTurmaDraft((d) => ({ ...d, turma: v }))}
                  />
                  <MiniField
                    label="Curso"
                    value={turmaDraft.curso}
                    onChange={(v) => setTurmaDraft((d) => ({ ...d, curso: v }))}
                  />
                  <MiniField
                    label="Faculdade"
                    value={turmaDraft.faculdade}
                    onChange={(v) => setTurmaDraft((d) => ({ ...d, faculdade: v }))}
                  />
                  <MiniField
                    label="Cidade"
                    value={turmaDraft.cidade}
                    onChange={(v) => setTurmaDraft((d) => ({ ...d, cidade: v }))}
                  />
                  <MiniField
                    label="Ano Formatura"
                    value={turmaDraft.anoFormatura}
                    onChange={(v) => setTurmaDraft((d) => ({ ...d, anoFormatura: v }))}
                  />
                  <MiniField
                    label="Qtd. Comissão"
                    type="number"
                    value={turmaDraft.quantidadeComissao}
                    onChange={(v) => setTurmaDraft((d) => ({ ...d, quantidadeComissao: v }))}
                  />
                  <MiniField
                    label="Meta de Contratos"
                    type="number"
                    value={turmaDraft.metaContratos}
                    onChange={(v) => setTurmaDraft((d) => ({ ...d, metaContratos: v }))}
                  />
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <MiniStat label="Empresa" value={lead.empresa || '—'} />
                  <MiniStat label="Turma" value={lead.turma || '—'} />
                  <MiniStat label="Ano Formatura" value={lead.anoFormatura || '—'} />
                  <MiniStat
                    icon={<Users className="w-3 h-3" />}
                    label="Qtd. Comissão"
                    value={lead.quantidadeComissao != null ? String(lead.quantidadeComissao) : '—'}
                  />
                  <MiniStat
                    icon={<Target className="w-3 h-3" />}
                    label="Meta de Contratos"
                    value={lead.metaContratos != null ? String(lead.metaContratos) : '—'}
                  />
                  <MiniStat
                    icon={<CheckCircle2 className="w-3 h-3" />}
                    label="Alunos Fechados"
                    value={String(lead.alunosFechados || 0)}
                  />
                  <MiniStat label="Total de Alunos" value={String(lead.totalAlunos || 0)} />
                </div>
              )}

              {/* Foto da turma */}
              <div className="flex items-center gap-3 pt-1 border-t border-white/[0.04]">
                <div className="w-14 h-14 rounded-lg border border-dashed border-white/15 bg-white/[0.02] flex items-center justify-center overflow-hidden shrink-0">
                  {lead.fotoUrl ? (
                    <img src={lead.fotoUrl} alt="Foto da turma" className="w-full h-full object-cover" />
                  ) : (
                    <ImageIcon className="w-5 h-5 text-slate-600" />
                  )}
                </div>
                <label className="text-[10px] text-orange-300 hover:text-orange-200 cursor-pointer">
                  {uploadingFoto ? 'Enviando...' : lead.fotoUrl ? 'Trocar foto da turma' : 'Enviar foto da turma'}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploadingFoto}
                    onChange={handleSelectFoto}
                  />
                </label>
              </div>
            </div>
          )}

          {/* Pacotes de Fotografia + Mensagem de WhatsApp */}
          {lead && (
            <div className="p-3 rounded-lg bg-[#0a0f14] border border-white/[0.06] space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-semibold text-slate-200">
                  <Package className="w-3.5 h-3.5 text-orange-400" /> Pacotes da Turma
                </div>
                {pacotes.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setMostrarApresentacao(true)}
                    className="text-[10px] font-semibold text-orange-400 hover:text-orange-300 inline-flex items-center gap-1"
                  >
                    <Presentation className="w-3 h-3" /> Ver Apresentação
                  </button>
                )}
              </div>

              {pacotes.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2 rounded-lg bg-[#111820] border border-white/[0.06]">
                    <span className="text-[9px] text-slate-500 block uppercase tracking-wide">
                      Ticket Médio (automático)
                    </span>
                    <span className="text-xs font-semibold text-slate-200">
                      R$ {ticketMedio.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-[#111820] border border-white/[0.06]">
                    <span className="text-[9px] text-slate-500 block uppercase tracking-wide">
                      Valor Esperado (TM × Meta) → vira o Valor
                    </span>
                    <span className="text-xs font-semibold text-orange-400">
                      {lead.metaContratos
                        ? `R$ ${valorEsperado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                        : 'defina a Meta de Contratos'}
                    </span>
                  </div>
                </div>
              )}

              {loadingPacotes ? (
                <p className="text-slate-500">Carregando pacotes...</p>
              ) : (
                <div className="space-y-2">
                  {pacotes.length === 0 && (
                    <p className="text-slate-500">Nenhum pacote cadastrado ainda para essa turma.</p>
                  )}
                  {pacotes.map((p) => (
                    <div
                      key={p.id}
                      className="p-2.5 rounded-lg bg-[#111820] border border-white/[0.06] flex items-start justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-white">
                          {p.nome} — R$ {p.valor.toLocaleString('pt-BR')} em {p.parcelas}x
                        </div>
                        {p.itens.length > 0 && (
                          <ul className="text-[11px] text-slate-400 mt-1 space-y-0.5">
                            {p.itens.map((item, i) => (
                              <li key={i}>• {item}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoverPacote(p.id)}
                        className="text-slate-500 hover:text-red-400 flex-shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Novo pacote */}
              <div className="p-2.5 rounded-lg bg-[#111820] border border-dashed border-white/10 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <MiniField
                    label="Nome do pacote"
                    value={novoPacote.nome}
                    onChange={(v) => setNovoPacote((d) => ({ ...d, nome: v }))}
                  />
                  <MiniField
                    label="Valor (R$)"
                    type="text"
                    value={novoPacote.valor}
                    onChange={(v) => setNovoPacote((d) => ({ ...d, valor: v }))}
                  />
                  <MiniField
                    label="Parcelas"
                    type="number"
                    value={novoPacote.parcelas}
                    onChange={(v) => setNovoPacote((d) => ({ ...d, parcelas: v }))}
                  />
                </div>
                <div>
                  <label className="block text-[9px] text-slate-500 mb-0.5 uppercase tracking-wide">
                    Itens do pacote (um por linha)
                  </label>
                  <textarea
                    rows={3}
                    value={novoPacote.itens}
                    onChange={(e) => setNovoPacote((d) => ({ ...d, itens: e.target.value }))}
                    placeholder={'Amor In Two\nEnsaio de 50%\nConvite + Mkt'}
                    className="w-full bg-[#0a0f14] border border-white/10 rounded px-2 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleAdicionarPacote}
                  disabled={salvandoPacote || !novoPacote.nome.trim() || !novoPacote.valor.trim()}
                  className="text-[10px] font-semibold text-white bg-orange-600 hover:bg-orange-500 disabled:opacity-50 rounded px-2.5 py-1.5 inline-flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Adicionar Pacote
                </button>
              </div>

              {/* Gerar mensagem */}
              {pacotes.length > 0 && (
                <div className="pt-2 border-t border-white/[0.04] space-y-2">
                  <button
                    type="button"
                    onClick={handleGerarMensagem}
                    disabled={gerandoMensagem}
                    className="text-[11px] font-semibold text-white bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 disabled:opacity-60 rounded-lg px-3 py-2 inline-flex items-center gap-1.5"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    {gerandoMensagem ? 'Gerando...' : 'Gerar Mensagem de WhatsApp'}
                  </button>
                  {!sgeLink && (
                    <p className="text-[10px] text-amber-400/80">
                      Essa turma ainda não está vinculada ao SGE — a mensagem sai sem o link de
                      assinatura do contrato.
                    </p>
                  )}
                  {mensagemGerada && (
                    <div className="space-y-1.5">
                      <textarea
                        readOnly
                        rows={10}
                        value={mensagemGerada}
                        className="w-full bg-[#111820] border border-white/10 rounded-lg p-2.5 text-[11px] text-slate-200 leading-relaxed focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleCopiarMensagem}
                        className="text-[10px] font-semibold text-orange-300 hover:text-orange-200 inline-flex items-center gap-1"
                      >
                        {copiado ? (
                          <>
                            <Check className="w-3 h-3" /> Copiado!
                          </>
                        ) : (
                          <>
                            <ClipboardCopy className="w-3 h-3" /> Copiar mensagem
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Tempo no estágio atual */}
          <div className="p-3 rounded-lg bg-[#0a0f14] border border-white/[0.06] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400" />
              <div>
                <div className="font-semibold text-slate-200">
                  {days} {days === 1 ? 'dia' : 'dias'} neste estágio
                </div>
                <div className="text-[10px] text-slate-400">
                  Em {stage?.name || '—'} desde {formatBRDate(enteredAt)}
                </div>
              </div>
            </div>
            {deal.stageHistory && deal.stageHistory.length > 1 && (
              <div className="text-right">
                <div className="text-[10px] text-slate-400">Histórico</div>
                <div className="text-[10px] text-slate-300">
                  {deal.stageHistory.length} transições
                </div>
              </div>
            )}
          </div>

          {/* Outcome (apenas stage-6) */}
          {deal.stageId === 'stage-6' && (
            <div className="p-3 rounded-lg bg-[#0a0f14] border border-white/[0.06] space-y-2">
              <div className="font-semibold text-slate-200">Resultado Final</div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setOutcome('ganho')}
                  className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 ${
                    deal.outcome === 'ganho'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-white/[0.04] text-slate-400 border border-white/[0.06] hover:text-slate-200'
                  }`}
                >
                  <TrendingUp className="w-3.5 h-3.5" /> Fechou (Ganhou)
                </button>
                <button
                  type="button"
                  onClick={() => setOutcome('perdido')}
                  className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 ${
                    deal.outcome === 'perdido'
                      ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                      : 'bg-white/[0.04] text-slate-400 border border-white/[0.06] hover:text-slate-200'
                  }`}
                >
                  <TrendingDown className="w-3.5 h-3.5" /> Perdeu
                </button>
              </div>
              {deal.outcome === 'perdido' && (
                <div className="space-y-2 pt-1">
                  <select
                    value={motivoSelecionado}
                    onChange={(e) => {
                      const valor = e.target.value
                      setMotivoSelecionado(valor)
                      if (valor !== 'Outro') {
                        setMotivoOutroDraft('')
                        onUpdateDeal({ lostReason: valor })
                      }
                    }}
                    className="w-full bg-[#111820] border border-white/10 rounded-lg p-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-red-500"
                  >
                    <option value="" disabled>
                      Selecione o motivo...
                    </option>
                    {motivosPerda.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                  {motivoSelecionado === 'Outro' && (
                    <textarea
                      rows={2}
                      placeholder="Descreva o motivo..."
                      value={motivoOutroDraft}
                      onChange={(e) => setMotivoOutroDraft(e.target.value)}
                      onBlur={() => onUpdateDeal({ lostReason: motivoOutroDraft })}
                      className="w-full bg-[#111820] border border-white/10 rounded-lg p-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                    />
                  )}
                </div>
              )}
            </div>
          )}

          {/* Link da proposta — a partir de Qualificação/Contato */}
          {showProposal && (
            <div className="p-3 rounded-lg bg-[#0a0f14] border border-white/[0.06] space-y-2">
              <div className="flex items-center gap-2 font-semibold text-slate-200">
                <Link2 className="w-3.5 h-3.5 text-orange-400" /> Link da Proposta
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="url"
                  placeholder="Cole o link do Canva (ou qualquer URL)..."
                  value={linkInput}
                  onChange={(e) => setLinkInput(e.target.value)}
                  className="flex-1 bg-[#111820] border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
                <button
                  type="button"
                  onClick={() => {
                    onProposalLinkChange(linkInput.trim())
                    toast({ title: 'Link da proposta salvo' })
                  }}
                  className="px-3 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-500 rounded-lg whitespace-nowrap"
                >
                  Salvar
                </button>
              </div>
              {proposalLink && (
                <a
                  href={proposalLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-orange-300 hover:text-orange-200 bg-orange-500/10 border border-orange-500/20 rounded px-3 py-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Ver Proposta
                </a>
              )}
            </div>
          )}

          {/* Checklist por estágio */}
          <div>
            <div className="flex items-center gap-2 font-semibold text-slate-200 mb-3">
              <CheckSquare className="w-3.5 h-3.5 text-orange-400" /> Checklist de Etapas
            </div>
            <div className="space-y-3">
              {stages.map((s) => {
                const items = itemsByStage.get(s.id) || []
                if (items.length === 0) return null
                const doneCount = items.filter((it) => deal.checklist?.[it.id]).length
                const isCurrent = s.id === deal.stageId
                return (
                  <div
                    key={s.id}
                    className={`p-3 rounded-lg border ${
                      isCurrent
                        ? 'border-orange-500/40 bg-orange-500/[0.04]'
                        : 'border-white/[0.06] bg-[#0a0f14]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: s.color }}
                        />
                        <span className="font-semibold text-slate-200">{s.name}</span>
                        {isCurrent && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-orange-500/20 text-orange-300 font-semibold">
                            ATUAL
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400 font-semibold">
                        {doneCount}/{items.length}
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {items.map((it) => {
                        const checked = !!deal.checklist?.[it.id]
                        return (
                          <button
                            key={it.id}
                            type="button"
                            onClick={() => onToggleChecklist(it.id, !checked)}
                            className="flex items-center gap-2 w-full text-left group"
                          >
                            {checked ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                            ) : (
                              <Circle className="w-4 h-4 text-slate-500 group-hover:text-slate-300 flex-shrink-0" />
                            )}
                            <span
                              className={`text-xs ${
                                checked ? 'text-slate-500 line-through' : 'text-slate-200'
                              }`}
                            >
                              {it.label}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Histórico de transições */}
          {deal.stageHistory && deal.stageHistory.length > 0 && (
            <div>
              <div className="flex items-center gap-2 font-semibold text-slate-200 mb-3">
                <Clock className="w-3.5 h-3.5 text-amber-400" /> Histórico de Transições
              </div>
              <div className="space-y-1.5">
                {deal.stageHistory.map((h, i) => {
                  const s = stages.find((st) => st.id === h.stage)
                  return (
                    <div
                      key={i}
                      className="flex items-center justify-between text-[11px] py-1 px-2 rounded bg-[#0a0f14] border border-white/[0.04]"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: s?.color || '#64748b' }}
                        />
                        <span className="text-slate-200">{s?.name || h.stage}</span>
                      </div>
                      <div className="flex items-center gap-3 text-slate-400">
                        <span>{formatBRDate(h.enteredAt)}</span>
                        <span className="text-slate-500">
                          {h.daysInStage} {h.daysInStage === 1 ? 'dia' : 'dias'}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Notas */}
          <div className="p-3 rounded-lg bg-[#0a0f14] border border-white/[0.06]">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 font-semibold text-slate-200">
                <StickyNote className="w-3.5 h-3.5 text-amber-400" /> Notas
              </div>
              {!editingNotes && (
                <button
                  type="button"
                  onClick={() => {
                    setNotesDraft(deal.notes || '')
                    setEditingNotes(true)
                  }}
                  className="text-[10px] text-orange-300 hover:text-orange-200"
                >
                  Editar
                </button>
              )}
            </div>
            {editingNotes ? (
              <div className="space-y-2">
                <textarea
                  rows={3}
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  className="w-full bg-[#111820] border border-white/10 rounded-lg p-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  placeholder="Observações sobre a turma..."
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onUpdateDeal({ notes: notesDraft })
                      setEditingNotes(false)
                    }}
                    className="px-3 py-1 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-500 rounded-lg"
                  >
                    Salvar
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingNotes(false)}
                    className="px-3 py-1 text-xs font-semibold text-slate-300 bg-white/[0.05] hover:bg-white/[0.1] rounded-lg"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-300 leading-relaxed">
                {deal.notes || 'Sem notas registradas.'}
              </p>
            )}
          </div>
        </div>
      </div>

      {mostrarApresentacao && lead && (
        <ApresentacaoPacotesModal
          lead={lead}
          pacotes={pacotes}
          sgeLink={sgeLink}
          onClose={() => setMostrarApresentacao(false)}
        />
      )}
    </div>
  )
}

function DetailCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="p-2.5 rounded-lg bg-[#0a0f14] border border-white/[0.06]">
      <div className="flex items-center gap-1 text-[10px] text-slate-400 mb-0.5">
        {icon} {label}
      </div>
      <div className="text-xs font-semibold text-white truncate">{value}</div>
    </div>
  )
}

function MiniStat({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="p-2 rounded-lg bg-[#111820] border border-white/[0.06]">
      <div className="flex items-center gap-1 text-[9px] text-slate-500 mb-0.5 uppercase tracking-wide">
        {icon} {label}
      </div>
      <div className="text-xs font-semibold text-slate-200 truncate">{value}</div>
    </div>
  )
}

function MiniField({
  label,
  value,
  onChange,
  type = 'text',
  select,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  select?: boolean
  options?: string[]
}) {
  return (
    <div>
      <label className="block text-[9px] text-slate-500 mb-0.5 uppercase tracking-wide">{label}</label>
      {select ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-[#111820] border border-white/10 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-orange-500"
        >
          {(options || []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-[#111820] border border-white/10 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-orange-500"
        />
      )}
    </div>
  )
}
