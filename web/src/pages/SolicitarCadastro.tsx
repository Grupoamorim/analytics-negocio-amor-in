import { useEffect, useState } from 'react'
import { CheckCircle2, Send } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'

/** Cadastro público — link enviado pra quem vai pedir acesso ao sistema (ex: um
 * fotógrafo novo). Só coleta nome/e-mail/telefone/mensagem; não cria conta nem
 * pede senha nenhuma — o Lucas aprova depois em Administração > Usuários,
 * escolhendo lá a função e as abas liberadas, e o convite oficial (com link de
 * senha) sai pelo mesmo fluxo seguro que já existe (invite-user). */
export default function SolicitarCadastro() {
  const [logoUrl, setLogoUrl] = useState('')
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [telefone, setTelefone] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    supabase
      .from('logo_marca_publica')
      .select('logo_url')
      .maybeSingle()
      .then(({ data }) => setLogoUrl(data?.logo_url || ''))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim() || !email.trim()) {
      setErro('Preencha nome e e-mail.')
      return
    }
    setEnviando(true)
    setErro(null)
    try {
      const { error } = await (supabase as any).from('solicitacoes_cadastro').insert({
        nome: nome.trim(),
        email: email.trim().toLowerCase(),
        telefone: telefone.trim() || null,
        mensagem: mensagem.trim() || null,
      })
      if (error) throw error
      setSuccess(true)
      setNome('')
      setEmail('')
      setTelefone('')
      setMensagem('')
    } catch (err: any) {
      setErro(err?.message || 'Não foi possível enviar agora, tente de novo em instantes.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0f14] text-[#f8fafc] flex flex-col items-center justify-center px-4 py-10 font-sans">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          {logoUrl ? (
            <img src={logoUrl} alt="Amor In Formaturas" className="h-14 max-w-[240px] object-contain mb-2" />
          ) : (
            <span className="font-bold text-xl tracking-tight text-white mb-2">Amor In Formaturas</span>
          )}
          <h1 className="text-2xl font-bold text-white text-center tracking-tight mt-2">Solicitar cadastro</h1>
          <p className="text-sm text-slate-400 text-center mt-1">
            Preencha seus dados — sua solicitação vai passar por aprovação antes de você ter acesso.
          </p>
        </div>

        <div className="bg-[#111820] border border-white/[0.08] rounded-2xl shadow-2xl p-6 sm:p-8">
          {success ? (
            <div className="flex flex-col items-center text-center gap-3 py-4">
              <CheckCircle2 className="w-10 h-10 text-emerald-400" />
              <p className="text-base font-semibold text-white">Recebemos seu cadastro!</p>
              <p className="text-sm text-slate-400">
                Aguarde a aprovação — você recebe um e-mail assim que seu acesso for liberado.
              </p>
              <button
                type="button"
                onClick={() => setSuccess(false)}
                className="text-xs text-orange-400 hover:underline mt-2"
              >
                Enviar outro cadastro
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Nome completo *</label>
                <input
                  type="text"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  className="w-full bg-[#0a0f14] border border-white/10 rounded-lg px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500/60 transition-colors"
                  placeholder="Seu nome"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">E-mail *</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-[#0a0f14] border border-white/10 rounded-lg px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500/60 transition-colors"
                  placeholder="voce@email.com"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Telefone (opcional)</label>
                <input
                  type="tel"
                  value={telefone}
                  onChange={(e) => setTelefone(e.target.value)}
                  className="w-full bg-[#0a0f14] border border-white/10 rounded-lg px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500/60 transition-colors"
                  placeholder="(77) 99999-9999"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Mensagem (opcional)
                </label>
                <textarea
                  value={mensagem}
                  onChange={(e) => setMensagem(e.target.value)}
                  rows={3}
                  className="w-full bg-[#0a0f14] border border-white/10 rounded-lg px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500/60 transition-colors resize-y"
                  placeholder="Ex: sou fotógrafo, trabalho com..."
                />
              </div>

              {erro && <p className="text-xs text-rose-400">{erro}</p>}

              <button
                type="submit"
                disabled={enviando}
                className="w-full flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-semibold text-sm rounded-lg py-2.5 transition-colors"
              >
                <Send className="w-4 h-4" />
                {enviando ? 'Enviando...' : 'Enviar cadastro'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
