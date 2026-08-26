// Tipos fundamentais do SDR CRM

export type LeadStatus =
  | 'Novo'
  | 'Contactado'
  | 'Qualificado'
  | 'Agendado'
  | 'Convertido'
  | 'Perdido'

export type LeadSource = 'Indicação' | 'LinkedIn' | 'Website' | 'Eventos' | 'Outros' | string

export type NoteType = 'Ligação' | 'Email' | 'Reunião' | 'Follow-up' | 'Outro'

// Cargo real do usuário (profiles.role: admin/financeiro/comercial/membro),
// já traduzido pro rótulo em PT-BR — não é mais um enum fixo de demonstração.
export type TeamRole = string

export const CARGO_LABEL: Record<string, string> = {
  admin: 'Administrador',
  financeiro: 'Financeiro',
  comercial: 'Comercial',
  membro: 'Membro',
}

export type Priority = 'Alta' | 'Média' | 'Baixa'

export type FieldType = 'texto' | 'número' | 'data' | 'dropdown' | 'multiselect'

export interface CustomField {
  id: string
  label: string
  type: FieldType
  entity: 'lead' | 'deal' | 'both'
  options?: string[]
  required: boolean
  visible: boolean
}

export interface PipelineStage {
  id: string
  name: string
  color: string // Tailwind or HEX
  order: number
  defaultProbability: number
}

export interface TeamMember {
  id: string
  name: string
  email: string
  role: TeamRole
  status: 'Ativo' | 'Inativo'
  avatarColor?: string
}

export interface Lead {
  id: string
  curso: string
  faculdade: string
  turma: string // "Turma 10"
  anoFormatura: string // "2026.2"
  cidade: string
  status: LeadStatus
  source: LeadSource
  potentialValue: number
  ownerId: string // TeamMember id
  nextActionDate?: string
  nextActionText?: string
  notes?: string
  createdAt: string
  updatedAt?: string
  updatedByEmail?: string // e-mail de quem fez a última edição neste cadastro
  totalAlunos: number // derivado de quantos alunos na captacao_leads tem essa mesma turma
  alunosFechados?: number // número de alunos que já fecharam contrato
  customFields?: Record<string, any>

  // Novas propriedades Notion
  empresa?: string // AFF, AIF, AIM
  tipoServico?: string // Formatura, Ensaio, etc
  comoConheceu?: string // Passiva, Ativa, Time comercial, etc
  closer?: string // Nome do closer responsável
  concorrentes?: string // Concorrentes identificados
  observacoes?: string // Observações gerais
  sdr?: string // Nome do SDR responsável
  primeiroContatoEm?: string // Data do primeiro contato
  dataCadastro?: string // Data de cadastro no Notion (Created time)
  dataFechamento?: string // Data de fechamento do contrato
  linkProposta?: string // Link da proposta (Google Drive/Canva)
  contatoNome?: string // Nome do contato principal
  contatoTelefone?: string // Telefone do contato principal

  quantidadeComissao?: number // nº de pessoas na comissão da turma
  metaContratos?: number // meta de contratos fechados para a turma
  fotoUrl?: string // foto de capa da turma

  concluida?: boolean // true quando a turma passou do semestre de formatura (job automático)
  concluidaEm?: string // data em que foi marcada como concluída
  turmaOrigemId?: string // id da turma que originou esta (quando criada automaticamente)
}

/**
 * Retorna um nome curto de exibição para a turma, ex.: "Eng. Civil USP T10".
 * Trunca curso/faculdade para manter compacto em tabelas e badges.
 */
export function getTurmaDisplayName(lead: Lead): string {
  const curso = (lead.curso || '').trim()
  const faculdade = (lead.faculdade || '').trim()
  const turmaNum = (lead.turma || '').replace(/^Turma\s+/i, '').trim()

  const cursoCurto = curso.length > 14 ? curso.slice(0, 13) + '.' : curso
  const facCurta = faculdade.length > 10 ? faculdade.slice(0, 9) + '.' : faculdade
  const turmaSufix = turmaNum ? ` T${turmaNum}` : ''

  const base = [cursoCurto, facCurta].filter(Boolean).join(' ')
  return `${base}${turmaSufix}`.trim() || 'Turma sem nome'
}

/**
 * Nome completo da turma, sem truncamento: Empresa + Curso + Faculdade + Turma +
 * Ano de Formatura + Cidade. Usado onde o Lucas precisa identificar a turma
 * inteira sem ambiguidade (ex: coluna principal da tabela de Turmas).
 */
export function getFullTurmaName(lead: Lead): string {
  const partes = [lead.empresa, lead.curso, lead.faculdade, lead.turma, lead.anoFormatura, lead.cidade].filter(
    Boolean,
  )
  return partes.length > 0 ? partes.join(' ') : 'Turma sem nome'
}

