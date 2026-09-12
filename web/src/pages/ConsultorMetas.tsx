import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bot, Send, Loader2, User, Sparkles, Key, BookOpen, Check, X } from 'lucide-react'
import { useCRM } from '@/context/CRMContext'
import { useToast } from '@/hooks/use-toast'
import { useFinanceiroDashboard } from '@/hooks/useFinanceiroDashboard'
import { useMetasNegocio, type MetricaMeta } from '@/hooks/useMetasNegocio'
import { useMetasChat } from '@/hooks/useMetasChat'
import { useConhecimentoEmpresa, type PeriodoTipoConhecimento } from '@/hooks/useConhecimentoEmpresa'
import { useEscolasVisitadas } from '@/hooks/useEscolasVisitadas'
import { pontosComerciais, rankingPorResponsavel } from '@/utils/comercialMetrics'
import type { PontoDiario } from '@/utils/pace'
import { buildMetasSnapshot } from '@/utils/metasSnapshot'
import { callGemini, callGeminiChat, getCustomSystemPrompt, getGeminiApiKey, getGeminiModel } from '@/utils/geminiApi'

const HOJE = new Date().toISOString().slice(0, 10)

// Persona fixa desse chat — diferente do "AMOR IN IA" flutuante (que cobre o negócio inteiro),
// aqui é só metas/estratégia, com uma postura de consultoria sênior que sempre questiona e
// pergunta de volta em vez de só recomendar às cegas.
const PERSONA = `Você é um conselho formado pelas melhores mentes de gestão comercial e growth do mercado mundial, atuando junto como consultoria estratégica sênior da Amor In Formaturas.

Contexto do negócio: a Amor In Formaturas presta SERVIÇOS de fotografia de formaturas (não vende produto nem tem estoque) — o ciclo de venda é longo (meses de negociação por turma) e a entrega acontece ao longo de meses/anos até a formatura. Trate tudo com essa lógica de serviço, nunca como venda transacional de produto.

Definições financeiras que você NUNCA pode confundir:
- "Adesão" = um aluno/formando (ou responsável) assinando o contrato de uma turma, entrando num plano de pagamento que será parcelado ao longo de vários meses/anos. O VALOR de uma adesão é o valor total do contrato daquele aluno (parecido com VGV — venda em competência), NÃO é faturamento daquele mês.
- "Faturamento/Receita real" = SOMENTE as entradas de caixa de verdade (parcelas efetivamente pagas, pela data de pagamento) — é isso que os cards de "Receita" e "Resultado líquido" mostram.
- Nunca some ou trate valor de adesões como se fosse receita/faturamento do período — são conceitos diferentes (venda assinada vs. dinheiro que já entrou). Se alguém confundir isso na conversa, corrija educadamente.

Seu jeito de trabalhar, sempre:
1. Nunca responda só com uma recomendação seca. Faça pelo menos uma pergunta de volta pra entender o contexto completo antes de aconselhar às cegas.
2. Questione decisões e trade-offs em vez de só concordar — se algo parecer arriscado, incompleto ou na contramão da melhor prática de mercado, diga isso claramente.
3. Seja comunicativa: converse, não solte um relatório frio.
4. Baseie-se SEMPRE nos dados reais fornecidos abaixo (metas, pace, ranking, conhecimento já registrado da empresa). Nunca invente número, nome, decisão ou fato que não esteja explicitamente ali — se faltar dado pra responder algo, diga que falta e pergunte pelo dado.
5. Responda em português do Brasil.
6. Convenção de trimestre do sistema: T1-T4. Se o usuário usar "Q1"-"Q4" (inglês), trate como sinônimo.`

const PERIODOS_CONHECIMENTO: { value: PeriodoTipoConhecimento; label: string }[] = [
  { value: 'geral', label: 'Geral (sem período)' },
  { value: 'mensal', label: 'Mensal' },
  { value: 'trimestral', label: 'Trimestral' },
  { value: 'semestral', label: 'Semestral' },
  { value: 'anual', label: 'Anual' },
]

