// Métricas de conversão das mensagens de WhatsApp: qual mensagem (roteiro) que
// enviamos aparece mais nas turmas que fecharam. Sem IA — só agrupa o texto de
// saída e cruza com o desfecho do funil. Agregável por mês/trimestre/semestre/ano.
import type { ConversaMsg } from '@/utils/conversas'
import type { Deal } from '@/types/crm'

export type Periodo = 'mes' | 'trimestre' | 'semestre' | 'ano'

const norm = (s: string) =>
  (s || '').toLowerCase().replace(/\s+/g, ' ').trim()

/** Rótulo do balde de período a que uma data pertence, ex "2026-T3", "2026-S1". */
export function baldePeriodo(iso: string, p: Periodo): string {
  const d = new Date(iso)
  const y = d.getFullYear()
  const m = d.getMonth() // 0-11
  if (p === 'ano') return String(y)
  if (p === 'semestre') return `${y}-S${m < 6 ? 1 : 2}`
  if (p === 'trimestre') return `${y}-T${Math.floor(m / 3) + 1}`
  return `${y}-${String(m + 1).padStart(2, '0')}`
}

export interface RoteiroMetrica {
  roteiro: string // trecho representativo da mensagem
  amostraTurmas: number // turmas distintas que receberam esse roteiro
  turmasFechadas: number
  taxaConversao: number // 0..1
  totalEnvios: number
}

interface Opts {
  periodo: Periodo
  balde?: string // se definido, só mensagens desse balde
  stageId?: string // se definido, só turmas nessa fase atual
  minChars?: number // ignora mensagens curtas (ex "ok", "bom dia")
}

/**
 * Agrupa as mensagens que NÓS enviamos por roteiro (primeiros ~80 chars
 * normalizados) e calcula a taxa de conversão das turmas que receberam.
 */
export function metricasRoteiros(
  msgs: ConversaMsg[],
  deals: Deal[],
  opts: Opts,
): RoteiroMetrica[] {
  const min = opts.minChars ?? 25
  const dealPorTurma = new Map<string, Deal>()
  for (const d of deals) if (d.leadId) dealPorTurma.set(d.leadId, d)

  const grupos = new Map<
    string,
    { exemplo: string; turmas: Set<string>; fechadas: Set<string>; envios: number }
  >()

  for (const m of msgs) {
    if (!m.deMim || !m.turmaId) continue
    const texto = (m.texto || '').trim()
    if (texto.length < min) continue
    if (opts.balde && baldePeriodo(m.enviadaEm, opts.periodo) !== opts.balde) continue

    const deal = dealPorTurma.get(m.turmaId)
    if (opts.stageId && deal?.stageId !== opts.stageId) continue

    const chave = norm(texto).slice(0, 80)
    if (!chave) continue
    let g = grupos.get(chave)
    if (!g) {
      g = { exemplo: texto.slice(0, 160), turmas: new Set(), fechadas: new Set(), envios: 0 }
      grupos.set(chave, g)
    }
    g.envios++
    g.turmas.add(m.turmaId)
    if (deal?.outcome === 'ganho') g.fechadas.add(m.turmaId)
  }

  return [...grupos.values()]
    .map((g) => ({
      roteiro: g.exemplo,
      amostraTurmas: g.turmas.size,
      turmasFechadas: g.fechadas.size,
      taxaConversao: g.turmas.size ? g.fechadas.size / g.turmas.size : 0,
      totalEnvios: g.envios,
    }))
    .filter((r) => r.amostraTurmas >= 1)
    .sort((a, b) => b.taxaConversao - a.taxaConversao || b.amostraTurmas - a.amostraTurmas)
}

/** Lista de baldes de período presentes nas mensagens, mais recente primeiro. */
export function baldesDisponiveis(msgs: ConversaMsg[], p: Periodo): string[] {
  const set = new Set<string>()
  for (const m of msgs) set.add(baldePeriodo(m.enviadaEm, p))
  return [...set].sort().reverse()
}
