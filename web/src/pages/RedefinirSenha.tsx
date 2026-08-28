import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { KeyRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { supabase } from '@/lib/supabase/client'
import { translateAuthError } from '@/lib/authErrors'

export default function RedefinirSenha() {
  const navigate = useNavigate()
  const [pronto, setPronto] = useState(false)
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [linkErro, setLinkErro] = useState('')
  const [sucesso, setSucesso] = useState(false)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    // Erros vindos do próprio link do Supabase (token expirado, já usado, etc.)
    // chegam no hash (#error=...&error_description=...) ou na query (?error=...).
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const query = new URLSearchParams(window.location.search)
    const errDesc =
      hash.get('error_description') ||
      query.get('error_description') ||
      hash.get('error') ||
      query.get('error')
    if (errDesc) {
      setLinkErro(decodeURIComponent(errDesc.replace(/\+/g, ' ')))
      return
    }

    // Convite e "esqueci a senha" caem aqui: o supabase-js processa o token do
    // link (recovery OU invite) e abre uma sessão. Serve pros dois fluxos.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN' || session) setPronto(true)
    })
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setPronto(true)
    })
    return () => subscription.unsubscribe()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setEnviando(true)
    const { error } = await supabase.auth.updateUser({ password: senha })
    setEnviando(false)
    if (error) {
      setErro(translateAuthError(error.message))
      return
    }
    setSucesso(true)
    setTimeout(() => navigate('/'), 2000)
  }

  return (
    <div className="min-h-screen bg-[#0a0f14] flex items-center justify-center p-4">
      <Card className="w-full max-w-sm bg-[#111820] border-white/[0.08]">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 p-2.5 rounded-xl bg-orange-500/15 border border-orange-500/20 w-fit">
            <KeyRound className="w-6 h-6 text-orange-400" />
          </div>
          <CardTitle className="text-white">Nova senha</CardTitle>
          <CardDescription>Defina a senha de acesso à sua conta</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {linkErro && (
            <div className="text-xs text-rose-400 text-center space-y-2">
              <p>Esse link não é mais válido: {linkErro}</p>
              <p className="text-slate-400">
                Links de convite/redefinição valem uma vez só e expiram rápido. Peça um novo em{' '}
                <button
                  type="button"
                  onClick={() => navigate('/login')}
                  className="text-orange-400 hover:underline"
                >
                  Entrar → Esqueci minha senha
                </button>
                , ou peça pro admin reenviar o convite.
              </p>
            </div>
          )}

          {!pronto && !sucesso && !linkErro && (
            <p className="text-xs text-slate-400 text-center">
              Abra esta página pelo link recebido no e-mail (convite ou redefinição de senha).
            </p>
          )}

          {pronto && !sucesso && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Nova senha</label>
                <Input
                  type="password"
                  required
                  minLength={6}
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  placeholder="••••••••"
                  className="bg-[#0a0f14] border-white/[0.1] text-white"
                />
              </div>
              {erro && <p className="text-xs text-rose-400">{erro}</p>}
              <Button
                type="submit"
                disabled={enviando}
                className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold"
              >
                Salvar nova senha
              </Button>
            </form>
          )}

          {sucesso && (
            <p className="text-xs text-emerald-400 text-center">
              Senha atualizada! Redirecionando...
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
