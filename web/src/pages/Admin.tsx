import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { useConfiguracoes } from '@/hooks/useConfiguracoes'
import { useAuth } from '@/hooks/useAuth'
import { translateAuthError } from '@/lib/authErrors'
import {
  saveGeminiApiKey,
  saveGeminiModel,
  saveCustomSystemPrompt,
  testGeminiConnection,
  GEMINI_DEFAULT_MODEL,
} from '@/utils/geminiApi'
import { testSGEConnection } from '@/utils/sgeIntegration'
import { supabase } from '@/lib/supabase/client'
import {
  ShieldCheck,
  Users,
  Building,
  Brain,
  Save,
  CheckCircle2,
  AlertCircle,
  User as UserIcon,
  Database,
  RefreshCw,
  LogOut,
  LogIn,
  Image as ImageIcon,
  Trash2,
} from 'lucide-react'

interface Perfil {
  id: string
  email: string
  nome: string
  role: 'admin' | 'financeiro' | 'comercial' | 'membro'
  created_at: string
}

const CARGOS: { value: Perfil['role']; label: string }[] = [
  { value: 'admin', label: 'Administrador' },
  { value: 'financeiro', label: 'Financeiro' },
  { value: 'comercial', label: 'Comercial' },
  { value: 'membro', label: 'Membro' },
]

