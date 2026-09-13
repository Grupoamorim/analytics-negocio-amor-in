import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Bot, Send, Loader2, User, Sparkles, Key, BookOpen, Check, X, Target, AlertTriangle } from 'lucide-react'
import { useCRM } from '@/context/CRMContext'
import { useToast } from '@/hooks/use-toast'
import { useFinanceiroDashboard } from '@/hooks/useFinanceiroDashboard'
import { useMetasNegocio, METRICA_LABEL, type MetricaMeta } from '@/hooks/useMetasNegocio'
import { useMetasChat } from '@/hooks/useMetasChat'
import { useConhecimentoEmpresa, type PeriodoTipoConhecimento } from '@/hooks/useConhecimentoEmpresa'
import { useMetasMarcos, type MarcoDecisao } from '@/hooks/useMetasMarcos'
import { useEscolasVisitadas } from '@/hooks/useEscolasVisitadas'
import { useTempoDecorrido, mensagemPensando } from '@/hooks/useTempoDecorrido'
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
4. Baseie-se SEMPRE nos dados reais fornecidos abaixo (metas, pace, ranking, marcos do Painel de Conquistas, conhecimento já registrado da empresa). Nunca invente número, nome, decisão ou fato que não esteja explicitamente ali — se faltar dado pra responder algo, diga que falta e pergunte pelo dado.
5. ANTES de perguntar qualquer coisa a Lucas, primeiro cheque se a resposta já está nos dados reais fornecidos abaixo. Só pergunte o que genuinamente não está disponível ali — nunca pergunte algo que já dá pra responder sozinho lendo o que já foi passado.
6. Responda em português do Brasil.
7. Convenção de trimestre do sistema: T1-T4. Se o usuário usar "Q1"-"Q4" (inglês), trate como sinônimo.