interface PropostaConhecimento {
  ano: number | null
  periodoTipo: PeriodoTipoConhecimento
  periodoValor: number | null
  titulo: string
  conteudo: string
  /** Título exato de um registro já existente que a IA julga ser sobre o mesmo assunto (mesmo
   * com título diferente) — dispara o aviso de conflito na revisão, pra decidir manualmente
   * qual prevalece em vez de duplicar silenciosamente. */
  possivelDuplicataDe: string | null
}

function extrairJson(texto: string): PropostaConhecimento[] {
  const limpo = texto.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '')
  const arr = JSON.parse(limpo)
  if (!Array.isArray(arr)) throw new Error('Formato inesperado')
  return arr.map((x: any) => ({
    ano: x.ano ?? null,
    periodoTipo: x.periodoTipo || 'geral',
    periodoValor: x.periodoValor ?? null,
    titulo: String(x.titulo || '').slice(0, 120),
    conteudo: String(x.conteudo || ''),
    possivelDuplicataDe: x.possivelDuplicataDe ? String(x.possivelDuplicataDe) : null,
  }))
}

export default function ConsultorMetas() {
  const { toast } = useToast()
  const { leads = [], deals = [] } = useCRM()
  const { pontosDiarios } = useFinanceiroDashboard(HOJE, HOJE, [])
  const { metas } = useMetasNegocio()
  const { visitas } = useEscolasVisitadas()
  const { registros: conhecimento, salvar: salvarConhecimento } = useConhecimentoEmpresa()
  const { mensagens, loading: carregandoHistorico, enviar } = useMetasChat()

  const [input, setInput] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [organizando, setOrganizando] = useState(false)
  const [propostas, setPropostas] = useState<PropostaConhecimento[] | null>(null)
  const [salvandoIdx, setSalvandoIdx] = useState<number | null>(null)
  const fimRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensagens.length])

  const pontosPorMetrica = useMemo<Partial<Record<MetricaMeta, PontoDiario[]>>>(
    () => ({
      receita: pontosDiarios('receita'),
      adesoes: pontosDiarios('adesoes'),
      resultado_liquido: pontosDiarios('resultado'),
      contratos: pontosComerciais(leads, 'contratos'),
      alunos: pontosComerciais(leads, 'alunos'),
      vgv: pontosComerciais(leads, 'vgv'),
      escolas_visitadas: visitas.map((v) => ({ data: v.data, valor: 1 })),
    }),
    [pontosDiarios, leads, visitas],
  )
  const ranking = useMemo(() => rankingPorResponsavel(leads, deals), [leads, deals])

  async function handleEnviar(textoForcado?: string) {
    const texto = (textoForcado ?? input).trim()
    if (!texto || enviando) return
    const key = getGeminiApiKey()
    if (!key) {
      setErro('sem-chave')
      return
    }
    setEnviando(true)
    setErro(null)
    setInput('')
    try {
      const msgUsuario = await enviar('user', texto)
      const snapshot = buildMetasSnapshot({ metas, pontosPorMetrica, ranking, conhecimento })
      const customPrompt = getCustomSystemPrompt()
      const systemInstruction = `${PERSONA}\n\nDADOS REAIS DA EMPRESA (atualizados agora):\n${snapshot}${
        customPrompt ? `\n\nINSTRUÇÕES ADICIONAIS DO ADMIN:\n${customPrompt}` : ''
      }`
      const historico = [...mensagens, msgUsuario].map((m) => ({ role: m.role, content: m.conteudo }))
      const resposta = await callGeminiChat(historico, systemInstruction, key, getGeminiModel())
      await enviar('model', resposta)
    } catch (err: any) {
      setErro(err?.message || 'Erro ao consultar o Gemini.')
    } finally {
      setEnviando(false)
    }
  }

  async function handleOrganizar() {
    if (mensagens.length === 0) return
    const key = getGeminiApiKey()
    if (!key) {
      setErro('sem-chave')
      return
    }
    setOrganizando(true)
    setErro(null)
    try {
      const transcricao = mensagens
        .slice(-30)
        .map((m) => `${m.role === 'user' ? 'Gestão' : 'Consultor'}: ${m.conteudo}`)
        .join('\n\n')
      const conhecimentoAtual = conhecimento
        .slice(0, 20)
        .map((c) => `- [${c.periodoTipo} ${c.periodoValor ?? ''}/${c.ano ?? ''}] "${c.titulo}": ${c.conteudo}`)
        .join('\n')
      const prompt = `Leia a conversa abaixo entre a gestão da Amor In Formaturas e um consultor de IA sobre metas e estratégia. Extraia fatos, decisões e status da empresa que valem a pena ficar registrados permanentemente na base de conhecimento da empresa, organizados por período.

Regras:
- Cada item deve ter: ano (número ou null se não for de um período específico), periodoTipo ("mensal"|"trimestral"|"semestral"|"anual"|"geral"), periodoValor (mês 1-12, trimestre 1-4, semestre 1-2, ou null se anual/geral), titulo (curto, até 8 palavras), conteudo (um parágrafo objetivo), possivelDuplicataDe (string ou null).
- Antes de criar um item novo, compare com os REGISTROS JÁ EXISTENTES abaixo (título + conteúdo). Se o assunto for sobre o MESMO tema de um registro existente — mesmo que com um título diferente, ou que pareça contradizer/atualizar o que já está lá — preencha "possivelDuplicataDe" com o título EXATO daquele registro existente, pra a gestão decidir manualmente qual versão prevalece (nunca decida isso sozinho). Se for assunto realmente novo, deixe "possivelDuplicataDe": null.
- Quando marcar possivelDuplicataDe, ainda assim escreva o conteúdo como a versão atualizada e completa do tema (não só o incremento) — quem ler depois não vai ver esta conversa, só esse texto.
- Não invente nada que não esteja na conversa.
- Responda APENAS com um JSON válido (array de objetos com essas chaves), sem markdown, sem texto antes ou depois.

REGISTROS JÁ EXISTENTES (compare o assunto, não só o título):
${conhecimentoAtual || '(nenhum ainda)'}

CONVERSA:
${transcricao}`
      const res = await callGemini(prompt, key, getGeminiModel())
      const extraidas = extrairJson(res)
      if (extraidas.length === 0) {
        toast({ title: 'Nada de novo pra registrar', description: 'A IA não encontrou fatos novos na conversa.' })
      }
      setPropostas(extraidas)
    } catch (err: any) {
      toast({ title: 'Erro ao organizar', description: err?.message || 'Não foi possível processar agora.', variant: 'destructive' })
    } finally {
      setOrganizando(false)
    }
  }

  async function handleSalvarProposta(idx: number) {
    if (!propostas) return
    const p = propostas[idx]
    setSalvandoIdx(idx)
    try {
      await salvarConhecimento({
        ano: p.ano,
        periodoTipo: p.periodoTipo,
        periodoValor: p.periodoValor,
        titulo: p.titulo,
        conteudo: p.conteudo,
        origem: 'ia',
      })
      setPropostas((prev) => (prev ? prev.filter((_, i) => i !== idx) : prev))
      toast({ title: 'Registrado na base de conhecimento' })
    } catch (err: any) {
      toast({ title: 'Erro ao salvar', description: err.message, variant: 'destructive' })
    } finally {
      setSalvandoIdx(null)
    }
  }

  function atualizarProposta(idx: number, patch: Partial<PropostaConhecimento>) {
    setPropostas((prev) => (prev ? prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)) : prev))
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-white/[0.06]">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-white tracking-tight flex items-center gap-2">
            <Bot className="w-6 h-6 text-orange-400" /> Consultor de Metas
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Chat só sobre metas e estratégia, sempre com os números reais de PACE por perto. Conversa
            contínua e salva — não se perde ao recarregar.
          </p>
        </div>
        <Link
          to="/conhecimento-empresa"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-orange-300 bg-orange-500/10 border border-orange-500/25 rounded-lg px-3 py-2 hover:bg-orange-500/20 whitespace-nowrap"
        >
          <BookOpen className="w-3.5 h-3.5" /> Ver base de conhecimento
        </Link>
      </div>

      <div className="bg-[#111820] border border-white/[0.06] rounded-xl flex flex-col h-[65vh] min-h-[420px]">
        <div className="flex-1 overflow-y-auto p-4 space-y-3 text-sm leading-relaxed">
          {carregandoHistorico ? (
            <p className="text-slate-500 text-xs">Carregando conversa...</p>
          ) : mensagens.length === 0 ? (
            <p className="text-slate-400 text-xs">
              Comece a conversa — conte como está a empresa, uma decisão que está pensando em tomar, ou
              pergunte sobre o ritmo das metas atuais.
            </p>
          ) : null}

          {mensagens.map((m) => (
            <div key={m.id} className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {m.role === 'model' && (
                <div className="w-6 h-6 rounded-full bg-orange-500/15 border border-orange-500/30 flex items-center justify-center shrink-0 text-orange-400 mt-0.5">
                  <Bot className="w-3.5 h-3.5" />
                </div>
              )}
              <div
                className={`max-w-[80%] rounded-xl px-3 py-2 whitespace-pre-wrap text-xs ${
                  m.role === 'user' ? 'bg-orange-600 text-white' : 'bg-[#0a0f14] border border-white/[0.06] text-slate-200'
                }`}
              >
                {m.conteudo}
              </div>
              {m.role === 'user' && (
                <div className="w-6 h-6 rounded-full bg-white/[0.08] flex items-center justify-center shrink-0 text-slate-300 mt-0.5">
                  <User className="w-3.5 h-3.5" />
                </div>
              )}
            </div>
          ))}

          {enviando && (
            <div className="flex items-center gap-2 text-slate-400 text-xs">
              <Loader2 className="w-4 h-4 text-orange-400 animate-spin" /> Consultando o Gemini...
            </div>
          )}

          {erro === 'sem-chave' && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 space-y-2 text-xs">
              <div className="font-semibold">Configure sua chave Gemini para habilitar a IA.</div>
              <Link
                to="/admin"
                className="inline-flex items-center gap-1 text-[11px] font-bold text-white bg-rose-600 hover:bg-rose-500 px-3 py-1.5 rounded-lg"
              >
                <Key className="w-3.5 h-3.5" /> Ir para Administração → IA
              </Link>
            </div>
          )}
          {erro && erro !== 'sem-chave' && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-semibold">
              {erro}
            </div>
          )}
          <div ref={fimRef} />
        </div>

        <div className="p-3 border-t border-white/[0.08] space-y-2">
          <button
            type="button"
            onClick={handleOrganizar}
            disabled={organizando || mensagens.length === 0}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-orange-300 bg-orange-500/10 border border-orange-500/25 rounded-lg px-3 py-1.5 hover:bg-orange-500/20 disabled:opacity-50"
          >
            {organizando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {organizando ? 'Organizando...' : 'Organizar na base de conhecimento'}
          </button>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleEnviar()}
              placeholder="Conte algo sobre a empresa, ou pergunte sobre as metas..."
              disabled={enviando}
              className="flex-1 bg-[#0a0f14] border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-orange-500/50 disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => handleEnviar()}
              disabled={enviando || !input.trim()}
              className="p-2.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white disabled:opacity-40"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {propostas && propostas.length > 0 && (
        <div className="bg-[#111820] border border-orange-500/20 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-orange-400" /> Revisar antes de salvar na base de conhecimento
          </h3>
          <p className="text-xs text-slate-400">
            A IA leu a conversa e propôs isso — revise, ajuste o que quiser, e salve cada item (se já
            existir um registro com o mesmo ano/período/título, ele é atualizado em vez de duplicado).
          </p>
          {propostas.map((p, idx) => {
            const existente = p.possivelDuplicataDe
              ? conhecimento.find((c) => c.titulo.trim().toLowerCase() === p.possivelDuplicataDe!.trim().toLowerCase())
              : null
            return (
            <div key={idx} className="border border-white/[0.08] rounded-lg p-4 space-y-3 bg-white/[0.02]">
              {existente && (
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs space-y-2">
                  <p>
                    ⚠️ Isso parece ser sobre o <strong>mesmo assunto</strong> que o registro já existente{' '}
                    <strong>"{existente.titulo}"</strong> ({existente.periodoTipo === 'geral' ? 'geral' : `${existente.periodoTipo} ${existente.periodoValor ?? ''}/${existente.ano ?? ''}`}). Qual deve prevalecer?
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        atualizarProposta(idx, {
                          ano: existente.ano,
                          periodoTipo: existente.periodoTipo,
                          periodoValor: existente.periodoValor,
                          titulo: existente.titulo,
                        })
                      }
                      className="text-[11px] font-semibold text-amber-200 bg-amber-500/20 border border-amber-500/40 rounded-lg px-2.5 py-1 hover:bg-amber-500/30"
                    >
                      Substituir "{existente.titulo}" por essa versão
                    </button>
                    <button
                      type="button"
                      onClick={() => atualizarProposta(idx, { possivelDuplicataDe: null })}
                      className="text-[11px] text-slate-400 hover:text-white underline decoration-dotted"
                    >
                      Manter os dois separados
                    </button>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <label className="text-xs text-slate-400 flex flex-col gap-1 sm:col-span-2">
                  Título
                  <input
                    type="text"
                    value={p.titulo}
                    onChange={(e) => atualizarProposta(idx, { titulo: e.target.value })}
                    className="bg-[#0a0f14] border border-white/[0.1] rounded-lg px-2 py-2 text-slate-200 text-xs"
                  />
                </label>
                <label className="text-xs text-slate-400 flex flex-col gap-1">
                  Período
                  <select
                    value={p.periodoTipo}
                    onChange={(e) => atualizarProposta(idx, { periodoTipo: e.target.value as PeriodoTipoConhecimento })}
                    className="bg-[#0a0f14] border border-white/[0.1] rounded-lg px-2 py-2 text-slate-200 text-xs"
                  >
                    {PERIODOS_CONHECIMENTO.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-slate-400 flex flex-col gap-1">
                  Ano
                  <input
                    type="number"
                    value={p.ano ?? ''}
                    onChange={(e) => atualizarProposta(idx, { ano: e.target.value ? Number(e.target.value) : null })}
                    className="bg-[#0a0f14] border border-white/[0.1] rounded-lg px-2 py-2 text-slate-200 text-xs"
                  />
                </label>
              </div>
              {p.periodoTipo !== 'anual' && p.periodoTipo !== 'geral' && (
                <label className="text-xs text-slate-400 flex flex-col gap-1 max-w-[160px]">
                  {p.periodoTipo === 'mensal' ? 'Mês (1-12)' : p.periodoTipo === 'trimestral' ? 'Trimestre (1-4)' : 'Semestre (1-2)'}
                  <input
                    type="number"
                    value={p.periodoValor ?? ''}
                    onChange={(e) => atualizarProposta(idx, { periodoValor: e.target.value ? Number(e.target.value) : null })}
                    className="bg-[#0a0f14] border border-white/[0.1] rounded-lg px-2 py-2 text-slate-200 text-xs"
                  />
                </label>
              )}
              <label className="text-xs text-slate-400 flex flex-col gap-1">
                Conteúdo
                <textarea
                  value={p.conteudo}
                  onChange={(e) => atualizarProposta(idx, { conteudo: e.target.value })}
                  rows={3}
                  className="bg-[#0a0f14] border border-white/[0.1] rounded-lg px-3 py-2 text-slate-200 text-xs resize-y"
                />
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleSalvarProposta(idx)}
                  disabled={salvandoIdx === idx}
                  className="inline-flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-xs font-semibold rounded-lg px-3 py-1.5"
                >
                  <Check className="w-3.5 h-3.5" /> {salvandoIdx === idx ? 'Salvando...' : 'Salvar'}
                </button>
                <button
                  type="button"
                  onClick={() => setPropostas((prev) => (prev ? prev.filter((_, i) => i !== idx) : prev))}
                  className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-rose-400"
                >
                  <X className="w-3.5 h-3.5" /> Descartar
                </button>
              </div>
            </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
