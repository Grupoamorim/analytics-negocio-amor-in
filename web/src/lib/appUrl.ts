/**
 * URL base do app para links que vão por e-mail para OUTRAS pessoas
 * (redefinição de senha, convite). Nunca usar `window.location.origin`
 * nesses casos: se o admin estiver rodando em localhost, o link iria
 * apontar para localhost e não funcionaria para o convidado.
 *
 * Ordem: VITE_APP_URL (se configurado) > origin atual quando NÃO é
 * localhost > domínio de produção conhecido (whitelistado no Supabase Auth).
 */
const PROD_URL = 'https://analytics-negocio-amor-in.pages.dev'

export function appBaseUrl(): string {
  const env = (import.meta as any).env?.VITE_APP_URL as string | undefined
  if (env) return env.replace(/\/+$/, '')
  if (typeof window !== 'undefined') {
    const o = window.location.origin
    if (o && !/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/i.test(o)) return o
  }
  return PROD_URL
}

/** URL completa para onde o link de definir/redefinir senha deve levar. */
export function redefinirSenhaUrl(): string {
  return `${appBaseUrl()}/redefinir-senha`
}
