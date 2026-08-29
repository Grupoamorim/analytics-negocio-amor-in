import { useEffect, useMemo, useState } from 'react'
import { Send, CheckCircle2, Search, ArrowLeft } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { addLead } from '@/utils/captacaoStorage'
import { fetchCidadeFaculdades, CidadeFaculdadesMap } from '@/utils/mercadoFaculdades'
import { fetchCursosConhecidos } from '@/utils/mercadoCursos'
import { fetchVendedoresAtivos } from '@/utils/vendedores'
import { listarDuracaoCursos, semestreDaTurma } from '@/utils/duracaoCursos'
import { formatPhoneBR } from '@/utils/phoneMask'

const OUTRO = '__outro__'

interface FormState {
  curso: string
  cursoOutro: string
  faculdade: string
  faculdadeOutro: string
  turma: string
  anoFormatura: string
  cidade: string
  cidadeOutro: string
  nome: string
  telefone: string
  email: string
  sdr: string
}

const EMPTY: FormState = {
  curso: '',
  cursoOutro: '',
  faculdade: '',
  faculdadeOutro: '',
  turma: '',
  anoFormatura: '',
  cidade: '',
  cidadeOutro: '',
  nome: '',
  telefone: '',
  email: '',
  sdr: '',
}

interface TurmaEncontrada {
  id: string
  curso: string
  faculdade: string
  turma: string
  anoFormatura: string
  cidade: string
  empresa: string
  periodoAtual: number | null
}

/** Calcula em qual período (1º, 2º...) do curso a turma está agora, usando a
 * duração cadastrada (Administração > Turmas) e a mesma lógica central de
 * `web/src/utils/duracaoCursos.ts` (usada em Turmas e Funil). Sem duração
 * cadastrada pro curso, não inventamos o período — retorna null. */
function calcularPeriodoAtual(anoFormatura: string, duracaoAnos: number): number | null {
  const s = semestreDaTurma(anoFormatura, duracaoAnos)
  if (!s || s.naoIniciado || s.formado) return null
  return s.atual
}

