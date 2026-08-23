import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { Sparkles, X, Loader2, Key, Bot, Send, Download, FileSpreadsheet, User } from 'lucide-react'
import { useCRM } from '@/context/CRMContext'
import {
  getGeminiApiKey,
  getGeminiModel,
  getCustomSystemPrompt,
  callGemini,
  callGeminiChat,
  ChatMessage,
} from '@/utils/geminiApi'
import { buildBusinessDataSnapshot } from '@/utils/dataSnapshot'
import { getTurmaDisplayName, Deal, Lead, Task, Transcript } from '@/types/crm'
import { CaptacaoLead } from '@/types/captacao'

const AI_BASE_RULES = `Você é o "AMOR IN IA", o assistente de dados do negócio Amor In Formaturas (fotografia de formaturas).
Responda sempre em português do Brasil, de forma direta e prática, formatando valores em Reais (R$).

REGRA MAIS IMPORTANTE — NUNCA VIOLE: use exclusivamente os dados fornecidos abaixo em "DADOS DO NEGÓCIO (ATUALIZADOS AGORA)". Nunca invente, estime ou suponha números, nomes, datas ou qualquer fato que não esteja explicitamente presente nesses dados. Se a pergunta não puder ser respondida com o que está disponível, diga claramente "não tenho esse dado disponível" em vez de arriscar um palpite.`

/**
 * Tipos de contexto suportados pelos botões inline de IA existentes
 */
export type AIContext =
  | 'dashboard-kpis'
  | 'dashboard-revenue'
  | 'dashboard-funnel'
  | 'dashboard-leadsource'
  | 'dashboard-topdeals'
  | 'dashboard-activities'
  | 'dashboard-tasks'
  | 'pipeline'
  | 'leads'
  | 'probability'
  | 'transcripts'
  | 'notes'
  | 'captacao-lista'
  | 'captacao-mapa'

export interface AIInsightsButtonProps {
  context?: AIContext
  data?: unknown
  className?: string
}

interface Suggestion {
  title: string
  body: string
}

