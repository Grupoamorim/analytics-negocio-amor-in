import type { ReactNode } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import { Toaster as Sonner } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { CRMProvider } from '@/context/CRMContext'
import { AcessoProvider, useAcesso } from '@/context/AcessoContext'
import { useAuth } from '@/hooks/useAuth'
import Layout from '@/components/Layout'

// Páginas reais e funcionais
import Login from '@/pages/Login'
import RedefinirSenha from '@/pages/RedefinirSenha'
import Index from '@/pages/Index'
import PainelFinanceiro from '@/pages/PainelFinanceiro'
import Agenda from '@/pages/Agenda'
import ApresentacaoPublica from '@/pages/ApresentacaoPublica'
import Pipeline from '@/pages/Pipeline'
import Leads from '@/pages/Leads'
import Probability from '@/pages/Probability'
import Transcripts from '@/pages/Transcripts'
import WhatsappComercial from '@/pages/WhatsappComercial'
import Notes from '@/pages/Notes'
import NotFound from '@/pages/NotFound'
import Captacao from '@/pages/Captacao'
import CaptacaoForm from '@/pages/CaptacaoForm'
import Contatos from '@/pages/Contatos'
import Clientes from '@/pages/Clientes'
import Adesoes from '@/pages/Adesoes'
import Financeiro from '@/pages/Financeiro'
import DRE from '@/pages/DRE'
import Projecoes from '@/pages/Projecoes'
import Relatorios from '@/pages/Relatorios'
import Admin from '@/pages/Admin'
import EmbedTurma from '@/pages/EmbedTurma'

const TELA_CARREGANDO = (
  <div className="min-h-screen bg-[#0a0f14] flex items-center justify-center text-slate-400 text-sm">
    Carregando...
  </div>
)

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, loading } = useAuth()
  if (loading) return TELA_CARREGANDO
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}

/** Bloqueia acesso direto (inclusive digitando a URL) a abas que o admin não liberou pro usuário. */
function RotaComPermissao({ path, children }: { path: string; children: ReactNode }) {
  const { carregando, podeVer, primeiraPaginaPermitida } = useAcesso()
  if (carregando) return TELA_CARREGANDO
  if (!podeVer(path)) return <Navigate to={primeiraPaginaPermitida} replace />
  return <>{children}</>
}

function AdminRoute({ children }: { children: ReactNode }) {
  const { carregando, isAdmin, primeiraPaginaPermitida } = useAcesso()
  if (carregando) {
    return (
      <div className="min-h-screen bg-[#0a0f14] flex items-center justify-center text-slate-400 text-sm">
        Verificando permissões...
      </div>
    )
  }
  if (!isAdmin) return <Navigate to={primeiraPaginaPermitida} replace />
  return <>{children}</>
}

const App = () => (
  <AcessoProvider>
    <CRMProvider>
      <BrowserRouter>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/redefinir-senha" element={<RedefinirSenha />} />
            {/* Sem Layout/topbar — carregado dentro de um <iframe> pela extensão do
                WhatsApp. A sessão chega por postMessage, não pela URL. */}
            <Route path="/embed/turma/:turmaId" element={<EmbedTurma />} />
            <Route
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<RotaComPermissao path="/"><Index /></RotaComPermissao>} />
              <Route path="/painel-financeiro" element={<RotaComPermissao path="/painel-financeiro"><PainelFinanceiro /></RotaComPermissao>} />
              <Route path="/agenda" element={<RotaComPermissao path="/agenda"><Agenda /></RotaComPermissao>} />
              <Route path="/pipeline" element={<RotaComPermissao path="/pipeline"><Pipeline /></RotaComPermissao>} />
              <Route path="/leads" element={<RotaComPermissao path="/leads"><Leads /></RotaComPermissao>} />
              <Route path="/contatos" element={<RotaComPermissao path="/contatos"><Contatos /></RotaComPermissao>} />
              <Route path="/clientes" element={<RotaComPermissao path="/clientes"><Clientes /></RotaComPermissao>} />
              <Route path="/probabilidade" element={<RotaComPermissao path="/probabilidade"><Probability /></RotaComPermissao>} />
              <Route path="/transcricoes" element={<RotaComPermissao path="/transcricoes"><Transcripts /></RotaComPermissao>} />
              <Route path="/whatsapp-comercial" element={<RotaComPermissao path="/whatsapp-comercial"><WhatsappComercial /></RotaComPermissao>} />
              <Route path="/notas" element={<RotaComPermissao path="/notas"><Notes /></RotaComPermissao>} />
              <Route path="/captacao" element={<RotaComPermissao path="/captacao"><Captacao /></RotaComPermissao>} />
              <Route path="/mapa-mercado" element={<Navigate to="/captacao?tab=mapa" replace />} />
              <Route path="/adesoes" element={<RotaComPermissao path="/adesoes"><Adesoes /></RotaComPermissao>} />
              <Route path="/financeiro" element={<RotaComPermissao path="/financeiro"><Financeiro /></RotaComPermissao>} />
              <Route path="/dre" element={<RotaComPermissao path="/dre"><DRE /></RotaComPermissao>} />
              <Route path="/projecoes" element={<RotaComPermissao path="/projecoes"><Projecoes /></RotaComPermissao>} />
              <Route path="/relatorios" element={<RotaComPermissao path="/relatorios"><Relatorios /></RotaComPermissao>} />
              <Route path="/configuracoes" element={<Navigate to="/admin" replace />} />
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
            <Route path="/p/:token" element={<ApresentacaoPublica />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </TooltipProvider>
      </BrowserRouter>
    </CRMProvider>
  </AcessoProvider>
)

export default App