export type DealOutcome = 'ganho' | 'perdido' | 'aberto'

/**
 * Registro de uma entrada de uma turma em um estágio do funil.
 * Toda vez que a turma muda de coluna, um novo item é adicionado ao histórico.
 */
export interface StageHistoryEntry {
  stage: string
  enteredAt: string // ISO
  daysInStage: number // dias corridos entre enteredAt e a saída (ou agora)
}

export interface Deal {
  id: string
  leadId?: string
  title: string
  company: string
  contactName: string
  contactPhone?: string
  contactEmail?: string
  source?: string
  probabilityType?: string
  checklistItems?: string[]
  tags?: string[]
  value: number
  stageId: string
  stage?: string
  probability: number // 0 - 100
  ownerId: string
  nextActionDate?: string
  nextActionText?: string
  notes?: string
  createdAt: string
  updatedAt: string
  updatedByEmail?: string // e-mail de quem fez a última edição neste negócio
  customFields?: Record<string, any>
  proposalLink?: string // link do Canva (ou qualquer URL) da proposta
  checklist?: Record<string, boolean> // mapa checklistKey -> concluído
  /** Histórico de estágios por onde a turma passou (ordenado por enteredAt). */
  stageHistory?: StageHistoryEntry[]
  /** Resultado final quando a turma está no estágio "Fechou ou Perdeu". */
  outcome?: DealOutcome | null
  /** Motivo da recusa, preenchido quando outcome === 'perdido'. */
  lostReason?: string
  expectedCloseDate?: string
  contractType?: string
  assignedTo?: string
  priority?: Priority | string
}

// ---------------------------------------------------------------------------
// Funil de 6 estágios (Turmas)
// ---------------------------------------------------------------------------

export interface FunnelStageMeta {
  id: string
  name: string
  color: string
  /** Significado/objetivo do estágio (tooltip do ícone "i"). */
  description: string
  /** O que deve ser feito neste estágio. */
  tasks: string[]
  /** Alerta de estagnação em dias (turma parada sem ação). */
  stagnationAlertDays: number
  /** Ação sugerida quando estagnada. */
  suggestedAction: string
  /** Probabilidade comercial padrão ao entrar no estágio. */
  defaultProbability: number
}

/**
 * Metadados oficiais do funil de 6 estágios. Único source-of-truth para
 * nome, cor, descrição, checklist sugerido e alertas de estagnação.
 * O seedData espelha estes ids em INITIAL_STAGES.
 */