Sobre propor novos marcos/compromissos (passos concretos rumo a uma meta, que entram no Painel de Conquistas): seja absurdamente crítica e realista antes de sugerir qualquer coisa nova. Nunca proponha um marco de forma otimista ou às cegas — primeiro pondere o que realisticamente pode dar errado ("se X acontecer, Y vai acontecer"), considere a capacidade real da equipe e o ritmo atual mostrado nos dados, e pergunte diretamente se Lucas quer mesmo se comprometer com aquilo antes de considerar a sugestão pronta. Só depois dessa ponderação — e só quando fizer sentido de verdade — é que vale sugerir que aquilo vire um marco registrado.`

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

interface PropostaMarco {
  titulo: string
  descricao: string
  prazo: string | null
  metrica: MetricaMeta | null
  pontos: number
  /** Ponderação crítica/realista que a IA é obrigada a escrever antes de propor — mostrada em
   * destaque na revisão, junto da pergunta direta se Lucas quer mesmo se comprometer. */
  riscoRealista: string
}

/** Extrai, de uma única chamada ao Gemini, tanto propostas de conhecimento quanto propostas de
 * marco — evita gastar uma segunda chamada só pra marcos (tier grátis do Gemini é limitado). */
function extrairPropostas(texto: string): { conhecimento: PropostaConhecimento[]; marcos: PropostaMarco[] } {
  const limpo = texto.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '')
  const obj = JSON.parse(limpo)
  const conhecimentoArr = Array.isArray(obj?.conhecimento) ? obj.conhecimento : []
  const marcosArr = Array.isArray(obj?.marcos) ? obj.marcos : []
  return {
    conhecimento: conhecimentoArr.map((x: any) => ({
      ano: x.ano ?? null,
      periodoTipo: x.periodoTipo || 'geral',
      periodoValor: x.periodoValor ?? null,
      titulo: String(x.titulo || '').slice(0, 120),
      conteudo: String(x.conteudo || ''),
      possivelDuplicataDe: x.possivelDuplicataDe ? String(x.possivelDuplicataDe) : null,
    })),
    marcos: marcosArr.map((x: any) => ({
      titulo: String(x.titulo || '').slice(0, 120),
      descricao: String(x.descricao || ''),
      prazo: x.prazo || null,
      metrica: x.metrica || null,
      pontos: Number(x.pontos) > 0 ? Number(x.pontos) : 10,
      riscoRealista: String(x.riscoRealista || ''),
    })),
  }
}

/** Marco (Painel de Conquistas) ou meta numérica (PaceBand) chegando com prazo vencido pra
 * discussão guiada — mesma UI/mecânica pros dois, só a fonte e a ação de decisão mudam. */
type ItemEmDiscussao =
  | { tipo: 'marco'; id: string; titulo: string; prazo: string | null; explicacao: string }
  | { tipo: 'meta'; id: string; titulo: string; resumo: string; explicacao: string }

export default function ConsultorMetas() {
  const { toast } = useToast()
  const { leads = [], deals = [] } = useCRM()
  const { pontosDiarios } = useFinanceiroDashboard(HOJE, HOJE, [])
  const { metas, aplicarDecisao: aplicarDecisaoMeta } = useMetasNegocio()
  const { visitas } = useEscolasVisitadas()
  const { registros: conhecimento, salvar: salvarConhecimento } = useConhecimentoEmpresa()
  const { marcos, salvar: salvarMarco, aplicarDecisao: aplicarDecisaoMarco } = useMetasMarcos()
  const { mensagens, loading: carregandoHistorico, enviar } = useMetasChat()
  const location = useLocation()
  const navigate = useNavigate()

  const [input, setInput] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [organizando, setOrganizando] = useState(false)
  const [propostasConhecimento, setPropostasConhecimento] = useState<PropostaConhecimento[] | null>(null)
  const [propostasMarcos, setPropostasMarcos] = useState<PropostaMarco[] | null>(null)
  const [salvandoIdx, setSalvandoIdx] = useState<number | null>(null)
  const [salvandoMarcoIdx, setSalvandoMarcoIdx] = useState<number | null>(null)
  const [itemEmDiscussao, setItemEmDiscussao] = useState<ItemEmDiscussao | null>(null)
  const [novoPrazoDecisao, setNovoPrazoDecisao] = useState('')
  const [decidindoItem, setDecidindoItem] = useState(false)
  const fimRef = useRef<HTMLDivElement>(null)
  const tempoPensando = useTempoDecorrido(enviando)
  const iniciouAutoEnvioRef = useRef(false)

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensagens.length])

  // Chegou aqui vindo do Painel de Conquistas (marco atrasado) ou do PaceBand (meta numérica
  // vencida) com o state da navegação — manda automaticamente a primeira mensagem resumindo o
  // caso, sem gastar chamada extra de Gemini (é a mesma conversa normal), e limpa o state da rota
  // pra não reenviar num reload.
  useEffect(() => {
    const state = location.state as ItemEmDiscussao | null
    if (!state?.tipo || iniciouAutoEnvioRef.current || carregandoHistorico) return
    iniciouAutoEnvioRef.current = true
    setItemEmDiscussao(state)
    navigate(location.pathname, { replace: true, state: null })
    const texto =
      state.tipo === 'marco'
        ? `Marco atrasado: "${state.titulo}"${state.prazo ? ` (prazo era ${state.prazo})` : ''}. O que aconteceu: ${
            state.explicacao || '(não descrito)'
          }. Me ajude a decidir: realoco pra outro período, descarto por não ser mais interessante pro negócio, ou penso em outro objetivo porque esse não tem mais como bater?`
        : `Meta vencida sem bater: "${state.titulo}" (${state.resumo}). O que aconteceu: ${
            state.explicacao || '(não descrito)'
          }. Me ajude a decidir: realoco o valor pra outro período, descarto por não ser mais interessante pro negócio, ou penso num objetivo diferente porque essa meta não tem mais como bater?`
    handleEnviar(texto)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, carregandoHistorico])

  const pontosPorMetrica = useMemo<Partial<Record<MetricaMeta, PontoDiario[]>>>(
    () => ({
      receita: pontosDiarios('receita'),
      adesoes: pontosDiarios('adesoes'),
      resultado_liquido: pontosDiarios('resultado'),
      contratos: pontosComerciais(leads, 'contratos'),
      // Alunos e VGV vêm das adesões reais do SGE (mesma base de "adesoes" acima), não mais
      // da Data de Fechamento manual da turma nem do valor potencial fictício.
      alunos: pontosDiarios('adesoes'),
      vgv: pontosDiarios('vgv'),
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
      const snapshot = buildMetasSnapshot({ metas, pontosPorMetrica, ranking, conhecimento, marcos })
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
      const marcosAtuais = marcos
        .filter((m) => m.status !== 'cancelado')
        .slice(0, 30)
        .map((m) => `- "${m.titulo}" [${m.status}]${m.prazo ? ` prazo ${m.prazo}` : ''}: ${m.descricao}`)
        .join('\n')
      const prompt = `Leia a conversa abaixo entre a gestão da Amor In Formaturas e um consultor de IA sobre metas e estratégia. Extraia duas coisas, num único JSON:

