import { Lead, Deal, LeadStatus, LeadSource, StageHistoryEntry } from '@/types/crm'

export interface CsvParsedData {
  headers: string[]
  rows: string[][]
}

export interface CsvColumnMapping {
  // CRM field -> CSV column header name (or empty string if none)
  curso: string
  faculdade: string
  turma: string
  anoFormatura: string
  cidade: string
  empresa: string
  funil: string
  contato: string
  telefone: string
  tipoServico: string
  comoConheceu: string
  sdr: string
  closer: string
  observacoes: string
  concorrentes: string
  proposta: string
  dataCadastro?: string
  primeiroContato?: string
  fechamentoContrato?: string
}

export const TEMPLATE_COLUMNS = [
  'Empresa',
  'Curso',
  'Faculdade',
  'Turma',
  'Ano Formatura',
  'Cidade',
  'Funil',
  'Contato',
  'Telefone',
  'SDR',
  'Closer',
  'Observações',
  'Concorrentes',
  'Tipo de Serviço',
  'Como Conheceu',
  'Proposta',
] as const

export const TEMPLATE_CSV_SAMPLE = `Empresa,Curso,Faculdade,Turma,Ano Formatura,Cidade,Funil,Contato,Telefone,SDR,Closer,Observações,Concorrentes,Tipo de Serviço,Como Conheceu,Proposta
AFF,Medicina,FAINOR,Turma 12,2027.1,Conquista,0. Prospecção,João da Silva,(77) 99999-8888,Matheus,Carlos,Comissão formada com 40 formandos,Viva Eventos,Formatura,Instagram,https://drive.google.com/proposta-exemplo`

export function downloadTemplateCsv() {
  const blob = new Blob(['\uFEFF' + TEMPLATE_CSV_SAMPLE], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', 'planilha_modelo_turmas.csv')
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Validates if the CSV headers match EXACTLY the template columns (names and order).
 */
export function validateCsvHeaders(headers: string[]): { isValid: boolean; error?: string } {
  if (headers.length !== TEMPLATE_COLUMNS.length) {
    return {
      isValid: false,
      error: 'O arquivo não segue o formato esperado. Baixe a planilha modelo e use-a como base.',
    }
  }

  for (let i = 0; i < TEMPLATE_COLUMNS.length; i++) {
    const expected = TEMPLATE_COLUMNS[i]
    const actual = headers[i]?.trim()
    if (actual !== expected) {
      return {
        isValid: false,
        error: 'O arquivo não segue o formato esperado. Baixe a planilha modelo e use-a como base.',
      }
    }
  }

  return { isValid: true }
}

export interface ImportResult {
  importedCount: number
  updatedCount: number
  ignoredCount: number
  dealsCreatedCount: number
  storageWarning: boolean
  errors: string[]
}

/**
 * Robust CSV parser that handles:
 * - RFC 4180 quotes ("hello, world", "he said ""hi""")
 * - multiline cells inside quotes
 * - commas, semicolons or tabs as delimiter
 * - carriage returns (\r\n and \n)
 */
export function parseCSV(text: string): CsvParsedData {
  if (!text || !text.trim()) {
    return { headers: [], rows: [] }
  }

  // Detect delimiter based on first line outside quotes
  const firstLineSample = text.split(/\r?\n/)[0] || ''
  let delimiter = ','
  const commaCount = (firstLineSample.match(/,/g) || []).length
  const semiCount = (firstLineSample.match(/;/g) || []).length
  const tabCount = (firstLineSample.match(/\t/g) || []).length
  if (semiCount > commaCount && semiCount > tabCount) delimiter = ';'
  else if (tabCount > commaCount && tabCount > semiCount) delimiter = '\t'

  const rows: string[][] = []
  let currentRow: string[] = []
  let currentField = ''
  let inQuotes = false
  let i = 0
  const len = text.length

  while (i < len) {
    const char = text[i]
    const nextChar = text[i + 1]

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          // Escaped quote: "" -> "
          currentField += '"'
          i += 2
          continue
        } else {
          // End of quoted cell
          inQuotes = false
          i++
          continue
        }
      } else {
        currentField += char
        i++
        continue
      }
    } else {
      if (char === '"') {
        inQuotes = true
        i++
        continue
      }

      if (char === delimiter) {
        currentRow.push(currentField.trim())
        currentField = ''
        i++
        continue
      }

      if (char === '\r') {
        if (nextChar === '\n') i++
        currentRow.push(currentField.trim())
        currentField = ''
        if (currentRow.some((c) => c.length > 0)) {
          rows.push(currentRow)
        }
        currentRow = []
        i++
        continue
      }

      if (char === '\n') {
        currentRow.push(currentField.trim())
        currentField = ''
        if (currentRow.some((c) => c.length > 0)) {
          rows.push(currentRow)
        }
        currentRow = []
        i++
        continue
      }

      currentField += char
      i++
    }
  }

  // Push remainder
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim())
    if (currentRow.some((c) => c.length > 0)) {
      rows.push(currentRow)
    }
  }

  if (rows.length === 0) {
    return { headers: [], rows: [] }
  }

  const headers = rows[0].map((h) => h.replace(/^\uFEFF/, '').trim())
  const dataRows = rows.slice(1).filter((r) => r.some((c) => c.trim().length > 0))

  return {
    headers,
    rows: dataRows,
  }
}

