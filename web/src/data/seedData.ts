import {
  Lead,
  Deal,
  Transcript,
  Note,
  Task,
  ActivityEvent,
  TeamMember,
  PipelineStage,
  CustomField,
  AppSettings,
  AnalysisKeyword,
  Contact,
  StageHistoryEntry,
} from '@/types/crm'

export const INITIAL_MEMBERS: TeamMember[] = [
  {
    id: 'm-1',
    name: 'Carlos Mendes',
    email: 'carlos.mendes@sdrcrm.com.br',
    role: 'SDR Líder',
    status: 'Ativo',
    avatarColor: '#F97316',
  },
  {
    id: 'm-2',
    name: 'Mariana Duarte',
    email: 'mariana.duarte@sdrcrm.com.br',
    role: 'SDR',
    status: 'Ativo',
    avatarColor: '#EA580C',
  },
  {
    id: 'm-3',
    name: 'Lucas Ferreira',
    email: 'lucas.ferreira@sdrcrm.com.br',
    role: 'Executivo',
    status: 'Ativo',
    avatarColor: '#10b981',
  },
  {
    id: 'm-4',
    name: 'Beatriz Castro',
    email: 'beatriz.castro@sdrcrm.com.br',
    role: 'Diretor',
    status: 'Ativo',
    avatarColor: '#f59e0b',
  },
]

// Funil de 6 estágios oficiais do CRM
export const INITIAL_STAGES: PipelineStage[] = [
  { id: 'stage-1', name: 'Prospecção', color: '#18181b', order: 1, defaultProbability: 20 },
  {
    id: 'stage-2',
    name: 'Qualificação/Contato',
    color: '#71717a',
    order: 2,
    defaultProbability: 40,
  },
  { id: 'stage-3', name: 'Reunião Comissão', color: '#eab308', order: 3, defaultProbability: 60 },
  { id: 'stage-4', name: 'Reunião Turma', color: '#f97316', order: 4, defaultProbability: 75 },
  { id: 'stage-5', name: 'Decisão', color: '#3b82f6', order: 5, defaultProbability: 90 },
  { id: 'stage-6', name: 'Fechou ou Perdeu', color: '#64748b', order: 6, defaultProbability: 100 },
]

export const INITIAL_CUSTOM_FIELDS: CustomField[] = []

export const INITIAL_POSITIVE_KEYWORDS: AnalysisKeyword[] = [
  { id: 'pk-1', word: 'orçamento', weight: 4, type: 'positive' },
  { id: 'pk-2', word: 'implementação', weight: 5, type: 'positive' },
  { id: 'pk-3', word: 'próximos passos', weight: 4, type: 'positive' },
  { id: 'pk-4', word: 'assinatura', weight: 5, type: 'positive' },
  { id: 'pk-5', word: 'cronograma', weight: 3, type: 'positive' },
  { id: 'pk-6', word: 'fechar', weight: 5, type: 'positive' },
  { id: 'pk-7', word: 'aprovação', weight: 4, type: 'positive' },
  { id: 'pk-8', word: 'interesse', weight: 3, type: 'positive' },
  { id: 'pk-9', word: 'proposta', weight: 4, type: 'positive' },
]

export const INITIAL_NEGATIVE_KEYWORDS: AnalysisKeyword[] = [
  { id: 'nk-1', word: 'preciso pensar', weight: 3, type: 'negative' },
  { id: 'nk-2', word: 'conversar com a equipe', weight: 3, type: 'negative' },
  { id: 'nk-3', word: 'vamos ver', weight: 2, type: 'negative' },
  { id: 'nk-4', word: 'muito caro', weight: 5, type: 'negative' },
  { id: 'nk-5', word: 'sem budget', weight: 5, type: 'negative' },
  { id: 'nk-6', word: 'não é prioridade', weight: 4, type: 'negative' },
  { id: 'nk-7', word: 'concorrente', weight: 3, type: 'negative' },
]

