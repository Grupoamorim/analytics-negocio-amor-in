// Formulário público de uma "Ação de Captação" (ex: ação de Direito num
// evento) — mais rápido que o link de captação normal: curso já vem quase
// pronto, lista as turmas que já temos por faculdade coloridas pelo status
// (verde = já é nossa, azul = ainda em prospecção, vermelho = já perdemos
// essa turma antes), e ao confirmar redireciona pro grupo do WhatsApp da
// ação. Config de cada ação em `utils/captacaoAcoes.ts`.
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ArrowLeft, Send, CheckCircle2 } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { addLead } from '@/utils/captacaoStorage'
import { fetchCidadeFaculdades } from '@/utils/mercadoFaculdades'
import { fetchCursosConhecidos } from '@/utils/mercadoCursos'
import { getCampanhaCaptacao } from '@/utils/captacaoAcoes'
import { formatPhoneBR } from '@/utils/phoneMask'

const OUTRO = '__outro__'

interface TurmaStatus {
  id: string
  curso: string
  faculdade: string
  turma: string
  anoFormatura: string
  cidade: string
  funilStatus: string | null
}

type Cor = 'verde' | 'azul' | 'vermelho'

function corDaTurma(funilStatus: string | null): Cor {
  if (funilStatus === 'Convertido') return 'verde'
  if (funilStatus === 'Perdido') return 'vermelho'
  return 'azul'
}

const CARD_COR: Record<Cor, { border: string; bg: string; tag: string; tagTexto: string }> = {
  verde: {
    border: 'border-emerald-500/40 hover:border-emerald-400/70',
    bg: 'bg-emerald-500/[0.06] hover:bg-emerald-500/[0.1]',
    tag: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    tagTexto: 'Já é nossa',
  },
  azul: {
    border: 'border-blue-500/40 hover:border-blue-400/70',
    bg: 'bg-blue-500/[0.06] hover:bg-blue-500/[0.1]',
    tag: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
    tagTexto: 'Em conversa',
  },
  vermelho: {
    border: 'border-red-500/40 hover:border-red-400/70',
    bg: 'bg-red-500/[0.06] hover:bg-red-500/[0.1]',
    tag: 'bg-red-500/15 text-red-300 border-red-500/30',
    tagTexto: 'Não fechamos antes',
  },
}

type Etapa = 'curso' | 'faculdade' | 'turma' | 'semestre' | 'dados' | 'sucesso'