/**
 * Cleans Notion markdown links like:
 * "Ângela Rocha (https://app.notion.com/...)" -> "Ângela Rocha"
 * "https://app.notion.com/..." -> "https://app.notion.com/..."
 */
export function cleanNotionValue(val: string | undefined): string {
  if (!val) return ''
  let cleaned = val.trim()

  // Match: Name (https://...) -> keep Name if there's text before (
  const matchWithText = cleaned.match(/^([^(]+)\s*\((https?:\/\/[^)]+)\)$/)
  if (matchWithText) {
    const textPart = matchWithText[1].trim()
    if (textPart) return textPart
  }

  // Handle multiple comma-separated entries with notion links: "Alefe Prado (url), Alefe 2 (url)"
  if (cleaned.includes('(https://') || cleaned.includes('(http://')) {
    cleaned = cleaned.replace(/\s*\([^)]+\)/g, '').trim()
  }

  return cleaned
}

/**
 * Extract URL from Notion value if present, otherwise returns original if it's a URL
 */
export function extractUrlOrClean(val: string | undefined): string {
  if (!val) return ''
  const cleaned = val.trim()
  const match = cleaned.match(/\((https?:\/\/[^)]+)\)/)
  if (match) {
    return match[1].trim()
  }
  if (/^https?:\/\//i.test(cleaned)) {
    return cleaned
  }
  return cleaned
}

/**
 * Normalizes a header for comparison (lower case, trim, remove accents/punctuation)
 */
function normalizeHeaderName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim()
}

/**
 * Target CRM fields and their aliases for auto-detection
 */
