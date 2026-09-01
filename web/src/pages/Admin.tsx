import { Fragment, useEffect, useState } from 'react'
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
import { useAcesso } from '@/context/AcessoContext'
import {
  PAGINAS,
  PAGINAS_PADRAO_COMERCIAL,
  PAGINAS_FINANCEIRO,
  paginasPadraoPorCargo,
} from '@/utils/paginas'
import MetasAdmin from '@/components/admin/MetasAdmin'
import { translateAuthError } from '@/lib/authErrors'
import {
  saveGeminiApiKey,
  saveGeminiModel,
  saveCustomSystemPrompt,
  testGeminiConnection,
  GEMINI_DEFAULT_MODEL,
} from '@/utils/geminiApi'
import { testSGEConnection } from '@/utils/sgeIntegration'
import {
  Vendedor,
  listarVendedores,
  adicionarVendedor,
  atualizarVendedor,
  removerVendedor,
} from '@/utils/vendedores'
import {
  DuracaoCurso,
  listarDuracaoCursos,
  adicionarDuracaoCurso,
  atualizarDuracaoCurso,
  removerDuracaoCurso,
} from '@/utils/duracaoCursos'
import {
  MotivoPerda,
  listarMotivosPerda,
  adicionarMotivoPerda,
  atualizarMotivoPerda,
  removerMotivoPerda,
} from '@/utils/motivosPerda'
import {
  ItemCatalogo,
  TemplatePacote,
  listarCatalogo,
  adicionarItemCatalogo,
  atualizarItemCatalogo,
  removerItemCatalogo,
  listarTemplates,
  adicionarTemplate,
  atualizarTemplate,
  removerTemplate,
} from '@/utils/pacoteCatalogo'
import { supabase } from '@/lib/supabase/client'
import { redefinirSenhaUrl } from '@/lib/appUrl'
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
  GraduationCap,
  TrendingDown,
  Package,
} from 'lucide-react'

interface Perfil {
  id: string
  email: string
  nome: string
  role: 'admin' | 'financeiro' | 'comercial' | 'membro'
  ativo?: boolean
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

  // Acessos por usuário (quais abas do menu cada não-admin vê)
  const { acessosPorUsuario, salvarAcessoUsuario, recarregar: recarregarAcesso } = useAcesso()
  const [editandoAcessoId, setEditandoAcessoId] = useState<string | null>(null)
  const [rascunhoAcesso, setRascunhoAcesso] = useState<string[]>([])
  const [salvandoAcessoId, setSalvandoAcessoId] = useState<string | null>(null)

  // Convite de usuário por e-mail
  const [conviteEmail, setConviteEmail] = useState('')
  const [conviteNome, setConviteNome] = useState('')
  const [conviteRole, setConviteRole] = useState<Perfil['role']>('membro')
  const [convitePaginas, setConvitePaginas] = useState<string[]>(() => paginasPadraoPorCargo('membro'))
  // Guarda se o admin já mexeu na seleção — se sim, trocar de cargo não sobrescreve.
  const [convitePaginasTocado, setConvitePaginasTocado] = useState(false)

  function escolherConviteRole(role: Perfil['role']) {
    setConviteRole(role)
    if (!convitePaginasTocado) setConvitePaginas(paginasPadraoPorCargo(role))
  }
  const [enviandoConvite, setEnviandoConvite] = useState(false)
  const [resetandoSenhaId, setResetandoSenhaId] = useState<string | null>(null)

  // Vendedores / SDR
  const [vendedores, setVendedores] = useState<Vendedor[]>([])
  const [carregandoVendedores, setCarregandoVendedores] = useState(true)
  const [novoVendedorNome, setNovoVendedorNome] = useState('')
  const [salvandoVendedor, setSalvandoVendedor] = useState(false)

  // Duração de Cursos (conclusão automática de turma)
  const [duracaoCursos, setDuracaoCursos] = useState<DuracaoCurso[]>([])
  const [carregandoDuracaoCursos, setCarregandoDuracaoCursos] = useState(true)
  const [novoCursoDuracao, setNovoCursoDuracao] = useState('')
  const [novaFaculdadeDuracao, setNovaFaculdadeDuracao] = useState('')
  const [novosAnosDuracao, setNovosAnosDuracao] = useState('')
  const [salvandoDuracaoCurso, setSalvandoDuracaoCurso] = useState(false)

  // Motivos de perda (Funil)
  const [motivosPerda, setMotivosPerda] = useState<MotivoPerda[]>([])
  const [carregandoMotivosPerda, setCarregandoMotivosPerda] = useState(true)
  const [novoMotivoPerda, setNovoMotivoPerda] = useState('')
  const [salvandoMotivoPerda, setSalvandoMotivoPerda] = useState(false)

  // Catálogo de itens de pacote + templates (Luxo/Moderno/Clássico/Básico)
  const [catalogoItens, setCatalogoItens] = useState<ItemCatalogo[]>([])
  const [templatesPacote, setTemplatesPacote] = useState<TemplatePacote[]>([])
  const [carregandoCatalogo, setCarregandoCatalogo] = useState(true)
  const [novoItemCatalogo, setNovoItemCatalogo] = useState('')
  const [salvandoItemCatalogo, setSalvandoItemCatalogo] = useState(false)
  const [novoTemplateNome, setNovoTemplateNome] = useState('')

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
  const [resendApiKey, setResendApiKey] = useState('')
  const [emailAlertaTurmaNova, setEmailAlertaTurmaNova] = useState('')
  const [emailAlertaErro, setEmailAlertaErro] = useState('')
  const [autoSyncSGE, setAutoSyncSGE] = useState(false)

  // Logo da marca
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState('')
  const [uploadingLogo, setUploadingLogo] = useState(false)

