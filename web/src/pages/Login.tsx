import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { LogIn, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase/client'
import { translateAuthError } from '@/lib/authErrors'

export default function Login() {
  const { isAuthenticated, loading, signIn, signUp } = useAuth()
  const [modo, setModo] = useState<'entrar' | 'criar' | 'recuperar'>('entrar')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [enviando, setEnviando] = useState(false)

  if (!loading && isAuthenticated) {
    return <Navigate to="/" replace />
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setAviso('')
    setEnviando(true)
    try {
      if (modo === 'entrar') {
        const { error } = await signIn(email, senha)
        if (error) setErro(translateAuthError(error.message))
      } else if (modo === 'criar') {
        const { error } = await signUp(email, senha)
        if (error) setErro(translateAuthError(error.message))
        else setAviso('Conta criada! Verifique seu e-mail para confirmar o acesso, se solicitado.')
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/redefinir-senha`,
        })
        if (error) setErro(translateAuthError(error.message))
        else setAviso('Se esse e-mail tiver uma conta, enviamos um link para redefinir a senha.')
      }
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0f14] flex items-center justify-center p-4">
      <Card className="w-full max-w-sm bg-[#111820] border-white/[0.08]">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 p-2.5 rounded-xl bg-orange-500/15 border border-orange-500/20 w-fit">
            <span className="text-2xl">📸</span>
          </div>
          <CardTitle className="text-white">Amor In Formaturas</CardTitle>
          <CardDescription>
            {modo === 'entrar' && 'Entre com sua conta'}
            {modo === 'criar' && 'Crie sua conta de acesso'}
            {modo === 'recuperar' && 'Informe seu e-mail para receber o link de redefinição'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">E-mail</label>
              <Input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@exemplo.com"
                className="bg-[#0a0f14] border-white/[0.1] text-white"
              />
            </div>
            {modo !== 'recuperar' && (
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Senha</label>
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
            )}

            {modo === 'entrar' && (
              <button
                type="button"
                onClick={() => {
                  setModo('recuperar')
                  setErro('')
                  setAviso('')
                }}
                className="text-[11px] text-slate-400 hover:text-orange-400 -mt-1"
              >
                Esqueceu a senha?
              </button>
            )}

            {erro && <p className="text-xs text-rose-400">{erro}</p>}
            {aviso && <p className="text-xs text-emerald-400">{aviso}</p>}

            <Button
              type="submit"
              disabled={enviando}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold"
            >
              {modo === 'entrar' && (
                <>
                  <LogIn className="w-4 h-4 mr-2" /> Entrar
                </>
              )}
              {modo === 'criar' && (
                <>
                  <UserPlus className="w-4 h-4 mr-2" /> Criar conta
                </>
              )}
              {modo === 'recuperar' && 'Enviar link de redefinição'}
            </Button>
          </form>

          <button
            type="button"
            onClick={() => {
              setModo(modo === 'entrar' ? 'criar' : 'entrar')
              setErro('')
              setAviso('')
            }}
            className="w-full text-center text-xs text-slate-400 hover:text-orange-400 mt-4"
          >
            {modo === 'criar' || modo === 'recuperar' ? 'Já tem conta? Entrar' : 'Ainda não tem conta? Criar uma'}
          </button>
        </CardContent>
      </Card>
    </div>
  )
}
