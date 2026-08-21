import React, { useState, useEffect, useRef, useMemo } from 'react'
import { Link, useLocation, Outlet, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Kanban,
  Users,
  BrainCircuit,
  FileText,
  StickyNote,
  Settings,
  Menu,
  X,
  QrCode,
  Search,
  Bell,
  Target,
  TrendingUp,
  Rocket,
  LogOut,
  Building2,
  GraduationCap,
  DollarSign,
  BarChart3,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Link as LinkIcon,
  ShieldCheck,
  UserPlus,
} from 'lucide-react'
import { getTurmaDisplayName, FUNNEL_STAGE_BY_ID, daysInCurrentStage } from '@/types/crm'
import { useCRM } from '@/context/CRMContext'
import { TeamMember } from '@/types/crm'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase/client'
import GlobalAIFoatingButton from '@/components/AIInsightsButton'

const CARGO_LABEL: Record<string, string> = {
  admin: 'Administrador',
  financeiro: 'Financeiro',
  comercial: 'Comercial',
  membro: 'Membro',
}

type NavItem = { path: string; label: string; icon: typeof LayoutDashboard }

// Menu setorizado por departamento do negócio - cada seção agrupa
// páginas do mesmo módulo, pra manter o menu organizado mesmo com
// várias telas dentro de "Comercial".
const NAVIGATION_SECTIONS: { section: string | null; items: NavItem[] }[] = [
  {
    section: null,
    items: [{ path: '/', label: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    section: 'Comercial',
    items: [
      { path: '/pipeline', label: 'Funil Amor In', icon: Kanban },
      { path: '/leads', label: 'Turmas', icon: GraduationCap },
      { path: '/contatos', label: 'Contatos', icon: Users },
      { path: '/probabilidade', label: 'Probabilidade', icon: BrainCircuit },
      { path: '/transcricoes', label: 'Transcrições', icon: FileText },
      { path: '/notas', label: 'Notas', icon: StickyNote },
      { path: '/captacao', label: 'Captação', icon: QrCode },
      { path: '/mapa-mercado', label: 'Mapa de Mercado', icon: BarChart3 },
      { path: '/adesoes', label: 'Adesões', icon: UserPlus },
    ],
  },
  {
    section: 'Financeiro',
    items: [
      { path: '/financeiro', label: 'Financeiro', icon: DollarSign },
      { path: '/dre', label: 'DRE', icon: TrendingUp },
      { path: '/projecoes', label: 'Projeções', icon: Rocket },
    ],
  },
  {
    section: null,
    items: [{ path: '/configuracoes', label: 'Configurações', icon: Settings }],
  },
]

const NAVIGATION_ITEMS: NavItem[] = NAVIGATION_SECTIONS.flatMap((s) => s.items)

export default function Layout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { leads, deals, tasks, settings } = useCRM()
  const { toast } = useToast()
  const { user, signOut } = useAuth()
  const [perfil, setPerfil] = useState<{ nome: string; role: string } | null>(null)

  useEffect(() => {
    if (!user) return
    supabase
      .from('profiles')
      .select('nome, role')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (data) setPerfil(data)
      })
  }, [user])

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchDropdownOpen, setSearchDropdownOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  const notificationRef = useRef<HTMLDivElement>(null)

  // Determina título da página
  const currentPageTitle = React.useMemo(() => {
    const current = NAVIGATION_ITEMS.find((item) => item.path === location.pathname)
    return current ? current.label : 'Amor In Formaturas'
  }, [location.pathname])

  // Contagem de tarefas pendentes
  const pendingTasksCount = tasks.filter((t) => !t.completed).length

  // Lembretes automáticos: turmas estagnadas em cada estágio (além do limite).
  const stagnantReminders = useMemo(() => {
    return deals
      .filter((d) => d.stageId !== 'stage-6')
      .map((d) => {
        const meta = FUNNEL_STAGE_BY_ID[d.stageId]
        const days = daysInCurrentStage(d)
        const lead = d.leadId ? leads.find((l) => l.id === d.leadId) : undefined
        return {
          deal: d,
          lead,
          days,
          stage: meta,
          isAlert: meta ? days >= meta.stagnationAlertDays : false,
        }
      })
      .filter((r) => r.isAlert)
      .sort((a, b) => b.days - a.days)
  }, [deals, leads])

  const totalNotifications = pendingTasksCount + stagnantReminders.length

  const goToPipelineCard = (dealId: string) => {
    ;(window as any).__pipelineHighlightDealId = dealId
    setNotificationsOpen(false)
    navigate('/pipeline')
  }

  // Resultados da busca global
  const searchResults = React.useMemo(() => {
    if (!searchQuery.trim()) return { leads: [], deals: [] }
    const q = searchQuery.toLowerCase().trim()
    const matchedLeads = leads
      .filter(
        (l) =>
          l.curso.toLowerCase().includes(q) ||
          l.faculdade.toLowerCase().includes(q) ||
          l.cidade.toLowerCase().includes(q),
      )
      .slice(0, 4)
    const matchedDeals = deals
      .filter(
        (d) =>
          d.title.toLowerCase().includes(q) ||
          d.company.toLowerCase().includes(q) ||
          d.contactName.toLowerCase().includes(q),
      )
      .slice(0, 4)
    return { leads: matchedLeads, deals: matchedDeals }
  }, [searchQuery, leads, deals])

  // Fechar menus ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setSearchDropdownOpen(false)
      }
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setNotificationsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Fechar drawer mobile ao mudar de rota
  useEffect(() => {
    setMobileMenuOpen(false)
  }, [location.pathname])

  // Ícone da marca configurado
  const BrandIconComponent = () => {
    switch (settings.brandIcon) {
      case 'trending':
        return <TrendingUp className="w-6 h-6 text-orange-400" />
      case 'rocket':
        return <Rocket className="w-6 h-6 text-orange-400" />
      case 'target':
      default:
        return <Target className="w-6 h-6 text-orange-400" />
    }
  }

  // Estilo de fundo baseado nas configurações
  const bgThemeClass =
    settings.themeIntensity === 'deep'
      ? 'bg-[#0a0f14]'
      : settings.themeIntensity === 'soft'
        ? 'bg-[#151c28]'
        : 'bg-[#111820]'

  const currentUser: TeamMember = {
    id: user?.id || 'm-default',
    name: perfil?.nome || user?.email?.split('@')[0] || 'Usuário',
    email: user?.email || '',
    role: perfil ? CARGO_LABEL[perfil.role] || perfil.role : '',
    status: 'Ativo',
    avatarColor: '#F97316',
  }

  const initials = currentUser.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase()

  return (
    <div
      className={`min-h-screen ${bgThemeClass} text-[#f8fafc] flex flex-col font-sans selection:bg-orange-500/30 selection:text-orange-200`}
    >
      {/* Topbar Fixa (60px) */}
      <header className="fixed top-0 left-0 right-0 h-[60px] z-40 bg-[#0a0f14]/80 backdrop-blur-md border-b border-white/[0.06] flex items-center justify-between px-4 lg:px-8">
        {/* Lado Esquerdo: Mobile Hamburger + Título da Página */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Abrir menu de navegação"
            className="md:hidden p-2 text-slate-300 hover:text-white hover:bg-white/[0.06] rounded-lg transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Logo compacta visível no topo mobile */}
          <div className="flex items-center gap-2 md:hidden">
            <BrandIconComponent />
            <span className="font-bold text-base tracking-tight text-white">Amor In Formaturas</span>
          </div>

          <div className="hidden md:flex items-center gap-2 md:pl-[248px]">
            <h1 className="text-lg font-semibold text-white tracking-tight">{currentPageTitle}</h1>
          </div>
        </div>

        {/* Lado Direito: Busca Global + Notificações + Avatar */}
        <div className="flex items-center gap-3">
          {/* Campo de Busca Global com Dropdown */}
          <div className="relative" ref={searchRef}>
            <div className="relative hidden sm:block w-64 lg:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar leads, empresas, negócios..."
                value={searchQuery}
                onFocus={() => setSearchDropdownOpen(true)}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setSearchDropdownOpen(true)
                }}
                className="w-full bg-[#111820] border border-white/[0.08] rounded-full pl-9 pr-4 py-1.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500/50 transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Dropdown de Resultados da Busca */}
            {searchDropdownOpen && searchQuery.trim().length > 0 && (
              <div className="absolute right-0 top-10 w-80 sm:w-96 bg-[#111820] border border-white/10 rounded-xl shadow-2xl p-3 z-50 animate-fade-in">
                <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 px-2">
                  Resultados para &quot;{searchQuery}&quot;
                </div>

                {searchResults.leads.length === 0 && searchResults.deals.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-400">
                    Nenhum registro encontrado.
                  </div>
                ) : (
                  <div className="space-y-3 max-h-80 overflow-y-auto">
                    {searchResults.leads.length > 0 && (
                      <div>
                        <div className="text-[10px] text-orange-400 font-bold px-2 mb-1 flex items-center gap-1">
                          <Users className="w-3 h-3" /> LEADS ({searchResults.leads.length})
                        </div>
                        {searchResults.leads.map((l) => (
                          <div
                            key={l.id}
                            onClick={() => {
                              setSearchDropdownOpen(false)
                              navigate('/leads')
                            }}
                            className="px-2 py-1.5 rounded-lg hover:bg-white/[0.06] cursor-pointer flex items-center justify-between text-xs transition-colors"
                          >
                            <div>
                              <div className="font-medium text-white">{getTurmaDisplayName(l)}</div>
                              <div className="text-[11px] text-slate-400">
                                {l.faculdade} • {l.cidade}
                              </div>
                            </div>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-300 border border-orange-500/20">
                              {l.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {searchResults.deals.length > 0 && (
                      <div>
                        <div className="text-[10px] text-emerald-400 font-bold px-2 mb-1 flex items-center gap-1">
                          <Building2 className="w-3 h-3" /> OPORTUNIDADES (
                          {searchResults.deals.length})
                        </div>
                        {searchResults.deals.map((d) => (
                          <div
                            key={d.id}
                            onClick={() => {
                              setSearchDropdownOpen(false)
                              navigate('/pipeline')
                            }}
                            className="px-2 py-1.5 rounded-lg hover:bg-white/[0.06] cursor-pointer flex items-center justify-between text-xs transition-colors"
                          >
                            <div>
                              <div className="font-medium text-white">{d.company}</div>
                              <div className="text-[11px] text-slate-400">{d.title}</div>
                            </div>
                            <div className="text-right">
                              <div className="font-bold text-emerald-400">
                                R$ {d.value.toLocaleString('pt-BR')}
                              </div>
                              <span className="text-[10px] text-slate-400">
                                {d.probability}% prob.
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Notificações com sino e badge */}
          <div className="relative" ref={notificationRef}>
            <button
              type="button"
              onClick={() => setNotificationsOpen(!notificationsOpen)}
              aria-label="Notificações e tarefas"
              className="relative p-2 text-slate-300 hover:text-white hover:bg-white/[0.06] rounded-full transition-colors"
            >
              <Bell className="w-5 h-5" />
              {totalNotifications > 0 && (
                <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white ring-2 ring-[#0a0f14] animate-pulse">
                  {totalNotifications}
                </span>
              )}
            </button>

            {/* Menu Dropdown de Notificações / Lembretes / Tarefas */}
            {notificationsOpen && (
              <div className="absolute right-0 top-11 w-80 bg-[#111820] border border-white/10 rounded-xl shadow-2xl p-3 z-50 animate-fade-in">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/[0.06]">
                  <span className="text-xs font-semibold text-white">
                    Notificações ({totalNotifications})
                  </span>
                  <Link
                    to="/"
                    onClick={() => setNotificationsOpen(false)}
                    className="text-[11px] text-orange-400 hover:underline"
                  >
                    Ver Dashboard
                  </Link>
                </div>
                <div className="space-y-2 max-h-[320px] overflow-y-auto">
                  {/* Lembretes de turmas estagnadas */}
                  {stagnantReminders.length > 0 && (
                    <div className="text-[10px] text-amber-400 font-bold uppercase tracking-wider px-1 pt-1 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> Turmas Paradas (
                      {stagnantReminders.length})
                    </div>
                  )}
                  {stagnantReminders.map(({ deal, lead, days, stage }) => (
                    <button
                      key={deal.id}
                      type="button"
                      onClick={() => goToPipelineCard(deal.id)}
                      className="w-full p-2 rounded-lg bg-amber-500/[0.06] border border-amber-500/20 flex items-start gap-2 text-xs text-left hover:border-amber-500/40 transition-colors"
                    >
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-slate-200 font-medium leading-snug truncate">
                          {lead ? getTurmaDisplayName(lead) : deal.title}
                        </p>
                        <p className="text-[10px] text-slate-400 leading-snug">
                          {stage?.name} • {days} dias parada
                        </p>
                        <p className="text-[10px] text-amber-300/90 leading-snug mt-0.5">
                          {stage?.suggestedAction}
                        </p>
                      </div>
                    </button>
                  ))}

                  {/* Tarefas pendentes */}
                  {pendingTasksCount > 0 && (
                    <div className="text-[10px] text-orange-400 font-bold uppercase tracking-wider px-1 pt-2 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Tarefas ({pendingTasksCount})
                    </div>
                  )}
                  {tasks
                    .filter((t) => !t.completed)
                    .map((t) => (
                      <div
                        key={t.id}
                        className="p-2 rounded-lg bg-white/[0.02] border border-white/[0.04] flex items-start gap-2 text-xs"
                      >
                        <span
                          className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                            t.priority === 'Alta'
                              ? 'bg-red-500'
                              : t.priority === 'Média'
                                ? 'bg-amber-500'
                                : 'bg-slate-500'
                          }`}
                        />
                        <div className="flex-1">
                          <p className="text-slate-200 text-xs leading-snug">{t.title}</p>
                          {t.dueDate && (
                            <span className="text-[10px] text-slate-400">Prazo: {t.dueDate}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  {totalNotifications === 0 && (
                    <div className="text-center py-4 text-xs text-slate-400 flex items-center justify-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Tudo em dia!
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Avatar e Perfil */}
          <div className="flex items-center gap-2 pl-2 border-l border-white/[0.08]">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-md"
              style={{ backgroundColor: currentUser.avatarColor || '#F97316' }}
              title={`${currentUser.name} (${currentUser.role})`}
            >
              {initials}
            </div>
          </div>
        </div>
      </header>

      {/* Sidebar Desktop Fixa (260px) */}
      <aside className="hidden md:flex flex-col fixed top-0 left-0 bottom-0 w-[260px] bg-[#0a0f14] border-r border-white/[0.06] z-50">
        {/* Topo da Sidebar: Logo */}
        <div className="h-[60px] flex items-center px-6 gap-3 border-b border-white/[0.06]">
          <div className="p-1.5 rounded-lg bg-orange-500/10 border border-orange-500/20">
            <BrandIconComponent />
          </div>
          <div>
            <div className="font-bold text-base tracking-tight text-white flex items-center gap-1.5">
              Amor In Formaturas
              <span className="text-[10px] font-semibold uppercase px-1.5 py-0.2 rounded bg-orange-500/20 text-orange-300 border border-orange-500/30">
                PRO
              </span>
            </div>
            <div className="text-[11px] text-slate-400">Conversão de Vendas</div>
          </div>
        </div>

        {/* Menu de Navegação Vertical, setorizado por módulo */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAVIGATION_SECTIONS.map((sec, idx) => (
            <div key={sec.section ?? `sec-${idx}`} className={idx > 0 ? 'pt-3' : ''}>
              {sec.section && (
                <div className="px-3.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  {sec.section}
                </div>
              )}
              {sec.items.map((item) => {
                const Icon = item.icon
                const isActive = location.pathname === item.path

                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`relative flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group ${
                      isActive
                        ? 'text-white bg-orange-500/15 border border-orange-500/20 shadow-sm'
                        : 'text-slate-400 hover:text-white hover:bg-white/[0.05]'
                    }`}
                  >
                    {/* Indicador Ativo Lateral Esquerdo de 3px */}
                    {isActive && (
                      <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-gradient-to-b from-orange-500 to-orange-500" />
                    )}
                    <Icon
                      className={`w-5 h-5 transition-colors ${
                        isActive ? 'text-orange-400' : 'text-slate-400 group-hover:text-slate-200'
                      }`}
                    />
                    <span className="tracking-tight">{item.label}</span>
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>

        {/* Rodapé da Sidebar: Perfil Compacto */}
        <div className="p-3 border-t border-white/[0.06]">
          <div className="flex items-center justify-between p-2 rounded-xl bg-[#111820] border border-white/[0.06] group hover:border-white/[0.12] transition-colors">
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 shadow-inner"
                style={{ backgroundColor: currentUser.avatarColor || '#F97316' }}
              >
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-white truncate">{currentUser.name}</div>
                <div className="text-[10px] text-slate-400 truncate">{currentUser.role}</div>
              </div>
            </div>
            <button
              type="button"
              onClick={async () => {
                await signOut()
                navigate('/login')
              }}
              title="Sair da conta"
              className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-white/[0.05] rounded-md transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Drawer Mobile (≤767px) */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          {/* Backdrop Blur */}
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity animate-fade-in"
            onClick={() => setMobileMenuOpen(false)}
          />

          {/* Painel do Drawer Deslizante */}
          <div className="relative w-[280px] max-w-[85%] bg-[#0a0f14] border-r border-white/10 h-full flex flex-col p-4 shadow-2xl z-10 animate-slide-right">
            <div className="flex items-center justify-between pb-4 border-b border-white/[0.08]">
              <div className="flex items-center gap-2.5">
                <BrandIconComponent />
                <span className="font-bold text-lg text-white">Amor In Formaturas</span>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Menu Mobile, setorizado por módulo */}
            <nav className="flex-1 py-4 space-y-1.5 overflow-y-auto">
              {NAVIGATION_SECTIONS.map((sec, idx) => (
                <div key={sec.section ?? `msec-${idx}`} className={idx > 0 ? 'pt-2' : ''}>
                  {sec.section && (
                    <div className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      {sec.section}
                    </div>
                  )}
                  {sec.items.map((item) => {
                    const Icon = item.icon
                    const isActive = location.pathname === item.path

                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        onClick={() => setMobileMenuOpen(false)}
                        className={`flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all ${
                          isActive
                            ? 'text-white bg-orange-500/20 border border-orange-500/30'
                            : 'text-slate-400 hover:text-white hover:bg-white/[0.05]'
                        }`}
                      >
                        <Icon
                          className={`w-5 h-5 ${isActive ? 'text-orange-400' : 'text-slate-400'}`}
                        />
                        <span>{item.label}</span>
                      </Link>
                    )
                  })}
                </div>
              ))}
            </nav>

            <div className="pt-3 border-t border-white/[0.08]">
              <div className="flex items-center gap-3 p-2 rounded-xl bg-[#111820]">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
                  style={{ backgroundColor: currentUser.avatarColor || '#F97316' }}
                >
                  {initials}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-white truncate">
                    {currentUser.name}
                  </div>
                  <div className="text-[10px] text-slate-400">{user?.email || currentUser.email}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Área de Conteúdo Principal (padding 32px desktop, 24px tablet, 16px mobile) */}
      <main className="flex-1 md:pl-[260px] pt-[60px] flex flex-col">
        <div className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto animate-fade-in-up">
          <Outlet />
        </div>

        {/* Footer Discreto 48px */}
        <footer className="h-12 border-t border-white/[0.04] flex items-center justify-center gap-3 text-xs text-[#64748b] px-4">
          <span>Amor In Formaturas — Gestão do Negócio</span>
          <span className="text-white/10">·</span>
          <Link
            to="/admin"
            className="flex items-center gap-1 text-[#64748b] hover:text-orange-400 transition-colors"
          >
            <ShieldCheck className="w-3 h-3" /> Modo Administrador
          </Link>
        </footer>
      </main>

      {/* Botão Flutuante Global de Análise com IA */}
      <GlobalAIFoatingButton />
    </div>
  )
}