  // Favicon (ícone da aba do navegador)
  const [faviconFile, setFaviconFile] = useState<File | null>(null)
  const [faviconPreview, setFaviconPreview] = useState('')
  const [uploadingFavicon, setUploadingFavicon] = useState(false)

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

  async function toggleAtivo(p: Perfil) {
    if (p.id === user?.id) {
      toast({
        title: 'Você não pode inativar a si mesmo',
        description: 'Peça a outro administrador para fazer isso.',
        variant: 'destructive',
      })
      return
    }
    const novoAtivo = p.ativo === false // estava inativo → reativa
    const acao = novoAtivo ? 'reativar' : 'inativar'
    if (!confirm(`Deseja ${acao} o acesso de "${p.nome || p.email}"?${novoAtivo ? '' : ' A pessoa é desconectada e não consegue mais entrar até ser reativada.'}`)) {
      return
    }
    setSalvandoId(p.id)
    const { error } = await supabase.from('profiles').update({ ativo: novoAtivo }).eq('id', p.id)
    setSalvandoId(null)
    if (error) {
      toast({ title: `Erro ao ${acao}`, description: error.message, variant: 'destructive' })
      return
    }
    setPerfis((prev) => prev.map((x) => (x.id === p.id ? { ...x, ativo: novoAtivo } : x)))
    toast({
      title: novoAtivo ? 'Usuário reativado' : 'Usuário inativado',
      description: novoAtivo
        ? `${p.nome || p.email} pode entrar de novo.`
        : `${p.nome || p.email} perde o acesso na próxima vez que abrir o sistema.`,
    })
  }

  function abrirEditorAcesso(p: Perfil) {
    const atual = acessosPorUsuario[p.id]
    // Sem acesso customizado ainda: começa do padrão do cargo da pessoa.
    setRascunhoAcesso(atual && atual.length ? atual : paginasPadraoPorCargo(p.role))
    setEditandoAcessoId((cur) => (cur === p.id ? null : p.id))
  }

  function toggleRascunhoPagina(path: string) {
    setRascunhoAcesso((prev) =>
      prev.includes(path) ? prev.filter((x) => x !== path) : [...prev, path],
    )
  }

  async function salvarAcesso(p: Perfil) {
    setSalvandoAcessoId(p.id)
    try {
      await salvarAcessoUsuario(p.id, rascunhoAcesso)
      toast({
        title: 'Acessos atualizados',
        description: `${p.nome || p.email} agora vê ${rascunhoAcesso.length} aba(s) do menu.`,
      })
      setEditandoAcessoId(null)
    } catch (err: any) {
      toast({
        title: 'Erro ao salvar acessos',
        description: err.message || 'Tente de novo.',
        variant: 'destructive',
      })
    } finally {
      setSalvandoAcessoId(null)
    }
  }

  async function handleResetarSenha(p: Perfil) {
    if (!confirm(`Enviar e-mail de redefinição de senha pra ${p.email}?`)) return
    setResetandoSenhaId(p.id)
    try {
      // Nunca window.location.origin aqui: o link vai por e-mail pra outra
      // pessoa e o admin pode estar no localhost.
      const { error } = await supabase.auth.resetPasswordForEmail(p.email, {
        redirectTo: redefinirSenhaUrl(),
      })
      if (error) throw error
      toast({
        title: 'E-mail enviado',
        description: `${p.email} vai receber o link pra definir uma nova senha. Se não chegar em alguns minutos, peça pra conferir o spam.`,
      })
    } catch (err: any) {
      toast({
        title: 'Erro ao enviar',
        description: err.message || 'Não foi possível enviar o e-mail de redefinição.',
        variant: 'destructive',
      })
    } finally {
      setResetandoSenhaId(null)
    }
  }

  async function handleConvidarUsuario(e: React.FormEvent) {
    e.preventDefault()
    const email = conviteEmail.trim()
    if (!email) return
    setEnviandoConvite(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) throw new Error('Sessão expirada, faça login novamente.')

      const { data, error } = await supabase.functions.invoke('invite-user', {
        body: {
          email,
          nome: conviteNome.trim(),
          role: conviteRole,
          paginas: conviteRole === 'admin' ? [] : convitePaginas,
        },
        headers: { Authorization: `Bearer ${token}` },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)

      toast({
        title: 'Convite enviado',
        description: `${email} vai receber um e-mail pra definir a própria senha.`,
      })
      setConviteEmail('')
      setConviteNome('')
      setConviteRole('membro')
      setConvitePaginas(paginasPadraoPorCargo('membro'))
      setConvitePaginasTocado(false)
      const { data: perfisAtualizados } = await supabase.from('profiles').select('*').order('created_at')
      setPerfis((perfisAtualizados || []) as Perfil[])
      recarregarAcesso()
    } catch (err: any) {
      toast({
        title: 'Erro ao convidar',
        description: err.message || 'Não foi possível enviar o convite.',
        variant: 'destructive',
      })
    } finally {
      setEnviandoConvite(false)
    }
  }

  useEffect(() => {
    async function carregar() {
      setCarregandoVendedores(true)
      setVendedores(await listarVendedores())
      setCarregandoVendedores(false)
    }
    carregar()
  }, [])

  async function handleAdicionarVendedor(e: React.FormEvent) {
    e.preventDefault()
    const nome = novoVendedorNome.trim()
    if (!nome) return
    setSalvandoVendedor(true)
    try {
      await adicionarVendedor(nome)
      setVendedores(await listarVendedores())
      setNovoVendedorNome('')
      toast({ title: 'Vendedor/SDR adicionado', description: `${nome} já aparece no formulário público.` })
    } catch (err: any) {
      toast({
        title: 'Erro ao adicionar',
        description: err.message || 'Não foi possível salvar. Talvez esse nome já exista.',
        variant: 'destructive',
      })
    } finally {
      setSalvandoVendedor(false)
    }
  }

