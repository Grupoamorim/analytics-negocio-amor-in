import { useState } from 'react'
import { Target, Send, CheckCircle2 } from 'lucide-react'
import { addLead } from '@/utils/captacaoStorage'
import { formatPhoneBR } from '@/utils/phoneMask'
import { useToast } from '@/hooks/use-toast'

interface FormState {
  curso: string
  faculdade: string
  turma: string
  anoFormatura: string
  cidade: string
  nome: string
  telefone: string
  email: string
}

const EMPTY: FormState = {
  curso: '',
  faculdade: '',
  turma: '',
  anoFormatura: '',
  cidade: '',
  nome: '',
  telefone: '',
  email: '',
}

export default function CaptacaoForm() {
  const [form, setForm] = useState<FormState>(EMPTY)
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)

  const set = (field: keyof FormState, value: string) => {
    setForm((f) => ({ ...f, [field]: value }))
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }))
    if (success) setSuccess(false)
  }

  const validate = (): boolean => {
    const errs: Partial<Record<keyof FormState, string>> = {}
    if (!form.curso.trim()) errs.curso = 'Informe o curso.'
    if (!form.faculdade.trim()) errs.faculdade = 'Informe a faculdade.'
    if (!form.anoFormatura.trim()) errs.anoFormatura = 'Informe o ano de formatura.'
    if (!form.cidade.trim()) errs.cidade = 'Informe a cidade.'
    if (!form.nome.trim()) errs.nome = 'Informe seu nome completo.'
    if (!form.telefone.trim()) errs.telefone = 'Informe seu telefone.'
    else if (form.telefone.replace(/\D/g, '').length < 10) errs.telefone = 'Telefone inválido.'
    if (!form.email.trim()) errs.email = 'Informe seu email.'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = 'Email inválido.'

    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) {
      showToast('Erro no cadastro', 'Verifique os campos destacados.', 'error')
      return
    }

    try {
      setSubmitting(true)
      addLead({
        curso: form.curso.trim(),
        faculdade: form.faculdade.trim(),
        turma: form.turma.trim(),
        anoFormatura: form.anoFormatura.trim(),
        cidade: form.cidade.trim(),
        nome: form.nome.trim(),
        telefone: form.telefone.trim(),
        email: form.email.trim(),
      })
      setForm(EMPTY)
      setErrors({})
      setSuccess(true)
      showToast('Cadastro enviado com sucesso!', 'Entraremos em contato em breve.', 'success')
    } catch {
      showToast('Erro ao enviar', 'Não foi possível salvar seu cadastro. Tente novamente.', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  // Toast visual simples dentro do layout standalone (sem o Toaster do app)
  const showToast = (title: string, _description: string, _variant: 'success' | 'error') => {
    // O Toaster global está montado em App.tsx, então usamos um evento custom
    // simples: exibimos um banner interno via state `success` / error local.
    // (Mantemos dependência do state visual abaixo.)
    if (_variant === 'success') setSuccess(true)
    void title
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

            {/* Faculdade */}
            <FormField
              label="FACULDADE"
              required
              error={errors.faculdade}
              value={form.faculdade}
              onChange={(v) => set('faculdade', v)}
              placeholder="Ex: USP"
            />

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

            {/* Cidade */}
            <FormField
              label="Cidade"
              required
              error={errors.cidade}
              value={form.cidade}
              onChange={(v) => set('cidade', v)}
              placeholder="Ex: São Paulo"
            />

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
              Enviar
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
