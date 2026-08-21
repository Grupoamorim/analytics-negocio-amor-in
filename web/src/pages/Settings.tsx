import React, { useState, useEffect } from 'react'
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
import { useToast } from '@/hooks/use-toast'
import { useConfiguracoes } from '@/hooks/useConfiguracoes'
import { useAuth } from '@/hooks/useAuth'
import {
  Building,
  Brain,
  Save,
  CheckCircle2,
  AlertCircle,
  User,
  ShieldCheck,
  Database,
  RefreshCw,
  LogOut,
  LogIn,
} from 'lucide-react'

export default function Settings() {
  const { toast } = useToast()
  const { config, updateConfig, loading: configLoading } = useConfiguracoes()
  const { user, isAuthenticated, signIn, signOut, signUp } = useAuth()

  // SGE State
  const [sgeCnpj, setSgeCnpj] = useState('')
  const [sgeToken, setSgeToken] = useState('')

  // Gemini State
  const [geminiKey, setGeminiKey] = useState('')
  const [geminiModel, setGeminiModel] = useState('gemini-1.5-flash')

  // Auth form state
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login')
  const [authSubmitting, setAuthSubmitting] = useState(false)

  // Notification Preferences
  const [notifyOnNewLead, setNotifyOnNewLead] = useState(true)
  const [notifyOnDealWon, setNotifyOnDealWon] = useState(true)
  const [autoSyncSGE, setAutoSyncSGE] = useState(false)

  // Sync state from hook config
  useEffect(() => {
    if (config) {
      setSgeCnpj(config.sgeCnpj || '')
      setSgeToken(config.sgeToken || '')
      setGeminiKey(config.geminiApiKey || '')
      if (config.preferencias) {
        if (config.preferencias.notifyOnNewLead !== undefined)
          setNotifyOnNewLead(config.preferencias.notifyOnNewLead)
        if (config.preferencias.notifyOnDealWon !== undefined)
          setNotifyOnDealWon(config.preferencias.notifyOnDealWon)
        if (config.preferencias.autoSyncSGE !== undefined)
          setAutoSyncSGE(config.preferencias.autoSyncSGE)
        if (config.preferencias.geminiModel) setGeminiModel(config.preferencias.geminiModel)
      }
    }
  }, [config])

  const handleSaveSGE = async () => {
    try {
      await updateConfig({
        sgeCnpj,
        sgeToken,
      })
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

  const handleSaveGemini = async () => {
    try {
      await updateConfig({
        geminiApiKey: geminiKey,
        preferencias: {
          ...config.preferencias,
          geminiModel,
        },
      })
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

  const handleSavePreferences = async () => {
    try {
      await updateConfig({
        preferencias: {
          ...config.preferencias,
          notifyOnNewLead,
          notifyOnDealWon,
          autoSyncSGE,
        },
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
        description: err.message || 'Verifique seus dados e tente novamente.',
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
          Configurações do Sistema
        </h1>
        <p className="text-sm text-gray-500">
          Gerencie suas integrações, inteligência artificial, conexão Supabase e preferências de
          conta.
        </p>
      </div>

      <Tabs defaultValue="integracoes" className="space-y-4">
        <TabsList className="grid grid-cols-4 w-full max-w-xl">
          <TabsTrigger value="integracoes">Integrações</TabsTrigger>
          <TabsTrigger value="supabase">Banco de Dados</TabsTrigger>
          <TabsTrigger value="ia">Inteligência Artificial</TabsTrigger>
          <TabsTrigger value="preferencias">Preferências</TabsTrigger>
        </TabsList>

        {/* ABA: INTEGRAÇÕES */}
        <TabsContent value="integracoes" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center space-x-2">
                <Building className="h-5 w-5 text-orange-600" />
                <CardTitle>Integração ERP SGE</CardTitle>
              </div>
              <CardDescription>
                Conecte seu CRM ao sistema SGE para importar e sincronizar contratos e turmas ganhas
                automaticamente.
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
                  <p className="text-xs text-gray-500">CNPJ cadastrado na sua conta do ERP SGE.</p>
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
                  <p className="text-xs text-gray-500">
                    Token fornecido pelo suporte ou painel do SGE.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t">
                <div className="flex items-center space-x-2 text-xs text-gray-500">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  <span>Autenticação Basic Auth criptografada no Supabase.</span>
                </div>
                <Button
                  onClick={handleSaveSGE}
                  disabled={configLoading}
                  className="bg-orange-600 hover:bg-orange-700"
                >
                  <Save className="h-4 w-4 mr-1.5" />
                  Salvar Credenciais SGE
                </Button>
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
                  <Database className="h-5 w-5 text-emerald-600" />
                  <CardTitle>Conexão com Banco de Dados Supabase</CardTitle>
                </div>
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${isAuthenticated ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}
                >
                  {isAuthenticated ? 'Conectado (Nuvem)' : 'Modo Offline (localStorage)'}
                </span>
              </div>
              <CardDescription>
                Seus dados de Turmas, Contatos, Funil, Transcrições e Notas são salvos e
                sincronizados com segurança no PostgreSQL via Supabase.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {isAuthenticated ? (
                <div className="space-y-4">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex items-start space-x-3">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5" />
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-emerald-900">
                        Sessão Supabase Ativa
                      </p>
                      <p className="text-xs text-emerald-700">
                        Usuário conectado: <strong>{user?.email}</strong> (ID:{' '}
                        <span className="font-mono">{user?.id}</span>)
                      </p>
                      <p className="text-xs text-emerald-600">
                        Políticas de segurança RLS ativas: você só acessa seus próprios leads e
                        oportunidades.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <Button
                      variant="outline"
                      onClick={() => window.location.reload()}
                      className="text-gray-700"
                    >
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
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start space-x-3">
                    <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-amber-900">
                        Modo Local / Fallback Ativo
                      </p>
                      <p className="text-xs text-amber-700">
                        O CRM está utilizando o armazenamento do seu navegador (localStorage). Faça
                        login ou cadastre-se para sincronizar seus dados com o Supabase na nuvem.
                      </p>
                    </div>
                  </div>

                  <form
                    onSubmit={handleAuthSubmit}
                    className="border rounded-lg p-4 bg-gray-50 space-y-4"
                  >
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-gray-900">
                        {authMode === 'login' ? 'Acessar Conta Supabase' : 'Criar Nova Conta'}
                      </h4>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}
                        className="text-xs text-orange-600 hover:text-orange-800"
                      >
                        {authMode === 'login'
                          ? 'Não tem conta? Cadastre-se'
                          : 'Já tem conta? Fazer login'}
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
                <Brain className="h-5 w-5 text-orange-600" />
                <CardTitle>Google Gemini AI</CardTitle>
              </div>
              <CardDescription>
                Configure a chave da API do Gemini para processar transcrições de reuniões, extrair
                sentimento, pontos fortes, pontos de atenção e calcular a probabilidade de
                fechamento.
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
                <p className="text-xs text-gray-500">
                  Obtenha gratuitamente sua chave no{' '}
                  <a
                    href="https://aistudio.google.com/"
                    target="_blank"
                    rel="noreferrer"
                    className="text-orange-600 underline"
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
                    <SelectItem value="gemini-1.5-flash">
                      Gemini 1.5 Flash (Recomendado - Mais Rápido)
                    </SelectItem>
                    <SelectItem value="gemini-1.5-pro">
                      Gemini 1.5 Pro (Maior Raciocínio Profundo)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex justify-end pt-2 border-t">
                <Button
                  onClick={handleSaveGemini}
                  disabled={configLoading}
                  className="bg-orange-600 hover:bg-orange-700"
                >
                  <Save className="h-4 w-4 mr-1.5" />
                  Salvar Configuração Gemini
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
                <User className="h-5 w-5 text-gray-700" />
                <CardTitle>Notificações e Automações</CardTitle>
              </div>
              <CardDescription>
                Ajuste as notificações do sistema e regras de comportamento do CRM.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">Notificar ao cadastrar nova Turma</Label>
                  <p className="text-xs text-gray-500">
                    Exibir confirmação e toast ao inserir um novo lead de turma.
                  </p>
                </div>
                <Switch checked={notifyOnNewLead} onCheckedChange={setNotifyOnNewLead} />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">Notificar fechamento de contrato</Label>
                  <p className="text-xs text-gray-500">
                    Disparar alerta quando um deal for movido para Ganho.
                  </p>
                </div>
                <Switch checked={notifyOnDealWon} onCheckedChange={setNotifyOnDealWon} />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">Auto-sincronização SGE</Label>
                  <p className="text-xs text-gray-500">
                    Verificar novos contratos faturados no SGE periodicamente.
                  </p>
                </div>
                <Switch checked={autoSyncSGE} onCheckedChange={setAutoSyncSGE} />
              </div>

              <div className="flex justify-end pt-4 border-t">
                <Button
                  onClick={handleSavePreferences}
                  disabled={configLoading}
                  className="bg-gray-800 hover:bg-gray-900"
                >
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
