// Ponto único pra avisar quando um SALVAMENTO no Supabase falha (insert/update/
// delete) - hoje isso só ia pro console e a tela seguia como se tivesse
// funcionado. Mostra um toast destrutivo na hora e manda um e-mail (via a
// mesma Edge Function/Resend já usada em alerta-turma-nova) pro endereço
// cadastrado em Admin > Preferências, com um throttle de 5min por contexto
// pra não floodar o e-mail se o mesmo erro repetir em loop.
import { toast } from '@/hooks/use-toast'
import { supabase } from '@/lib/supabase/client'

const ultimoEnvioPorContexto = new Map<string, number>()
const THROTTLE_MS = 5 * 60 * 1000

export function reportSupabaseError(contexto: string, error: unknown): void {
  const mensagem = error instanceof Error ? error.message : String(error)
  console.error(`[erro ao salvar] ${contexto}:`, error)

  toast({
    title: 'Erro ao salvar',
    description: `${contexto}: ${mensagem}`,
    variant: 'destructive',
  })

  const agora = Date.now()
  const ultimo = ultimoEnvioPorContexto.get(contexto) || 0
  if (agora - ultimo < THROTTLE_MS) return
  ultimoEnvioPorContexto.set(contexto, agora)

  supabase.functions
    .invoke('alerta-erro-salvar', {
      body: { contexto, mensagem, url: window.location.href, quando: new Date().toISOString() },
    })
    .catch(() => {
      // Se nem a chamada da função funcionar (ex: offline), não tem mais o
      // que fazer do lado do cliente - o toast já avisou na tela.
    })
}