function clamp(text: string, max = 180): string {
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : max)}…`
}

function daysSince(iso: string): number {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return 0
  return Math.floor((Date.now() - t) / 86400000)
}

function isOverdue(due: string | undefined): boolean {
  if (!due) return false
  const d = new Date(due).getTime()
  return !Number.isNaN(d) && d < Date.now()
}

/**
 * Monta o prompt contextual enviado ao Gemini pelos botões inline "IA".
 * `data`, quando informado pelo chamador, tem prioridade sobre os dados globais do CRM
 * (ex.: lista já filtrada da tela de Captação).
 */
function buildInlinePrompt(
  context: AIContext | undefined,
  crm: ReturnType<typeof useCRM>,
  data: unknown,
): string {
  const persona =
    'Você é um consultor comercial sênior de uma empresa de fotografia de formaturas. Responda em português, em no máximo 2 dicas curtas e diretas (1 frase cada), sem introdução nem saudação.'

  switch (context) {
    case 'dashboard-kpis': {
      const activeTurmas = crm.leads.filter((l) => l.status !== 'Perdido').length
      const wonTurmas = crm.leads.filter((l) => l.status === 'Convertido').length
      const totalPipelineVal = crm.deals.reduce((acc, d) => acc + (d.value || 0), 0)
      return `${persona}\nKPIs do dashboard: ${activeTurmas} turmas ativas, ${wonTurmas} convertidas, R$ ${totalPipelineVal.toLocaleString('pt-BR')} em funil. Dê dicas para melhorar esses números.`
    }
    case 'dashboard-revenue': {
      const wonValue = crm.deals
        .filter((d) => d.outcome === 'ganho')
        .reduce((acc, d) => acc + (d.value || 0), 0)
      return `${persona}\nReceita fechada no funil: R$ ${wonValue.toLocaleString('pt-BR')} em ${crm.deals.filter((d) => d.outcome === 'ganho').length} turmas ganhas. Dê dicas para acelerar a receita.`
    }
    case 'dashboard-funnel': {
      const porEstagio = crm.deals.reduce<Record<string, number>>((acc, d) => {
        const key = d.stage || d.stageId
        acc[key] = (acc[key] || 0) + 1
        return acc
      }, {})
      const resumo = Object.entries(porEstagio)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ')
      return `${persona}\nDistribuição do funil de vendas por estágio: ${resumo || 'sem oportunidades no funil'}. Aponte onde está o gargalo e o que fazer.`
    }
    case 'dashboard-leadsource': {
      const porOrigem = crm.leads.reduce<Record<string, number>>((acc, l) => {
        acc[l.source] = (acc[l.source] || 0) + 1
        return acc
      }, {})
      const resumo = Object.entries(porOrigem)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ')
      return `${persona}\nLeads por origem: ${resumo || 'sem leads registrados'}. Diga em qual canal vale a pena investir mais.`
    }
    case 'dashboard-topdeals': {
      const topDeals = [...crm.deals]
        .sort((a, b) => b.value - a.value)
        .slice(0, 5)
        .map((d) => `${d.company} (R$ ${d.value.toLocaleString('pt-BR')}, ${d.probability}% prob.)`)
        .join('; ')
      return `${persona}\nMaiores oportunidades ativas: ${topDeals || 'nenhuma oportunidade em aberto'}. Diga qual priorizar e por quê.`
    }
    case 'dashboard-activities': {
      const recentes = crm.activities
        .slice(0, 8)
        .map((a) => `${a.type}: ${a.title}`)
        .join('; ')
      return `${persona}\nAtividades recentes do CRM: ${recentes || 'sem atividades recentes'}. Diga se o ritmo de atividade está saudável e o que reforçar.`
    }
    case 'dashboard-tasks': {
      const pendentes = crm.tasks.filter((t) => !t.completed)
      const atrasadas = pendentes.filter((t) => isOverdue(t.dueDate)).length
      return `${persona}\nTarefas pendentes: ${pendentes.length}, sendo ${atrasadas} atrasadas. Dê uma dica para organizar essa fila.`
    }
    case 'pipeline': {
      const dealsList = crm.deals
        .slice(0, 8)
        .map(
          (d) =>
            `${d.company} (${d.title}): estágio ${d.stage || d.stageId}, R$ ${d.value.toLocaleString('pt-BR')}, prob. ${d.probability}%`,
        )
        .join('; ')
      return `${persona}\nPipeline de turmas: ${dealsList || 'funil vazio'}. Diga quais priorizar hoje e o argumento de fechamento.`
    }
    case 'leads': {
      const resumo = crm.leads
        .slice(0, 10)
        .map((l) => `${getTurmaDisplayName(l)}: status ${l.status}, ${l.alunosFechados || 0}/${l.totalAlunos || 0} alunos`)
        .join('; ')
      return `${persona}\nCarteira de turmas: ${resumo || 'sem turmas cadastradas'}. Aponte onde há maior potencial de expansão.`
    }
    case 'probability': {
      return `${persona}\nO CRM calcula a probabilidade de conversão com base em 4 pilares: Cobertura de Necessidades, Timing, Poder de Decisão e Valor Percebido. Dê dicas para elevar o score das turmas em negociação.`
    }
    case 'transcripts': {
      const resumo = crm.transcripts
        .slice(0, 6)
        .map((t) => `${t.title}: score ${t.geminiAnalysis?.probabilidade ?? t.probabilityScore}%, sentimento ${t.geminiAnalysis?.sentimento || 'neutro'}`)
        .join('; ')
      return `${persona}\nÚltimas reuniões analisadas: ${resumo || 'nenhuma transcrição recente'}. Dê uma orientação para melhorar a próxima abordagem comercial.`
    }
    case 'notes': {
      const resumo = crm.notes
        .slice(0, 8)
        .map((n) => `${n.type}: ${clamp(n.content, 80)}`)
        .join('; ')
      return `${persona}\nÚltimas anotações registradas: ${resumo || 'nenhuma anotação recente'}. Dê uma boa prática para não perder histórico crítico no fechamento.`
    }
    case 'captacao-lista':
    case 'captacao-mapa': {
      const leadsCaptados = Array.isArray(data) ? (data as { curso?: string; faculdade?: string; cidade?: string }[]) : []
      const porCurso = leadsCaptados.reduce<Record<string, number>>((acc, l) => {
        const key = l.curso || 'Sem curso'
        acc[key] = (acc[key] || 0) + 1
        return acc
      }, {})
      const resumo = Object.entries(porCurso)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ')
      return `${persona}\nLeads captados por curso: ${resumo || 'sem leads captados ainda'} (total ${leadsCaptados.length}). Diga onde concentrar a próxima campanha de captação.`
    }
    default:
      return `${persona}\nDê uma dica tática para acelerar as vendas e o fechamento de comissões de formatura hoje.`
  }
}

/**
 * Heurísticas locais — usadas como fallback quando a chave Gemini não está configurada
 * ou a chamada à IA falha.
 */
function buildInlineSuggestions(
  context: AIContext | undefined,
  crm: ReturnType<typeof useCRM>,
): Suggestion[] {
  if (!context) return []
  const out: Suggestion[] = []

  if (context.startsWith('dashboard')) {
    const hotLeads = crm.leads.filter((l) => l.status === 'Qualificado' || l.status === 'Agendado')
    if (hotLeads.length) {
      out.push({
        title: `${hotLeads.length} leads quentes`,
        body: clamp(
          `Você tem ${hotLeads.length} turmas em estágio avançado. Foco em fechar esses primeiro!`,
        ),
      })
    }
    const overdueTasks = crm.tasks.filter((t) => !t.completed && isOverdue(t.dueDate))
    if (overdueTasks.length) {
      out.push({
        title: `${overdueTasks.length} tarefas pendentes`,
        body: clamp(`Resolva as tarefas atrasadas para manter o pipeline fluindo.`),
      })
    }
  } else if (context === 'pipeline') {
    const topDeals = [...crm.deals].sort((a, b) => b.value - a.value).slice(0, 2)
    if (topDeals.length) {
      out.push({
        title: `Foco em ${topDeals[0].company}`,
        body: clamp(
          `Maior oportunidade no funil (R$ ${topDeals[0].value.toLocaleString('pt-BR')}). Priorize follow-up.`,
        ),
      })
    }
  } else if (context === 'transcripts') {
    const count = crm.transcripts.length
    out.push({
      title: `${count} reuniões registradas`,
      body: clamp(
        `As análises Gemini apontam as probabilidades de avanço de cada comissão em tempo real.`,
      ),
    })
  }

  if (!out.length) {
    out.push({
      title: 'Mantenha o ritmo',
      body: '80% dos fechamentos ocorrem após o 5º contato. Siga o fluxo de cadência do SDR.',
    })
  }

  return out.slice(0, 2)
}

/**
 * Componente que atua como Botão Inline (se receber props) OU Botão Flutuante Global
 */
export default function AIInsightsButton({ context, data, className = '' }: AIInsightsButtonProps) {
  const location = useLocation()
  const crm = useCRM()

  // Se context foi passado, renderiza o botão inline clássico
  const isInline = Boolean(context)

  // Estados do chat "AMOR IN IA" (modal flutuante global)
  const [globalOpen, setGlobalOpen] = useState(false)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<string | null>(null)
  const [snapshotLoading, setSnapshotLoading] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Estados para popover inline rápido
  const [inlineOpen, setInlineOpen] = useState(false)
  const [inlineAiText, setInlineAiText] = useState<string | null>(null)
  const [inlineAiLoading, setInlineAiLoading] = useState(false)
  const [inlineAiError, setInlineAiError] = useState<'sem-chave' | string | null>(null)
  const inlineFetchedRef = useRef(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const runInlineAI = useCallback(async () => {
    if (inlineFetchedRef.current || inlineAiLoading) return
    const key = getGeminiApiKey()
    if (!key) {
      setInlineAiError('sem-chave')
      return
    }
    inlineFetchedRef.current = true
    setInlineAiLoading(true)
    setInlineAiError(null)
    try {
      const prompt = buildInlinePrompt(context, crm, data)
      const res = await callGemini(prompt, key)
      setInlineAiText(res)
    } catch (err: any) {
      inlineFetchedRef.current = false
      setInlineAiError(err.message || 'Erro ao consultar Gemini.')
    } finally {
      setInlineAiLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context, data, inlineAiLoading])

  // Prompt contextual para o botão flutuante global
  const buildContextPrompt = (): { pageName: string; prompt: string } => {
    const path = location.pathname

    if (path === '/' || path === '/dashboard') {
      const activeTurmas = crm.leads.filter((l) => l.status !== 'Perdido').length
      const wonTurmas = crm.leads.filter((l) => l.status === 'Convertido').length
      const totalPipelineVal = crm.deals.reduce((acc, d) => acc + (d.value || 0), 0)
      const alunosFechados = crm.leads.reduce((acc, l) => acc + (l.alunosFechados || 0), 0)

      return {
        pageName: 'Dashboard',
        prompt: `Você é um diretor comercial e SDR experiente. Analise estes KPIs de vendas e dê 3 recomendações estratégicas diretas e acionáveis:
- Turmas Ativas: ${activeTurmas}
- Turmas Ganhas/Convertidas: ${wonTurmas}
- Valor Total no Funil: R$ ${totalPipelineVal.toLocaleString('pt-BR')}
- Alunos com Contrato Fechado: ${alunosFechados}
- Tarefas Pendentes: ${crm.tasks.filter((t) => !t.completed).length}

Responda em tópicos curtos, práticos e orientados a fechamento.`,
      }
    }

    if (path.startsWith('/pipeline')) {
      const dealsList = crm.deals
        .slice(0, 8)
        .map(
          (d) =>
            `- ${d.company} (${d.title}): Estágio ${d.stageId}, R$ ${d.value.toLocaleString('pt-BR')}, Probabilidade ${d.probability}%`,
        )
        .join('\n')

      return {
        pageName: 'Funil Amor In',
        prompt: `Você é um SDR especialista em fechamento de turmas e formaturas. Analise este pipeline e sugira quais 3 turmas devo priorizar hoje e qual argumento de fechamento usar para cada uma:
${dealsList}

Seja objetivo e tático.`,
      }
    }

    if (path.startsWith('/leads')) {
      const turmasSummary = crm.leads
        .slice(0, 10)
        .map(
          (l) =>
            `- ${getTurmaDisplayName(l)} (${l.cidade}): Status ${l.status}, ${l.alunosFechados || 0}/${l.totalAlunos || 0} alunos fechados, Valor potencial R$ ${l.potentialValue.toLocaleString('pt-BR')}`,
        )
        .join('\n')

      return {
        pageName: 'Turmas (Leads)',
        prompt: `Analise a saúde desta carteira de turmas e sugira ações práticas para acelerar a adesão dos formandos:
${turmasSummary}

Destaque onde há maior potencial de expansão e gargalos de conversão.`,
      }
    }

    if (path.startsWith('/transcricoes')) {
      const transcriptsSummary = crm.transcripts
        .slice(0, 6)
        .map(
          (t) =>
            `- ${t.title} (${t.meetingType || 'Reunião'}): Score ${t.geminiAnalysis?.probabilidade ?? t.probabilityScore}%, Sentimento ${t.geminiAnalysis?.sentimento || 'neutro'}`,
        )
        .join('\n')

      return {
        pageName: 'Transcrições',
        prompt: `Analise o histórico recente de transcrições de reuniões gravadas com as comissões de formatura e dê 2 orientações para melhorar a abordagem comercial nas próximas ligações:
${transcriptsSummary || 'Nenhuma transcrição recente registrada.'}`,
      }
    }

    if (path.startsWith('/probabilidade')) {
      return {
        pageName: 'Motor de Probabilidade',
        prompt: `Analise a calibragem da probabilidade de conversão do CRM com base nos 4 pilares (Cobertura de Necessidades, Timing, Poder de Decisão, Valor Percebido). Dê dicas para elevar o score geral das turmas em negociação.`,
      }
    }

    if (path.startsWith('/mapa-mercado')) {
      const cidades = Array.from(new Set(crm.leads.map((l) => l.cidade))).filter(Boolean)
      return {
        pageName: 'Mapa de Mercado',
        prompt: `Analise a distribuição de mercado em nossas praças ativas (${cidades.join(', ')}) e sugira onde focar prospecção ativa de novas comissões de formatura.`,
      }
    }

    if (path.startsWith('/notas')) {
      return {
        pageName: 'Notas e Anotações',
        prompt: `Dê 3 boas práticas de registro de anotações pós-reunião para o SDR não perder histórico crítico e acelerar o fechamento dos contratos.`,
      }
    }

    if (path.startsWith('/configuracoes')) {
      return {
        pageName: 'Configurações',
        prompt: `Explique sucintamente como otimizar os pesos de palavras-chave e a integração SGE ERP para obter máxima eficiência no CRM.`,
      }
    }

    if (path.startsWith('/financeiro')) {
      return {
        pageName: 'Financeiro',
        prompt: `Você é um analista financeiro sênior de uma empresa de fotografia de formaturas. Olhe os