// Checklist por etapa = nosso Playbook de Vendas oficial (6 fases), colado
// pelo Lucas em 2026-08-26. Cada etapa aqui é uma fase do playbook — ver
// CLAUDE.md pra o texto completo dos scripts que embasam cada item.
export const FUNNEL_STAGES: FunnelStageMeta[] = [
  {
    id: 'stage-1',
    name: 'Prospecção',
    color: '#64748b',
    defaultProbability: 20,
    description: 'Ainda sem contato direto da comissão — base do Mapa de Mercado.',
    tasks: [
      'Prospectar contato da turma/comissão (Instagram, presencial, indicação)',
      'Conseguir nome, telefone e @ do contato',
      'Cadastrar o contato no Mapa de Mercado (a turma vira Qualificação sozinha)',
    ],
    stagnationAlertDays: 7,
    suggestedAction: 'Prospectar ativamente até conseguir um contato pra cadastrar.',
  },
  {
    id: 'stage-2',
    name: 'Qualificação/Contato',
    color: '#3b82f6',
    defaultProbability: 40,
    description: 'Fase 1 do Playbook — Aquecimento: primeiro contato e qualificação.',
    tasks: [
      'Enviar a sequência de Primeiro Contato (texto + áudio + texto do Instagram)',
      'Marcar Primeiro Contato como concluído ao enviar (mesmo sem resposta)',
      'Ao responder: perguntar se faz parte da comissão (script de Qualificação)',
      'Se SIM: lead qualificado — preparar a proposta',
      'Se NÃO souber quem é a comissão: pedir contato dos responsáveis',
      'Se ainda NÃO tem comissão: enviar material "Como montar uma comissão" e agendar follow-up',
      'Se NÃO RESPONDE: qualificar como não interessado, turma volta pra Prospecção',
    ],
    stagnationAlertDays: 5,
    suggestedAction: 'Enviar o Primeiro Contato e confirmar se é a comissão.',
  },
  {
    id: 'stage-3',
    name: 'Reunião Comissão',
    color: '#f59e0b',
    defaultProbability: 60,
    description: 'Fase 2 do Playbook — agendar e realizar a reunião com a comissão.',
    tasks: [
      'Agendar reunião com a comissão (só concluir com data e hora confirmadas)',
      'Criar grupo no WhatsApp com todos os membros da comissão',
      'Enviar o formulário inicial no grupo e coletar todas as respostas',
      'Montar a proposta visual no Canva com base nas respostas',
      'Anexar o link da proposta no card antes da reunião (obrigatório)',
    ],
    stagnationAlertDays: 5,
    suggestedAction: 'Agendar a reunião e montar a proposta no Canva antes dela.',
  },
  {
    id: 'stage-4',
    name: 'Reunião Turma',
    color: '#f97316',
    defaultProbability: 75,
    description: 'Fase 3 (Reunião com a Turma) + Fase 4 (Decisão) do Playbook.',
    tasks: [
      'Enviar o PDF da proposta/orçamento pra turma',
      'Sair da reunião com a comissão com a reunião da turma pré-agendada',
      'Se a turma só puder se reunir em data distante: reforçar contato 3 dias antes',
      'Realizar a apresentação pra turma inteira',
      'Follow-up pós-reunião com a comissão (1 a 2 dias depois)',
      'Lembretes de prazo da proposta (ex: 7 dias antes de vencer)',
      'Registrar a decisão final da turma (Sim ou Não)',
    ],
    stagnationAlertDays: 7,
    suggestedAction: 'Realizar a apresentação e acompanhar até a decisão final.',
  },
  {
    id: 'stage-5',
    name: 'Adesão',
    color: '#FB923C',
    defaultProbability: 90,
    description: 'Fase 5 do Playbook (Ganhou) — contrato assinado, adesões individuais em andamento.',
    tasks: [
      'Enviar o contrato pra comissão assinar',
      'Acompanhar as adesões individuais por 30 dias',
      'Contatar cada aluno individualmente pra ajudar na escolha do pacote',
      'Passar o bastão pra equipe de vendas individuais após os 30 dias',
    ],
    stagnationAlertDays: 10,
    suggestedAction: 'Contatar alunos pendentes e acelerar as adesões.',
  },
  {
    id: 'stage-6',
    name: 'Fechou ou Perdeu',
    color: '#22c55e',
    defaultProbability: 100,
    description: 'Fase 5 (Ganhou) e Fase 6 (Perdeu) do Playbook — resultado final registrado.',
    tasks: [
      'Se Fechou: formalizar contrato e iniciar as adesões individuais',
      'Se Perdeu: enviar formulário de feedback pra entender o motivo',
      'Se Perdeu por preço: oferecer proposta mais enxuta (AFF ou SFF), se fizer sentido',
      'Mesmo perdendo: realizar o ensaio Amor in Two e entregar de presente',
    ],
    stagnationAlertDays: 999,
    suggestedAction: 'Registrar o resultado final e cumprir o combinado.',
  },
]

/** Mapa stageId -> meta para acesso rápido. */
export const FUNNEL_STAGE_BY_ID: Record<string, FunnelStageMeta> = FUNNEL_STAGES.reduce(
  (acc, s) => {
    acc[s.id] = s
    return acc
  },
  {} as Record<string, FunnelStageMeta>,
)

/**
 * Item de checklist padrão por estágio do Kanban (Turmas).
 * `stageId` referencia o estágio ao qual o item pertence.
 */
export interface ChecklistItem {
  id: string
  stageId: string
  label: string
}

/**
 * Checklist padrão (templates) por estágio do pipeline de Turmas.
 * As marcas (concluído/pendente) são salvas no Deal em `checklist`.
 */
/**
 * Checklist padrão (templates) por estágio do pipeline de Turmas.
 * As marcas (concluído/pendente) são salvas no Deal em `checklist`.
 * Espelha `FUNNEL_STAGES[].tasks`.
 */
export const DEFAULT_CHECKLIST_ITEMS: ChecklistItem[] = FUNNEL_STAGES.flatMap((stage) =>
  stage.tasks.map((label, idx) => ({
    id: `${stage.id}-${idx}`,
    stageId: stage.id,
    label,
  })),
)

/** Dia de hoje em ISO (apenas data YYYY-MM-DD não é suficiente p/ dias). */
export const NOW_ISO = () => new Date().toISOString()

/** Diferença em dias entre duas datas ISO (floor). */
export function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(fromIso).getTime()
  const to = new Date(toIso).getTime()
  if (isNaN(from) || isNaN(to)) return 0
  return Math.max(0, Math.floor((to - from) / 86400000))
}

/**
 * Dias que a turma está (ou esteve) no estágio atual: diferença entre
 * o último `enteredAt` do histórico e agora. Cai em 0 se não houver histórico.
 */
export function daysInCurrentStage(deal: Deal): number {
  if (!deal.stageHistory || deal.stageHistory.length === 0) return 0
  const last = deal.stageHistory[deal.stageHistory.length - 1]
  return daysBetween(last.enteredAt, NOW_ISO())
}

/**
 * Data ISO em que a turma entrou no estágio atual (último item do histórico),
 * ou `deal.updatedAt` como fallback.
 */