1. "conhecimento": fatos, decisões e status da empresa que valem a pena ficar registrados permanentemente na base de conhecimento, organizados por período.
2. "marcos": passos/ações/compromissos concretos que a conversa deixou claro que a gestão decidiu perseguir rumo a alguma meta — só o que for uma AÇÃO real com começo e fim, não uma constatação (isso vai pra "conhecimento", não pra "marcos").

Regras de "conhecimento" — cada item: ano (número ou null se não for de um período específico), periodoTipo ("mensal"|"trimestral"|"semestral"|"anual"|"geral"), periodoValor (mês 1-12, trimestre 1-4, semestre 1-2, ou null se anual/geral), titulo (curto, até 8 palavras), conteudo (um parágrafo objetivo), possivelDuplicataDe (string ou null).
- Antes de criar um item novo, compare com os REGISTROS JÁ EXISTENTES abaixo (título + conteúdo). Se o assunto for sobre o MESMO tema de um registro existente — mesmo que com um título diferente, ou que pareça contradizer/atualizar o que já está lá — preencha "possivelDuplicataDe" com o título EXATO daquele registro existente, pra a gestão decidir manualmente qual versão prevalece (nunca decida isso sozinho). Se for assunto realmente novo, deixe "possivelDuplicataDe": null.
- Quando marcar possivelDuplicataDe, ainda assim escreva o conteúdo como a versão atualizada e completa do tema (não só o incremento) — quem ler depois não vai ver esta conversa, só esse texto.

Regras de "marcos" — cada item: titulo (curto, acionável), descricao (o que precisa ser feito, objetivo e completo — quem ler depois não vai ver esta conversa), prazo (YYYY-MM-DD ou null se não foi combinada uma data), metrica (uma destas ou null: receita|adesoes|contratos|alunos|resultado_liquido|vgv|escolas_visitadas|caixa), pontos (10 pra algo simples, até 50 pra algo grande/estratégico), riscoRealista (OBRIGATÓRIO — 1-2 frases bem críticas e realistas sobre o que pode dar errado ou o esforço real que isso exige, terminando com uma pergunta direta tipo "tem certeza que quer se comprometer com isso?").
- NÃO proponha um marco que já existe na lista de MARCOS JÁ REGISTRADOS abaixo (mesmo assunto, título diferente) — se for sobre o mesmo, ignore.
- Só inclua um marco se a conversa realmente indicou uma decisão/compromisso — se for só uma ideia solta sem decisão, não conte como marco.

Comum às duas listas:
- Não invente nada que não esteja na conversa.
- Se não achar nada pra alguma das duas listas, devolva ela como array vazio.
- Responda APENAS com um JSON válido no formato {"conhecimento": [...], "marcos": [...]}, sem markdown, sem texto antes ou depois.

REGISTROS JÁ EXISTENTES NA BASE DE CONHECIMENTO (compare o assunto, não só o título):
${conhecimentoAtual || '(nenhum ainda)'}

MARCOS JÁ REGISTRADOS NO PAINEL DE CONQUISTAS (não proponha de novo o que já está aqui):
${marcosAtuais || '(nenhum ainda)'}

