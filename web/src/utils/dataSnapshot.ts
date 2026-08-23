// Monta um retrato completo e atualizado do negócio para ancorar as respostas da IA em dados
// reais do banco (nunca inventados). Combina o CRM já carregado em memória com uma consulta
// direta ao Supabase para os números financeiros/SGE, que não ficam no contexto do CRM.
import { supabase } from '@/lib/supabase/client'
import { Lead, Deal, Contact, Note, CallTranscript, Task, getTurmaDisplayName } from '@/types/crm'

function fmtBRL(v: number): string {
  return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function sumBy<T>(items: T[], key: (i: T) => number): number {
  return items.reduce((acc, i) => acc + (key(i) || 0), 0)
}

function groupSumBy<T>(items: T[], group: (i: T) => string, value: (i: T) => number): string {
  const map = new Map<string, number>()
  for (const it of items) {
    const k = group(it) || 'Sem categoria'
    map.set(k, (map.get(k) || 0) + (value(it) || 0))
  }
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `  - ${k}: ${fmtBRL(v)}`)
    .join('\n')
}

interface CrmSnapshotInput {
  leads: Lead[]
  deals: Deal[]
  contacts: Contact[]
  notes: Note[]
  transcripts: CallTranscript[]
  tasks: Task[]
}

/**
 * Busca os dados financeiros/SGE direto do Supabase (não estão carregados no CRMContext)
 * e devolve um bloco de texto já agregado (somas e contagens reais, sem dumpar linha a linha).
 */
async function buildFinanceiroSnapshot(): Promise<string> {
  // Tabelas fora do type gerado do Supabase (schema legado do dashboard) — cast necessário.
  const db = supabase as any
  const [pagamentosRes, contasPagarRes, vendasRes, adesoesRes] = await Promise.all([
    db.from('pagamentos').select('valor, valor_pago, status, data_vencimento'),
    db.from('contas_pagar').select('valor, categoria, fornecedor, status, data_vencimento'),
    db.from('vendas').select('valor_total, status, data_venda'),
    db.from('sge_adesoes').select('valor, status, data_adesao'),
  ])

  const pagamentos = (pagamentosRes.data as any[]) || []
  const contasPagar = (contasPagarRes.data as any[]) || []
  const vendas = (vendasRes.data as any[]) || []
  const adesoes = (adesoesRes.data as any[]) || []

  const totalReceber = sumBy(pagamentos, (p) => p.valor)
  const totalRecebido = sumBy(pagamentos, (p) => p.valor_pago)
  const totalPendente = sumBy(
    pagamentos.filter((p) => p.status !== 'pago'),
    (p) => p.valor - (p.valor_pago || 0),
  )
  const hoje = new Date()
  const totalAtraso = sumBy(
    pagamentos.filter((p) => p.status !== 'pago' && new Date(p.data_vencimento) < hoje),
    (p) => p.valor - (p.valor_pago || 0),
  )

  const totalContasPagar = sumBy(contasPagar, (c) => c.valor)
  const totalContasPagarPendente = sumBy(
    contasPagar.filter((c) => c.status !== 'pago'),
    (c) => c.valor,
  )

  const totalVendas = sumBy(vendas, (v) => v.valor_total)
  const totalAdesoes = sumBy(adesoes, (a) => a.valor)

  return `## Financeiro (fonte: Supabase, dados exatos consultados agora)
- Total a receber (parcelas/pagamentos): ${fmtBRL(totalReceber)} (${pagamentos.length} lançamentos)
- Total já recebido: ${fmtBRL(totalRecebido)}
- Total pendente (não pago): ${fmtBRL(totalPendente)}
- Total em atraso (vencido e não pago): ${fmtBRL(totalAtraso)}
- Total de contas a pagar: ${fmtBRL(totalContasPagar)} (${contasPagar.length} lançamentos), sendo ${fmtBRL(totalContasPagarPendente)} ainda pendente
- Total de vendas registradas (SGE): ${fmtBRL(totalVendas)} (${vendas.length} vendas)
- Total de adesões registradas (SGE): ${fmtBRL(totalAdesoes)} (${adesoes.length} adesões)

### Contas a pagar por categoria (total, todas as datas):
${groupSumBy(contasPagar, (c) => c.categoria, (c) => c.valor) || '  - sem lançamentos'}

### Contas a pagar por fornecedor (top, total):
${groupSumBy(contasPagar, (c) => c.fornecedor, (c) => c.valor)
  .split('\n')
  .slice(0, 10)
  .join('\n') || '  - sem lançamentos'}`
}

function buildCrmSnapshot({ leads, deals, contacts, notes, transcripts, tasks }: CrmSnapshotInput): string {
  const dealByLead = new Map(deals.map((d) => [d.leadId, d]))

  const turmasLines = leads
    .map((l) => {
      const deal = l.id ? dealByLead.get(l.id) : undefined
      return `  - ${getTurmaDisplayName(l)} | ${l.faculdade || '?'} / ${l.curso || '?'} / ${l.cidade || '?'} | status: ${l.status} | alunos fechados: ${l.alunosFechados || 0}/${l.totalAlunos || 0} | valor potencial: ${fmtBRL(l.potentialValue || 0)}${deal ? ` | funil: ${deal.stage || deal.stageId} (${fmtBRL(deal.value || 0)})` : ' | sem oportunidade no funil'}`
    })
    .join('\n')

  const dealsAbertos = deals.filter((d) => !d.outcome)
  const dealsGanhos = deals.filter((d) => d.outcome === 'ganho')
  const dealsPerdidos = deals.filter((d) => d.outcome === 'perdido')
  const valorFunilAberto = sumBy(dealsAbertos, (d) => d.value)
  const valorGanho = sumBy(dealsGanhos, (d) => d.value)

  const tarefasPendentes = tasks.filter((t) => !t.completed)

  return `## CRM / Turmas (${leads.length} turmas cadastradas)
${turmasLines || '  - nenhuma turma cadastrada'}

## Funil de Vendas
- Oportunidades abertas: ${dealsAbertos.length}, valor total em aberto: ${fmtBRL(valorFunilAberto)}
- Oportunidades ganhas: ${dealsGanhos.length}, valor total ganho: ${fmtBRL(valorGanho)}
- Oportunidades perdidas: ${dealsPerdidos.length}

## Tarefas
- Pendentes: ${tarefasPendentes.length} (${tarefasPendentes.map((t) => t.title).slice(0, 15).join('; ') || 'nenhuma'})

## Contatos
- Total de contatos cadastrados: ${contacts.length}

## Notas registradas
- Total: ${notes.length}

## Transcrições de reuniões analisadas
- Total: ${transcripts.length}, ${transcripts.filter((t) => t.geminiAnalysis).length} já analisadas por IA`
}

/**
 * Monta o snapshot completo (CRM + financeiro) usado como base factual para o chat "AMOR IN IA".
 * Sempre busca o financeiro fresco do Supabase; o CRM vem do contexto já carregado (evita duplicar rede).
 */
export async function buildBusinessDataSnapshot(crm: CrmSnapshotInput): Promise<string> {
  let financeiro = '## Financeiro\n  - Não foi possível carregar os dados financeiros agora.'
  try {
    financeiro = await buildFinanceiroSnapshot()
  } catch (e) {
    console.error('Erro ao buscar snapshot financeiro:', e)
  }
  const crmSnapshot = buildCrmSnapshot(crm)
  return `${crmSnapshot}\n\n${financeiro}`
}
