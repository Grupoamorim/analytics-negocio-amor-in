// Persistência local (localStorage) dos leads de captação
import { CaptacaoLead, normalizeTurma } from '@/types/captacao'

const STORAGE_KEY = 'captacao_leads'

// Seed de demonstração (3-5 registros em português)
export const CAPTACAO_SEED: CaptacaoLead[] = []

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `cap-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function loadLeads(): CaptacaoLead[] {
  if (!isBrowser()) return CAPTACAO_SEED
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(CAPTACAO_SEED))
      return CAPTACAO_SEED
    }
    const parsed = JSON.parse(raw) as CaptacaoLead[]
    if (!Array.isArray(parsed)) return CAPTACAO_SEED
    return parsed
  } catch {
    return CAPTACAO_SEED
  }
}

export const CAPTACAO_LEADS_CHANGED_EVENT = 'captacao-leads-changed'

export function saveLeads(leads: CaptacaoLead[]): void {
  if (!isBrowser()) return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(leads))
    // Notifica componentes que o storage mudou (ex.: formulário público → gestão)
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }))
    // CustomEvent garante notificação na MESMA aba, mesmo após remontagem do
    // componente (cenário onde o `storage` event nativo não dispara).
    window.dispatchEvent(new CustomEvent(CAPTACAO_LEADS_CHANGED_EVENT))
  } catch {
    /* noop */
  }
}

/**
 * Inscreve um callback nas mudanças de leads. Combina três mecanismos para
 * garantir sincronização robusta em navegação SPA (React Router):
 *  - CustomEvent 'captacao-leads-changed' (mesma aba, mesmo após remontagem)
 *  - `storage` event nativo (entre abas)
 *  - `setInterval` de 2 segundos (polling como fallback definitivo)
 *
 * Retorna uma função de cleanup que remove todos os listeners e cancela o intervalo.
 */
export function subscribeToLeads(callback: () => void): () => void {
  if (!isBrowser()) {
    return () => {}
  }

  const onCustom = () => callback()
  const onStorage = (e: StorageEvent) => {
    if (!e.key || e.key === STORAGE_KEY) callback()
  }

  window.addEventListener(CAPTACAO_LEADS_CHANGED_EVENT, onCustom)
  window.addEventListener('storage', onStorage)

  const intervalId = window.setInterval(callback, 2000)

  return () => {
    window.removeEventListener(CAPTACAO_LEADS_CHANGED_EVENT, onCustom)
    window.removeEventListener('storage', onStorage)
    window.clearInterval(intervalId)
  }
}

export function addLead(
  input: Omit<CaptacaoLead, 'id' | 'dataCadastro' | 'turma'> & {
    turma?: string
  },
): CaptacaoLead[] {
  const leads = loadLeads()
  const newLead: CaptacaoLead = {
    ...input,
    id: uuid(),
    turma: normalizeTurma(input.turma),
    dataCadastro: new Date().toISOString(),
  }
  const next = [newLead, ...leads]
  saveLeads(next)
  return next
}

export function updateLead(id: string, patch: Partial<CaptacaoLead>): CaptacaoLead[] {
  let leads = loadLeads()
  leads = leads.map((l) =>
    l.id === id
      ? {
          ...l,
          ...patch,
          turma: normalizeTurma(patch.turma ?? l.turma),
        }
      : l,
  )
  saveLeads(leads)
  return leads
}

export function deleteLead(id: string): CaptacaoLead[] {
  let leads = loadLeads()
  leads = leads.filter((l) => l.id !== id)
  saveLeads(leads)
  return leads
}