export function currentStageEnteredAt(deal: Deal): string {
  if (deal.stageHistory && deal.stageHistory.length > 0) {
    return deal.stageHistory[deal.stageHistory.length - 1].enteredAt
  }
  return deal.updatedAt || deal.createdAt
}

/** Formata uma data ISO em dd/mm. */
export function formatBRDate(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

/**
 * Tempo total do ciclo da turma, em dias: da primeira entrada no funil
 * (primeiro item do histórico, ou createdAt) até agora (ou até o fechamento).
 */
export function totalCycleDays(deal: Deal): number {
  const start = deal.stageHistory?.[0]?.enteredAt || deal.createdAt
  const last = deal.stageHistory?.[deal.stageHistory.length - 1]
  // Se a turma já está fechada/perdida (stage-6), conta até a entrada no stage-6.
  const end = last && last.stage === 'stage-6' ? last.enteredAt : NOW_ISO()
  return daysBetween(start, end)
}

/**
 * Contato (Aluno) vinculado a uma Turma (Lead).
 * Vários contatos podem pertencer à mesma Turma.
 */
export interface Contact {
  id: string
  nome: string
  telefone: string
  email: string
  leadId: string // vinculado à Turma/Lead
  createdAt: string
  updatedAt?: string
  updatedByEmail?: string // e-mail de quem fez a última edição neste contato
  role?: string
  name?: string
  phone?: string
  isPrimary?: boolean
  notes?: string
  naoRespondeCount?: number // quantas vezes marcaram que esse contato não respondeu (3 = volta a turma pra Prospecção)
}

export type CallTranscript = Transcript
export type Activity = ActivityEvent
export type DealStage = string

export interface TranscriptSignal {
  text: string
  type: 'positive' | 'negative'
  weight: number
  explanation?: string
}

export type MeetingType = 'Reunião Comissão' | 'Reunião Turma' | string

export interface GeminiAnalysisData {
  probabilidade: number // 0 - 100
  sentimento: 'positivo' | 'neutro' | 'negativo'
  pontosFortes: string[]
  pontosAtencao: string[]
  resumo: string
  recomendacao: string
}

export interface Transcript {
  id: string
  title: string
  fileName: string
  leadId?: string
  company: string
  contactName?: string
  meetingType?: MeetingType // "Reunião Comissão" | "Reunião Turma"
  fathomUrl?: string
  sourceType?: 'fathom' | 'manual_upload' | 'manual_text'
  date: string
  durationMinutes: number
  wordCount: number
  content: string
  analyzed: boolean
  probabilityScore: number
  // Análise Gemini estruturada
  geminiAnalysis?: GeminiAnalysisData
  signals: TranscriptSignal[]
  needCoverageScore: number // 0 - 100
  timingScore: number // 0 - 100
  decisionPowerScore: number // 0 - 100
  perceivedValueScore: number // 0 - 100
  insights: {
    type: 'positive' | 'risk' | 'recommendation'
    text: string
    quote?: string
  }[]
}

export interface Note {
  id: string
  leadId: string
  dealId?: string
  type: NoteType
  content: string
  authorId: string
  author?: string
  date: string
  createdAt?: string
  priority?: Priority
}

export interface Task {
  id: string
  title: string
  completed: boolean
  priority: Priority
  dueDate?: string
  assignedToId?: string
  leadId?: string
  createdAt?: string
}

export interface ActivityEvent {
  id: string
  type:
    | 'reuniao'
    | 'nota'
    | 'proposta'
    | 'fechamento'
    | 'estagio'
    | 'lead'
    | 'tarefa'
    | 'sistema'
    | 'ia'
    | 'sge'
  title: string
  description: string
  timestamp: string // ISO date
  authorName?: string
  actorName?: string
  authorRole?: string
  color?: string
}

export interface AnalysisKeyword {
  id: string
  word: string
  weight: number // 1 to 5
  type: 'positive' | 'negative'
}

export interface AppSettings {
  accentColor: 'indigo' | 'violet' | 'blue' | 'emerald' | 'amber' | 'pink'
  themeIntensity: 'deep' | 'default' | 'soft'
  density: 'compact' | 'default' | 'spacious'
  brandIcon: 'target' | 'trending' | 'rocket'
  defaultPeriod: '7d' | '30d' | '90d' | 'year'
  dashboardWidgets: {
    revenueChart: boolean
    funnelChart: boolean
    leadSourceChart: boolean
    topDeals: boolean
    recentActivity: boolean
    pendingTasks: boolean
  }
  analysisConfig: {
    keywordWeightMultiplier: number // 0 - 100 (%)
    historicalDataWeight: number // 0 - 100 (%)
    positiveKeywords: AnalysisKeyword[]
    negativeKeywords: AnalysisKeyword[]
  }
}