export const FIELD_DEFINITIONS: {
  key: keyof CsvColumnMapping
  label: string
  required?: boolean
  description: string
  aliases: string[]
}[] = [
  {
    key: 'curso',
    label: 'Curso',
    required: true,
    description: 'Nome do curso (ex: Medicina, Direito)',
    aliases: ['curso', 'course', 'nomedocurso'],
  },
  {
    key: 'faculdade',
    label: 'Faculdade / Instituição',
    required: true,
    description: 'Nome da instituição (ex: FASA, UNINASSAU, FAINOR, UNEX, UFBA, UESB)',
    aliases: ['faculdade', 'instituicao', 'universidade', 'ies', 'facul', 'college', 'university'],
  },
  {
    key: 'turma',
    label: 'Turma',
    description: 'Identificador da turma (ex: Turma 8, 27, Turma 15 N)',
    aliases: ['turma', 'class', 'turmanum', 'numerodaturma', 'identificadordaturma'],
  },
  {
    key: 'anoFormatura',
    label: 'Ano de Formatura',
    description: 'Ano e semestre de formatura (ex: 2028.1, 2027.2)',
    aliases: [
      'anoformatura',
      'ano',
      'formandoem',
      'formatura',
      'anodaformatura',
      'periodoformatura',
      'graduationyear',
    ],
  },
  {
    key: 'cidade',
    label: 'Cidade',
    description: 'Cidade da turma (ex: Conquista, Itabuna, Jequié)',
    aliases: ['cidade', 'municipio', 'city', 'local', 'localidade', 'polo'],
  },
  {
    key: 'empresa',
    label: 'Empresa',
    description: 'Empresa do grupo responsável (AFF, AIF, AIM)',
    aliases: ['empresa', 'company', 'brand', 'marca', 'siglaempresa'],
  },
  {
    key: 'funil',
    label: 'Funil / Status do Funil',
    description: 'Status no Notion (0. Prospecção, 1. Negociação, Ganhou, Perdeu)',
    aliases: [
      'funil',
      'funildevendas',
      'statusdofunil',
      'statusfunil',
      'etapa',
      'stage',
      'statuscrm',
      'fase',
    ],
  },
  {
    key: 'contato',
    label: 'Contato Principal (Nome)',
    description: 'Nome do formando ou membro da comissão',
    aliases: [
      'contato',
      'nomedocontato',
      'contatoprincipal',
      'comissao',
      'representante',
      'nomeresponsavel',
      'contact',
    ],
  },
  {
    key: 'telefone',
    label: 'Telefone do Contato',
    description: 'Telefone/WhatsApp do contato',
    aliases: ['telefone', 'tel', 'whatsapp', 'wpp', 'celular', 'phone', 'contatotelefone'],
  },
  {
    key: 'tipoServico',
    label: 'Tipo de Serviço',
    description: 'Formatura, Ensaio, Baile, etc.',
    aliases: ['tipodeservico', 'servico', 'tiposervico', 'service', 'produto'],
  },
  {
    key: 'comoConheceu',
    label: 'Como Conheceu / Origem',
    description: 'Passiva, Ativa, Time comercial, Instagram, etc.',
    aliases: ['comoconheceu', 'origem', 'comonosconheceu', 'source', 'canal', 'canalcaptacao'],
  },
  {
    key: 'sdr',
    label: 'SDR Responsável',
    description: 'Nome do SDR responsável pela prospecção',
    aliases: ['sdr', 'sdrresponsavel', 'responsavelsdr', 'criador', 'criadopor'],
  },
  {
    key: 'closer',
    label: 'Closer Responsável',
    description: 'Nome do closer/executivo de vendas',
    aliases: ['closer', 'executivo', 'vendedor', 'closerresponsavel', 'fechador'],
  },
  {
    key: 'observacoes',
    label: 'Observações',
    description: 'Anotações gerais sobre a turma ou negociação',
    aliases: ['observacoes', 'obs', 'observacao', 'notas', 'notes', 'historico', 'comentarios'],
  },
  {
    key: 'concorrentes',
    label: 'Concorrentes',
    description: 'Empresas concorrentes identificadas',
    aliases: ['concorrentes', 'concorrente', 'competitors', 'outraempresa'],
  },
  {
    key: 'proposta',
    label: 'Proposta / Link Proposta',
    description: 'Link ou referência da proposta',
    aliases: [
      'proposta',
      'linkproposta',
      'propostalinks',
      'canva',
      'linkdocanva',
      'propostacomercial',
    ],
  },
  {
    key: 'fechamentoContrato',
    label: 'Fechamento do Contrato (Data)',
    description: 'Data em que o contrato foi fechado',
    aliases: [
      'fechamentodocontrato',
      'datafechamento',
      'fechamento',
      'datadefechamento',
      'closedate',
    ],
  },
  {
    key: 'primeiroContato',
    label: 'Primeiro Contato Em (Data)',
    description: 'Data do primeiro contato com a turma',
    aliases: ['primeirocontatoem', 'primeirocontato', 'dataprimeirocontato', 'firstcontact'],
  },
  {
    key: 'dataCadastro',
    label: 'Data de Cadastro / Criado em',
    description: 'Data de criação do registro no Notion (Created time)',
    aliases: ['cadastro', 'createdtime', 'criadoem', 'datacadastro', 'datadecadastro'],
  },
]

