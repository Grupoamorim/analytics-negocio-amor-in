import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { PAGINAS_PADRAO_COMERCIAL, TODAS_PAGINAS } from '@/utils/paginas'

export interface UsuarioSistema {
  id: string
  nome: string
  email: string
  role: string
}

interface MinhaVisaoArgs {
  /** Campos de texto com nome de responsável (closer, sdr, responsável, vendedor...). */
  nomes?: Array<string | null | undefined>
  /** id (uuid) do dono/criador do registro, quando existir. */
  ownerId?: string | null
}

interface AcessoContextType {
  carregando: boolean
  userId: string | null
  nome: string
  email: string
  role: string
  isAdmin: boolean

  /** Todos os perfis do sistema — usado em dropdowns (SDR/closer/vendedor) e no filtro. */
  usuarios: UsuarioSistema[]

  /** Abas que o usuário atual pode ver (admin = todas). */
  paginasPermitidas: string[]
  podeVer: (path: string) => boolean
  primeiraPaginaPermitida: string

  // ---- Filtro pessoal "Responsável" ----
  /** Nome selecionado no filtro. null = "Todos" (empresa inteira). */
  responsavelFiltro: string | null
  /** uuid do usuário selecionado no filtro, quando o nome bate com um perfil. */
  responsavelFiltroUserId: string | null
  setResponsavelFiltro: (nomeOuNull: string | null) => void
  /** true quando está filtrando por uma pessoa (não "Todos"). */
  filtroPessoalAtivo: boolean
  /** Regra central: esse registro deve aparecer para o responsável filtrado? */
  minhaVisao: (args: MinhaVisaoArgs) => boolean

  // ---- Gestão (admin) ----
  acessosPorUsuario: Record<string, string[]>
  salvarAcessoUsuario: (uid: string, paginas: string[]) => Promise<void>
  recarregar: () => Promise<void>
}

const AcessoContext = createContext<AcessoContextType | undefined>(undefined)

