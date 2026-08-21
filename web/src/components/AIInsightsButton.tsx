import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { Sparkles, X, Loader2, Key, Bot } from 'lucide-react'
import { useCRM } from '@/context/CRMContext'
import { getGeminiApiKey, callGemini } from '@/utils/geminiApi'
import { getTurmaDisplayName, Deal, Lead, Task, Transcript } from '@/types/crm'
import { CaptacaoLead } from '@/types/captacao'

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
 * Heurísticas locais rápidas para botões de contexto inline
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

  // Estados para modal flutuante global Gemini
  const [globalOpen, setGlobalOpen] = useState(false)
  const [globalLoading, setGlobalLoading] = useState(false)
  const [globalResponse, setGlobalResponse] = useState<string | null>(null)
  const [globalError, setGlobalError] = useState<string | null>(null)

  // Estados para popover inline rápido
  const [inlineOpen, setInlineOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

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

  const handleRunGlobalAI = async () => {
    const key = getGeminiApiKey()
    if (!key) {
      setGlobalError('Configure sua chave Gemini em Configurações para habilitar a IA.')
      setGlobalOpen(true)
      return
    }

    setGlobalOpen(true)
    setGlobalLoading(true)
    setGlobalError(null)
    setGlobalResponse(null)

    const { prompt } = buildContextPrompt()

    try {
      const res = await callGemini(prompt, key)
      setGlobalResponse(res)
    } catch (err: any) {
      setGlobalError(err.message || 'Erro ao consultar Gemini API.')
    } finally {
      setGlobalLoading(false)
    }
  }

  // Se for inline, renderiza botão discreto inline
  if (isInline) {
    const suggestions = buildInlineSuggestions(context, crm)

    return (
      <div ref={wrapperRef} className={`relative inline-flex ${className}`}>
        <button
          type="button"
          onClick={() => setInlineOpen(!inlineOpen)}
          className="group inline-flex items-center gap-1.5 h-7 px-2 rounded-[6px] border border-orange-400/20 bg-orange-500/[0.08] text-orange-300 hover:bg-orange-500/[0.16] hover:border-orange-400/40 transition-all duration-200"
          title="Sugestões rápidas de IA"
        >
          <Sparkles className="w-3.5 h-3.5 shrink-0" />
          <span className="text-[11px] font-medium whitespace-nowrap">IA</span>
        </button>

        {inlineOpen && (
          <div className="absolute right-0 top-8 z-50 w-[260px] rounded-xl border border-orange-500/30 bg-[#0e141c] p-3 shadow-2xl animate-fade-in text-xs space-y-2">
            <div className="flex items-center justify-between pb-1.5 border-b border-white/[0.06]">
              <span className="font-bold text-orange-300 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5" /> Dica Rápida
              </span>
              <button
                type="button"
                onClick={() => setInlineOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            {suggestions.map((s, i) => (
              <div key={i} className="p-2 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                <strong className="text-orange-200 block text-[11px]">{s.title}</strong>
                <p className="text-slate-300 text-[11px] mt-0.5 leading-snug">{s.body}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // Caso Global: Botão Flutuante
  const { pageName } = buildContextPrompt()

  return (
    <>
      <button
        type="button"
        onClick={handleRunGlobalAI}
        title="Analisar esta tela com IA (Google Gemini)"
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-full bg-gradient-to-r from-orange-600 via-orange-600 to-pink-600 hover:from-orange-500 hover:to-pink-500 text-white font-bold text-xs shadow-2xl shadow-orange-500/40 hover:scale-105 active:scale-95 transition-all cursor-pointer border border-white/20"
      >
        <Sparkles className="w-4 h-4 text-yellow-300" />
        <span className="hidden sm:inline">Analisar com IA</span>
      </button>

      {globalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-lg bg-[#111820] border border-orange-500/30 rounded-2xl shadow-2xl p-5 space-y-4 max-h-[85vh] overflow-y-auto animate-scale-in">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-orange-500/15 text-orange-400 border border-orange-500/30">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                    Insights IA — {pageName}
                    <span className="text-[10px] px-2 py-0.5 rounded bg-orange-500/20 text-orange-300 border border-orange-500/30 font-mono">
                      gemini-1.5-flash
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400">Análise contextual em tempo real</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setGlobalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-xs leading-relaxed text-slate-200">
              {globalLoading && (
                <div className="py-8 flex flex-col items-center justify-center gap-3 text-slate-400">
                  <Loader2 className="w-7 h-7 text-orange-400 animate-spin" />
                  <span>Consultando Gemini 1.5 Flash...</span>
                </div>
              )}

              {globalError && (
                <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 space-y-2">
                  <div className="font-semibold">{globalError}</div>
                  {!getGeminiApiKey() && (
                    <a
                      href="/configuracoes"
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-white bg-rose-600 hover:bg-rose-500 px-3 py-1.5 rounded-lg mt-1"
                    >
                      <Key className="w-3.5 h-3.5" /> Ir para Configurações e Salvar Chave
                    </a>
                  )}
                </div>
              )}

              {globalResponse && (
                <div className="space-y-3 bg-[#0a0f14] p-4 rounded-xl border border-white/[0.06] whitespace-pre-wrap font-sans text-slate-200">
                  {globalResponse}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-white/[0.08] text-[11px] text-slate-500">
              <span>Google Gemini AI</span>
              <button
                type="button"
                onClick={() => setGlobalOpen(false)}
                className="px-3 py-1.5 bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 font-semibold rounded-lg text-xs"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