/**
 * Auto-detect mapping from CSV headers
 */
export function autoDetectMapping(headers: string[]): CsvColumnMapping {
  const mapping: CsvColumnMapping = {
    curso: '',
    faculdade: '',
    turma: '',
    anoFormatura: '',
    cidade: '',
    empresa: '',
    funil: '',
    contato: '',
    telefone: '',
    tipoServico: '',
    comoConheceu: '',
    sdr: '',
    closer: '',
    observacoes: '',
    concorrentes: '',
    proposta: '',
    dataCadastro: '',
    primeiroContato: '',
    fechamentoContrato: '',
  }

  const normalizedHeaders = headers.map((h) => ({
    original: h,
    norm: normalizeHeaderName(h),
  }))

  for (const def of FIELD_DEFINITIONS) {
    // Try exact alias match first
    for (const alias of def.aliases) {
      const found = normalizedHeaders.find((h) => h.norm === alias)
      if (found) {
        mapping[def.key] = found.original
        break
      }
    }

    // If not matched, try partial match (includes)
    if (!mapping[def.key]) {
      for (const alias of def.aliases) {
        const found = normalizedHeaders.find(
          (h) => h.norm.includes(alias) || alias.includes(h.norm),
        )
        if (found) {
          mapping[def.key] = found.original
          break
        }
      }
    }
  }

  return mapping
}

/**
 * Standardizes turma name (e.g. "8" -> "Turma 8", "Turma 8" -> "Turma 8", "" -> "Turma 0")
 */
export function normalizeTurmaField(raw: string | undefined): string {
  if (!raw || !raw.trim()) return 'Turma 0'
  const trimmed = raw.trim()
  if (/^turma\s+/i.test(trimmed)) {
    return trimmed
  }
  // Check if it's just a number or alphanumeric
  return `Turma ${trimmed}`
}

/**
 * Canonical key for deduplicating leads
 */
export function buildTurmaKey(item: {
  curso?: string
  faculdade?: string
  turma?: string
  anoFormatura?: string
  cidade?: string
}): string {
  return [
    (item.curso || '').trim().toLowerCase(),
    (item.faculdade || '').trim().toLowerCase(),
    (item.turma || '').trim().toLowerCase(),
    (item.anoFormatura || '').trim().toLowerCase(),
    (item.cidade || '').trim().toLowerCase(),
  ].join('|')
}

/**
 * Parse a date in Notion / BR format to standard string
 */
export function parseDateString(raw: string | undefined): string {
  if (!raw || !raw.trim()) return ''
  const val = raw.trim()

  // Match "DD/MM/YYYY"
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(val)) {
    return val
  }

  // Match ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(val)) {
    const d = new Date(val)
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('pt-BR')
    }
  }

  // Match "28 de fevereiro de 2024 18:11"
  const ptMatch = val.match(/^(\d{1,2})\s+de\s+([a-zçãéíóú]+)\s+de\s+(\d{4})/i)
  if (ptMatch) {
    const day = ptMatch[1].padStart(2, '0')
    const monthNames: Record<string, string> = {
      janeiro: '01',
      fevereiro: '02',
      marco: '03',
      março: '03',
      abril: '04',
      maio: '05',
      junho: '06',
      julho: '07',
      agosto: '08',
      setembro: '09',
      outubro: '10',
      novembro: '11',
      dezembro: '12',
    }
    const month = monthNames[ptMatch[2].toLowerCase()] || '01'
    const year = ptMatch[3]
    return `${day}/${month}/${year}`
  }

  return val
}