function norm(s?: string | null): string {
  return (s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function primeiroNome(s?: string | null): string {
  return norm(s).split(/\s+/)[0] || ''
}

export const AcessoProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isAuthenticated, loading: authLoading } = useAuth()

  // Só sai de "carregando" depois que a autenticação resolveu E a 1ª busca terminou —
  // senão o AdminRoute/RotaComPermissao decidem cedo demais (role ainda vazio) e redirecionam.
  const [buscaConcluida, setBuscaConcluida] = useState(false)
  const carregando = authLoading || !buscaConcluida
  const [role, setRole] = useState('')
  const [nome, setNome] = useState('')
  const [usuarios, setUsuarios] = useState<UsuarioSistema[]>([])
  const [acessosPorUsuario, setAcessosPorUsuario] = useState<Record<string, string[]>>({})

  const userId = user?.id ?? null
  const email = user?.email ?? ''
  const isAdmin = role === 'admin'

  const carregar = useCallback(async () => {
    if (authLoading) return
    if (!isAuthenticated || !userId) {
      setRole('')
      setBuscaConcluida(true)
      return
    }

    // `acesso_paginas` é nova e ainda não está no types.ts gerado — cast como o resto do projeto faz.
    const db = supabase as any
    const [{ data: perfis }, { data: acessos }] = await Promise.all([
      supabase.from('profiles').select('id, nome, email, role, ativo').order('nome'),
      db.from('acesso_paginas').select('user_id, paginas'),
    ])

    // Usuário inativado por um admin: desconecta e avisa (senão fica só
    // "entra e cai" sem explicação).
    const meuPerfilRaw = (perfis || []).find((p: any) => p.id === userId)
    if (meuPerfilRaw && meuPerfilRaw.ativo === false) {
      try {
        sessionStorage.setItem('acesso_inativo', '1')
      } catch {
        // ignora
      }
      await supabase.auth.signOut()
      setRole('')
      setBuscaConcluida(true)
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        window.location.assign('/login?inativo=1')
      }
      return
    }

    const listaUsuarios: UsuarioSistema[] = (perfis || []).map((p: any) => ({
      id: p.id,
      nome: p.nome || p.email || 'Usuário',
      email: p.email || '',
      role: p.role || 'membro',
    }))
    setUsuarios(listaUsuarios)

    const mapAcessos: Record<string, string[]> = {}
    for (const a of acessos || []) {
      mapAcessos[(a as any).user_id] = Array.isArray((a as any).paginas) ? (a as any).paginas : []
    }
    setAcessosPorUsuario(mapAcessos)

    const meuPerfil = listaUsuarios.find((u) => u.id === userId)
    setRole(meuPerfil?.role || 'membro')
    setNome(meuPerfil?.nome || user?.email?.split('@')[0] || 'Usuário')

    setBuscaConcluida(true)
  }, [authLoading, isAuthenticated, userId, user?.email])

  useEffect(() => {
    carregar()
  }, [carregar])

  // Abas permitidas para o usuário atual.
  const paginasPermitidas = useMemo(() => {
    if (isAdmin) return TODAS_PAGINAS
    if (!userId) return []
    const cfg = acessosPorUsuario[userId]
    if (!cfg || cfg.length === 0) return PAGINAS_PADRAO_COMERCIAL
    return cfg.filter((p) => TODAS_PAGINAS.includes(p))
  }, [isAdmin, userId, acessosPorUsuario])

  const podeVer = useCallback(
    (path: string) => isAdmin || paginasPermitidas.includes(path),
    [isAdmin, paginasPermitidas],
  )

  const primeiraPaginaPermitida = paginasPermitidas[0] || '/'

  // ---- Filtro pessoal ----
  const [responsavelFiltro, setResponsavelFiltroState] = useState<string | null>(null)
  const [filtroInicializado, setFiltroInicializado] = useState(false)

  useEffect(() => {
    if (carregando || filtroInicializado) return
    // Usuário comum começa vendo só o que é dele; admin começa vendo tudo.
    // Não persiste em lugar nenhum de propósito: todo reload volta para esse padrão.
    if (!isAdmin && nome) setResponsavelFiltroState(nome)
    setFiltroInicializado(true)
  }, [carregando, filtroInicializado, isAdmin, nome])

  const setResponsavelFiltro = useCallback((v: string | null) => {
    setResponsavelFiltroState(v && v.trim() ? v : null)
  }, [])

  const responsavelFiltroUserId = useMemo(() => {
    if (!responsavelFiltro) return null
    const alvo = norm(responsavelFiltro)
    return usuarios.find((u) => norm(u.nome) === alvo)?.id || null
  }, [responsavelFiltro, usuarios])

  const filtroPessoalAtivo = responsavelFiltro != null

  const minhaVisao = useCallback(
    ({ nomes = [], ownerId = null }: MinhaVisaoArgs) => {
      if (!responsavelFiltro) return true
      if (ownerId && responsavelFiltroUserId && ownerId === responsavelFiltroUserId) return true
      const alvo = norm(responsavelFiltro)
      const alvoPrim = primeiroNome(responsavelFiltro)
      const vals = nomes.map(norm).filter(Boolean)
      if (vals.length === 0) return true // nada vinculado a ninguém → aparece para todos
      return vals.some((v) => v === alvo || primeiroNome(v) === alvoPrim)
    },
    [responsavelFiltro, responsavelFiltroUserId],
  )

  // ---- Gestão (admin) ----
  const salvarAcessoUsuario = useCallback(async (uid: string, paginas: string[]) => {
    const limpo = paginas.filter((p) => TODAS_PAGINAS.includes(p))
    const { error } = await (supabase as any)
      .from('acesso_paginas')
      .upsert({ user_id: uid, paginas: limpo, updated_at: new Date().toISOString() })
    if (error) throw error
    setAcessosPorUsuario((prev) => ({ ...prev, [uid]: limpo }))
  }, [])

  const value: AcessoContextType = {
    carregando,
    userId,
    nome,
    email,
    role,
    isAdmin,
    usuarios,
    paginasPermitidas,
    podeVer,
    primeiraPaginaPermitida,
    responsavelFiltro,
    responsavelFiltroUserId,
    setResponsavelFiltro,
    filtroPessoalAtivo,
    minhaVisao,
    acessosPorUsuario,
    salvarAcessoUsuario,
    recarregar: carregar,
  }

  return <AcessoContext.Provider value={value}>{children}</AcessoContext.Provider>
}

export function useAcesso(): AcessoContextType {
  const ctx = useContext(AcessoContext)
  if (!ctx) throw new Error('useAcesso deve ser usado dentro de <AcessoProvider>')
  return ctx
}
