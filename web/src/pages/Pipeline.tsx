import React, { useState, useMemo } from 'react'
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
    toggleChecklistItem,
    addDeal,
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
    if (selectedEmpresas.length === 0) return deals
    return deals.filter((d) => {
      const lead = d.leadId ? leadById.get(d.leadId) : null
      return lead && selectedEmpresas.includes(lead.empresa || 'AFF')
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
      toast({
        title: `Turma movida para ${stage.name}`,
        description: `${deal.company} agora está em ${stage.name}.`,
      })
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
            const stageDeals = filteredDeals.filter((d) => d.stageId === stage.id)
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
  onClose: () => void
}

function DealDetailModal({
  deal,
  lead,
  owner,
  stages,
  proposalLink,
  onProposalLinkChange,
  onToggleChecklist,
  onUpdateDeal,
  onClose,
}: DealDetailModalProps) {
  const { toast } = useToast()
  const [linkInput, setLinkInput] = useState(proposalLink)
  const [editingNotes, setEditingNotes] = useState(false)
  const [notesDraft, setNotesDraft] = useState(deal.notes || '')
  const [lostReasonDraft, setLostReasonDraft] = useState(deal.lostReason || '')
  const stage = stages.find((s) => s.id === deal.stageId)
  const turmaName = lead ? getTurmaDisplayName(lead) : deal.title

  const showProposal = isProposalStage(deal.stageId)
  const days = daysInCurrentStage(deal)
  const enteredAt = currentStageEnteredAt(deal)

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
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-white truncate">{turmaName}</h3>
              <p className="text-xs text-slate-400 truncate">
                {lead?.faculdade || deal.company}
                {lead?.curso ? ` • ${lead.curso}` : ''}
                {lead?.cidade ? ` • ${lead.cidade}` : ''}
                {stage ? ` • ${stage.name}` : ''}
              </p>
              <LastEditedBy
                email={deal.updatedByEmail}
                updatedAt={deal.updatedAt}
                className="mt-0.5"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] flex-shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          {/* Detalhes da turma */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <DetailCard
              icon={<DollarSign className="w-3.5 h-3.5" />}
              label="Valor"
              value={`R$ ${deal.value.toLocaleString('pt-BR')}`}
            />
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
                  <textarea
                    rows={2}
                    placeholder="Motivo da recusa e aprendizado..."
                    value={lostReasonDraft}
                    onChange={(e) => setLostReasonDraft(e.target.value)}
                    onBlur={() => onUpdateDeal({ lostReason: lostReasonDraft })}
                    className="w-full bg-[#111820] border border-white/10 rounded-lg p-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                  />
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