/**
 * Map Notion Funil value to Pipeline stage ID and Deal outcome
 */
export function mapFunnelStage(funilVal: string | undefined): {
  stageId: string
  stageName: string
  probability: number
  outcome: Deal['outcome']
  leadStatus: LeadStatus
} {
  const norm = (funilVal || '').trim().toLowerCase()

  if (norm.includes('ganhou') || norm === 'ganho' || norm.includes('fechou')) {
    return {
      stageId: 'stage-6',
      stageName: 'Fechou ou Perdeu',
      probability: 100,
      outcome: 'ganho',
      leadStatus: 'Convertido',
    }
  }

  if (norm.includes('perdeu') || norm === 'perdido') {
    return {
      stageId: 'stage-6',
      stageName: 'Fechou ou Perdeu',
      probability: 0,
      outcome: 'perdido',
      leadStatus: 'Perdido',
    }
  }

  if (norm.includes('negociação') || norm.includes('negociacao') || norm.includes('1.')) {
    return {
      stageId: 'stage-2',
      stageName: 'Qualificação/Contato',
      probability: 40,
      outcome: 'aberto',
      leadStatus: 'Qualificado',
    }
  }

  // Default: Prospecção
  return {
    stageId: 'stage-1',
    stageName: 'Prospecção',
    probability: 20,
    outcome: 'aberto',
    leadStatus: 'Novo',
  }
}

/**
 * Transform a parsed CSV into Lead and Deal objects according to mapping
 */