indicadores de Total Faturado, Recebido, A Receber, Inadimplência e Contas a Pagar mostrados na tela
de Financeiro e dê uma leitura direta: a inadimplência está dentro do saudável para o setor (referência:
5-10%)? O fluxo de caixa (recebido vs a pagar) está equilibrado? Dê 3 ações práticas para melhorar o
caixa este mês. Lembre o usuário de confirmar qualquer decisão fiscal com o contador do negócio.`,
      }
    }

    if (path.startsWith('/dre')) {
      return {
        pageName: 'DRE',
        prompt: `Você é um analista financeiro sênior. Olhe o Demonstrativo de Resultado (DRE) mostrado na
tela — receita bruta, impostos, custos diretos, despesas operacionais e resultado líquido — e as margens
bruta e operacional. Aponte se as margens estão saudáveis para uma empresa de fotografia de formaturas
e onde estão os maiores ralos de despesa no período. Seja direto e prático.`,
      }
    }

    if (path.startsWith('/adesoes')) {
      return {
        pageName: 'Adesões',
        prompt: `Você é um analista comercial sênior de uma empresa de fotografia de formaturas. Olhe os
números de adesões do período mostrados na tela (quantidade, valor total, ticket médio e a variação
percentual contra o mesmo período do ano passado) e o gráfico comparativo. Diga se o ritmo de adesões
está acelerando ou desacelerando, se a variação anual é normal para a sazonalidade do setor (picos
em certas épocas do calendário acadêmico), e dê 2 ações práticas para aumentar as adesões no
próximo período.`,
      }
    }

    if (path.startsWith('/projecoes')) {
      return {
        pageName: 'Projeções',
        prompt: `Você é um analista financeiro sênior. Olhe a projeção de faturamento (tendência linear
sobre o histórico real) mostrada na tela. Comente se a tendência é de crescimento, estagnação ou queda,
considerando a sazonalidade típica do mercado de formaturas (picos em certas épocas do calendário
acadêmico), e sugira uma ação para os próximos meses.`,
      }
    }

    return {
      pageName: 'Amor In Formaturas',
      prompt: `Dê 3 recomendações táticas gerais para acelerar as vendas e o fechamento de comissões de formatura hoje.`,
    }
  }

  const handleOpenChat = async () => {
    setGlobalOpen(true)
    if (snapshot === null && !snapshotLoading) {
      setSnapshotLoading(true)
      try {
        const snap = await buildBusinessDataSnapshot({
          leads: crm.leads,
          deals: crm.deals,
          contacts: crm.contacts,
          notes: crm.notes,
          transcripts: crm.transcripts,
          tasks: crm.tasks,
        })
        setSnapshot(snap)
      } catch {
        setSnapshot('Falha ao carregar dados do negócio.')
      } finally {
        setSnapshotLoading(false)
      }
    }
  }

  const handleSendChat = async (question?: string) => {
    const text = (question ?? chatInput).trim()
    if (!text || chatLoading) return

    const key = getGeminiApiKey()
    if (!key) {
      setChatError('sem-chave')
      return
    }

    const nextMessages: ChatMessage[] = [...chatMessages, { role: 'user', content: text }]
    setChatMessages(nextMessages)
    setChatInput('')
    setChatLoading(true)
    setChatError(null)

    const customPrompt = getCustomSystemPrompt()
    const systemInstruction = `${AI_BASE_RULES}

