// Métricas comerciais do Painel Comercial. Só usa o que o CRM tem de forma
// confiável hoje: estado atual do funil (turmas.funil_status / deals.stage /
// deals.outcome), probabilidade do motor, alunos fechados (SGE) e a data de
// fechamento do contrato quando existe. Histórico de transições de estágio
// (stage_transitions) é quase inexistente, então NÃO baseamos ciclo/tempo por
// estágio nele — deixamos claro quando um número tem cobertura parcial.

import type { Deal, Lead, FunilEvento } from '@/types/crm'
import { FUNNEL_STAGES } from '@/types/crm'

export interface Periodo {
  ini: string // YYYY-MM-DD
  fim: string // YYYY-MM-DD
}

const norm = (s?: string | null) =>
  (s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

/** Nome do responsável comercial de uma turma (closer, senão SDR). */
export function responsavelDaTurma(l: Lead): string {
  return (l.closer || l.sdr || '').trim() || 'Sem responsável'
}

/** Uma turma está "em atendimento" se não foi ganha, perdida nem já formou. */
export function turmaEmAtendimento(l: Lead): boolean {
  if (l.concluida) return false
  const st = norm(l.status)
  return st !== 'convertido' && st !== 'perdido'
}

/** Data em que o contrato foi fechado, quando registrada (Notion). */
export function dataFechamento(l: Lead): string | null {
  const raw = (l.dataFechamento || '').trim()
  if (!raw) return null
  if (raw.includes('/')) {
    const [d, m, y] = raw.split('/')
    if (d && m && y) return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  return raw.slice(0, 10)
}

function dentro(d: string | null, p: Periodo): boolean {
  return !!d && d >= p.ini && d <= p.fim
}

// ---------------------------------------------------------------------------
// Funil (fotografia atual)
// ---------------------------------------------------------------------------

export interface EstagioResumo {
  id: string
  nome: string
  cor: string
  turmas: number
  alunos: number
  probMedia: number
}

/** Distribuição das turmas EM ATENDIMENTO pelos estágios do funil (stage-1..5). */
export function funilAberto(leads: Lead[], deals: Deal[]): EstagioResumo[] {
  const dealByLead = new Map(deals.map((d) => [d.leadId, d]))
  const base = FUNNEL_STAGES.filter((s) => s.id !== 'stage-6').map((s) => ({
    id: s.id,
    nome: s.name,
    cor: s.color,
    turmas: 0,
    alunos: 0,
    probMedia: 0,
    _probSoma: 0,
  }))
  const byId = new Map(base.map((b) => [b.id, b]))
  for (const l of leads) {
    if (!turmaEmAtendimento(l)) continue
    const d = dealByLead.get(l.id)
    const stageId = d?.stageId && d.stageId !== 'stage-6' ? d.stageId : 'stage-1'
    const b = byId.get(stageId) || byId.get('stage-1')!
    b.turmas += 1
    b.alunos += l.totalAlunos || 0
    b._probSoma += d?.probability ?? 0
  }
  return base.map(({ _probSoma, ...b }) => ({
    ...b,
    probMedia: b.turmas > 0 ? Math.round(_probSoma / b.turmas) : 0,
  }))
}

// ---------------------------------------------------------------------------
// Desfechos (win rate)
// ---------------------------------------------------------------------------

export interface Desfechos {
  ganhasHistorico: number
  perdidasHistorico: number
  winRateHistorico: number // %
  ganhasNoPeriodo: number
  perdidasNoPeriodo: number
  winRateNoPeriodo: number | null // null quando não há desfecho datado no período
  coberturaDatas: number // % das turmas ganhas que têm data de fechamento
}

export function desfechos(leads: Lead[], periodo: Periodo): Desfechos {
  let ganhasHistorico = 0
  let perdidasHistorico = 0
  let ganhasComData = 0
  let ganhasNoPeriodo = 0
  let perdidasNoPeriodo = 0

  for (const l of leads) {
    const st = norm(l.status)
    const fech = dataFechamento(l)
    if (st === 'convertido') {
      ganhasHistorico += 1
      if (fech) ganhasComData += 1
      if (dentro(fech, periodo)) ganhasNoPeriodo += 1
    } else if (st === 'perdido') {
      perdidasHistorico += 1
      // perda raramente tem data — usamos updatedAt como aproximação
      const dPerda = (l.updatedAt || '').slice(0, 10) || null
      if (dentro(dPerda, periodo)) perdidasNoPeriodo += 1
    }
  }

  const totHist = ganhasHistorico + perdidasHistorico
  const totPer = ganhasNoPeriodo + perdidasNoPeriodo
  return {
    ganhasHistorico,
    perdidasHistorico,
    winRateHistorico: totHist > 0 ? (ganhasHistorico / totHist) * 100 : 0,
    ganhasNoPeriodo,
    perdidasNoPeriodo,
    winRateNoPeriodo: totPer > 0 ? (ganhasNoPeriodo / totPer) * 100 : null,
    coberturaDatas: ganhasHistorico > 0 ? (ganhasComData / ganhasHistorico) * 100 : 0,
  }
}

// ---------------------------------------------------------------------------
// Alunos fechados no período (via data de fechamento do contrato da turma)
// ---------------------------------------------------------------------------

export function alunosFechadosNoPeriodo(leads: Lead[], periodo: Periodo): {
  alunos: number
  turmas: number
  semData: number
} {
  let alunos = 0
  let turmas = 0
  let semData = 0
  for (const l of leads) {
    if (norm(l.status) !== 'convertido') continue
    const n = l.alunosFechados || 0
    const fech = dataFechamento(l)
    if (!fech) {
      semData += 1
      continue
    }
    if (dentro(fech, periodo)) {
      alunos += n
      turmas += 1
    }
  }
  return { alunos, turmas, semData }
}

// ---------------------------------------------------------------------------
// Rankings
// ---------------------------------------------------------------------------

export interface LinhaRanking {
  chave: string
  emAtendimento: number
  ganhas: number
  perdidas: number
  winRate: number // %
  probMedia: number // média da probabilidade do motor das turmas em atendimento
  alunosFechados: number
  totalAlunos: number
  penetracao: number // alunos fechados / total de alunos das turmas ganhas (%)
}

function agrupar(
  leads: Lead[],
  deals: Deal[],
  chaveDe: (l: Lead) => string,
): LinhaRanking[] {
  const dealByLead = new Map(deals.map((d) => [d.leadId, d]))
  const map = new Map<
    string,
    { emAt: number; ganhas: number; perdidas: number; probSoma: number; probN: number; fech: number; totAlunosGanhas: number }
  >()
  for (const l of leads) {
    const k = chaveDe(l) || '—'
    const e = map.get(k) || {
      emAt: 0,
      ganhas: 0,
      perdidas: 0,
      probSoma: 0,
      probN: 0,
      fech: 0,
      totAlunosGanhas: 0,
    }
    const st = norm(l.status)
    if (turmaEmAtendimento(l)) {
      e.emAt += 1
      const d = dealByLead.get(l.id)
      if (d) {
        e.probSoma += d.probability ?? 0
        e.probN += 1
      }
    }
    if (st === 'convertido') {
      e.ganhas += 1
      e.fech += l.alunosFechados || 0
      e.totAlunosGanhas += l.totalAlunos || 0
    } else if (st === 'perdido') {
      e.perdidas += 1
    }
    map.set(k, e)
  }
  const semResp = (c: string) => /sem respons|^—$/i.test(c)
  return Array.from(map.entries())
    .map(([chave, e]) => {
      const tot = e.ganhas + e.perdidas
      return {
        chave,
        emAtendimento: e.emAt,
        ganhas: e.ganhas,
        perdidas: e.perdidas,
        winRate: tot > 0 ? (e.ganhas / tot) * 100 : 0,
        probMedia: e.probN > 0 ? Math.round(e.probSoma / e.probN) : 0,
        alunosFechados: e.fech,
        totalAlunos: e.totAlunosGanhas,
        penetracao: e.totAlunosGanhas > 0 ? (e.fech / e.totAlunosGanhas) * 100 : 0,
      }
    })
    // "Sem responsável" / "—" sempre no fim, não importa o volume.
    .sort((a, b) => {
      const sa = semResp(a.chave) ? 1 : 0
      const sb = semResp(b.chave) ? 1 : 0
      if (sa !== sb) return sa - sb
      return b.ganhas - a.ganhas || b.emAtendimento - a.emAtendimento
    })
}

/** % das turmas (com desfecho ou em atendimento) que não têm responsável cadastrado. */
export function pctSemResponsavel(leads: Lead[]): number {
  if (leads.length === 0) return 0
  const sem = leads.filter((l) => !(l.closer || l.sdr || '').trim()).length
  return (sem / leads.length) * 100
}

export const rankingPorResponsavel = (leads: Lead[], deals: Deal[]) =>
  agrupar(leads, deals, responsavelDaTurma)
export const rankingPorFaculdade = (leads: Lead[], deals: Deal[]) =>
  agrupar(leads, deals, (l) => l.faculdade || '—')
export const rankingPorCurso = (leads: Lead[], deals: Deal[]) =>
  agrupar(leads, deals, (l) => l.curso || '—')

// ---------------------------------------------------------------------------
// Motivos de perda
// ---------------------------------------------------------------------------

export function motivosDePerda(
  leads: Lead[],
  deals: Deal[],
  funilEventos: FunilEvento[],
): { motivo: string; n: number }[] {
  const cont = new Map<string, number>()
  const add = (m?: string | null) => {
    const t = (m || '').trim()
    if (!t) return
    cont.set(t, (cont.get(t) || 0) + 1)
  }
  const idsPerdidas = new Set(leads.filter((l) => norm(l.status) === 'perdido').map((l) => l.id))
  for (const d of deals) if (d.outcome === 'perdido' || (d.leadId && idsPerdidas.has(d.leadId))) add(d.lostReason)
  for (const ev of funilEventos) if (ev.outcome === 'perdido') add(ev.motivoPerda)
  return Array.from(cont.entries())
    .map(([motivo, n]) => ({ motivo, n }))
    .sort((a, b) => b.n - a.n)
}

// ---------------------------------------------------------------------------
// Forecast ponderado do funil aberto
// ---------------------------------------------------------------------------

export function forecastPonderado(deals: Deal[]): {
  valorBruto: number
  valorPonderado: number
  comValor: number
  semValor: number
} {
  let valorBruto = 0
  let valorPonderado = 0
  let comValor = 0
  let semValor = 0
  for (const d of deals) {
    if ((d.stageId || 'stage-1') === 'stage-6') continue
    const v = d.value || 0
    if (v > 0) {
      comValor += 1
      valorBruto += v
      valorPonderado += v * ((d.probability ?? 0) / 100)
    } else {
      semValor += 1
    }
  }
  return { valorBruto, valorPonderado, comValor, semValor }
}