export const INITIAL_SETTINGS: AppSettings = {
  accentColor: 'indigo',
  themeIntensity: 'deep',
  density: 'default',
  brandIcon: 'target',
  defaultPeriod: '30d',
  dashboardWidgets: {
    revenueChart: true,
    funnelChart: true,
    leadSourceChart: true,
    topDeals: true,
    recentActivity: true,
    pendingTasks: true,
  },
  analysisConfig: {
    keywordWeightMultiplier: 80,
    historicalDataWeight: 65,
    positiveKeywords: INITIAL_POSITIVE_KEYWORDS,
    negativeKeywords: INITIAL_NEGATIVE_KEYWORDS,
  },
}

// Helpers para datas relativas e parsing de data brasileira DD/MM/YYYY
const DAYS_AGO = (n: number) => new Date(Date.now() - n * 86400000).toISOString()

function parseBRDateToISO(brDate: string | undefined, fallbackDaysAgo: number): string {
  if (!brDate) return DAYS_AGO(fallbackDaysAgo)
  const parts = brDate.trim().split('/')
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10)
    const month = parseInt(parts[1], 10) - 1
    const year = parseInt(parts[2], 10)
    const date = new Date(Date.UTC(year, month, day, 12, 0, 0))
    if (!isNaN(date.getTime())) {
      return date.toISOString()
    }
  }
  return DAYS_AGO(fallbackDaysAgo)
}

interface RawNotionTurma {
  id: string
  nomeTurma: string
  empresa: string
  curso: string
  faculdade: string
  turma: string
  anoFormatura: string
  cidade: string
  funilNotion: '0. Prospecção' | '1. Negociação' | 'Ganhou' | 'Perdeu'
  comoConheceu?: string
  tipoServico?: string
  dataFechamento?: string
  observacoes?: string
}

