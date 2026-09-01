// Catálogo único das abas do menu do app. Usado tanto pela navegação (Layout)
// quanto pela tela de Administração > Usuários, onde o admin marca abas que
// cada usuário não-admin pode ver. O admin sempre vê todas, ignorando isso.

export interface PaginaDef {
  path: string
  label: string
  grupo: 'Geral' | 'Comercial' | 'Financeiro'
}

export const PAGINAS: PaginaDef[] = [
  { path: '/', label: 'Painel Comercial', grupo: 'Comercial' },
  { path: '/painel-financeiro', label: 'Painel Financeiro', grupo: 'Financeiro' },
  { path: '/agenda', label: 'Agenda', grupo: 'Comercial' },
  { path: '/captacao', label: 'Mapa de Mercado', grupo: 'Comercial' },
  { path: '/pipeline', label: 'Funil Amor In', grupo: 'Comercial' },
  { path: '/leads', label: 'Turmas', grupo: 'Comercial' },
  { path: '/contatos', label: 'Contatos', grupo: 'Comercial' },
  { path: '/probabilidade', label: 'Probabilidade', grupo: 'Comercial' },
  { path: '/transcricoes', label: 'Transcrições', grupo: 'Comercial' },
  { path: '/notas', label: 'Notas', grupo: 'Comercial' },
  { path: '/adesoes', label: 'Adesões', grupo: 'Financeiro' },
  { path: '/financeiro', label: 'Financeiro', grupo: 'Financeiro' },
  { path: '/dre', label: 'DRE', grupo: 'Financeiro' },
  { path: '/projecoes', label: 'Projeções', grupo: 'Financeiro' },
  { path: '/relatorios', label: 'Relatórios', grupo: 'Geral' },
]

export const TODAS_PAGINAS: string[] = PAGINAS.map((p) => p.path)

/** Páginas do setor comercial — usado para saber se um usuário tem acesso comercial. */
export const PAGINAS_COMERCIAL: string[] = PAGINAS.filter((p) => p.grupo === 'Comercial').map(
  (p) => p.path,
)

/** Conjunto padrão para um usuário não-admin recém-criado (comercial, sem financeiro). */
export const PAGINAS_PADRAO_COMERCIAL: string[] = [
  '/',
  '/agenda',
  '/captacao',
  '/pipeline',
  '/leads',
  '/contatos',
  '/probabilidade',
  '/transcricoes',
  '/notas',
]

/** Páginas do setor financeiro — liberadas em bloco quando o admin marca "acesso financeiro". */
export const PAGINAS_FINANCEIRO: string[] = [
  '/painel-financeiro',
  '/adesoes',
  '/financeiro',
  '/dre',
  '/projecoes',
]

/**
 * Conjunto de abas que já vem marcado ao escolher um cargo (no convite ou ao
 * editar o acesso de alguém). É só um ponto de partida — o admin pode marcar/
 * desmarcar o que quiser por cima.
 */
export const PAGINAS_PADRAO_POR_CARGO: Record<string, string[]> = {
  admin: TODAS_PAGINAS,
  financeiro: [...PAGINAS_FINANCEIRO, '/relatorios'],
  comercial: PAGINAS_PADRAO_COMERCIAL,
  membro: ['/', '/agenda', '/leads', '/probabilidade', '/notas'],
}

export function paginasPadraoPorCargo(role: string): string[] {
  return PAGINAS_PADRAO_POR_CARGO[role] ?? PAGINAS_PADRAO_COMERCIAL
}

/**
 * Um usuário tem acesso comercial se for admin, ou se as páginas liberadas para
 * ele incluírem ao menos uma aba do grupo Comercial. `paginasConfiguradas` vazio
 * ou ausente = padrão comercial (todo mundo comum começa comercial).
 */
export function temAcessoComercial(role: string, paginasConfiguradas?: string[] | null): boolean {
  if (role === 'admin') return true
  const paginas =
    !paginasConfiguradas || paginasConfiguradas.length === 0
      ? PAGINAS_PADRAO_COMERCIAL
      : paginasConfiguradas
  return paginas.some((p) => PAGINAS_COMERCIAL.includes(p))
}

export function labelDaPagina(path: string): string {
  return PAGINAS.find((p) => p.path === path)?.label || path
}