  async function handleToggleAtivoVendedor(v: Vendedor) {
    await atualizarVendedor(v.id, { ativo: !v.ativo })
    setVendedores((prev) => prev.map((x) => (x.id === v.id ? { ...x, ativo: !x.ativo } : x)))
  }

  async function handleRemoverVendedor(v: Vendedor) {
    if (!confirm(`Remover "${v.nome}" da lista de vendedores/SDR?`)) return
    await removerVendedor(v.id)
    setVendedores((prev) => prev.filter((x) => x.id !== v.id))
  }

  useEffect(() => {
    async function carregar() {
      setCarregandoDuracaoCursos(true)
      setDuracaoCursos(await listarDuracaoCursos())
      setCarregandoDuracaoCursos(false)
    }
    carregar()
  }, [])

  async function handleAdicionarDuracaoCurso(e: React.FormEvent) {
    e.preventDefault()
    const curso = novoCursoDuracao.trim()
    const anos = Number(novosAnosDuracao)
    if (!curso || !anos) return
    setSalvandoDuracaoCurso(true)
    try {
      await adicionarDuracaoCurso(curso, novaFaculdadeDuracao, anos)
      setDuracaoCursos(await listarDuracaoCursos())
      setNovoCursoDuracao('')
      setNovaFaculdadeDuracao('')
      setNovosAnosDuracao('')
      toast({ title: 'Duração cadastrada', description: `${curso} (${anos} anos) salvo.` })
    } catch (err: any) {
      toast({
        title: 'Erro ao adicionar',
        description: err.message || 'Não foi possível salvar. Talvez esse curso+faculdade já exista.',
        variant: 'destructive',
      })
    } finally {
      setSalvandoDuracaoCurso(false)
    }
  }

  async function handleEditarDuracaoCurso(d: DuracaoCurso) {
    const novoValor = prompt(`Nova duração (em anos) para ${d.curso}${d.faculdade ? ' - ' + d.faculdade : ''}:`, String(d.duracaoAnos))
    if (!novoValor) return
    const anos = Number(novoValor)
    if (!anos) return
    await atualizarDuracaoCurso(d.id, { duracaoAnos: anos })
    setDuracaoCursos((prev) => prev.map((x) => (x.id === d.id ? { ...x, duracaoAnos: anos } : x)))
  }

  async function handleRemoverDuracaoCurso(d: DuracaoCurso) {
    if (!confirm(`Remover a duração cadastrada de "${d.curso}${d.faculdade ? ' - ' + d.faculdade : ''}"?`)) return
    await removerDuracaoCurso(d.id)
    setDuracaoCursos((prev) => prev.filter((x) => x.id !== d.id))
  }

  useEffect(() => {
    async function carregar() {
      setCarregandoMotivosPerda(true)
      setMotivosPerda(await listarMotivosPerda())
      setCarregandoMotivosPerda(false)
    }
    carregar()
  }, [])

  async function handleAdicionarMotivoPerda(e: React.FormEvent) {
    e.preventDefault()
    const motivo = novoMotivoPerda.trim()
    if (!motivo) return
    setSalvandoMotivoPerda(true)
    try {
      await adicionarMotivoPerda(motivo)
      setMotivosPerda(await listarMotivosPerda())
      setNovoMotivoPerda('')
      toast({ title: 'Motivo adicionado', description: `"${motivo}" já aparece no Funil.` })
    } catch (err: any) {
      toast({
        title: 'Erro ao adicionar',
        description: err.message || 'Não foi possível salvar. Talvez esse motivo já exista.',
        variant: 'destructive',
      })
    } finally {
      setSalvandoMotivoPerda(false)
    }
  }

  async function handleToggleAtivoMotivoPerda(m: MotivoPerda) {
    await atualizarMotivoPerda(m.id, { ativo: !m.ativo })
    setMotivosPerda((prev) => prev.map((x) => (x.id === m.id ? { ...x, ativo: !x.ativo } : x)))
  }

  async function handleRemoverMotivoPerda(m: MotivoPerda) {
    if (!confirm(`Remover o motivo "${m.motivo}"?`)) return
    await removerMotivoPerda(m.id)
    setMotivosPerda((prev) => prev.filter((x) => x.id !== m.id))
  }

  useEffect(() => {
    async function carregar() {
      setCarregandoCatalogo(true)
      const [itens, templates] = await Promise.all([listarCatalogo(), listarTemplates()])
      setCatalogoItens(itens)
      setTemplatesPacote(templates)
      setCarregandoCatalogo(false)
    }
    carregar()
  }, [])

  async function handleAdicionarItemCatalogo(e: React.FormEvent) {
    e.preventDefault()
    const nome = novoItemCatalogo.trim()
    if (!nome) return
    setSalvandoItemCatalogo(true)
    try {
      await adicionarItemCatalogo(nome)
      setCatalogoItens(await listarCatalogo())
      setNovoItemCatalogo('')
      toast({ title: 'Item adicionado', description: `"${nome}" já aparece clicável ao montar pacotes.` })
    } catch (err: any) {
      toast({
        title: 'Erro ao adicionar',
        description: err.message || 'Não foi possível salvar. Talvez esse item já exista.',
        variant: 'destructive',
      })
    } finally {
      setSalvandoItemCatalogo(false)
    }
  }

  async function handleToggleAtivoItemCatalogo(item: ItemCatalogo) {
    await atualizarItemCatalogo(item.id, { ativo: !item.ativo })
    setCatalogoItens((prev) => prev.map((x) => (x.id === item.id ? { ...x, ativo: !x.ativo } : x)))
  }

  async function handleRemoverItemCatalogo(item: ItemCatalogo) {
    if (!confirm(`Remover o item "${item.nome}" do catálogo?`)) return
    await removerItemCatalogo(item.id)
    setCatalogoItens((prev) => prev.filter((x) => x.id !== item.id))
  }