export default function CaptacaoAcaoForm() {
  const { slug } = useParams<{ slug: string }>()
  const campanha = getCampanhaCaptacao(slug)

  const [logoUrl, setLogoUrl] = useState('')
  const [cursosConhecidos, setCursosConhecidos] = useState<string[]>([])
  const [faculdadeCidade, setFaculdadeCidade] = useState<Record<string, string[]>>({})

  const [etapa, setEtapa] = useState<Etapa>('curso')
  const [mostrarOutroCurso, setMostrarOutroCurso] = useState(false)
  const [curso, setCurso] = useState('')
  const [cursoOutro, setCursoOutro] = useState('')

  const [faculdade, setFaculdade] = useState('')
  const [faculdadeOutro, setFaculdadeOutro] = useState('')
  const [cidade, setCidade] = useState('')

  const [turmas, setTurmas] = useState<TurmaStatus[]>([])
  const [buscandoTurmas, setBuscandoTurmas] = useState(false)
  const [turmaEscolhida, setTurmaEscolhida] = useState<TurmaStatus | null>(null)
  const [semestre, setSemestre] = useState('')

  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [email, setEmail] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    supabase
      .from('logo_marca_publica')
      .select('logo_url')
      .maybeSingle()
      .then(({ data }) => setLogoUrl(data?.logo_url || ''))
    fetchCursosConhecidos().then(setCursosConhecidos)
    fetchCidadeFaculdades().then(setFaculdadeCidade)
  }, [])

  // Faculdade -> cidade(s) onde ela aparece (pra preencher cidade sozinho
  // quando a faculdade escolhida só existe numa cidade conhecida).
  const cidadesPorFaculdade = useMemo(() => {
    const map: Record<string, string[]> = {}
    Object.entries(faculdadeCidade).forEach(([cid, faculdades]) => {
      faculdades.forEach((f) => {
        if (!map[f]) map[f] = []
        if (!map[f].includes(cid)) map[f].push(cid)
      })
    })
    return map
  }, [faculdadeCidade])

  const faculdadesConhecidas = useMemo(() => {
    const set = new Set<string>()
    Object.values(faculdadeCidade).forEach((list) => list.forEach((f) => set.add(f)))
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [faculdadeCidade])

  const cursoFinal = curso === OUTRO ? cursoOutro.trim() : curso
  const faculdadeFinal = faculdade === OUTRO ? faculdadeOutro.trim() : faculdade
  const precisaCidadeManual = !faculdadeFinal || faculdade === OUTRO || (cidadesPorFaculdade[faculdadeFinal]?.length || 0) !== 1

  if (!campanha) {
    return (
      <div className="min-h-screen bg-[#0a0f14] text-[#f8fafc] flex items-center justify-center px-4">
        <p className="text-sm text-slate-400">Essa ação de captação não existe ou não está mais ativa.</p>
      </div>
    )
  }

  const escolherCursoPrincipal = () => {
    setCurso(campanha.curso)
    setEtapa('faculdade')
  }

  const confirmarOutroCurso = () => {
    if (!cursoFinal) return
    setEtapa('faculdade')
  }

  const confirmarFaculdade = async () => {
    if (!faculdadeFinal) return
    if (precisaCidadeManual && !cidade.trim()) return
    const cidadeFinal = precisaCidadeManual ? cidade.trim() : cidadesPorFaculdade[faculdadeFinal][0]
    setCidade(cidadeFinal)
    setBuscandoTurmas(true)
    setEtapa('turma')
    const { data } = await (supabase as any)
      .from('turmas_captacao_status')
      .select('id, curso, faculdade, turma, ano_formatura, cidade, funil_status')
      .eq('curso', cursoFinal)
      .eq('faculdade', faculdadeFinal)
    const lista: TurmaStatus[] = (data || []).map((t: any) => ({
      id: t.id,
      curso: t.curso || '',
      faculdade: t.faculdade || '',
      turma: t.turma || '',
      anoFormatura: t.ano_formatura || '',
      cidade: t.cidade || '',
      funilStatus: t.funil_status,
    }))
    lista.sort((a, b) => a.anoFormatura.localeCompare(b.anoFormatura, 'pt-BR'))
    setTurmas(lista)
    setBuscandoTurmas(false)
  }

  const escolherTurma = (t: TurmaStatus) => {
    setTurmaEscolhida(t)
    setEtapa('dados')
  }

  const pularTurma = () => {
    setTurmaEscolhida(null)
    setEtapa('semestre')
  }

  const confirmarSemestre = () => {
    if (!semestre.trim()) return
    setEtapa('dados')
  }

  const validarDados = (): boolean => {
    const errs: Record<string, string> = {}
    if (!nome.trim()) errs.nome = 'Informe seu nome completo.'
    if (!telefone.trim()) errs.telefone = 'Informe seu telefone.'
    else if (telefone.replace(/\D/g, '').length < 10) errs.telefone = 'Telefone inválido.'
    if (!email.trim()) errs.email = 'Informe seu email.'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = 'Email inválido.'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validarDados()) return

    const observacao = turmaEscolhida
      ? `Ação ${campanha.curso} · turma "${turmaEscolhida.turma}" — ${CARD_COR[corDaTurma(turmaEscolhida.funilStatus)].tagTexto}.`
      : `Ação ${campanha.curso} · sem turma encontrada — semestre informado: ${semestre.trim()}.`

    try {
      setSubmitting(true)
      await addLead({
        curso: cursoFinal,
        faculdade: faculdadeFinal,
        turma: turmaEscolhida?.turma || '',
        anoFormatura: turmaEscolhida?.anoFormatura || '',
        cidade,
        nome: nome.trim(),
        telefone: telefone.trim(),
        email: email.trim(),
        sdr: '',
        origem: campanha.slug,
        observacao,
      })
      setEtapa('sucesso')
      setTimeout(() => {
        window.location.href = campanha.whatsappLink
      }, 1800)
    } catch {
      alert('Não foi possível enviar seu cadastro agora. Tente novamente em instantes.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0f14] text-[#f8fafc] flex flex-col items-center justify-center px-4 py-10 font-sans">
      <div className="w-full max-w-lg">
        <div className="flex flex-col items-center mb-8">
          {logoUrl ? (
            <img src={logoUrl} alt="Amor In Formaturas" className="h-14 max-w-[240px] object-contain mb-2" />
          ) : (
            <span className="font-bold text-xl tracking-tight text-white mb-2">Amor In Formaturas</span>
          )}
          <h1 className="text-2xl font-bold text-white text-center tracking-tight mt-2">
            Você quer um presente?
          </h1>
          <p className="text-sm text-slate-400 text-center mt-1">
            Cadastro rápido — leva menos de 1 minuto
          </p>
        </div>

        <div className="bg-[#111820] border border-white/[0.08] rounded-2xl shadow-2xl p-6 sm:p-8 space-y-4">
          {etapa === 'curso' && (
            <div className="space-y-4">
              <label className="block text-xs font-semibold text-slate-300">Qual é o seu curso?</label>
              {!mostrarOutroCurso ? (
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={escolherCursoPrincipal}
                    className="p-4 rounded-xl bg-gradient-to-r from-orange-600 to-orange-600 hover:from-orange-500 hover:to-orange-500 text-white text-sm font-bold shadow-lg shadow-orange-500/30 transition-all"
                  >
                    {campanha.curso}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMostrarOutroCurso(true)}
                    className="p-4 rounded-xl bg-[#0a0f14] border border-white/10 hover:border-white/25 text-slate-300 text-sm font-semibold transition-colors"
                  >
                    Outro curso
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <select
                    value={curso}
                    onChange={(e) => setCurso(e.target.value)}
                    className="w-full bg-[#0a0f14] border border-white/10 rounded-lg px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500/60"
                  >
                    <option value="">Selecione seu curso</option>
                    {cursosConhecidos
                      .filter((c) => c !== campanha.curso)
                      .map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    <option value={OUTRO}>Outro (não está na lista)</option>
                  </select>
                  {curso === OUTRO && (
                    <input
                      type="text"
                      placeholder="Digite o nome do seu curso"
                      value={cursoOutro}
                      onChange={(e) => setCursoOutro(e.target.value)}
                      className="w-full bg-[#0a0f14] border border-white/10 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500/60"
                    />
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setMostrarOutroCurso(false)
                        setCurso('')
                        setCursoOutro('')
                      }}
                      className="text-xs text-slate-400 hover:text-orange-400 inline-flex items-center gap-1"
                    >
                      <ArrowLeft className="w-3 h-3" /> Voltar
                    </button>
                    <button
                      type="button"
                      disabled={!cursoFinal}
                      onClick={confirmarOutroCurso}
                      className="flex-1 px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 disabled:opacity-40 text-white text-xs font-bold"
                    >
                      Continuar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {etapa === 'faculdade' && (
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => setEtapa('curso')}
                className="text-xs text-slate-400 hover:text-orange-400 inline-flex items-center gap-1"
              >
                <ArrowLeft className="w-3 h-3" /> {cursoFinal}
              </button>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Qual é a sua faculdade?</label>
                <select
                  value={faculdade}
                  onChange={(e) => setFaculdade(e.target.value)}
                  className="w-full bg-[#0a0f14] border border-white/10 rounded-lg px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500/60"
                >
                  <option value="">Selecione sua faculdade</option>
                  {faculdadesConhecidas.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                  <option value={OUTRO}>Outra (não está na lista)</option>
                </select>
              </div>
              {faculdade === OUTRO && (
                <input
                  type="text"
                  placeholder="Digite o nome da sua faculdade"
                  value={faculdadeOutro}
                  onChange={(e) => setFaculdadeOutro(e.target.value)}
                  className="w-full bg-[#0a0f14] border border-white/10 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500/60"
                />
              )}
              {precisaCidadeManual && faculdadeFinal && (
                <input
                  type="text"
                  placeholder="Sua cidade"
                  value={cidade}
                  onChange={(e) => setCidade(e.target.value)}
                  className="w-full bg-[#0a0f14] border border-white/10 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500/60"
                />
              )}
              <button
                type="button"
                disabled={!faculdadeFinal || (precisaCidadeManual && !cidade.trim())}
                onClick={confirmarFaculdade}
                className="w-full px-4 py-2.5 rounded-lg bg-orange-600 hover:bg-orange-500 disabled:opacity-40 text-white text-sm font-bold"
              >
                Continuar
              </button>
            </div>
          )}

          {etapa === 'turma' && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setEtapa('faculdade')}
                className="text-xs text-slate-400 hover:text-orange-400 inline-flex items-center gap-1"
              >
                <ArrowLeft className="w-3 h-3" /> {faculdadeFinal}
              </button>
              <p className="text-xs text-slate-400">
                Encontre a sua turma abaixo e clique nela — se não achar, pule essa etapa.
              </p>
              {buscandoTurmas && <p className="text-xs text-slate-500">Buscando turmas...</p>}
              {!buscandoTurmas && turmas.length === 0 && (
                <p className="text-xs text-slate-500 italic">Nenhuma turma encontrada ainda por aqui.</p>
              )}
              <div className="space-y-2">
                {turmas.map((t) => {
                  const cor = CARD_COR[corDaTurma(t.funilStatus)]
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => escolherTurma(t)}
                      className={`w-full text-left p-3 rounded-lg border transition-colors ${cor.border} ${cor.bg}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-white">
                          {t.turma} · Formatura {t.anoFormatura}
                        </span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border shrink-0 ${cor.tag}`}>
                          {cor.tagTexto}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
              <button
                type="button"
                onClick={pularTurma}
                className="w-full text-center text-xs text-slate-400 hover:text-orange-400 underline decoration-dotted pt-2"
              >
                Não encontrei minha turma — pular
              </button>
            </div>
          )}

          {etapa === 'semestre' && (
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => setEtapa('turma')}
                className="text-xs text-slate-400 hover:text-orange-400 inline-flex items-center gap-1"
              >
                <ArrowLeft className="w-3 h-3" /> Voltar
              </button>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Em que período/semestre você está?
                </label>
                <input
                  type="text"
                  placeholder="Ex: 3º período, ou 2026.2"
                  value={semestre}
                  onChange={(e) => setSemestre(e.target.value)}
                  className="w-full bg-[#0a0f14] border border-white/10 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500/60"
                />
              </div>
              <button
                type="button"
                disabled={!semestre.trim()}
                onClick={confirmarSemestre}
                className="w-full px-4 py-2.5 rounded-lg bg-orange-600 hover:bg-orange-500 disabled:opacity-40 text-white text-sm font-bold"
              >
                Continuar
              </button>
            </div>
          )}

          {etapa === 'dados' && (
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <button
                type="button"
                onClick={() => setEtapa(turmaEscolhida ? 'turma' : 'semestre')}
                className="text-xs text-slate-400 hover:text-orange-400 inline-flex items-center gap-1"
              >
                <ArrowLeft className="w-3 h-3" /> Voltar
              </button>
              <div className="p-3 rounded-lg bg-orange-500/[0.06] border border-orange-500/20">
                <div className="text-sm font-semibold text-white">
                  {cursoFinal} — {faculdadeFinal}
                </div>
                <div className="text-xs text-slate-400">
                  {cidade}
                  {turmaEscolhida
                    ? ` · ${turmaEscolhida.turma} · Formatura ${turmaEscolhida.anoFormatura}`
                    : ` · ${semestre}`}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Nome Completo <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Ex: João Silva"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  className={`w-full bg-[#0a0f14] border rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500/60 ${errors.nome ? 'border-red-500/60' : 'border-white/10'}`}
                />
                {errors.nome && <p className="text-xs text-red-400 mt-1">{errors.nome}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Telefone <span className="text-red-400">*</span>
                </label>
                <input
                  type="tel"
                  inputMode="tel"
                  placeholder="Ex: (11) 99999-9999"
                  value={telefone}
                  onChange={(e) => setTelefone(formatPhoneBR(e.target.value))}
                  className={`w-full bg-[#0a0f14] border rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500/60 ${errors.telefone ? 'border-red-500/60' : 'border-white/10'}`}
                />
                {errors.telefone && <p className="text-xs text-red-400 mt-1">{errors.telefone}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Email <span className="text-red-400">*</span>
                </label>
                <input
                  type="email"
                  placeholder="Ex: joao@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`w-full bg-[#0a0f14] border rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500/60 ${errors.email ? 'border-red-500/60' : 'border-white/10'}`}
                />
                {errors.email && <p className="text-xs text-red-400 mt-1">{errors.email}</p>}
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl bg-gradient-to-r from-orange-600 to-orange-600 hover:from-orange-500 hover:to-orange-500 text-white text-sm font-bold shadow-lg shadow-orange-500/30 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60 mt-2"
              >
                <Send className="w-4 h-4" />
                {submitting ? 'Enviando...' : 'Confirmar e entrar no grupo'}
              </button>
            </form>
          )}

          {etapa === 'sucesso' && (
            <div className="flex flex-col items-center text-center gap-3 py-6">
              <CheckCircle2 className="w-10 h-10 text-emerald-400" />
              <p className="text-sm font-semibold text-white">Cadastro enviado com sucesso!</p>
              <p className="text-xs text-slate-400">Te levando pro grupo do WhatsApp...</p>
              <a
                href={campanha.whatsappLink}
                className="text-xs text-orange-400 hover:underline mt-2"
              >
                Clique aqui se não for redirecionado automaticamente
              </a>
            </div>
          )}
        </div>

        <p className="text-center text-[11px] text-slate-600 mt-6">
          Amor In Formaturas — Seus dados estão seguros e não serão compartilhados.
        </p>
      </div>
    </div>
  )
}
