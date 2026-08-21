import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import { Toaster as Sonner } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { CRMProvider } from '@/context/CRMContext'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase/client'
import Layout from '@/components/Layout'

// Páginas reais e funcionais
import Login from '@/pages/Login'
import RedefinirSenha from '@/pages/RedefinirSenha'
import Index from '@/pages/Index'
import Pipeline from '@/pages/Pipeline'
import Leads from '@/pages/Leads'
import Probability from '@/pages/Probability'
import Transcripts from '@/pages/Transcripts'
import Notes from '@/pages/Notes'
import Settings from '@/pages/Settings'
import NotFound from '@/pages/NotFound'
import Captacao from '@/pages/Captacao'
import CaptacaoForm from '@/pages/CaptacaoForm'
import Contatos from '@/pages/Contatos'
import MapaMercado from '@/pages/MapaMercado'
import Financeiro from '@/pages/Financeiro'
import DRE from '@/pages/DRE'
import Projecoes from '@/pages/Projecoes'
import Admin from '@/pages/Admin'

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, loading } = useAuth()
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0f14] flex items-center justify-center text-slate-400 text-sm">
        Carregando...
      </div>
    )
  }
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}

function AdminRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const [checando, setChecando] = useState(true)
  const [ehAdmin, setEhAdmin] = useState(false)

  useEffect(() => {
    if (!user) return
    supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        setEhAdmin(data?.role === 'admin')
        setChecando(false)
      })
  }, [user])

  if (loading || checando) {
    return (
      <div className="min-h-screen bg-[#0a0f14] flex items-center justify-center text-slate-400 text-sm">
        Verificando permissões...
      </div>
    )
  }
  if (!ehAdmin) return <Navigate to="/" replace />
  return <>{children}</>
}

const App = () => (
  <CRMProvider>
    <BrowserRouter>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/redefinir-senha" element={<RedefinirSenha />} />
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<Index />} />
            <Route path="/pipeline" element={<Pipeline />} />
            <Route path="/leads" element={<Leads />} />
            <Route path="/contatos" element={<Contatos />} />
            <Route path="/probabilidade" element={<Probability />} />
            <Route path="/transcricoes" element={<Transcripts />} />
            <Route path="/notas" element={<Notes />} />
            <Route path="/captacao" element={<Captacao />} />
            <Route path="/mapa-mercado" element={<MapaMercado />} />
            <Route path="/financeiro" element={<Financeiro />} />
            <Route path="/dre" element={<DRE />} />
            <Route path="/projecoes" element={<Projecoes />} />
            <Route path="/configuracoes" element={<Settings />} />
            <Route
              path="/admin"
              element={
                <AdminRoute>
                  <Admin />
                </AdminRoute>
              }
            />
          </Route>
          <Route path="/captacao/form" element={<CaptacaoForm />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </TooltipProvider>
    </BrowserRouter>
  </CRMProvider>
)

export default App
