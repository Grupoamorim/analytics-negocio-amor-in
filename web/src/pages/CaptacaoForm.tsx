import { useEffect, useMemo, useState } from 'react'
import { Target, Send, CheckCircle2 } from 'lucide-react'
import { addLead } from '@/utils/captacaoStorage'
import { fetchCidadeFaculdades, CidadeFaculdadesMap } from '@/utils/mercadoFaculdades'
import { fetchVendedoresAtivos } from '@/utils/vendedores'
import { formatPhoneBR } from '@/utils/phoneMask'

const OUTRO = '__outro__'

interface FormState {
  curso: string
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

export default function CaptacaoForm() {
  const [form, setForm] = useState<FormState>(EMPTY)
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [cidadeFaculdades, setCidadeFaculdades] = useState<CidadeFaculdadesMap>({})
  const [vendedores, setVendedores] = useState<string[]>([])

  useEffect(() => {
    fetchCidadeFaculdades().then(setCidadeFaculdades)
    fetchVendedoresAtivos().then(setVendedores)
  }, [])

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

  const validate = (): boolean => {
    const errs: Partial<Record<keyof FormState, string>> = {}
    if (!form.curso.trim()) errs.curso = 'Informe o curso.'
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return

    try {
      setSubmitting(true)
      await addLead({
        curso: form.curso.trim(),
        faculdade: faculdadeFinal,
        turma: form.turma.trim(),
        anoFormatura: form.anoFormatura.trim(),
        cidade: cidadeFinal,
        nome: form.nome.trim(),
        telefone: form.telefone.trim(),
        email: form.email.trim(),
        sdr: form.sdr,
      })
      setForm(EMPTY)
      setErrors({})
      setSuccess(true)
    } catch {
      setErrors((e) => ({ ...e, nome: undefined }))
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
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-xl bg-orange-500/10 border border-orange-500/20">
              <Target className="w-7 h-7 text-orange-400" />
            </div>
            <span className="font-bold text-xl tracking-tight text-white">Amor In Formaturas</span>
          </div>
          <h1 className="text-2xl font-bold text-white text-center tracking-tight mt-2">
            Cadastro de Interesse
          </h1>
          <p className="text-sm text-slate-400 text-center mt-1">
            Preencha seus dados para entrarmos em contato
          </p>
        </div>

        {/* Card central */}
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

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {/* Curso */}
            <FormField
              label="Curso"
              required
              error={errors.curso}
              value={form.curso}
              onChange={(v) => set('curso', v)}
              placeholder="Ex: Engenharia Civil"
            />

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