  async function handleAdicionarTemplate(e: React.FormEvent) {
    e.preventDefault()
    const nome = novoTemplateNome.trim()
    if (!nome) return
    try {
      await adicionarTemplate(nome)
      setTemplatesPacote(await listarTemplates())
      setNovoTemplateNome('')
    } catch (err: any) {
      toast({
        title: 'Erro ao adicionar',
        description: err.message || 'Não foi possível salvar. Talvez esse template já exista.',
        variant: 'destructive',
      })
    }
  }

  async function handleToggleItemNoTemplate(template: TemplatePacote, itemNome: string) {
    const jaTem = template.itens.includes(itemNome)
    const novosItens = jaTem
      ? template.itens.filter((i) => i !== itemNome)
      : [...template.itens, itemNome]
    await atualizarTemplate(template.id, { itens: novosItens })
    setTemplatesPacote((prev) =>
      prev.map((t) => (t.id === template.id ? { ...t, itens: novosItens } : t)),
    )
  }

  async function handleRemoverTemplate(template: TemplatePacote) {
    if (!confirm(`Remover o template "${template.nome}"?`)) return
    await removerTemplate(template.id)
    setTemplatesPacote((prev) => prev.filter((x) => x.id !== template.id))
  }

  // Sync state from hook config
  useEffect(() => {
    if (config) {
      setSgeCnpj(config.sgeCnpj || '')
      setSgeToken(config.sgeToken || '')
      setGeminiKey(config.geminiApiKey || '')
      if (config.geminiApiKey) saveGeminiApiKey(config.geminiApiKey)
      if (config.logoUrl) setLogoPreview(config.logoUrl)
      if (config.faviconUrl) setFaviconPreview(config.faviconUrl)
      setResendApiKey(config.resendApiKey || '')
      setEmailAlertaTurmaNova(config.emailAlertaTurmaNova || '')
      setEmailAlertaErro(config.emailAlertaErro || '')
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

  const FAVICON_TYPES = ['image/png', 'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon']

  const handleSelectFavicon = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!FAVICON_TYPES.includes(file.type) && !file.name.toLowerCase().endsWith('.ico')) {
      toast({
        title: 'Formato inválido',
        description: 'Envie um arquivo PNG, SVG ou ICO (quadrado, idealmente 512x512).',
        variant: 'destructive',
      })
      return
    }
    setFaviconFile(file)
    setFaviconPreview(URL.createObjectURL(file))
  }

  const handleUploadFavicon = async () => {
    if (!faviconFile || !user) return
    setUploadingFavicon(true)
    try {
      const ext = faviconFile.name.toLowerCase().endsWith('.ico')
        ? 'ico'
        : faviconFile.type === 'image/svg+xml'
          ? 'svg'
          : 'png'
      const path = `${user.id}/favicon.${ext}`
      const { error: uploadErr } = await supabase.storage
        .from('logos')
        .upload(path, faviconFile, { upsert: true, contentType: faviconFile.type || 'image/png' })
      if (uploadErr) throw uploadErr

      const { data } = supabase.storage.from('logos').getPublicUrl(path)
      const publicUrl = `${data.publicUrl}?v=${Date.now()}`

      await updateConfig({ faviconUrl: publicUrl })
      setFaviconFile(null)
      toast({
        title: 'Ícone da aba atualizado',
        description: 'O favicon foi enviado. Pode levar um hard-refresh (Ctrl+Shift+R) para aparecer.',
      })
    } catch (err: any) {
      toast({
        title: 'Erro ao enviar o ícone',
        description: err.message || 'Não foi possível enviar a imagem.',
        variant: 'destructive',
      })
    } finally {
      setUploadingFavicon(false)
    }
  }

  const handleRemoveFavicon = async () => {
    try {
      if (user) {
        await supabase.storage
          .from('logos')
          .remove([`${user.id}/favicon.png`, `${user.id}/favicon.svg`, `${user.id}/favicon.ico`])
      }
      await updateConfig({ faviconUrl: '' })
      setFaviconPreview('')
      setFaviconFile(null)
      toast({ title: 'Ícone da aba removido', description: 'Voltou para o favicon padrão (a pena da marca).' })
    } catch {
      toast({
        title: 'Erro ao remover o ícone',
        description: 'Tente novamente em instantes.',
        variant: 'destructive',
      })
    }
  }

  const handleSavePreferences = async () => {
    try {
      await updateConfig({
        resendApiKey,
        emailAlertaTurmaNova,
        emailAlertaErro,
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
        <TabsList className="grid grid-cols-3 sm:grid-cols-9 w-full max-w-5xl bg-[#111820] border border-white/[0.06]">
          <TabsTrigger value="usuarios">Usuários</TabsTrigger>
          <TabsTrigger value="metas">Metas</TabsTrigger>
          <TabsTrigger value="vendedores">Vendedores/SDR</TabsTrigger>
          <TabsTrigger value="turmas">Turmas</TabsTrigger>
          <TabsTrigger value="integracoes">Integrações</TabsTrigger>
          <TabsTrigger value="supabase">Banco de Dados</TabsTrigger>
          <TabsTrigger value="ia">IA</TabsTrigger>
          <TabsTrigger value="marca">Marca</TabsTrigger>
          <TabsTrigger value="preferencias">Preferências</TabsTrigger>
        </TabsList>

        {/* ABA: METAS */}
        <TabsContent value="metas" className="space-y-4">
          <MetasAdmin />
        </TabsContent>

        {/* ABA: USUÁRIOS E CARGOS */}
        <TabsContent value="usuarios" className="space-y-4">
          <div className="bg-[#111820] border border-white/[0.06] rounded-xl p-5">
            <h2 className="text-sm font-semibold text-white mb-1 flex items-center gap-2">
              <Users className="w-4 h-4 text-orange-400" /> Usuários e Cargos
            </h2>
            <p className="text-xs text-slate-400 mb-4">
              Convide por e-mail — a pessoa recebe um link e define a própria senha. Você nunca vê nem
              define a senha de ninguém.
            </p>

            <form onSubmit={handleConvidarUsuario} className="flex items-center gap-2 mb-4 flex-wrap">
              <input
                type="email"
                placeholder="E-mail"
                value={conviteEmail}
                onChange={(e) => setConviteEmail(e.target.value)}
                className="flex-1 min-w-[180px] bg-[#0a0f14] border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
              <input
                type="text"
                placeholder="Nome (opcional)"
                value={conviteNome}
                onChange={(e) => setConviteNome(e.target.value)}
                className="flex-1 min-w-[140px] bg-[#0a0f14] border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
              <select
                value={conviteRole}
                onChange={(e) => escolherConviteRole(e.target.value as Perfil['role'])}
                className="bg-[#0a0f14] border border-white/[0.1] rounded-lg px-2 py-2 text-slate-200 text-xs"
              >
                {CARGOS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
              <Button
                type="submit"
                disabled={!conviteEmail.trim() || enviandoConvite}
                className="bg-orange-500 hover:bg-orange-600 text-white text-xs"
              >
                {enviandoConvite ? 'Enviando...' : 'Convidar'}
              </Button>

              {conviteRole === 'admin' ? (
                <p className="w-full text-[11px] text-slate-500">
                  Administrador vê todas as abas e o Modo Administrador.
                </p>
              ) : (
                <div className="w-full">
                  <p className="text-[11px] text-slate-400 mb-1.5">
                    Já vem marcado o padrão do cargo <strong className="text-slate-200">{CARGOS.find((c) => c.value === conviteRole)?.label}</strong> — marque/desmarque o que quiser (dá pra mudar depois também).{' '}
                    {convitePaginasTocado && (
                      <button
                        type="button"
                        onClick={() => {
                          setConvitePaginas(paginasPadraoPorCargo(conviteRole))
                          setConvitePaginasTocado(false)
                        }}
                        className="text-orange-400 hover:text-orange-300 underline decoration-dotted"
                      >
                        voltar ao padrão do cargo
                      </button>
                    )}
                  </p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                    {PAGINAS.map((pg) => (
                      <label key={pg.path} className="flex items-center gap-1.5 text-[11px] text-slate-300">
                        <input
                          type="checkbox"
                          checked={convitePaginas.includes(pg.path)}
                          onChange={() => {
                            setConvitePaginasTocado(true)
                            setConvitePaginas((prev) =>
                              prev.includes(pg.path)
                                ? prev.filter((x) => x !== pg.path)
                                : [...prev, pg.path],
                            )
                          }}
                          className="accent-orange-500"
                        />
                        {pg.label}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </form>

            {carregandoPerfis ? (
              <div className="text-sm text-slate-400">Carregando...</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 text-xs uppercase border-b border-white/[0.06]">
                    <th className="py-2">Nome</th>
                    <th className="py-2">E-mail</th>
                    <th className="py-2">Cargo</th>
                    <th className="py-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {perfis.map((p) => {
                    const ehAdmin = p.role === 'admin'
                    const acessoAtual = acessosPorUsuario[p.id]
                    const resumoAcesso = ehAdmin
                      ? 'Todas as abas'
                      : `${(acessoAtual && acessoAtual.length ? acessoAtual : PAGINAS_PADRAO_COMERCIAL).length} de ${PAGINAS.length} abas`
                    return (
                      <Fragment key={p.id}>
                        <tr className="border-b border-white/[0.04]">
                          <td className="py-2.5 text-slate-200">
                            <span className={p.ativo === false ? 'line-through text-slate-500' : ''}>{p.nome}</span>{' '}
                            {p.id === user?.id && <span className="text-orange-400 text-xs">(você)</span>}
                            {p.ativo === false && (
                              <span className="ml-1.5 text-[10px] uppercase tracking-wide bg-red-500/15 text-red-300 rounded px-1.5 py-0.5">
                                Inativo
                              </span>
                            )}
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
                          <td className="py-2.5 text-right space-x-3 whitespace-nowrap">
                            {!ehAdmin && (
                              <button
                                type="button"
                                onClick={() => abrirEditorAcesso(p)}
                                className="text-[11px] text-slate-400 hover:text-orange-400 underline decoration-dotted"
                              >
                                {editandoAcessoId === p.id ? 'Fechar acessos' : `Acessos (${resumoAcesso})`}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleResetarSenha(p)}
                              disabled={resetandoSenhaId === p.id}
                              className="text-[11px] text-slate-400 hover:text-orange-400 underline decoration-dotted"
                            >
                              {resetandoSenhaId === p.id ? 'Enviando...' : 'Resetar senha'}
                            </button>
                            {p.id !== user?.id && (
                              <button
                                type="button"
                                onClick={() => toggleAtivo(p)}
                                disabled={salvandoId === p.id}
                                className={`text-[11px] underline decoration-dotted ${
                                  p.ativo === false
                                    ? 'text-emerald-400 hover:text-emerald-300'
                                    : 'text-slate-400 hover:text-red-400'
                                }`}
                              >
                                {salvandoId === p.id
                                  ? '...'
                                  : p.ativo === false
                                    ? 'Reativar'
                                    : 'Inativar'}
                              </button>
                            )}
                          </td>
                        </tr>
                        {!ehAdmin && editandoAcessoId === p.id && (
                          <tr className="border-b border-white/[0.04] bg-[#0a0f14]/60">
                            <td colSpan={4} className="py-3 px-1">
                              <p className="text-[11px] text-slate-400 mb-2">
                                Marque as abas que <strong className="text-slate-200">{p.nome || p.email}</strong> pode ver.
                                Nas telas comerciais ele começa vendo só o que é dele — pode tirar o filtro, mas volta ao dele a cada atualização.
                              </p>
                              <div className="flex flex-wrap gap-x-4 gap-y-1.5 mb-3">
                                {PAGINAS.map((pg) => (
                                  <label key={pg.path} className="flex items-center gap-1.5 text-[11px] text-slate-300">
                                    <input
                                      type="checkbox"
                                      checked={rascunhoAcesso.includes(pg.path)}
                                      onChange={() => toggleRascunhoPagina(pg.path)}
                                      className="accent-orange-500"
                                    />
                                    {pg.label}
                                    <span className="text-slate-600">· {pg.grupo}</span>
                                  </label>
                                ))}
                              </div>
                              <div className="flex items-center gap-2">
                                <Button
                                  type="button"
                                  onClick={() => salvarAcesso(p)}
                                  disabled={salvandoAcessoId === p.id}
                                  className="bg-orange-500 hover:bg-orange-600 text-white text-xs h-8"
                                >
                                  {salvandoAcessoId === p.id ? 'Salvando...' : 'Salvar acessos'}
                                </Button>
                                <button
                                  type="button"
                                  onClick={() => setRascunhoAcesso(paginasPadraoPorCargo(p.role))}
                                  className="text-[11px] text-slate-400 hover:text-white underline decoration-dotted"
                                >
                                  Padrão do cargo ({CARGOS.find((c) => c.value === p.role)?.label})
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setRascunhoAcesso(PAGINAS.map((x) => x.path))}
                                  className="text-[11px] text-slate-400 hover:text-white underline decoration-dotted"
                                >
                                  Marcar todas
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setRascunhoAcesso(PAGINAS_PADRAO_COMERCIAL)}
                                  className="text-[11px] text-slate-400 hover:text-white underline decoration-dotted"
                                >
                                  Só comercial
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setRascunhoAcesso((prev) =>
                                      Array.from(new Set([...prev, ...PAGINAS_FINANCEIRO])),
                                    )
                                  }
                                  className="text-[11px] text-slate-400 hover:text-white underline decoration-dotted"
                                >
                                  + Liberar financeiro
                                </button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </TabsContent>

        {/* ABA: VENDEDORES / SDR */}
        <TabsContent value="vendedores" className="space-y-4">
          <div className="bg-[#111820] border border-white/[0.06] rounded-xl p-5">
            <h2 className="text-sm font-semibold text-white mb-1 flex items-center gap-2">
              <Users className="w-4 h-4 text-orange-400" /> Vendedores / SDR
            </h2>
            <p className="text-xs text-slate-400 mb-4">
              Essa lista aparece no formulário público de Captação — o cliente escolhe ali quem é o
              vendedor/SDR dele. Desative em vez de remover se só quiser tirar da lista sem perder o
              histórico dos leads já cadastrados com esse nome.
            </p>

            <form onSubmit={handleAdicionarVendedor} className="flex items-center gap-2 mb-4">
              <input
                type="text"
                placeholder="Nome do vendedor/SDR"
                value={novoVendedorNome}
                onChange={(e) => setNovoVendedorNome(e.target.value)}
                className="flex-1 bg-[#0a0f14] border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
              <Button
                type="submit"
                disabled={!novoVendedorNome.trim() || salvandoVendedor}
                className="bg-orange-500 hover:bg-orange-600 text-white text-xs"
              >
                Adicionar
              </Button>
            </form>

            {carregandoVendedores ? (
              <div className="text-sm text-slate-400">Carregando...</div>
            ) : vendedores.length === 0 ? (
              <div className="text-sm text-slate-500">Nenhum vendedor/SDR cadastrado ainda.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 text-xs uppercase border-b border-white/[0.06]">
                    <th className="py-2">Nome</th>
                    <th className="py-2">Status</th>
                    <th className="py-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {vendedores.map((v) => (
                    <tr key={v.id} className="border-b border-white/[0.04]">
                      <td className="py-2.5 text-slate-200">{v.nome}</td>
                      <td className="py-2.5">
                        <button
                          type="button"
                          onClick={() => handleToggleAtivoVendedor(v)}
                          className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                            v.ativo
                              ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                              : 'bg-slate-500/15 text-slate-400 border-slate-500/30'
                          }`}
                        >
                          {v.ativo ? 'Ativo' : 'Inativo'}
                        </button>
                      </td>
                      <td className="py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => handleRemoverVendedor(v)}
                          className="p-1.5 text-slate-400 hover:text-red-400 rounded hover:bg-white/[0.05]"
                          title="Remover"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </TabsContent>

        {/* ABA: TURMAS */}
        <TabsContent value="turmas" className="space-y-4">
          <div className="bg-[#111820] border border-white/[0.06] rounded-xl p-5">
            <h2 className="text-sm font-semibold text-white mb-1 flex items-center gap-2">
              <GraduationCap className="w-4 h-4 text-orange-400" /> Duração dos Cursos
            </h2>
            <p className="text-xs text-slate-400 mb-4">
              Usado pela conclusão automática de turma: quando uma turma fecha o semestre de
              formatura, o sistema marca ela como "Concluída" e — se a duração do curso estiver
              cadastrada aqui — cria sozinho a turma seguinte (mesmo curso/faculdade/cidade,
              formatura calculada a partir dessa duração). Sem duração cadastrada, a turma só é
              marcada como concluída; a turma nova não é criada automaticamente.
            </p>

            <form onSubmit={handleAdicionarDuracaoCurso} className="flex items-center gap-2 mb-4">
              <input
                type="text"
                placeholder="Curso (ex: Odontologia)"
                value={novoCursoDuracao}
                onChange={(e) => setNovoCursoDuracao(e.target.value)}
                className="flex-1 bg-[#0a0f14] border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
              <input
                type="text"
                placeholder="Faculdade (opcional)"
                value={novaFaculdadeDuracao}
                onChange={(e) => setNovaFaculdadeDuracao(e.target.value)}
                className="flex-1 bg-[#0a0f14] border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
              <input
                type="number"
                min={1}
                placeholder="Anos"
                value={novosAnosDuracao}
                onChange={(e) => setNovosAnosDuracao(e.target.value)}
                className="w-20 bg-[#0a0f14] border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
              <Button
                type="submit"
                disabled={!novoCursoDuracao.trim() || !novosAnosDuracao || salvandoDuracaoCurso}
                className="bg-orange-500 hover:bg-orange-600 text-white text-xs"
              >
                Adicionar
              </Button>
            </form>

            {carregandoDuracaoCursos ? (
              <div className="text-sm text-slate-400">Carregando...</div>
            ) : duracaoCursos.length === 0 ? (
              <div className="text-sm text-slate-500">Nenhuma duração de curso cadastrada ainda.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 text-xs uppercase border-b border-white/[0.06]">
                    <th className="py-2">Curso</th>
                    <th className="py-2">Faculdade</th>
                    <th className="py-2">Duração</th>
                    <th className="py-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {duracaoCursos.map((d) => (
                    <tr key={d.id} className="border-b border-white/[0.04]">
                      <td className="py-2.5 text-slate-200">{d.curso}</td>
                      <td className="py-2.5 text-slate-400">{d.faculdade || 'Todas'}</td>
                      <td className="py-2.5">
                        <button
                          type="button"
                          onClick={() => handleEditarDuracaoCurso(d)}
                          className="text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-orange-500/15 text-orange-400 border-orange-500/30"
                        >
                          {d.duracaoAnos} anos
                        </button>
                      </td>
                      <td className="py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => handleRemoverDuracaoCurso(d)}
                          className="p-1.5 text-slate-400 hover:text-red-400 rounded hover:bg-white/[0.05]"
                          title="Remover"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="bg-[#111820] border border-white/[0.06] rounded-xl p-5">
            <h2 className="text-sm font-semibold text-white mb-1 flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-orange-400" /> Motivos de Perda (Funil)
            </h2>
            <p className="text-xs text-slate-400 mb-4">
              Lista de motivos que aparece quando uma turma é marcada como "Perdeu" no Funil —
              vira dado analisável em vez de texto livre. Desative em vez de remover se só quiser
              tirar da lista sem perder o histórico de turmas já marcadas com esse motivo.
            </p>

            <form onSubmit={handleAdicionarMotivoPerda} className="flex items-center gap-2 mb-4">
              <input
                type="text"
                placeholder="Novo motivo"
                value={novoMotivoPerda}
                onChange={(e) => setNovoMotivoPerda(e.target.value)}
                className="flex-1 bg-[#0a0f14] border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
              <Button
                type="submit"
                disabled={!novoMotivoPerda.trim() || salvandoMotivoPerda}
                className="bg-orange-500 hover:bg-orange-600 text-white text-xs"
              >
                Adicionar
              </Button>
            </form>

            {carregandoMotivosPerda ? (
              <div className="text-sm text-slate-400">Carregando...</div>
            ) : motivosPerda.length === 0 ? (
              <div className="text-sm text-slate-500">Nenhum motivo cadastrado ainda.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 text-xs uppercase border-b border-white/[0.06]">
                    <th className="py-2">Motivo</th>
                    <th className="py-2">Status</th>
                    <th className="py-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {motivosPerda.map((m) => (
                    <tr key={m.id} className="border-b border-white/[0.04]">
                      <td className="py-2.5 text-slate-200">{m.motivo}</td>
                      <td className="py-2.5">
                        <button
                          type="button"
                          onClick={() => handleToggleAtivoMotivoPerda(m)}
                          className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                            m.ativo
                              ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                              : 'bg-slate-500/15 text-slate-400 border-slate-500/30'
                          }`}
                        >
                          {m.ativo ? 'Ativo' : 'Inativo'}
                        </button>
                      </td>
                      <td className="py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => handleRemoverMotivoPerda(m)}
                          className="p-1.5 text-slate-400 hover:text-red-400 rounded hover:bg-white/[0.05]"
                          title="Remover"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="bg-[#111820] border border-white/[0.06] rounded-xl p-5">
            <h2 className="text-sm font-semibold text-white mb-1 flex items-center gap-2">
              <Package className="w-4 h-4 text-orange-400" /> Pacotes — Itens e Templates
            </h2>
            <p className="text-xs text-slate-400 mb-4">
              Itens do catálogo aparecem clicáveis ao montar o pacote de uma turma. Cada template
              (Luxo/Moderno/Clássico/Básico) é só um ponto de partida — clicar no template
              pré-marca esses itens, e depois dá pra tirar/acrescentar item por item em cada
              pacote individualmente.
            </p>

            {carregandoCatalogo ? (
              <div className="text-sm text-slate-400">Carregando...</div>
            ) : (
              <>
                <div className="mb-5">
                  <h3 className="text-xs font-semibold text-slate-300 mb-2">Catálogo de itens</h3>
                  <form onSubmit={handleAdicionarItemCatalogo} className="flex items-center gap-2 mb-3">
                    <input
                      type="text"
                      placeholder="Novo item (ex: Making Of)"
                      value={novoItemCatalogo}
                      onChange={(e) => setNovoItemCatalogo(e.target.value)}
                      className="flex-1 bg-[#0a0f14] border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                    />
                    <Button
                      type="submit"
                      disabled={!novoItemCatalogo.trim() || salvandoItemCatalogo}
                      className="bg-orange-500 hover:bg-orange-600 text-white text-xs"
                    >
                      Adicionar
                    </Button>
                  </form>
                  <div className="flex flex-wrap gap-2">
                    {catalogoItens.map((item) => (
                      <span
                        key={item.id}
                        className={`inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full border ${
                          item.ativo
                            ? 'bg-white/[0.04] text-slate-200 border-white/[0.1]'
                            : 'bg-slate-500/10 text-slate-500 border-slate-500/20 line-through'
                        }`}
                      >
                        <button type="button" onClick={() => handleToggleAtivoItemCatalogo(item)}>
                          {item.nome}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoverItemCatalogo(item)}
                          className="text-slate-500 hover:text-red-400"
                          title="Remover"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-xs font-semibold text-slate-300 mb-2">Templates</h3>
                  <form onSubmit={handleAdicionarTemplate} className="flex items-center gap-2 mb-3">
                    <input
                      type="text"
                      placeholder="Novo template (ex: Premium)"
                      value={novoTemplateNome}
                      onChange={(e) => setNovoTemplateNome(e.target.value)}
                      className="flex-1 bg-[#0a0f14] border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                    />
                    <Button
                      type="submit"
                      disabled={!novoTemplateNome.trim()}
                      className="bg-orange-500 hover:bg-orange-600 text-white text-xs"
                    >
                      Adicionar
                    </Button>
                  </form>
                  <div className="space-y-3">
                    {templatesPacote.map((template) => (
                      <div
                        key={template.id}
                        className="rounded-lg border border-white/[0.06] p-3 bg-[#0a0f14]"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold text-orange-400">{template.nome}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoverTemplate(template)}
                            className="p-1 text-slate-500 hover:text-red-400 rounded"
                            title="Remover template"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {catalogoItens.map((item) => {
                            const incluso = template.itens.includes(item.nome)
                            return (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => handleToggleItemNoTemplate(template, item.nome)}
                                className={`text-[10px] px-2 py-1 rounded-full border ${
                                  incluso
                                    ? 'bg-orange-500/15 text-orange-400 border-orange-500/30'
                                    : 'bg-white/[0.02] text-slate-500 border-white/[0.08]'
                                }`}
                              >
                                {incluso ? '✓ ' : ''}
                                {item.nome}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
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

          <Card>
            <CardHeader>
              <div className="flex items-center space-x-2">
                <ImageIcon className="h-5 w-5 text-orange-400" />
                <CardTitle>Ícone da aba do navegador (favicon)</CardTitle>
              </div>
              <CardDescription>
                É o símbolo que aparece na aba do navegador, ao lado do nome do site. Envie a pena da
                marca em PNG quadrado (512x512), SVG ou ICO — de preferência com fundo transparente.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!isAuthenticated && (
                <p className="text-xs text-amber-400">
                  Faça login na aba "Banco de Dados" para poder enviar o ícone.
                </p>
              )}

              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-xl border border-dashed border-white/[0.15] bg-[repeating-conic-gradient(#1b1f2a_0%_25%,#0a0f14_0%_50%)] bg-[length:12px_12px] flex items-center justify-center overflow-hidden shrink-0">
                  {faviconPreview ? (
                    <img src={faviconPreview} alt="Favicon atual" className="w-full h-full object-contain" />
                  ) : (
                    <ImageIcon className="w-6 h-6 text-slate-600" />
                  )}
                </div>

                <div className="space-y-2">
                  <Input
                    id="favicon-file"
                    type="file"
                    accept="image/png,image/svg+xml,image/x-icon,.ico"
                    onChange={handleSelectFavicon}
                    disabled={!isAuthenticated}
                  />
                  <p className="text-xs text-slate-500">
                    PNG 512x512, SVG ou ICO. Pode precisar de um hard-refresh (Ctrl+Shift+R) para o
                    navegador trocar o ícone em cache.
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-white/[0.06]">
                {faviconPreview && (
                  <Button
                    variant="outline"
                    onClick={handleRemoveFavicon}
                    disabled={!isAuthenticated || uploadingFavicon}
                  >
                    <Trash2 className="h-4 w-4 mr-1.5" />
                    Remover
                  </Button>
                )}
                <Button
                  onClick={handleUploadFavicon}
                  disabled={!isAuthenticated || !faviconFile || uploadingFavicon}
                  className="bg-orange-500 hover:bg-orange-600"
                >
                  <Save className="h-4 w-4 mr-1.5" />
                  {uploadingFavicon ? 'Enviando...' : 'Salvar ícone'}
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

              <div className="space-y-4 pt-4 border-t border-white/[0.06]">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">Alertas por e-mail (Resend)</Label>
                  <p className="text-xs text-slate-500">
                    Usado pra avisar de turma nova sem cadastro no Mapa de Mercado e pra avisar
                    quando algum salvamento no site falhar.
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="resend-api-key">Resend API Key</Label>
                    <Input
                      id="resend-api-key"
                      type="password"
                      placeholder="re_••••••••••••••••••"
                      value={resendApiKey}
                      onChange={(e) => setResendApiKey(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email-alerta-turma-nova">E-mail: turma sem cadastro</Label>
                    <Input
                      id="email-alerta-turma-nova"
                      type="email"
                      placeholder="seuemail@exemplo.com"
                      value={emailAlertaTurmaNova}
                      onChange={(e) => setEmailAlertaTurmaNova(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="email-alerta-erro">E-mail: erro ao salvar</Label>
                    <Input
                      id="email-alerta-erro"
                      type="email"
                      placeholder="seuemail@exemplo.com"
                      value={emailAlertaErro}
                      onChange={(e) => setEmailAlertaErro(e.target.value)}
                    />
                    <p className="text-xs text-slate-500">
                      Se um insert/update/delete no Supabase falhar, chega um e-mail aqui e uma
                      notificação (sino) pra todo admin.
                    </p>
                  </div>
                </div>
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