export default function Admin() {
  const { toast } = useToast()
  const { config, updateConfig, loading: configLoading } = useConfiguracoes()
  const { user, isAuthenticated, signIn, signOut, signUp } = useAuth()

  // Usuários e Cargos
  const [perfis, setPerfis] = useState<Perfil[]>([])
  const [carregandoPerfis, setCarregandoPerfis] = useState(true)
  const [salvandoId, setSalvandoId] = useState<string | null>(null)

  // SGE State
  const [sgeCnpj, setSgeCnpj] = useState('')
  const [sgeToken, setSgeToken] = useState('')

  // Gemini State
  const [geminiKey, setGeminiKey] = useState('')
  const [geminiModel, setGeminiModel] = useState(GEMINI_DEFAULT_MODEL)
  const [iaSystemPrompt, setIaSystemPrompt] = useState('')

  // Auth form state
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login')
  const [authSubmitting, setAuthSubmitting] = useState(false)

  // Notification Preferences
  const [notifyOnNewLead, setNotifyOnNewLead] = useState(true)
  const [notifyOnDealWon, setNotifyOnDealWon] = useState(true)
  const [autoSyncSGE, setAutoSyncSGE] = useState(false)

  // Logo da marca
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState('')
  const [uploadingLogo, setUploadingLogo] = useState(false)

  // Status de conexão das integrações
  const [sgeStatus, setSgeStatus] = useState<{ ok: boolean; message: string } | null>(null)
  const [testingSGE, setTestingSGE] = useState(false)
  const [geminiStatus, setGeminiStatus] = useState<{ ok: boolean; message: string } | null>(null)
  const [testingGemini, setTestingGemini] = useState(false)

  useEffect(() => {
    async function carregar() {
      setCarregandoPerfis(true)
      const { data } = await supabase.from('profiles').select('*').order('created_at')
      setPerfis((data || []) as Perfil[])
      setCarregandoPerfis(false)
    }
    carregar()
  }, [])

  async function mudarCargo(id: string, role: Perfil['role']) {
    setSalvandoId(id)
    await supabase.from('profiles').update({ role }).eq('id', id)
    setPerfis((prev) => prev.map((p) => (p.id === id ? { ...p, role } : p)))
    setSalvandoId(null)
  }

  // Sync state from hook config
  useEffect(() => {
    if (config) {
      setSgeCnpj(config.sgeCnpj || '')
      setSgeToken(config.sgeToken || '')
      setGeminiKey(config.geminiApiKey || '')
      if (config.geminiApiKey) saveGeminiApiKey(config.geminiApiKey)
      if (config.logoUrl) setLogoPreview(config.logoUrl)
      if (config.preferencias) {
        if (config.preferencias.notifyOnNewLead !== undefined)
          setNotifyOnNewLead(config.preferencias.notifyOnNewLead)
        if (config.preferencias.notifyOnDealWon !== undefined)
          setNotifyOnDealWon(config.preferencias.notifyOnDealWon)
        if (config.preferencias.autoSyncSGE !== undefined)
          setAutoSyncSGE(config.preferencias.autoSyncSGE)
        if (config.preferencias.geminiModel) setGeminiModel(config.preferencias.geminiModel)
        if (config.preferencias.iaSystemPrompt !== undefined) {
          setIaSystemPrompt(config.preferencias.iaSystemPrompt)
          saveCustomSystemPrompt(config.preferencias.iaSystemPrompt)
        }
      }
    }
  }, [config])

  const handleSaveSGE = async () => {
    try {
      await updateConfig({ sgeCnpj, sgeToken })
      setSgeStatus(null)
      toast({
        title: 'Configurações SGE Salvas',
        description: 'As credenciais do SGE foram sincronizadas com sucesso.',
      })
    } catch {
      toast({
        title: 'Erro ao salvar',
        description: 'Não foi possível salvar as credenciais do SGE.',
        variant: 'destructive',
      })
    }
  }

  const handleTestSGE = async () => {
    setTestingSGE(true)
    setSgeStatus(null)
    const result = await testSGEConnection(sgeCnpj, sgeToken)
    setTestingSGE(false)

    if (result.ok) {
      try {
        await updateConfig({ sgeCnpj, sgeToken })
        setSgeStatus({ ok: true, message: `${result.message} Credenciais salvas.` })
      } catch {
        setSgeStatus({
          ok: false,
          message: 'A conexão funcionou, mas não foi possível salvar as credenciais. Tente novamente.',
        })
      }
    } else {
      setSgeStatus({ ok: result.ok, message: result.message })
    }
  }

  const handleSaveGemini = async () => {
    try {
      await updateConfig({
        geminiApiKey: geminiKey,
        preferencias: { ...config.preferencias, geminiModel, iaSystemPrompt },
      })
      saveGeminiApiKey(geminiKey)
      saveGeminiModel(geminiModel)
      saveCustomSystemPrompt(iaSystemPrompt)
      setGeminiStatus(null)
      toast({
        title: 'Configurações do Gemini Salvas',
        description: 'Chave de API configurada para análise de reuniões.',
      })
    } catch {
      toast({
        title: 'Erro ao salvar',
        description: 'Não foi possível salvar a chave do Gemini.',
        variant: 'destructive',
      })
    }
  }

  const handleTestGemini = async () => {
    setTestingGemini(true)
    setGeminiStatus(null)
    const result = await testGeminiConnection(geminiKey, geminiModel)
    setTestingGemini(false)

    if (result.ok) {
      try {
        await updateConfig({
          geminiApiKey: geminiKey,
          preferencias: { ...config.preferencias, geminiModel, iaSystemPrompt },
        })
        saveGeminiApiKey(geminiKey)
        saveGeminiModel(geminiModel)
        saveCustomSystemPrompt(iaSystemPrompt)
        setGeminiStatus({ ok: true, message: `${result.message} Credenciais salvas.` })
      } catch {
        setGeminiStatus({
          ok: false,
          message: 'A conexão funcionou, mas não foi possível salvar a chave. Tente novamente.',
        })
      }
    } else {
      setGeminiStatus({ ok: result.ok, message: result.message })
    }
  }

  const handleSelectLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.type !== 'image/png') {
      toast({
        title: 'Formato inválido',
        description: 'Envie um arquivo PNG (idealmente sem fundo/transparente).',
        variant: 'destructive',
      })
      return
    }
    setLogoFile(file)
    setLogoPreview(URL.createObjectURL(file))
  }

  const handleUploadLogo = async () => {
    if (!logoFile || !user) return
    setUploadingLogo(true)
    try {
      const path = `${user.id}/logo.png`
      const { error: uploadErr } = await supabase.storage
        .from('logos')
        .upload(path, logoFile, { upsert: true, contentType: 'image/png' })
      if (uploadErr) throw uploadErr

      const { data } = supabase.storage.from('logos').getPublicUrl(path)
      const publicUrl = `${data.publicUrl}?v=${Date.now()}`

      await updateConfig({ logoUrl: publicUrl })
      setLogoFile(null)
      toast({
        title: 'Logo atualizado',
        description: 'Seu logotipo foi enviado e já está disponível no sistema.',
      })
    } catch (err: any) {
      toast({
        title: 'Erro ao enviar logo',
        description: err.message || 'Não foi possível enviar a imagem.',
        variant: 'destructive',
      })
    } finally {
      setUploadingLogo(false)
    }
  }

  const handleRemoveLogo = async () => {
    try {
      if (user) await supabase.storage.from('logos').remove([`${user.id}/logo.png`])
      await updateConfig({ logoUrl: '' })
      setLogoPreview('')
      setLogoFile(null)
      toast({ title: 'Logo removido' })
    } catch {
      toast({
        title: 'Erro ao remover logo',
        description: 'Tente novamente em instantes.',
        variant: 'destructive',
      })
    }
  }

  const handleSavePreferences = async () => {
    try {
      await updateConfig({
        preferencias: { ...config.preferencias, notifyOnNewLead, notifyOnDealWon, autoSyncSGE },
      })
      toast({
        title: 'Preferências Salvas',
        description: 'Suas preferências de notificações e sistema foram atualizadas.',
      })
    } catch {
      toast({
        title: 'Erro ao salvar',
        description: 'Não foi possível salvar as preferências.',
        variant: 'destructive',
      })
    }
  }

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!authEmail) return

    setAuthSubmitting(true)
    try {
      if (authMode === 'login') {
        const { error } = await signIn(authEmail, authPassword)
        if (error) throw error
        toast({
          title: 'Login efetuado com sucesso',
          description: 'Seus dados agora são sincronizados em tempo real no Supabase.',
        })
      } else {
        const { error } = await signUp(authEmail, authPassword)
        if (error) throw error
        toast({
          title: 'Cadastro realizado',
          description: 'Conta criada com sucesso no Supabase.',
        })
      }
      setAuthPassword('')
    } catch (err: any) {
      toast({
        title: 'Falha na autenticação',
        description: translateAuthError(err.message) || 'Verifique seus dados e tente novamente.',
        variant: 'destructive',
      })
    } finally {
      setAuthSubmitting(false)
    }
  }

  const handleSignOut = async () => {
    await signOut()
    toast({
      title: 'Desconectado',
      description: 'Você saiu da sua conta Supabase. Modo offline/localStorage ativado.',
    })
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-orange-400" /> Administração
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Área restrita ao administrador: usuários, cargos, integrações, IA, marca e preferências do
          sistema.
        </p>
      </div>

      <Tabs defaultValue="usuarios" className="space-y-4">
        <TabsList className="grid grid-cols-3 sm:grid-cols-6 w-full max-w-3xl bg-[#111820] border border-white/[0.06]">
          <TabsTrigger value="usuarios">Usuários</TabsTrigger>
          <TabsTrigger value="integracoes">Integrações</TabsTrigger>
          <TabsTrigger value="supabase">Banco de Dados</TabsTrigger>
          <TabsTrigger value="ia">IA</TabsTrigger>
          <TabsTrigger value="marca">Marca</TabsTrigger>
          <TabsTrigger value="preferencias">Preferências</TabsTrigger>
        </TabsList>

        {/* ABA: USUÁRIOS E CARGOS */}
        <TabsContent value="usuarios" className="space-y-4">
          <div className="bg-[#111820] border border-white/[0.06] rounded-xl p-5">
            <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <Users className="w-4 h-4 text-orange-400" /> Usuários e Cargos
            </h2>
            {carregandoPerfis ? (
              <div className="text-sm text-slate-400">Carregando...</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 text-xs uppercase border-b border-white/[0.06]">
                    <th className="py-2">Nome</th>
                    <th className="py-2">E-mail</th>
                    <th className="py-2">Cargo</th>
                  </tr>
                </thead>
                <tbody>
                  {perfis.map((p) => (
                    <tr key={p.id} className="border-b border-white/[0.04]">
                      <td className="py-2.5 text-slate-200">
                        {p.nome} {p.id === user?.id && <span className="text-orange-400 text-xs">(você)</span>}
                      </td>
                      <td className="py-2.5 text-slate-400">{p.email}</td>
                      <td className="py-2.5">
                        <select
                          value={p.role}
                          disabled={salvandoId === p.id}
                          onChange={(e) => mudarCargo(p.id, e.target.value as Perfil['role'])}
                          className="bg-[#0a0f14] border border-white/[0.1] rounded-lg px-2 py-1 text-slate-200 text-xs"
                        >
                          {CARGOS.map((c) => (
                            <option key={c.value} value={c.value}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </TabsContent>

        {/* ABA: INTEGRAÇÕES */}
        <TabsContent value="integracoes" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center space-x-2">
                <Building className="h-5 w-5 text-orange-400" />
                <CardTitle>Integração ERP SGE</CardTitle>
              </div>
              <CardDescription>
                Conecte o sistema ao SGE para importar e sincronizar contratos e turmas automaticamente.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="sge-cnpj">CNPJ da Empresa (SGE)</Label>
                  <Input
                    id="sge-cnpj"
                    placeholder="00.000.000/0000-00 ou números"
                    value={sgeCnpj}
                    onChange={(e) => setSgeCnpj(e.target.value)}
                  />
                  <p className="text-xs text-slate-500">CNPJ cadastrado na sua conta do ERP SGE.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sge-token">Token de Acesso / Chave API</Label>
                  <Input
                    id="sge-token"
                    type="password"
                    placeholder="••••••••••••••••••••••••"
                    value={sgeToken}
                    onChange={(e) => setSgeToken(e.target.value)}
                  />
                  <p className="text-xs text-slate-500">Token fornecido pelo suporte ou painel do SGE.</p>
                </div>
              </div>

              {sgeStatus && (
                <div
                  className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg border ${
                    sgeStatus.ok
                      ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                      : 'bg-rose-500/10 text-rose-300 border-rose-500/20'
                  }`}
                >
                  {sgeStatus.ok ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                  ) : (
                    <AlertCircle className="h-4 w-4 shrink-0" />
                  )}
                  <span>{sgeStatus.ok ? 'Logado e funcionando: ' : ''}{sgeStatus.message}</span>
                </div>
              )}

              <div className="flex items-center justify-between pt-2 border-t border-white/[0.06]">
                <div className="flex items-center space-x-2 text-xs text-slate-500">
                  <ShieldCheck className="h-4 w-4 text-emerald-400" />
                  <span>Autenticação Basic Auth criptografada no Supabase.</span>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={handleTestSGE}
                    disabled={testingSGE || !sgeCnpj || !sgeToken}
                  >
                    <RefreshCw className={`h-4 w-4 mr-1.5 ${testingSGE ? 'animate-spin' : ''}`} />
                    {testingSGE ? 'Testando...' : 'Testar Conexão'}
                  </Button>
                  <Button
                    onClick={handleSaveSGE}
                    disabled={configLoading}
                    className="bg-orange-500 hover:bg-orange-600"
                  >
                    <Save className="h-4 w-4 mr-1.5" />
                    Salvar Credenciais SGE
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ABA: SUPABASE / BANCO DE DADOS */}
        <TabsContent value="supabase" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Database className="h-5 w-5 text-emerald-400" />
                  <CardTitle>Conexão com Banco de Dados Supabase</CardTitle>
                </div>
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    isAuthenticated
                      ? 'bg-emerald-500/10 text-emerald-300'
                      : 'bg-amber-500/10 text-amber-300'
                  }`}
                >
                  {isAuthenticated ? 'Conectado (Nuvem)' : 'Modo Offline (localStorage)'}
                </span>
              </div>
              <CardDescription>
                Seus dados são salvos e sincronizados com segurança no PostgreSQL via Supabase.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {isAuthenticated ? (
                <div className="space-y-4">
                  <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4 flex items-start space-x-3">
                    <CheckCircle2 className="h-5 w-5 text-emerald-400 mt-0.5" />
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-emerald-300">Sessão Supabase Ativa</p>
                      <p className="text-xs text-emerald-400/80">
                        Usuário conectado: <strong>{user?.email}</strong> (ID:{' '}
                        <span className="font-mono">{user?.id}</span>)
                      </p>
                      <p className="text-xs text-emerald-400/70">
                        Políticas de segurança RLS ativas: você só acessa seus próprios dados.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <Button variant="outline" onClick={() => window.location.reload()}>
                      <RefreshCw className="h-4 w-4 mr-1.5" />
                      Recarregar Dados
                    </Button>
                    <Button variant="destructive" onClick={handleSignOut}>
                      <LogOut className="h-4 w-4 mr-1.5" />
                      Desconectar Conta
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 flex items-start space-x-3">
                    <AlertCircle className="h-5 w-5 text-amber-400 mt-0.5" />
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-amber-300">Modo Local / Fallback Ativo</p>
                      <p className="text-xs text-amber-400/80">
                        O sistema está utilizando o armazenamento do navegador (localStorage). Faça login
                        para sincronizar seus dados com o Supabase na nuvem.
                      </p>
                    </div>
                  </div>

                  <form
                    onSubmit={handleAuthSubmit}
                    className="border border-white/[0.06] rounded-lg p-4 bg-[#0a0f14] space-y-4"
                  >
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-white">
                        {authMode === 'login' ? 'Acessar Conta Supabase' : 'Criar Nova Conta'}
                      </h4>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}
                        className="text-xs text-orange-400 hover:text-orange-300"
                      >
                        {authMode === 'login' ? 'Não tem conta? Cadastre-se' : 'Já tem conta? Fazer login'}
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <Label htmlFor="auth-email" className="text-xs">
                          E-mail
                        </Label>
                        <Input
                          id="auth-email"
                          type="email"
                          placeholder="seu.email@empresa.com.br"
                          value={authEmail}
                          onChange={(e) => setAuthEmail(e.target.value)}
                          required
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="auth-pass" className="text-xs">
                          Senha
                        </Label>
                        <Input
                          id="auth-pass"
                          type="password"
                          placeholder="••••••••"
                          value={authPassword}
                          onChange={(e) => setAuthPassword(e.target.value)}
                          required
                        />
                      </div>
                    </div>

                    <div className="flex justify-end pt-2">
                      <Button
                        type="submit"
                        disabled={authSubmitting}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        <LogIn className="h-4 w-4 mr-1.5" />
                        {authSubmitting
                          ? 'Processando...'
                          : authMode === 'login'
                            ? 'Entrar com Supabase'
                            : 'Cadastrar Conta'}
                      </Button>
                    </div>
                  </form>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ABA: INTELIGÊNCIA ARTIFICIAL */}
        <TabsContent value="ia" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center space-x-2">
                <Brain className="h-5 w-5 text-orange-400" />
                <CardTitle>Google Gemini AI</CardTitle>
              </div>
              <CardDescription>
                Configure a chave da API do Gemini para processar transcrições de reuniões, extrair
                sentimento, pontos fortes, pontos de atenção e calcular a probabilidade de fechamento.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="gemini-key">Chave de API do Gemini (Google AI Studio)</Label>
                <Input
                  id="gemini-key"
                  type="password"
                  placeholder="AIzaSy..."
                  value={geminiKey}
                  onChange={(e) => setGeminiKey(e.target.value)}
                />
                <p className="text-xs text-slate-500">
                  Obtenha gratuitamente sua chave no{' '}
                  <a
                    href="https://aistudio.google.com/"
                    target="_blank"
                    rel="noreferrer"
                    className="text-orange-400 underline"
                  >
                    Google AI Studio
                  </a>
                  .
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="gemini-model">Modelo de Análise Padrão</Label>
                <Select value={geminiModel} onValueChange={setGeminiModel}>
                  <SelectTrigger id="gemini-model">
                    <SelectValue placeholder="Selecione o modelo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gemini-2.5-flash">
                      Gemini 2.5 Flash (Recomendado - Mais Rápido)
                    </SelectItem>
                    <SelectItem value="gemini-2.5-pro">
                      Gemini 2.5 Pro (Maior Raciocínio Profundo)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="ia-system-prompt">Instruções personalizadas para a IA (AMOR IN IA)</Label>
                <Textarea
                  id="ia-system-prompt"
                  placeholder="Ex: Sempre responda de forma direta e objetiva. Nunca invente números — se não tiver o dado, diga que não tem essa informação disponível. Trate valores em Reais (R$)."
                  value={iaSystemPrompt}
                  onChange={(e) => setIaSystemPrompt(e.target.value)}
                  rows={5}
                  className="text-xs"
                />
                <p className="text-xs text-slate-500">
                  Essas instruções são enviadas em toda conversa do chat "AMOR IN IA". Use para reforçar
                  tom, formato de resposta e a regra de nunca inventar dados.
                </p>
              </div>

              {geminiStatus && (
                <div
                  className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg border ${
                    geminiStatus.ok
                      ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                      : 'bg-rose-500/10 text-rose-300 border-rose-500/20'
                  }`}
                >
                  {geminiStatus.ok ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                  ) : (
                    <AlertCircle className="h-4 w-4 shrink-0" />
                  )}
                  <span>{geminiStatus.ok ? 'Logado e funcionando: ' : ''}{geminiStatus.message}</span>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-white/[0.06]">
                <Button variant="outline" onClick={handleTestGemini} disabled={testingGemini || !geminiKey}>
                  <RefreshCw className={`h-4 w-4 mr-1.5 ${testingGemini ? 'animate-spin' : ''}`} />
                  {testingGemini ? 'Testando...' : 'Testar Conexão'}
                </Button>
                <Button
                  onClick={handleSaveGemini}
                  disabled={configLoading}
                  className="bg-orange-500 hover:bg-orange-600"
                >
                  <Save className="h-4 w-4 mr-1.5" />
                  Salvar Configuração Gemini
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ABA: MARCA (LOGO) */}
        <TabsContent value="marca" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center space-x-2">
                <ImageIcon className="h-5 w-5 text-orange-400" />
                <CardTitle>Logotipo</CardTitle>
              </div>
              <CardDescription>
                Envie o logo da Amor In Formaturas em PNG, de preferência sem fundo (transparente), para
                usar nos locais de identidade visual do sistema.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!isAuthenticated && (
                <p className="text-xs text-amber-400">
                  Faça login na aba "Banco de Dados" para poder enviar e sincronizar o logo.
                </p>
              )}

              <div className="flex items-center gap-4">
                <div className="w-24 h-24 rounded-xl border border-dashed border-white/[0.15] bg-[repeating-conic-gradient(#1b1f2a_0%_25%,#0a0f14_0%_50%)] bg-[length:16px_16px] flex items-center justify-center overflow-hidden shrink-0">
                  {logoPreview ? (
                    <img src={logoPreview} alt="Logo atual" className="w-full h-full object-contain" />
                  ) : (
                    <ImageIcon className="w-8 h-8 text-slate-600" />
                  )}
                </div>

                <div className="space-y-2">
                  <Input
                    id="logo-file"
                    type="file"
                    accept="image/png"
                    onChange={handleSelectLogo}
                    disabled={!isAuthenticated}
                  />
                  <p className="text-xs text-slate-500">
                    PNG com fundo transparente. Tamanho recomendado: 512x512px.
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-white/[0.06]">
                {logoPreview && (
                  <Button variant="outline" onClick={handleRemoveLogo} disabled={!isAuthenticated || uploadingLogo}>
                    <Trash2 className="h-4 w-4 mr-1.5" />
                    Remover
                  </Button>
                )}
                <Button
                  onClick={handleUploadLogo}
                  disabled={!isAuthenticated || !logoFile || uploadingLogo}
                  className="bg-orange-500 hover:bg-orange-600"
                >
                  <Save className="h-4 w-4 mr-1.5" />
                  {uploadingLogo ? 'Enviando...' : 'Salvar Logo'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ABA: PREFERÊNCIAS */}
        <TabsContent value="preferencias" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center space-x-2">
                <UserIcon className="h-5 w-5 text-slate-300" />
                <CardTitle>Notificações e Automações</CardTitle>
              </div>
              <CardDescription>Ajuste as notificações do sistema e regras de comportamento.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">Notificar ao cadastrar nova Turma</Label>
                  <p className="text-xs text-slate-500">
                    Exibir confirmação e toast ao inserir um novo lead de turma.
                  </p>
                </div>
                <Switch checked={notifyOnNewLead} onCheckedChange={setNotifyOnNewLead} />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">Notificar fechamento de contrato</Label>
                  <p className="text-xs text-slate-500">Disparar alerta quando um deal for movido para Ganho.</p>
                </div>
                <Switch checked={notifyOnDealWon} onCheckedChange={setNotifyOnDealWon} />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">Auto-sincronização SGE</Label>
                  <p className="text-xs text-slate-500">Verificar novos contratos faturados no SGE periodicamente.</p>
                </div>
                <Switch checked={autoSyncSGE} onCheckedChange={setAutoSyncSGE} />
              </div>

              <div className="flex justify-end pt-4 border-t border-white/[0.06]">
                <Button onClick={handleSavePreferences} disabled={configLoading} className="bg-slate-700 hover:bg-slate-600">
                  <Save className="h-4 w-4 mr-1.5" />
                  Salvar Preferências
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
