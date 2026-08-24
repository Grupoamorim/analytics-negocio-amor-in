// Tipos da Captação de Leads — formulário público de captação

export interface CaptacaoLead {
  id: string
  curso: string
  faculdade: string
  turma: string // sempre salvo no formato "Turma X"
  anoFormatura: string // ex: "2026.2"
  cidade: string
  nome: string
  telefone: string
  email: string
  sdr: string // vendedor/SDR escolhido pelo cliente no formulário público
  dataCadastro: string // ISO string
}

// Garante que o campo turma tenha o prefixo "Turma" + número.
// Se vier vazio/undefined salva "Turma 0". Se já vier "Turma 10" mantém.
// Se vier só "10" vira "Turma 10".
export function normalizeTurma(value: string | undefined | null): string {
  if (!value) return 'Turma 0'
  const trimmed = value.trim()
  if (!trimmed) return 'Turma 0'

  // Caso o usuário já tenha digitado "Turma 10"
  const lower = trimmed.toLowerCase()
  if (lower.startsWith('turma ')) {
    const num = trimmed.slice(6).trim()
    return num ? `Turma ${num}` : 'Turma 0'
  }
  if (lower === 'turma') return 'Turma 0'

  // Caso seja só números (ex: "10")
  if (/^\d+$/.test(trimmed)) return `Turma ${trimmed}`

  // Qualquer outro texto livre — mantém com prefixo
  return `Turma ${trimmed}`
}

// Extrai só o número da turma para edição no input
export function extractTurmaNumber(value: string): string {
  if (!value) return ''
  const lower = value.toLowerCase()
  if (lower.startsWith('turma ')) return value.slice(6).trim()
  if (lower === 'turma') return ''
  return value
}