export function transformCsvToEntities(
  parsed: CsvParsedData,
  mapping: CsvColumnMapping,
  existingLeads: Lead[],
  existingDeals: Deal[],
  defaultOwnerId: string,
  onProgress?: (percent: number) => void,
): {
  leads: Lead[]
  deals: Deal[]
  result: ImportResult
} {
  const result: ImportResult = {
    importedCount: 0,
    updatedCount: 0,
    ignoredCount: 0,
    dealsCreatedCount: 0,
    storageWarning: false,
    errors: [],
  }

  const getColIndex = (headerName: string): number => {
    if (!headerName) return -1
    return parsed.headers.indexOf(headerName)
  }

  const idxMap = {
    curso: getColIndex(mapping.curso || 'Curso'),
    faculdade: getColIndex(mapping.faculdade || 'Faculdade'),
    turma: getColIndex(mapping.turma || 'Turma'),
    anoFormatura: getColIndex(mapping.anoFormatura || 'Ano Formatura'),
    cidade: getColIndex(mapping.cidade || 'Cidade'),
    empresa: getColIndex(mapping.empresa || 'Empresa'),
    funil: getColIndex(mapping.funil || 'Funil'),
    contato: getColIndex(mapping.contato || 'Contato'),
    telefone: getColIndex(mapping.telefone || 'Telefone'),
    tipoServico: getColIndex(mapping.tipoServico || 'Tipo de Serviço'),
    comoConheceu: getColIndex(mapping.comoConheceu || 'Como Conheceu'),
    sdr: getColIndex(mapping.sdr || 'SDR'),
    closer: getColIndex(mapping.closer || 'Closer'),
    observacoes: getColIndex(mapping.observacoes || 'Observações'),
    concorrentes: getColIndex(mapping.concorrentes || 'Concorrentes'),
    proposta: getColIndex(mapping.proposta || 'Proposta'),
    dataCadastro: getColIndex(mapping.dataCadastro || ''),
    primeiroContato: getColIndex(mapping.primeiroContato || ''),
    fechamentoContrato: getColIndex(mapping.fechamentoContrato || ''),
  }

  const getValue = (row: string[], colIdx: number): string => {
    if (colIdx < 0 || colIdx >= row.length) return ''
    return (row[colIdx] || '').trim()
  }

  // Work with copies of current lists
  const nextLeads = [...existingLeads]
  const nextDeals = [...existingDeals]

  // Quick lookup index for existing leads
  const leadIndexByKey = new Map<string, number>()
  nextLeads.forEach((l, idx) => {
    leadIndexByKey.set(buildTurmaKey(l), idx)
  })

  const totalRows = parsed.rows.length
  const nowIso = new Date().toISOString()

  parsed.rows.forEach((row, rowIndex) => {
    if (onProgress && totalRows > 0) {
      onProgress(Math.round(((rowIndex + 1) / totalRows) * 100))
    }

    const rawCurso = getValue(row, idxMap.curso)
    const rawFaculdade = getValue(row, idxMap.faculdade)

    // A valid lead must at least have curso or faculdade
    if (!rawCurso && !rawFaculdade) {
      result.ignoredCount++
      return
    }

    const curso = cleanNotionValue(rawCurso) || 'Curso Geral'
    const faculdade = cleanNotionValue(rawFaculdade) || 'Faculdade'
    const rawTurma = getValue(row, idxMap.turma)
    const turma = normalizeTurmaField(cleanNotionValue(rawTurma))
    const anoFormatura = cleanNotionValue(getValue(row, idxMap.anoFormatura)) || '2027.1'
    const cidade = cleanNotionValue(getValue(row, idxMap.cidade)) || 'Conquista'
    const empresa = cleanNotionValue(getValue(row, idxMap.empresa)) || 'AFF'
    const funilRaw = cleanNotionValue(getValue(row, idxMap.funil))
    const contatoNome = cleanNotionValue(getValue(row, idxMap.contato))
    const contatoTelefone = cleanNotionValue(getValue(row, idxMap.telefone))
    const tipoServico = cleanNotionValue(getValue(row, idxMap.tipoServico)) || 'Formatura'
    const comoConheceu = cleanNotionValue(getValue(row, idxMap.comoConheceu)) || 'Passiva'
    const sdr = cleanNotionValue(getValue(row, idxMap.sdr))
    const closer = cleanNotionValue(getValue(row, idxMap.closer))
    const observacoes = cleanNotionValue(getValue(row, idxMap.observacoes))
    const concorrentes = cleanNotionValue(getValue(row, idxMap.concorrentes))
    const rawProposta = getValue(row, idxMap.proposta)
    const linkProposta = extractUrlOrClean(rawProposta)
    const dataCadastro = parseDateString(getValue(row, idxMap.dataCadastro))
    const primeiroContatoEm = parseDateString(getValue(row, idxMap.primeiroContato))
    const dataFechamento = parseDateString(getValue(row, idxMap.fechamentoContrato))

    const { stageId, probability, outcome, leadStatus } = mapFunnelStage(funilRaw)

    const key = buildTurmaKey({ curso, faculdade, turma, anoFormatura, cidade })
    const existingIdx = leadIndexByKey.get(key)

    let leadId: string

    const potentialValue = outcome === 'ganho' ? 65000 : stageId === 'stage-2' ? 48000 : 35000

    if (existingIdx !== undefined && existingIdx >= 0) {
      // Update existing lead
      const oldLead = nextLeads[existingIdx]
      leadId = oldLead.id
      nextLeads[existingIdx] = {
        ...oldLead,
        curso,
        faculdade,
        turma,
        anoFormatura,
        cidade,
        empresa: empresa || oldLead.empresa,
        tipoServico: tipoServico || oldLead.tipoServico,
        comoConheceu: comoConheceu || oldLead.comoConheceu,
        sdr: sdr || oldLead.sdr,
        closer: closer || oldLead.closer,
        observacoes: observacoes || oldLead.observacoes,
        notes: observacoes || oldLead.notes,
        concorrentes: concorrentes || oldLead.concorrentes,
        linkProposta: linkProposta || oldLead.linkProposta,
        dataCadastro: dataCadastro || oldLead.dataCadastro,
        primeiroContatoEm: primeiroContatoEm || oldLead.primeiroContatoEm,
        dataFechamento: dataFechamento || oldLead.dataFechamento,
        contatoNome: contatoNome || oldLead.contatoNome,
        contatoTelefone: contatoTelefone || oldLead.contatoTelefone,
        status: funilRaw ? leadStatus : oldLead.status,
        source: (comoConheceu || oldLead.source || 'Ativa') as LeadSource,
        updatedAt: nowIso,
      }
      result.updatedCount++
    } else {
      // Create new lead
      leadId = `lead-imp-${Date.now()}-${rowIndex}-${Math.random().toString(36).slice(2, 6)}`
      const newLead: Lead = {
        id: leadId,
        curso,
        faculdade,
        turma,
        anoFormatura,
        cidade,
        empresa,
        tipoServico,
        comoConheceu,
        sdr,
        closer,
        observacoes,
        notes: observacoes,
        concorrentes,
        linkProposta,
        dataCadastro,
        primeiroContatoEm,
        dataFechamento,
        contatoNome,
        contatoTelefone,
        status: leadStatus,
        source: (comoConheceu || 'Ativa') as LeadSource,
        potentialValue,
        ownerId: defaultOwnerId || 'm-1',
        totalAlunos: 0,
        createdAt: nowIso,
        updatedAt: nowIso,
      }
      nextLeads.push(newLead)
      leadIndexByKey.set(key, nextLeads.length - 1)
      result.importedCount++
    }

    // Deal management: ensure corresponding Deal exists in Pipeline
    const existingDealIdx = nextDeals.findIndex((d) => d.leadId === leadId)
    const dealTitle = `${curso} ${faculdade} ${turma.replace(/^Turma\s+/i, 'T')}`

    const stageHistory: StageHistoryEntry[] = [
      {
        stage: stageId,
        enteredAt: nowIso,
        daysInStage: 0,
      },
    ]

    if (existingDealIdx >= 0) {
      // Update deal if status changed
      const oldDeal = nextDeals[existingDealIdx]
      nextDeals[existingDealIdx] = {
        ...oldDeal,
        title: dealTitle,
        company: faculdade,
        contactName: contatoNome || dealTitle,
        stageId: funilRaw ? stageId : oldDeal.stageId,
        probability: funilRaw ? probability : oldDeal.probability,
        outcome: funilRaw ? outcome : oldDeal.outcome,
        proposalLink: linkProposta || oldDeal.proposalLink,
        notes: observacoes || oldDeal.notes,
        updatedAt: nowIso,
      }
    } else {
      // Create new deal
      const newDeal: Deal = {
        id: `deal-imp-${Date.now()}-${rowIndex}-${Math.random().toString(36).slice(2, 6)}`,
        leadId,
        title: dealTitle,
        company: faculdade,
        contactName: contatoNome || dealTitle,
        value: potentialValue,
        stageId,
        probability,
        ownerId: defaultOwnerId || 'm-1',
        proposalLink: linkProposta,
        notes: observacoes,
        stageHistory,
        outcome,
        createdAt: nowIso,
        updatedAt: nowIso,
      }
      nextDeals.push(newDeal)
      result.dealsCreatedCount++
    }
  })

  // Check localStorage quota safety
  try {
    const testData = JSON.stringify({ nextLeads, nextDeals })
    if (testData.length > 4 * 1024 * 1024) {
      result.storageWarning = true
    }
  } catch {
    result.storageWarning = true
  }

  return {
    leads: nextLeads,
    deals: nextDeals,
    result,
  }
}