DADOS DO NEGÓCIO (ATUALIZADOS AGORA):
${snapshot || 'Carregando dados, responda apenas se realmente já tiver o necessário acima.'}
${customPrompt ? `\nINSTRUÇÕES ADICIONAIS DO USUÁRIO:\n${customPrompt}` : ''}`

    try {
      const res = await callGeminiChat(nextMessages, systemInstruction, key, getGeminiModel())
      setChatMessages((prev) => [...prev, { role: 'model', content: res }])
    } catch (err: any) {
      setChatError(err.message || 'Erro ao consultar o Gemini.')
    } finally {
      setChatLoading(false)
    }
  }

  const handleExportChatTxt = () => {
    const lines = chatMessages.map(
      (m) => `${m.role === 'user' ? 'Você' : 'AMOR IN IA'}: ${m.content}`,
    )
    const blob = new Blob([lines.join('\n\n')], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `amor-in-ia-conversa-${Date.now()}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleExportChatCsv = () => {
    const escapeCsv = (v: string) => `"${v.replace(/"/g, '""').replace(/\n/g, ' ')}"`
    const rows = [['Autor', 'Mensagem']]
    for (const m of chatMessages) {
      rows.push([m.role === 'user' ? 'Você' : 'AMOR IN IA', m.content])
    }
    const csv = rows.map((r) => r.map(escapeCsv).join(',')).join('\n')
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `amor-in-ia-conversa-${Date.now()}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, chatLoading])

  // Se for inline, renderiza botão discreto inline
  if (isInline) {
    const suggestions = buildInlineSuggestions(context, crm)

    return (
      <div ref={wrapperRef} className={`relative inline-flex ${className}`}>
        <button
          type="button"
          onClick={() => {
            const next = !inlineOpen
            setInlineOpen(next)
            if (next) runInlineAI()
          }}
          className="group inline-flex items-center gap-1.5 h-7 px-2 rounded-[6px] border border-orange-400/20 bg-orange-500/[0.08] text-orange-300 hover:bg-orange-500/[0.16] hover:border-orange-400/40 transition-all duration-200"
          title="Sugestões rápidas de IA (Google Gemini)"
        >
          <Sparkles className="w-3.5 h-3.5 shrink-0" />
          <span className="text-[11px] font-medium whitespace-nowrap">IA</span>
        </button>

        {inlineOpen && (
          <div className="absolute right-0 top-8 z-50 w-[260px] rounded-xl border border-orange-500/30 bg-[#0e141c] p-3 shadow-2xl animate-fade-in text-xs space-y-2">
            <div className="flex items-center justify-between pb-1.5 border-b border-white/[0.06]">
              <span className="font-bold text-orange-300 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5" /> Dica Rápida
                {inlineAiText && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-300 border border-orange-500/30 font-mono normal-case">
                    Gemini
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={() => setInlineOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {inlineAiLoading && (
              <div className="py-4 flex flex-col items-center justify-center gap-2 text-slate-400">
                <Loader2 className="w-4 h-4 text-orange-400 animate-spin" />
                <span className="text-[11px]">Consultando Gemini...</span>
              </div>
            )}

            {!inlineAiLoading && inlineAiText && (
              <div className="p-2 rounded-lg bg-white/[0.02] border border-white/[0.04] whitespace-pre-wrap text-slate-300 text-[11px] leading-snug">
                {inlineAiText}
              </div>
            )}

            {!inlineAiLoading && !inlineAiText && (
              <>
                {suggestions.map((s, i) => (
                  <div key={i} className="p-2 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                    <strong className="text-orange-200 block text-[11px]">{s.title}</strong>
                    <p className="text-slate-300 text-[11px] mt-0.5 leading-snug">{s.body}</p>
                  </div>
                ))}
                {inlineAiError === 'sem-chave' && (
                  <a
                    href="/configuracoes"
                    className="flex items-center gap-1 text-[10px] font-semibold text-orange-300 hover:text-orange-200 pt-1"
                  >
                    <Key className="w-3 h-3" /> Configure sua chave Gemini para dicas geradas por IA
                  </a>
                )}
                {inlineAiError && inlineAiError !== 'sem-chave' && (
                  <p className="text-[10px] text-rose-400 pt-1">
                    Gemini indisponível agora ({inlineAiError}). Mostrando dica local.
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    )
  }

  // Caso Global: Botão Flutuante "AMOR IN IA" (chat com acesso a todos os dados do negócio)
  const { pageName, prompt: pagePrompt } = buildContextPrompt()

  return (
    <>
      <button
        type="button"
        onClick={handleOpenChat}
        title="Conversar com a AMOR IN IA sobre seus dados"
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-full bg-gradient-to-r from-orange-600 via-orange-600 to-pink-600 hover:from-orange-500 hover:to-pink-500 text-white font-bold text-xs shadow-2xl shadow-orange-500/40 hover:scale-105 active:scale-95 transition-all cursor-pointer border border-white/20"
      >
        <Sparkles className="w-4 h-4 text-yellow-300" />
        <span className="hidden sm:inline">AMOR IN IA</span>
      </button>

      {globalOpen && (
        <div
          className="fixed inset-y-0 right-0 z-50 w-full sm:w-[420px] bg-[#111820] border-l border-orange-500/30 shadow-2xl flex flex-col animate-slide-in-right"
          style={{ maxWidth: '100vw' }}
        >
            {/* Cabeçalho */}
            <div className="flex items-center justify-between p-4 border-b border-white/[0.08] shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-orange-500/15 text-orange-400 border border-orange-500/30">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                    AMOR IN IA
                    <span className="text-[10px] px-2 py-0.5 rounded bg-orange-500/20 text-orange-300 border border-orange-500/30 font-mono">
                      {getGeminiModel()}
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {snapshotLoading ? 'Carregando dados do negócio...' : 'Pergunte qualquer coisa sobre seus dados'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {chatMessages.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={handleExportChatTxt}
                      title="Exportar conversa (.txt)"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06]"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={handleExportChatCsv}
                      title="Exportar conversa como planilha (.csv)"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06]"
                    >
                      <FileSpreadsheet className="w-4 h-4" />
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setGlobalOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06]"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Mensagens */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 text-xs leading-relaxed">
              {chatMessages.length === 0 && !chatLoading && (
                <div className="space-y-3">
                  <p className="text-slate-400">
                    Pergunte qualquer coisa sobre turmas, funil, financeiro, contas a pagar, vendas e
                    adesões. As respostas são baseadas apenas nos dados reais do seu negócio — nunca
                    inventadas.
                  </p>
                  <button
                    type="button"
                    onClick={() => handleSendChat(pagePrompt)}
                    disabled={snapshotLoading}
                    className="text-[11px] font-semibold text-orange-300 hover:text-orange-200 bg-orange-500/10 border border-orange-500/20 rounded-lg px-3 py-2 disabled:opacity-50"
                  >
                    ✨ Analisar a tela atual ({pageName})
                  </button>
                </div>
              )}

              {chatMessages.map((m, i) => (
                <div key={i} className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {m.role === 'model' && (
                    <div className="w-6 h-6 rounded-full bg-orange-500/15 border border-orange-500/30 flex items-center justify-center shrink-0 text-orange-400">
                      <Bot className="w-3.5 h-3.5" />
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] rounded-xl px-3 py-2 whitespace-pre-wrap ${
                      m.role === 'user'
                        ? 'bg-orange-600 text-white'
                        : 'bg-[#0a0f14] border border-white/[0.06] text-slate-200'
                    }`}
                  >
                    {m.content}
                  </div>
                  {m.role === 'user' && (
                    <div className="w-6 h-6 rounded-full bg-white/[0.08] flex items-center justify-center shrink-0 text-slate-300">
                      <User className="w-3.5 h-3.5" />
                    </div>
                  )}
                </div>
              ))}

              {chatLoading && (
                <div className="flex items-center gap-2 text-slate-400">
                  <Loader2 className="w-4 h-4 text-orange-400 animate-spin" />
                  <span>AMOR IN IA está consultando os dados...</span>
                </div>
              )}

              {chatError === 'sem-chave' && (
                <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 space-y-2">
                  <div className="font-semibold">Configure sua chave Gemini para habilitar a IA.</div>
                  <a
                    href="/configuracoes"
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-white bg-rose-600 hover:bg-rose-500 px-3 py-1.5 rounded-lg"
                  >
                    <Key className="w-3.5 h-3.5" /> Ir para Configurações e Salvar Chave
                  </a>
                </div>
              )}
              {chatError && chatError !== 'sem-chave' && (
                <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 font-semibold">
                  {chatError}
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Campo de entrada */}
            <div className="p-3 border-t border-white/[0.08] shrink-0">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendChat()}
                  placeholder="Pergunte algo sobre seus dados..."
                  disabled={chatLoading || snapshotLoading}
                  className="flex-1 bg-[#0a0f14] border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-orange-500/50 disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => handleSendChat()}
                  disabled={chatLoading || snapshotLoading || !chatInput.trim()}
                  className="p-2.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white disabled:opacity-40 disabled:hover:bg-orange-600"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
      )}
    </>
  )
}


