export interface SGELink {
  leadId: string
  sgeProjectCode: string
  sgeProjectName?: string
  linkedAt: string
}

export interface SGEVendaItem {
  Codigo?: string | number
  Id?: string | number
  codigo?: string | number
  id?: string | number
  'Turma/Evento/Projeto'?: string
  'Turma / Evento / Projeto'?: string
  Turma?: string
  Evento?: string
  Projeto?: string
  Descricao?: string
  Nome?: string
  turma?: string
  evento?: string
  projeto?: string
  [key: string]: any
}

const STORAGE_KEY_SGE_LINKS = 'sge_links'

export function getSGELinks(): SGELink[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SGE_LINKS)
    if (raw) {
      return JSON.parse(raw)
    }
  } catch (err) {
    console.error('Erro ao ler sge_links:', err)
  }
  return []
}

export function saveSGELinks(links: SGELink[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_SGE_LINKS, JSON.stringify(links))
    window.dispatchEvent(new CustomEvent('sge_links_changed', { detail: links }))
  } catch (err) {
    console.error('Erro ao salvar sge_links:', err)
  }
}

export function linkTurmaToSGE(
  leadId: string,
  sgeProjectCode: string,
  sgeProjectName?: string,
): SGELink[] {
  const current = getSGELinks()
  const filtered = current.filter((item) => item.leadId !== leadId)
  const newLink: SGELink = {
    leadId,
    sgeProjectCode: sgeProjectCode.trim(),
    sgeProjectName: sgeProjectName?.trim() || '',
    linkedAt: new Date().toISOString(),
  }
  const updated = [newLink, ...filtered]
  saveSGELinks(updated)
  return updated
}

export function unlinkTurmaFromSGE(leadId: string): SGELink[] {
  const current = getSGELinks()
  const updated = current.filter((item) => item.leadId !== leadId)
  saveSGELinks(updated)
  return updated
}

export function getSGELinkForLead(leadId: string): SGELink | undefined {
  const links = getSGELinks()
  return links.find((l) => l.leadId === leadId)
}

function cleanCnpj(cnpj: string): string {
  return cnpj.replace(/\D/g, '')
}

export function buildBasicAuthHeader(cnpj: string, token: string): string {
  const cleanedCnpj = cleanCnpj(cnpj) || cnpj.trim()
  const rawCreds = `${cleanedCnpj}:${token.trim()}`
  return `Basic ${btoa(rawCreds)}`
}

export interface SGETestResult {
  ok: boolean
  status?: number
  message: string
}

export async function testSGEConnection(cnpj: string, token: string): Promise<SGETestResult> {
  if (!cnpj.trim() || !token.trim()) {
    return { ok: false, message: 'CNPJ e Token são obrigatórios.' }
  }

  const authHeader = buildBasicAuthHeader(cnpj, token)

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 12000)

    const response = await fetch('https://e-api.sge.com.br/api/emp/conta/listagem-simplificada', {
      method: 'GET',
      headers: {
        Authorization: authHeader,
        Accept: 'application/json',
      },
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        status: response.status,
        message: 'Credenciais inválidas. Verifique CNPJ e Token.',
      }
    }

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        message: `Servidor SGE retornou status ${response.status} (${response.statusText}).`,
      }
    }

    return {
      ok: true,
      status: response.status,
      message: 'Conexão com a API do SGE estabelecida com sucesso!',
    }
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return {
        ok: false,
        message: 'Servidor SGE indisponível. Tempo limite esgotado.',
      }
    }
    return {
      ok: false,
      message: 'Servidor SGE indisponível. Tente novamente.',
    }
  }
}

export interface SGESyncResult {
  ok: boolean
  totalFetched: number
  linkedCount: number
  unmatchedCount: number
  alreadyLinkedCount: number
  message: string
  details?: Array<{
    turmaNome: string
    sgeCode: string
    status: 'linked' | 'already_linked' | 'unmatched'
  }>
}

export function extractTurmaNameFromVenda(venda: SGEVendaItem): string {
  return (
    venda['Turma/Evento/Projeto'] ||
    venda['Turma / Evento / Projeto'] ||
    venda.Turma ||
    venda.Evento ||
    venda.Projeto ||
    venda.turma ||
    venda.evento ||
    venda.projeto ||
    venda.Descricao ||
    venda.Nome ||
    ''
  ).trim()
}

export function extractCodeFromVenda(venda: SGEVendaItem): string {
  const code =
    venda.Codigo ??
    venda.Id ??
    venda.codigo ??
    venda.id ??
    venda.CodigoProjeto ??
    venda.IdProjeto ??
    ''
  return String(code).trim()
}

export function normalizeNameForComparison(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function fetchSGEVendas(
  cnpj: string,
  token: string,
  startDateStr: string,
  endDateStr: string,
  onProgress?: (step: string) => void,
): Promise<SGEVendaItem[]> {
  const authHeader = buildBasicAuthHeader(cnpj, token)
  const url = `https://e-api.sge.com.br/api/emp/venda/listar-vendas-por-periodo?PeriodoInicial=${encodeURIComponent(
    startDateStr,
  )}&PeriodoFinal=${encodeURIComponent(endDateStr)}`

  onProgress?.('Conectando à API SGE...')

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 20000)

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: authHeader,
        Accept: 'application/json',
      },
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (res.status === 401 || res.status === 403) {
      throw new Error('Credenciais inválidas. Verifique CNPJ e Token.')
    }

    if (!res.ok) {
      throw new Error(`Erro na API SGE: status ${res.status}`)
    }

    const data = await res.json()
    if (Array.isArray(data)) {
      return data
    }
    if (data && Array.isArray(data.items)) {
      return data.items
    }
    if (data && Array.isArray(data.data)) {
      return data.data
    }
    if (data && Array.isArray(data.Vendas)) {
      return data.Vendas
    }
    if (data && Array.isArray(data.vendas)) {
      return data.vendas
    }
    return []
  } catch (err: any) {
    clearTimeout(timeoutId)
    if (err.name === 'AbortError') {
      throw new Error('Servidor SGE indisponível. Tente novamente.')
    }
    throw err
  }
}