const RAW_NOTION_TURMAS: RawNotionTurma[] = [
  {
    id: 'lead-notion-1',
    nomeTurma: 'AFF Agronomia UEFS Turma 0 2025.1 Feira de Santana',
    empresa: 'AFF',
    curso: 'Agronomia',
    faculdade: 'UEFS',
    turma: 'Turma 0',
    anoFormatura: '2025.1',
    cidade: 'Feira de Santana',
    funilNotion: 'Perdeu',
    comoConheceu: 'Passiva',
    tipoServico: 'Formatura',
  },
  {
    id: 'lead-notion-2',
    nomeTurma: 'AFF Arquitetura FAINOR Turma 0 2027.1 Conquista',
    empresa: 'AFF',
    curso: 'Arquitetura',
    faculdade: 'FAINOR',
    turma: 'Turma 0',
    anoFormatura: '2027.1',
    cidade: 'Conquista',
    funilNotion: '0. Prospecção',
  },
  {
    id: 'lead-notion-3',
    nomeTurma: 'AFF Arquitetura FAINOR Turma 0 2027.2 Conquista',
    empresa: 'AFF',
    curso: 'Arquitetura',
    faculdade: 'FAINOR',
    turma: 'Turma 0',
    anoFormatura: '2027.2',
    cidade: 'Conquista',
    funilNotion: 'Perdeu',
  },
  {
    id: 'lead-notion-4',
    nomeTurma: 'AFF Arquitetura FAINOR Turma 0 2028.1 Conquista',
    empresa: 'AFF',
    curso: 'Arquitetura',
    faculdade: 'FAINOR',
    turma: 'Turma 0',
    anoFormatura: '2028.1',
    cidade: 'Conquista',
    funilNotion: 'Perdeu',
    comoConheceu: 'Passiva',
    tipoServico: 'Formatura',
  },
  {
    id: 'lead-notion-5',
    nomeTurma: 'AFF Arquitetura FAINOR Turma 0 2028.2 Conquista',
    empresa: 'AFF',
    curso: 'Arquitetura',
    faculdade: 'FAINOR',
    turma: 'Turma 0',
    anoFormatura: '2028.2',
    cidade: 'Conquista',
    funilNotion: '0. Prospecção',
  },
  {
    id: 'lead-notion-6',
    nomeTurma: 'AFF Arquitetura FAINOR Turma 0 2029.1 Conquista',
    empresa: 'AFF',
    curso: 'Arquitetura',
    faculdade: 'FAINOR',
    turma: 'Turma 0',
    anoFormatura: '2029.1',
    cidade: 'Conquista',
    funilNotion: '0. Prospecção',
  },
  {
    id: 'lead-notion-7',
    nomeTurma: 'AFF Arquitetura FAINOR Turma 0 2029.2 Conquista',
    empresa: 'AFF',
    curso: 'Arquitetura',
    faculdade: 'FAINOR',
    turma: 'Turma 0',
    anoFormatura: '2029.2',
    cidade: 'Conquista',
    funilNotion: '0. Prospecção',
  },
  {
    id: 'lead-notion-8',
    nomeTurma: 'AFF Arquitetura FAINOR Turma 0 2030.1 Conquista',
    empresa: 'AFF',
    curso: 'Arquitetura',
    faculdade: 'FAINOR',
    turma: 'Turma 0',
    anoFormatura: '2030.1',
    cidade: 'Conquista',
    funilNotion: '1. Negociação',
  },
  {
    id: 'lead-notion-9',
    nomeTurma: 'AFF Arquitetura FAINOR Turma 0 2030.2 Conquista',
    empresa: 'AFF',
    curso: 'Arquitetura',
    faculdade: 'FAINOR',
    turma: 'Turma 0',
    anoFormatura: '2030.2',
    cidade: 'Conquista',
    funilNotion: '0. Prospecção',
  },
  {
    id: 'lead-notion-10',
    nomeTurma: 'AFF Arquitetura FAINOR Turma 0 2031.1 Conquista',
    empresa: 'AFF',
    curso: 'Arquitetura',
    faculdade: 'FAINOR',
    turma: 'Turma 0',
    anoFormatura: '2031.1',
    cidade: 'Conquista',
    funilNotion: '0. Prospecção',
  },
  {
    id: 'lead-notion-11',
    nomeTurma: 'AFF Arquitetura FAINOR Turma 0 2031.2 Conquista',
    empresa: 'AFF',
    curso: 'Arquitetura',
    faculdade: 'FAINOR',
    turma: 'Turma 0',
    anoFormatura: '2031.2',
    cidade: 'Conquista',
    funilNotion: '0. Prospecção',
  },
  {
    id: 'lead-notion-12',
    nomeTurma: 'AFF Arquitetura UNINASSAU turma 0 2027.1 Conquista',
    empresa: 'AFF',
    curso: 'Arquitetura',
    faculdade: 'UNINASSAU',
    turma: 'Turma 0',
    anoFormatura: '2027.1',
    cidade: 'Conquista',
    funilNotion: '1. Negociação',
  },
  {
    id: 'lead-notion-13',
    nomeTurma: 'AFF Arquitetura UNINASSAU turma 0 2027.2 Conquista',
    empresa: 'AFF',
    curso: 'Arquitetura',
    faculdade: 'UNINASSAU',
    turma: 'Turma 0',
    anoFormatura: '2027.2',
    cidade: 'Conquista',
    funilNotion: '0. Prospecção',
  },
  {
    id: 'lead-notion-14',
    nomeTurma: 'AFF Arquitetura UNINASSAU Turma 0 2028.1 Conquista',
    empresa: 'AFF',
    curso: 'Arquitetura',
    faculdade: 'UNINASSAU',
    turma: 'Turma 0',
    anoFormatura: '2028.1',
    cidade: 'Conquista',
    funilNotion: 'Ganhou',
    comoConheceu: 'Passiva',
    tipoServico: 'Formatura',
    dataFechamento: '31/12/2024',
  },
  {
    id: 'lead-notion-15',
    nomeTurma: 'AFF Arquitetura UNINASSAU turma 0 2028.2 Conquista',
    empresa: 'AFF',
    curso: 'Arquitetura',
    faculdade: 'UNINASSAU',
    turma: 'Turma 0',
    anoFormatura: '2028.2',
    cidade: 'Conquista',
    funilNotion: '1. Negociação',
  },
  {
    id: 'lead-notion-16',
    nomeTurma: 'AFF Arquitetura UNINASSAU Turma 0 2029.1 Conquista',
    empresa: 'AFF',
    curso: 'Arquitetura',
    faculdade: 'UNINASSAU',
    turma: 'Turma 0',
    anoFormatura: '2029.1',
    cidade: 'Conquista',
    funilNotion: '0. Prospecção',
    tipoServico: 'Formatura',
  },
  {
    id: 'lead-notion-17',
    nomeTurma: 'AFF Arquitetura UNINASSAU turma 0 2029.2 Conquista',
    empresa: 'AFF',
    curso: 'Arquitetura',
    faculdade: 'UNINASSAU',
    turma: 'Turma 0',
    anoFormatura: '2029.2',
    cidade: 'Conquista',
    funilNotion: '0. Prospecção',
  },
  {
    id: 'lead-notion-18',
    nomeTurma: 'AFF Arquitetura UNINASSAU turma 0 2030.1 Conquista',
    empresa: 'AFF',
    curso: 'Arquitetura',
    faculdade: 'UNINASSAU',
    turma: 'Turma 0',
    anoFormatura: '2030.1',
    cidade: 'Conquista',
    funilNotion: '1. Negociação',
  },
  {
    id: 'lead-notion-19',
    nomeTurma: 'AFF Arquitetura UNINASSAU turma 0 2030.2 Conquista',
    empresa: 'AFF',
    curso: 'Arquitetura',
    faculdade: 'UNINASSAU',
    turma: 'Turma 0',
    anoFormatura: '2030.2',
    cidade: 'Conquista',
    funilNotion: '0. Prospecção',
  },
  {
    id: 'lead-notion-20',
    nomeTurma: 'AFF Arquitetura UNINASSAU turma 0 2031.1 Conquista',
    empresa: 'AFF',
    curso: 'Arquitetura',
    faculdade: 'UNINASSAU',
    turma: 'Turma 0',
    anoFormatura: '2031.1',
    cidade: 'Conquista',
    funilNotion: '0. Prospecção',
  },
  {
    id: 'lead-notion-21',
    nomeTurma: 'AFF Arquitetura UNINASSAU turma 0 2031.2 Conquista',
    empresa: 'AFF',
    curso: 'Arquitetura',
    faculdade: 'UNINASSAU',
    turma: 'Turma 0',
    anoFormatura: '2031.2',
    cidade: 'Conquista',
    funilNotion: '0. Prospecção',
  },
  {
    id: 'lead-notion-22',
    nomeTurma: 'AFF Biomedicina UNEX Turma 9 2027.1 Conquista',
    empresa: 'AFF',
    curso: 'Biomedicina',
    faculdade: 'UNEX',
    turma: 'Turma 9',
    anoFormatura: '2027.1',
    cidade: 'Conquista',
    funilNotion: 'Ganhou',
    comoConheceu: 'Passiva',
    tipoServico: 'Formatura',
    dataFechamento: '31/12/2024',
  },
  {
    id: 'lead-notion-23',
    nomeTurma: 'AFF Biomedicina UNEX Turma 11 2028.1 Conquista',
    empresa: 'AFF',
    curso: 'Biomedicina',
    faculdade: 'UNEX',
    turma: 'Turma 11',
    anoFormatura: '2028.1',
    cidade: 'Conquista',
    funilNotion: '0. Prospecção',
  },
  {
    id: 'lead-notion-24',
    nomeTurma: 'AFF Biomedicina UNEX Turma 12 2028.2 Conquista',
    empresa: 'AFF',
    curso: 'Biomedicina',
    faculdade: 'UNEX',
    turma: 'Turma 12',
    anoFormatura: '2028.2',
    cidade: 'Conquista',
    funilNotion: 'Perdeu',
  },
  {
    id: 'lead-notion-25',
    nomeTurma: 'AFF Biomedicina UNEX Turma 13 2029.1 Conquista',
    empresa: 'AFF',
    curso: 'Biomedicina',
    faculdade: 'UNEX',
    turma: 'Turma 13',
    anoFormatura: '2029.1',
    cidade: 'Conquista',
    funilNotion: 'Ganhou',
  },
  {
    id: 'lead-notion-26',
    nomeTurma: 'AFF Biomedicina UNEX Turma 14 2029.2 Conquista',
    empresa: 'AFF',
    curso: 'Biomedicina',
    faculdade: 'UNEX',
    turma: 'Turma 14',
    anoFormatura: '2029.2',
    cidade: 'Conquista',
    funilNotion: '0. Prospecção',
  },
  {
    id: 'lead-notion-27',
    nomeTurma: 'AFF Biomedicina UNEX Turma 15 2030.1 Conquista',
    empresa: 'AFF',
    curso: 'Biomedicina',
    faculdade: 'UNEX',
    turma: 'Turma 15',
    anoFormatura: '2030.1',
    cidade: 'Conquista',
    funilNotion: '0. Prospecção',
  },
  {
    id: 'lead-notion-28',
    nomeTurma: 'AFF Biomedicina UNEX Turma 16 2030.1 Conquista',
    empresa: 'AFF',
    curso: 'Biomedicina',
    faculdade: 'UNEX',
    turma: 'Turma 16',
    anoFormatura: '2030.1',
    cidade: 'Conquista',
    funilNotion: '0. Prospecção',
  },
  {
    id: 'lead-notion-29',
    nomeTurma: 'AFF Ciencias Biologicas UFBA Turma 15 2027.1 Conquista',
    empresa: 'AFF',
    curso: 'Ciencias Biologicas',
    faculdade: 'UFBA',
    turma: 'Turma 15',
    anoFormatura: '2027.1',
    cidade: 'Conquista',
    funilNotion: '1. Negociação',
    comoConheceu: 'Passiva',
    tipoServico: 'Formatura',
  },
  {
    id: 'lead-notion-30',
    nomeTurma: 'AFF ciencias contabeis UNEB turma 4 2027.1 Bom Jesus da Lapa',
    empresa: 'AFF',
    curso: 'Ciencias Contabeis',
    faculdade: 'UNEB',
    turma: 'Turma 4',
    anoFormatura: '2027.1',
    cidade: 'Bom Jesus da Lapa',
    funilNotion: '1. Negociação',
    comoConheceu: 'Passiva',
    tipoServico: 'Formatura',
  },
  {
    id: 'lead-notion-31',
    nomeTurma: 'AFF Direito UESB Turma 49 2029.2 Conquista',
    empresa: 'AFF',
    curso: 'Direito',
    faculdade: 'UESB',
    turma: 'Turma 49',
    anoFormatura: '2029.2',
    cidade: 'Conquista',
    funilNotion: 'Perdeu',
    comoConheceu: 'Time comercial',
    tipoServico: 'Formatura',
  },
  {
    id: 'lead-notion-32',
    nomeTurma: 'AFF Enfermagem ANHANGUERA Turma 0 2028.2 Conquista',
    empresa: 'AFF',
    curso: 'Enfermagem',
    faculdade: 'ANHANGUERA',
    turma: 'Turma 0',
    anoFormatura: '2028.2',
    cidade: 'Conquista',
    funilNotion: 'Perdeu',
    comoConheceu: 'Passiva',
    tipoServico: 'Formatura',
  },
  {
    id: 'lead-notion-33',
    nomeTurma: 'AFF Enfermagem ANHANGUERA Turma 0 2028.2 Conquista (Negociação)',
    empresa: 'AFF',
    curso: 'Enfermagem',
    faculdade: 'ANHANGUERA',
    turma: 'Turma 0',
    anoFormatura: '2028.2',
    cidade: 'Conquista',
    funilNotion: '1. Negociação',
    comoConheceu: 'Passiva',
    tipoServico: 'Formatura',
    observacoes: 'Segunda entrada, mesma turma em negociação',
  },
  {
    id: 'lead-notion-34',
    nomeTurma: 'AFF Enfermagem FAINOR Turma 28 2027.2 Conquista',
    empresa: 'AFF',
    curso: 'Enfermagem',
    faculdade: 'FAINOR',
    turma: 'Turma 28',
    anoFormatura: '2027.2',
    cidade: 'Conquista',
    funilNotion: '0. Prospecção',
  },
  {
    id: 'lead-notion-35',
    nomeTurma: 'AFF Enfermagem FAINOR Turma 29 2028.1 Conquista',
    empresa: 'AFF',
    curso: 'Enfermagem',
    faculdade: 'FAINOR',
    turma: 'Turma 29',
    anoFormatura: '2028.1',
    cidade: 'Conquista',
    funilNotion: 'Perdeu',
    comoConheceu: 'Time comercial',
    tipoServico: 'Formatura',
  },
  {
    id: 'lead-notion-36',
    nomeTurma: 'AFF Enfermagem FAINOR Turma 30 2028.2 Conquista',
    empresa: 'AFF',
    curso: 'Enfermagem',
    faculdade: 'FAINOR',
    turma: 'Turma 30',
    anoFormatura: '2028.2',
    cidade: 'Conquista',
    funilNotion: 'Perdeu',
    comoConheceu: 'Time comercial',
    tipoServico: 'Formatura',
  },
  {
    id: 'lead-notion-37',
    nomeTurma: 'AFF Enfermagem FAINOR Turma 31 2029.1 Conquista',
    empresa: 'AFF',
    curso: 'Enfermagem',
    faculdade: 'FAINOR',
    turma: 'Turma 31',
    anoFormatura: '2029.1',
    cidade: 'Conquista',
    funilNotion: '0. Prospecção',
  },
  {
    id: 'lead-notion-38',
    nomeTurma: 'AFF Enfermagem FAINOR Turma 32 2029.2 Conquista',
    empresa: 'AFF',
    curso: 'Enfermagem',
    faculdade: 'FAINOR',
    turma: 'Turma 32',
    anoFormatura: '2029.2',
    cidade: 'Conquista',
    funilNotion: '0. Prospecção',
  },
  {
    id: 'lead-notion-39',
    nomeTurma: 'AFF Enfermagem FAINOR Turma 33 2030.1 Conquista',
    empresa: 'AFF',
    curso: 'Enfermagem',
    faculdade: 'FAINOR',
    turma: 'Turma 33',
    anoFormatura: '2030.1',
    cidade: 'Conquista',
    funilNotion: '0. Prospecção',
  },
  {
    id: 'lead-notion-40',
    nomeTurma: 'AFF Enfermagem FAINOR Turma 34 2030.2 Conquista',
    empresa: 'AFF',
    curso: 'Enfermagem',
    faculdade: 'FAINOR',
    turma: 'Turma 34',
    anoFormatura: '2030.2',
    cidade: 'Conquista',
    funilNotion: '0. Prospecção',
  },
  {
    id: 'lead-notion-41',
    nomeTurma: 'AFF Enfermagem FAINOR Turma 35 2031.1 Conquista',
    empresa: 'AFF',
    curso: 'Enfermagem',
    faculdade: 'FAINOR',
    turma: 'Turma 35',
    anoFormatura: '2031.1',
    cidade: 'Conquista',
    funilNotion: '0. Prospecção',
  },
  {
    id: 'lead-notion-42',
    nomeTurma: 'AFF Enfermagem FAINOR Turma 36 2031.2 Conquista',
    empresa: 'AFF',
    curso: 'Enfermagem',
    faculdade: 'FAINOR',
    turma: 'Turma 36',
    anoFormatura: '2031.2',
    cidade: 'Conquista',
    funilNotion: '0. Prospecção',
  },
  {
    id: 'lead-notion-43',
    nomeTurma: 'AFF Enfermagem UNEX Turma 39 2027.1 Conquista',
    empresa: 'AFF',
    curso: 'Enfermagem',
    faculdade: 'UNEX',
    turma: 'Turma 39',
    anoFormatura: '2027.1',
    cidade: 'Conquista',
    funilNotion: 'Perdeu',
    comoConheceu: 'Time comercial',
    tipoServico: 'Formatura',
  },
  {
    id: 'lead-notion-44',
    nomeTurma: 'AFF Enfermagem UNEX Turma 40 2027.2 Conquista',
    empresa: 'AFF',
    curso: 'Enfermagem',
    faculdade: 'UNEX',
    turma: 'Turma 40',
    anoFormatura: '2027.2',
    cidade: 'Conquista',
    funilNotion: 'Perdeu',
    comoConheceu: 'Time comercial',
    tipoServico: 'Formatura',
  },
  {
    id: 'lead-notion-45',
    nomeTurma: 'AFF Enfermagem UNEX Turma 41 2028.1 Conquista',
    empresa: 'AFF',
    curso: 'Enfermagem',
    faculdade: 'UNEX',
    turma: 'Turma 41',
    anoFormatura: '2028.1',
    cidade: 'Conquista',
    funilNotion: 'Perdeu',
    comoConheceu: 'Time comercial',
    tipoServico: 'Formatura',
  },
  {
    id: 'lead-notion-46',
    nomeTurma: 'AFF Enfermagem UNEX Turma 42 2028.2 Conquista',
    empresa: 'AFF',
    curso: 'Enfermagem',
    faculdade: 'UNEX',
    turma: 'Turma 42',
    anoFormatura: '2028.2',
    cidade: 'Conquista',
    funilNotion: '0. Prospecção',
  },
  {
    id: 'lead-notion-47',
    nomeTurma: 'AFF Enfermagem UNEX Turma 43 2029.1 Conquista',
    empresa: 'AFF',
    curso: 'Enfermagem',
    faculdade: 'UNEX',
    turma: 'Turma 43',
    anoFormatura: '2029.1',
    cidade: 'Conquista',
    funilNotion: '0. Prospecção',
    comoConheceu: 'Time comercial',
    tipoServico: 'Formatura',
  },
  {
    id: 'lead-notion-48',
    nomeTurma: 'AFF Enfermagem UNEX Turma 44 2029.2 Conquista',
    empresa: 'AFF',
    curso: 'Enfermagem',
    faculdade: 'UNEX',
    turma: 'Turma 44',
    anoFormatura: '2029.2',
    cidade: 'Conquista',
    funilNotion: 'Perdeu',
  },
  {
    id: 'lead-notion-49',
    nomeTurma: 'AFF Enfermagem UNEX Turma 45 2030.1 Conquista',
    empresa: 'AFF',
    curso: 'Enfermagem',
    faculdade: 'UNEX',
    turma: 'Turma 45',
    anoFormatura: '2030.1',
    cidade: 'Conquista',
    funilNotion: 'Perdeu',
  },
  {
    id: 'lead-notion-50',
    nomeTurma: 'AFF Enfermagem UNEX Turma 46 2030.2 Conquista',
    empresa: 'AFF',
    curso: 'Enfermagem',
    faculdade: 'UNEX',
    turma: 'Turma 46',
    anoFormatura: '2030.2',
    cidade: 'Conquista',
    funilNotion: '0. Prospecção',
  },
]

