import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { KeyRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { supabase } from '@/lib/supabase/client'

export default function RedefinirSenha() {
  const navigate = useNavigate()
  const [pronto, setPronto] = useState(false)
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState(false)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setPronto(true)
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
      setErro(error.message)
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
          <CardDescription>Defina a nova senha de acesso à sua conta</CardDescription>
        </CardHeader>
        <CardContent>
          {!pronto && !sucesso && (
            <p className="text-xs text-slate-400 text-center">
              Abra esta página pelo link recebido no e-mail de redefinição de senha.
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