export default function CaptacaoForm() {
  const [modo, setModo] = useState<'buscar' | 'manual'>('buscar')
  const [logoUrl, setLogoUrl] = useState('')

  const [cursos, setCursos] = useState<string[]>([])
  const [duracoes, setDuracoes] = useState<{ curso: string; faculdade: string; duracaoAnos: number }[]>([])
  const [cursoBusca, setCursoBusca] = useState('')
  const [faculdadeBusca, setFaculdadeBusca] = useState('')
  const [turmasEncontradas, setTurmasEncontradas] = useState<TurmaEncontrada[]>([])
  const [buscando, setBuscando] = useState(false)
  const [turmaEscolhida, setTurmaEscolhida] = useState<TurmaEncontrada | null>(null)

  const [form, setForm] = useState<FormState>(EMPTY)
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [cidadeFaculdades, setCidadeFaculdades] = useState<CidadeFaculdadesMap>({})
  const [vendedores, setVendedores] = useState<string[]>([])

  useEffect(() => {
    supabase
      .from('logo_marca_publica')
      .select('logo_url')
      .maybeSingle()
      .then(({ data }) => setLogoUrl(data?.logo_url || ''))
    fetchCidadeFaculdades().then(setCidadeFaculdades)
    fetchVendedoresAtivos().then(setVendedores)
    fetchCursosConhecidos().then(setCursos)
    listarDuracaoCursos().then((d) =>
      setDuracoes(d.map((x) => ({ curso: x.curso, faculdade: x.faculdade, duracaoAnos: x.duracaoAnos }))),
    )
  }, [])

  const duracaoParaCurso = (curso: string, faculdade: string): number | null => {
    const exata = duracoes.find((d) => d.curso === curso && d.faculdade === faculdade)
    if (exata) return exata.duracaoAnos
    const generica = duracoes.find((d) => d.curso === curso && d.faculdade === '')
    return generica ? generica.duracaoAnos : null
  }

  useEffect(() => {
    setFaculdadeBusca('')
  }, [cursoBusca])

  useEffect(() => {
    if (!cursoBusca) {
      setTurmasEncontradas([])
      return
    }
    setBuscando(true)
    supabase
      .from('turmas')
      .select('id, curso, faculdade, turma, ano_formatura, cidade, empresa')
      .eq('curso', cursoBusca)
      .eq('concluida', false)
      .not('funil_status', 'in', '("Convertido","Perdido")')
      .then(({ data }) => {
        const encontradas: TurmaEncontrada[] = (data || []).map((t) => {
          const duracao = duracaoParaCurso(t.curso || '', t.faculdade || '')
          return {
            id: t.id,
            curso: t.curso || '',
            faculdade: t.faculdade || '',
            turma: t.turma || '',
            anoFormatura: t.ano_formatura || '',
            cidade: t.cidade || '',
            empresa: t.empresa || 'AFF',
            periodoAtual: duracao ? calcularPeriodoAtual(t.ano_formatura || '', duracao) : null,
          }
        })
        // Ordem: Faculdade (alfabética) -> número da turma -> ano de formatura.
        encontradas.sort((a, b) => {
          const porFaculdade = a.faculdade.localeCompare(b.faculdade, 'pt-BR')
          if (porFaculdade !== 0) return porFaculdade
          const numA = parseInt(a.turma.replace(/\D/g, ''), 10) || 0
          const numB = parseInt(b.turma.replace(/\D/g, ''), 10) || 0
          if (numA !== numB) return numA - numB
          return a.anoFormatura.localeCompare(b.anoFormatura, 'pt-BR')
        })
        setTurmasEncontradas(encontradas)
        setBuscando(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursoBusca, duracoes])

  const faculdadesEncontradas = useMemo(() => {
    const set = new Set<string>()
    turmasEncontradas.forEach((t) => t.faculdade && set.add(t.faculdade))
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [turmasEncontradas])

  const turmasDaFaculdade = useMemo(
    () => turmasEncontradas.filter((t) => t.faculdade === faculdadeBusca),
    [turmasEncontradas, faculdadeBusca],
  )

  const cidades = useMemo(
    () => Object.keys(cidadeFaculdades).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [cidadeFaculdades],
  )
  const faculdadesDaCidade = useMemo(
    () => (form.cidade && form.cidade !== OUTRO ? cidadeFaculdades[form.cidade] || [] : []),
    [cidadeFaculdades, form.cidade],
  )

  const set = (field: keyof FormState, value: string) => {
    setForm((f) => ({ ...f, [field]: value }))
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }))
    if (success) setSuccess(false)
  }

  const cidadeFinal = form.cidade === OUTRO ? form.cidadeOutro.trim() : form.cidade
  const faculdadeFinal = form.faculdade === OUTRO ? form.faculdadeOutro.trim() : form.faculdade
  const cursoFinal = form.curso === OUTRO ? form.cursoOutro.trim() : form.curso

  const validate = (): boolean => {
    const errs: Partial<Record<keyof FormState, string>> = {}
    if (!form.curso) errs.curso = 'Selecione o curso.'
    if (form.curso === OUTRO && !form.cursoOutro.trim()) errs.cursoOutro = 'Informe o nome do curso.'
    if (!form.faculdade) errs.faculdade = 'Selecione a faculdade.'
    if (form.faculdade === OUTRO && !form.faculdadeOutro.trim())
      errs.faculdadeOutro = 'Informe o nome da faculdade.'
    if (!form.anoFormatura.trim()) errs.anoFormatura = 'Informe o ano de formatura.'
    if (!form.cidade) errs.cidade = 'Selecione a cidade.'
    if (form.cidade === OUTRO && !form.cidadeOutro.trim()) errs.cidadeOutro = 'Informe a cidade.'
    if (!form.nome.trim()) errs.nome = 'Informe seu nome completo.'
    if (!form.telefone.trim()) errs.telefone = 'Informe seu telefone.'
    else if (form.telefone.replace(/\D/g, '').length < 10) errs.telefone = 'Telefone inválido.'
    if (!form.email.trim()) errs.email = 'Informe seu email.'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = 'Email inválido.'
    if (!form.sdr) errs.sdr = 'Selecione quem é seu vendedor/SDR.'

    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const avisarTurmaNova = (dados: {
    curso: string
    faculdade: string
    cidade: string
    turma: string
    anoFormatura: string
    nome: string
  }) => {
    supabase.functions.invoke('alerta-turma-nova', { body: dados }).catch(() => {
      /* aviso é só um extra, não bloqueia o cadastro da pessoa */
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return

    try {
      setSubmitting(true)
      await addLead({
        curso: cursoFinal,
        faculdade: faculdadeFinal,
        turma: form.turma.trim(),
        anoFormatura: form.anoFormatura.trim(),
        cidade: cidadeFinal,
        nome: form.nome.trim(),
        telefone: form.telefone.trim(),
        email: form.email.trim(),
        sdr: form.sdr,
      })
      // Cadastro manual = a turma não foi encontrada no Mapa de Mercado.
      avisarTurmaNova({
        curso: cursoFinal,
        faculdade: faculdadeFinal,
        cidade: cidadeFinal,
        turma: form.turma.trim(),
        anoFormatura: form.anoFormatura.trim(),
        nome: form.nome.trim(),
      })
      setForm(EMPTY)
      setErrors({})
      setSuccess(true)
    } catch {
      alert('Não foi possível enviar seu cadastro agora. Tente novamente em instantes.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleSubmitTurmaEscolhida = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!turmaEscolhida) return
    const errs: Partial<Record<keyof FormState, string>> = {}
    if (!form.nome.trim()) errs.nome = 'Informe seu nome completo.'
    if (!form.telefone.trim()) errs.telefone = 'Informe seu telefone.'
    else if (form.telefone.replace(/\D/g, '').length < 10) errs.telefone = 'Telefone inválido.'
    if (!form.email.trim()) errs.email = 'Informe seu email.'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = 'Email inválido.'
    if (!form.sdr) errs.sdr = 'Selecione quem é seu vendedor/SDR.'
    setErrors(errs)
    if (Object.keys(errs).length > 0) return

    try {
      setSubmitting(true)
      await addLead({
        curso: turmaEscolhida.curso,
        faculdade: turmaEscolhida.faculdade,
        turma: turmaEscolhida.turma,
        anoFormatura: turmaEscolhida.anoFormatura,
        cidade: turmaEscolhida.cidade,
        nome: form.nome.trim(),
        telefone: form.telefone.trim(),
        email: form.email.trim(),
        sdr: form.sdr,
      })
      setForm(EMPTY)
      setErrors({})
      setTurmaEscolhida(null)
      setCursoBusca('')
      setSuccess(true)
    } catch {
      alert('Não foi possível enviar seu cadastro agora. Tente novamente em instantes.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0f14] text-[#f8fafc] flex flex-col items-center justify-center px-4 py-10 font-sans">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt="Amor In Formaturas"
              className="h-14 max-w-[240px] object-contain mb-2"
            />
          ) : (
            <span className="font-bold text-xl tracking-tight text-white mb-2">
              Amor In Formaturas
            </span>
          )}
          <h1 className="text-2xl font-bold text-white text-center tracking-tight mt-2">
            Você quer um presente?
          </h1>
          <p className="text-sm text-slate-400 text-center mt-1">
            Preencha seus dados para entrarmos em contato
          </p>
        </div>

        <div className="bg-[#111820] border border-white/[0.08] rounded-2xl shadow-2xl p-6 sm:p-8">
          {success && (
            <div className="mb-5 flex items-start gap-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 animate-fade-in">
              <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold">Cadastro enviado com sucesso!</p>
                <p className="text-xs text-emerald-300/80">Entraremos em contato em breve.</p>
              </div>
            </div>
          )}

          {/* ===== MODO BUSCAR: encontrar a turma no Mapa de Mercado ===== */}
          {modo === 'buscar' && !turmaEscolhida && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Qual é o seu curso?
                </label>
                <select
                  value={cursoBusca}
                  onChange={(e) => setCursoBusca(e.target.value)}
                  className="w-full bg-[#0a0f14] border border-white/10 rounded-lg px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500/60 transition-colors"
                >
                  <option value="">Selecione seu curso</option>
                  {cursos.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              {buscando && <p className="text-xs text-slate-500">Buscando turmas...</p>}

              {!buscando && cursoBusca && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Qual é a sua faculdade?
                  </label>
                  {faculdadesEncontradas.length === 0 ? (
                    <p className="text-xs text-slate-500 italic">
                      Nenhuma turma de {cursoBusca} encontrada ainda.
                    </p>
                  ) : (
                    <select
                      value={faculdadeBusca}
                      onChange={(e) => setFaculdadeBusca(e.target.value)}
                      className="w-full bg-[#0a0f14] border border-white/10 rounded-lg px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500/60 transition-colors"
                    >
                      <option value="">Selecione sua faculdade</option>
                      {faculdadesEncontradas.map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {!buscando && cursoBusca && faculdadeBusca && (
                <div className="space-y-2">
                  <p className="text-xs text-slate-400">
                    Encontre a sua turma abaixo e clique nela — se não achar, cadastre manualmente.
                  </p>
                  {turmasDaFaculdade.length === 0 && (
                    <p className="text-xs text-slate-500 italic">
                      Nenhuma turma de {cursoBusca} na {faculdadeBusca} encontrada ainda.
                    </p>
                  )}
                  {turmasDaFaculdade.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTurmaEscolhida(t)}
                      className="w-full text-left p-3 rounded-lg bg-[#0a0f14] border border-white/10 hover:border-orange-500/50 hover:bg-orange-500/[0.04] transition-colors"
                    >
                      <div className="text-sm font-semibold text-white">
                        {t.turma} · Formatura {t.anoFormatura}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {t.cidade}
                        {t.periodoAtual && ` · ${t.periodoAtual}º período atual`}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={() => setModo('manual')}
                className="w-full text-center text-xs text-slate-400 hover:text-orange-400 underline decoration-dotted pt-2"
              >
                Não encontrei minha turma — cadastrar manualmente
              </button>
            </div>
          )}

          {/* ===== Turma escolhida no Mapa de Mercado: só pede os dados pessoais ===== */}
          {modo === 'buscar' && turmaEscolhida && (
            <form onSubmit={handleSubmitTurmaEscolhida} className="space-y-4" noValidate>
              <button
                type="button"
                onClick={() => setTurmaEscolhida(null)}
                className="text-xs text-slate-400 hover:text-orange-400 inline-flex items-center gap-1"
              >
                <ArrowLeft className="w-3 h-3" /> Escolher outra turma
              </button>
              <div className="p-3 rounded-lg bg-orange-500/[0.06] border border-orange-500/20">
                <div className="text-sm font-semibold text-white">
                  {turmaEscolhida.curso} — {turmaEscolhida.faculdade}
                </div>
                <div className="text-xs text-slate-400">
                  {turmaEscolhida.cidade} · {turmaEscolhida.turma} · Formatura {turmaEscolhida.anoFormatura}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Quem é seu vendedor/SDR? <span className="text-red-400">*</span>
                </label>
                <select
                  value={form.sdr}
                  onChange={(e) => set('sdr', e.target.value)}
                  className={`w-full bg-[#0a0f14] border rounded-lg px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500/60 transition-colors ${
                    errors.sdr ? 'border-red-500/60' : 'border-white/10'
                  }`}
                >
                  <option value="">Selecione quem te atendeu</option>
                  {vendedores.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
                {errors.sdr && <p className="text-xs text-red-400 mt-1">{errors.sdr}</p>}
              </div>

              <FormField
                label="Nome Completo"
                required
                error={errors.nome}
                value={form.nome}
                onChange={(v) => set('nome', v)}
                placeholder="Ex: João Silva"
              />

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Telefone <span className="text-red-400">*</span>
                </label>
                <input
                  type="tel"
                  inputMode="tel"
                  placeholder="Ex: (11) 99999-9999"
                  value={form.telefone}
                  onChange={(e) => set('telefone', formatPhoneBR(e.target.value))}
                  className={`w-full bg-[#0a0f14] border rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500/60 transition-colors ${
                    errors.telefone ? 'border-red-500/60' : 'border-white/10'
                  }`}
                />
                {errors.telefone && <p className="text-xs text-red-400 mt-1">{errors.telefone}</p>}
              </div>

              <FormField
                label="Email"
                required
                type="email"
                error={errors.email}
                value={form.email}
                onChange={(v) => set('email', v)}
                placeholder="Ex: joao@email.com"
              />

              <button
                type="submit"
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl bg-gradient-to-r from-orange-600 to-orange-600 hover:from-orange-500 hover:to-orange-500 text-white text-sm font-bold shadow-lg shadow-orange-500/30 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60 disabled:hover:scale-100 mt-2"
              >
                <Send className="w-4 h-4" />
                {submitting ? 'Enviando...' : 'Confirmar'}
              </button>
            </form>
          )}

          {/* ===== MODO MANUAL: formulário completo (fallback) ===== */}
          {modo === 'manual' && (
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <button
                type="button"
                onClick={() => setModo('buscar')}
                className="text-xs text-slate-400 hover:text-orange-400 inline-flex items-center gap-1"
              >
                <Search className="w-3 h-3" /> Voltar pra busca de turma
              </button>

              {/* Curso */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Curso <span className="text-red-400">*</span>
                </label>
                <select
                  value={form.curso}
                  onChange={(e) => set('curso', e.target.value)}
                  className={`w-full bg-[#0a0f14] border rounded-lg px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500/60 transition-colors ${
                    errors.curso ? 'border-red-500/60' : 'border-white/10'
                  }`}
                >
                  <option value="">Selecione seu curso</option>
                  {cursos.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                  <option value={OUTRO}>Outro (não está na lista)</option>
                </select>
                {errors.curso && <p className="text-xs text-red-400 mt-1">{errors.curso}</p>}
                {form.curso === OUTRO && (
                  <div className="mt-2">
                    <FormField
                      label="Qual curso?"
                      required
                      error={errors.cursoOutro}
                      value={form.cursoOutro}
                      onChange={(v) => set('cursoOutro', v)}
                      placeholder="Digite o nome do seu curso"
                    />
                  </div>
                )}
              </div>

              {/* Cidade */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Cidade <span className="text-red-400">*</span>
                </label>
                <select
                  value={form.cidade}
                  onChange={(e) => {
                    set('cidade', e.target.value)
                    set('faculdade', '')
                  }}
                  className={`w-full bg-[#0a0f14] border rounded-lg px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500/60 transition-colors ${
                    errors.cidade ? 'border-red-500/60' : 'border-white/10'
                  }`}
                >
                  <option value="">Selecione sua cidade</option>
                  {cidades.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                  <option value={OUTRO}>Outra (não está na lista)</option>
                </select>
                {errors.cidade && <p className="text-xs text-red-400 mt-1">{errors.cidade}</p>}
                {form.cidade === OUTRO && (
                  <div className="mt-2">
                    <FormField
                      label="Qual cidade?"
                      required
                      error={errors.cidadeOutro}
                      value={form.cidadeOutro}
                      onChange={(v) => set('cidadeOutro', v)}
                      placeholder="Digite o nome da sua cidade"
                    />
                  </div>
                )}
              </div>

              {/* Faculdade */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Faculdade <span className="text-red-400">*</span>
                </label>
                <select
                  value={form.faculdade}
                  onChange={(e) => set('faculdade', e.target.value)}
                  disabled={!form.cidade}
                  className={`w-full bg-[#0a0f14] border rounded-lg px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500/60 transition-colors disabled:opacity-50 ${
                    errors.faculdade ? 'border-red-500/60' : 'border-white/10'
                  }`}
                >
                  <option value="">
                    {form.cidade ? 'Selecione sua faculdade' : 'Selecione a cidade primeiro'}
                  </option>
                  {faculdadesDaCidade.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                  <option value={OUTRO}>Outra (não está na lista)</option>
                </select>
                {errors.faculdade && <p className="text-xs text-red-400 mt-1">{errors.faculdade}</p>}
                {form.faculdade === OUTRO && (
                  <div className="mt-2">
                    <FormField
                      label="Qual faculdade?"
                      required
                      error={errors.faculdadeOutro}
                      value={form.faculdadeOutro}
                      onChange={(v) => set('faculdadeOutro', v)}
                      placeholder="Digite o nome da sua faculdade"
                    />
                  </div>
                )}
              </div>

              {/* Turma */}
              <div>
                <FormField
                  label="Turma"
                  value={form.turma}
                  onChange={(v) => set('turma', v)}
                  placeholder="Ex: Turma 10 (não é o semestre)"
                />
                <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                  Informe o número da turma, não o semestre. Ex: Turma 10, Turma 11. Se não souber,
                  deixe em branco.
                </p>
              </div>

              {/* Ano de Formatura */}
              <div>
                <FormField
                  label="Ano de Formatura"
                  required
                  error={errors.anoFormatura}
                  value={form.anoFormatura}
                  onChange={(v) => set('anoFormatura', v)}
                  placeholder="Ex: 2026.2"
                />
                <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                  Ano em que a formatura vai acontecer. Ex: 2026.2
                </p>
              </div>

              {/* Vendedor / SDR */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Quem é seu vendedor/SDR? <span className="text-red-400">*</span>
                </label>
                <select
                  value={form.sdr}
                  onChange={(e) => set('sdr', e.target.value)}
                  className={`w-full bg-[#0a0f14] border rounded-lg px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500/60 transition-colors ${
                    errors.sdr ? 'border-red-500/60' : 'border-white/10'
                  }`}
                >
                  <option value="">Selecione quem te atendeu</option>
                  {vendedores.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
                {errors.sdr && <p className="text-xs text-red-400 mt-1">{errors.sdr}</p>}
              </div>

              {/* Nome Completo */}
              <FormField
                label="Nome Completo"
                required
                error={errors.nome}
                value={form.nome}
                onChange={(v) => set('nome', v)}
                placeholder="Ex: João Silva"
              />

              {/* Telefone */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Telefone <span className="text-red-400">*</span>
                </label>
                <input
                  type="tel"
                  inputMode="tel"
                  placeholder="Ex: (11) 99999-9999"
                  value={form.telefone}
                  onChange={(e) => set('telefone', formatPhoneBR(e.target.value))}
                  className={`w-full bg-[#0a0f14] border rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500/60 transition-colors ${
                    errors.telefone ? 'border-red-500/60' : 'border-white/10'
                  }`}
                />
                {errors.telefone && <p className="text-xs text-red-400 mt-1">{errors.telefone}</p>}
              </div>

              {/* Email */}
              <FormField
                label="Email"
                required
                type="email"
                error={errors.email}
                value={form.email}
                onChange={(v) => set('email', v)}
                placeholder="Ex: joao@email.com"
              />

              {/* Submit */}
              <button
                type="submit"
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl bg-gradient-to-r from-orange-600 to-orange-600 hover:from-orange-500 hover:to-orange-500 text-white text-sm font-bold shadow-lg shadow-orange-500/30 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60 disabled:hover:scale-100 mt-2"
              >
                <Send className="w-4 h-4" />
                {submitting ? 'Enviando...' : 'Enviar'}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-[11px] text-slate-600 mt-6">
          Amor In Formaturas — Seus dados estão seguros e não serão compartilhados.
        </p>
      </div>
    </div>
  )
}

interface FormFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  required?: boolean
  type?: string
  error?: string
}

function FormField({
  label,
  value,
  onChange,
  placeholder,
  required,
  type = 'text',
  error,
}: FormFieldProps) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-300 mb-1.5">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full bg-[#0a0f14] border rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500/60 transition-colors ${
          error ? 'border-red-500/60' : 'border-white/10'
        }`}
      />
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  )
}