// Mapeamento para Leads
export const INITIAL_LEADS: Lead[] = RAW_NOTION_TURMAS.map((item, index) => {
  let status: Lead['status'] = 'Novo'
  if (item.funilNotion === '0. Prospecção') status = 'Novo'
  else if (item.funilNotion === '1. Negociação') status = 'Qualificado'
  else if (item.funilNotion === 'Ganhou') status = 'Convertido'
  else if (item.funilNotion === 'Perdeu') status = 'Perdido'

  // Distribuir SDRs responsaveis de forma consistente
  const ownerId = INITIAL_MEMBERS[index % INITIAL_MEMBERS.length].id

  return {
    id: item.id,
    curso: item.curso,
    faculdade: item.faculdade,
    turma: item.turma,
    anoFormatura: item.anoFormatura,
    cidade: item.cidade,
    status,
    source: item.comoConheceu || 'Ativa',
    potentialValue:
      item.funilNotion === 'Ganhou' ? 65000 : item.funilNotion === '1. Negociação' ? 48000 : 35000,
    ownerId,
    totalAlunos: 0, // Alunos começam zerados conforme requisito
    createdAt: item.dataFechamento
      ? parseBRDateToISO(item.dataFechamento, 90)
      : DAYS_AGO(60 - (index % 30)),
    notes: item.observacoes,
    empresa: item.empresa,
    tipoServico: item.tipoServico,
    comoConheceu: item.comoConheceu,
    observacoes: item.observacoes,
    dataFechamento: item.dataFechamento,
  }
})