CONVERSA:
${transcricao}`
      const res = await callGemini(prompt, key, getGeminiModel())
      const extraidas = extrairPropostas(res)
      if (extraidas.conhecimento.length === 0 && extraidas.marcos.length === 0) {
        toast({ title: 'Nada de novo pra registrar', description: 'A IA não encontrou fatos ou marcos novos na conversa.' })
      }
      setPropostasConhecimento(extraidas.conhecimento)
      setPropostasMarcos(extraidas.marcos)
    } catch (err: any) {
      toast({ title: 'Erro ao organizar', description: err?.message || 'Não foi possível processar agora.', variant: 'destructive' })
    } finally {
      setOrganizando(false)
    }
  }

  async function handleSalvarProposta(idx: number) {
    if (!propostasConhecimento) return
    const p = propostasConhecimento[idx]
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
      setPropostasConhecimento((prev) => (prev ? prev.filter((_, i) => i !== idx) : prev))
      toast({ title: 'Registrado na base de conhecimento' })
    } catch (err: any) {
      toast({ title: 'Erro ao salvar', description: err.message, variant: 'destructive' })
    } finally {
      setSalvandoIdx(null)
    }
  }

  function atualizarProposta(idx: number, patch: Partial<PropostaConhecimento>) {
    setPropostasConhecimento((prev) => (prev ? prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)) : prev))
  }

  async function handleSalvarPropostaMarco(idx: number) {
    if (!propostasMarcos) return
    const p = propostasMarcos[idx]
    setSalvandoMarcoIdx(idx)
    try {
      await salvarMarco({
        titulo: p.titulo,
        descricao: p.descricao,
        prazo: p.prazo,
        metrica: p.metrica,
        pontos: p.pontos,
        riscoRealista: p.riscoRealista,
        origem: 'ia',
      })
      setPropostasMarcos((prev) => (prev ? prev.filter((_, i) => i !== idx) : prev))
      toast({ title: 'Marco adicionado ao Painel de Conquistas' })
    } catch (err: any) {
      toast({ title: 'Erro ao salvar', description: err.message, variant: 'destructive' })
    } finally {
      setSalvandoMarcoIdx(null)
    }
  }

  function atualizarPropostaMarco(idx: number, patch: Partial<PropostaMarco>) {
    setPropostasMarcos((prev) => (prev ? prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)) : prev))
  }

  /** "outro" cobre o terceiro botão em ambos os casos — vira 'substituido' pra marco ou
   * 'repensado' pra meta, já que o enum de decisão de cada tabela usa um nome diferente pra essa
   * mesma ideia ("não tem mais como bater, penso em outra coisa"). */
  async function handleAplicarDecisaoItem(acao: 'realocado' | 'descartado' | 'outro') {
    if (!itemEmDiscussao) return
    if (itemEmDiscussao.tipo === 'marco' && acao === 'realocado' && !novoPrazoDecisao) {
      toast({ title: 'Escolha o novo prazo antes de realocar', variant: 'destructive' })
      return
    }
    setDecidindoItem(true)
    try {
      if (itemEmDiscussao.tipo === 'marco') {
        const decisao: MarcoDecisao = acao === 'outro' ? 'substituido' : acao
        await aplicarDecisaoMarco(itemEmDiscussao.id, decisao, novoPrazoDecisao || undefined)
        toast({
          title: decisao === 'realocado' ? 'Marco realocado' : decisao === 'descartado' ? 'Marco descartado' : 'Marco marcado como substituído',
        })
      } else {
        const decisao = acao === 'outro' ? 'repensado' : acao
        await aplicarDecisaoMeta(itemEmDiscussao.id, decisao)
        toast({
          title:
            decisao === 'realocado'
              ? 'Meta marcada como realocada — cadastre o novo período em Administração → Metas'
              : decisao === 'descartado'
                ? 'Meta descartada'
                : 'Meta marcada pra repensar — crie o novo objetivo em Conquistas & Marcos',
        })
      }
      setItemEmDiscussao(null)
      setNovoPrazoDecisao('')
    } catch (err: any) {
      toast({ title: 'Erro ao aplicar decisão', description: err.message, variant: 'destructive' })
    } finally {
      setDecidindoItem(false)
    }
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
              <Loader2 className="w-4 h-4 text-orange-400 animate-spin" /> {mensagemPensando(tempoPensando)}
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

      {itemEmDiscussao && (
        <div className="bg-[#111820] border border-amber-500/25 rounded-xl p-4 flex flex-wrap items-center gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <span className="text-xs text-slate-300 flex-1 min-w-[200px]">
            Aplicar decisão {itemEmDiscussao.tipo === 'marco' ? 'ao marco atrasado' : 'à meta vencida'}{' '}
            <strong className="text-white">"{itemEmDiscussao.titulo}"</strong> — só clique depois de fechar isso com a IA no chat acima.
          </span>
          {itemEmDiscussao.tipo === 'marco' && (
            <input
              type="date"
              value={novoPrazoDecisao}
              onChange={(e) => setNovoPrazoDecisao(e.target.value)}
              className="bg-[#0a0f14] border border-white/[0.1] rounded-lg px-2 py-1.5 text-slate-200 text-xs"
            />
          )}
          <button
            type="button"
            disabled={decidindoItem}
            onClick={() => handleAplicarDecisaoItem('realocado')}
            className="text-xs font-semibold text-emerald-300 hover:underline disabled:opacity-50"
            title={itemEmDiscussao.tipo === 'meta' ? 'Marca como realocada — cadastre o novo período em Administração → Metas' : undefined}
          >
            Realocar
          </button>
          <button
            type="button"
            disabled={decidindoItem}
            onClick={() => handleAplicarDecisaoItem('descartado')}
            className="text-xs font-semibold text-slate-400 hover:underline disabled:opacity-50"
          >
            Descartar
          </button>
          <button
            type="button"
            disabled={decidindoItem}
            onClick={() => handleAplicarDecisaoItem('outro')}
            className="text-xs font-semibold text-rose-300 hover:underline disabled:opacity-50"
          >
            Pensar em outro objetivo
          </button>
          <button
            type="button"
            onClick={() => setItemEmDiscussao(null)}
            className="text-xs text-slate-500 hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {propostasConhecimento && propostasConhecimento.length > 0 && (
        <div className="bg-[#111820] border border-orange-500/20 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-orange-400" /> Revisar antes de salvar na base de conhecimento
          </h3>
          <p className="text-xs text-slate-400">
            A IA leu a conversa e propôs isso — revise, ajuste o que quiser, e salve cada item (se já
            existir um registro com o mesmo ano/período/título, ele é atualizado em vez de duplicado).
          </p>
          {propostasConhecimento.map((p, idx) => {
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
                  onClick={() => setPropostasConhecimento((prev) => (prev ? prev.filter((_, i) => i !== idx) : prev))}
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

      {propostasMarcos && propostasMarcos.length > 0 && (
        <div className="bg-[#111820] border border-orange-500/20 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Target className="w-4 h-4 text-orange-400" /> Marcos propostos pro Painel de Conquistas
          </h3>
          <p className="text-xs text-slate-400">
            A IA identificou compromissos concretos na conversa. Leia a ponderação crítica antes de confirmar — nada entra no painel sem
            sua aprovação.
          </p>
          {propostasMarcos.map((p, idx) => (
            <div key={idx} className="border border-white/[0.08] rounded-lg p-4 space-y-3 bg-white/[0.02]">
              {p.riscoRealista && (
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <p>{p.riscoRealista}</p>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="text-xs text-slate-400 flex flex-col gap-1 sm:col-span-2">
                  Título
                  <input
                    type="text"
                    value={p.titulo}
                    onChange={(e) => atualizarPropostaMarco(idx, { titulo: e.target.value })}
                    className="bg-[#0a0f14] border border-white/[0.1] rounded-lg px-2 py-2 text-slate-200 text-xs"
                  />
                </label>
                <label className="text-xs text-slate-400 flex flex-col gap-1">
                  Prazo (opcional)
                  <input
                    type="date"
                    value={p.prazo ?? ''}
                    onChange={(e) => atualizarPropostaMarco(idx, { prazo: e.target.value || null })}
                    className="bg-[#0a0f14] border border-white/[0.1] rounded-lg px-2 py-2 text-slate-200 text-xs"
                  />
                </label>
              </div>
              <label className="text-xs text-slate-400 flex flex-col gap-1">
                Descrição — o que precisa ser feito
                <textarea
                  value={p.descricao}
                  onChange={(e) => atualizarPropostaMarco(idx, { descricao: e.target.value })}
                  rows={2}
                  className="bg-[#0a0f14] border border-white/[0.1] rounded-lg px-3 py-2 text-slate-200 text-xs resize-y"
                />
              </label>
              {p.metrica && <p className="text-[11px] text-slate-500">Métrica relacionada: {METRICA_LABEL[p.metrica]}</p>}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleSalvarPropostaMarco(idx)}
                  disabled={salvandoMarcoIdx === idx}
                  className="inline-flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-xs font-semibold rounded-lg px-3 py-1.5"
                >
                  <Check className="w-3.5 h-3.5" /> {salvandoMarcoIdx === idx ? 'Salvando...' : 'Confirmar — quero me comprometer'}
                </button>
                <button
                  type="button"
                  onClick={() => setPropostasMarcos((prev) => (prev ? prev.filter((_, i) => i !== idx) : prev))}
                  className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-rose-400"
                >
                  <X className="w-3.5 h-3.5" /> Descartar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