// Mapeamento para Deals do Pipeline (Kanban)
export const INITIAL_DEALS: Deal[] = RAW_NOTION_TURMAS.map((item, index) => {
  const dealId = `deal-${item.id.replace('lead-', '')}`
  const ownerId = INITIAL_MEMBERS[index % INITIAL_MEMBERS.length].id
  const turmaShort = `${item.curso} ${item.faculdade} ${item.turma.replace(/^Turma\s+/i, 'T')}`

  let stageId = 'stage-1'
  let probability = 20
  let outcome: Deal['outcome'] = 'aberto'
  let stageHistory: StageHistoryEntry[] = []
  let createdAt = DAYS_AGO(30)
  let updatedAt = DAYS_AGO(2)
  let value = 35000

  if (item.funilNotion === '0. Prospecção') {
    stageId = 'stage-1'
    probability = 20
    outcome = 'aberto'
    createdAt = DAYS_AGO(20 + (index % 15))
    updatedAt = DAYS_AGO(index % 5)
    value = 35000
    stageHistory = [{ stage: 'stage-1', enteredAt: createdAt, daysInStage: 0 }]
  } else if (item.funilNotion === '1. Negociação') {
    stageId = 'stage-2' // Qualificação/Contato
    probability = 40
    outcome = 'aberto'
    createdAt = DAYS_AGO(40 + (index % 15))
    const enteredStage2 = DAYS_AGO(12 + (index % 6))
    updatedAt = DAYS_AGO(index % 4)
    value = 48000
    stageHistory = [
      { stage: 'stage-1', enteredAt: createdAt, daysInStage: 28 },
      { stage: 'stage-2', enteredAt: enteredStage2, daysInStage: 0 },
    ]
  } else if (item.funilNotion === 'Ganhou') {
    stageId = 'stage-6'
    probability = 100
    outcome = 'ganho'
    const closeDateISO = parseBRDateToISO(item.dataFechamento, 30)
    const closeTime = new Date(closeDateISO).getTime()
    const tStage1 = new Date(closeTime - 90 * 86400000).toISOString()
    const tStage2 = new Date(closeTime - 70 * 86400000).toISOString()
    const tStage3 = new Date(closeTime - 50 * 86400000).toISOString()
    const tStage4 = new Date(closeTime - 35 * 86400000).toISOString()
    const tStage5 = new Date(closeTime - 20 * 86400000).toISOString()
    const tStage6 = closeDateISO

    createdAt = tStage1
    updatedAt = closeDateISO
    value = 65000
    stageHistory = [
      { stage: 'stage-1', enteredAt: tStage1, daysInStage: 20 },
      { stage: 'stage-2', enteredAt: tStage2, daysInStage: 20 },
      { stage: 'stage-3', enteredAt: tStage3, daysInStage: 15 },
      { stage: 'stage-4', enteredAt: tStage4, daysInStage: 15 },
      { stage: 'stage-5', enteredAt: tStage5, daysInStage: 20 },
      { stage: 'stage-6', enteredAt: tStage6, daysInStage: 0 },
    ]
  } else if (item.funilNotion === 'Perdeu') {
    stageId = 'stage-6'
    probability = 0
    outcome = 'perdido'
    const closeDateISO = DAYS_AGO(25 + (index % 10))
    const closeTime = new Date(closeDateISO).getTime()
    const tStage1 = new Date(closeTime - 60 * 86400000).toISOString()
    const tStage2 = new Date(closeTime - 40 * 86400000).toISOString()
    const tStage3 = new Date(closeTime - 20 * 86400000).toISOString()
    const tStage6 = closeDateISO

    createdAt = tStage1
    updatedAt = closeDateISO
    value = 35000
    stageHistory = [
      { stage: 'stage-1', enteredAt: tStage1, daysInStage: 20 },
      { stage: 'stage-2', enteredAt: tStage2, daysInStage: 20 },
      { stage: 'stage-3', enteredAt: tStage3, daysInStage: 20 },
      { stage: 'stage-6', enteredAt: tStage6, daysInStage: 0 },
    ]
  }

  return {
    id: dealId,
    leadId: item.id,
    title: turmaShort,
    company: item.faculdade,
    contactName: turmaShort,
    value,
    stageId,
    probability,
    ownerId,
    createdAt,
    updatedAt,
    stageHistory,
    outcome,
    notes: item.observacoes,
  }
})

// CRM começa zerado em entidades operacionais de dados mock:
export const INITIAL_CONTACTS: Contact[] = []
export const INITIAL_NOTES: Note[] = []
export const INITIAL_TRANSCRIPTS: Transcript[] = []
export const INITIAL_TASKS: Task[] = []
export const INITIAL_ACTIVITIES: ActivityEvent[] = [
  {
    id: 'act-notion-import',
    type: 'lead',
    title: 'Base de Turmas Notion Importada',
    description: '50 turmas reais sincronizadas com sucesso no CRM.',
    timestamp: new Date().toISOString(),
    authorName: 'Sistema',
    color: '#3b82f6',
  },
]
