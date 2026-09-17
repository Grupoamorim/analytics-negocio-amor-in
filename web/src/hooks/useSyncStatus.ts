// Indicador de "última sincronização" no cabeçalho — mesma ideia da auditoria diária por e-mail,
// só que visível na hora pra qualquer usuário logado, sem precisar esperar o e-mail das 07h.
// Usa sge_contas_receber como referência (é a tabela que mais recebe atualização, financeiro
// puxado a cada 3h) — se ela está em dia, o resto do sync do SGE também está.
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'

// Sync automatico roda a cada 3h (sync-financeiro.yml) - 6h de limite da 2 execucoes
// de folga antes de avisar, cobrindo um atraso ocasional de agendamento do GitHub
// Actions sem disparar alarme falso.
const LIMITE_ATRASO_HORAS = 6

export function useSyncStatus() {
  const [ultimaSync, setUltimaSync] = useState<Date | null>(null)
  const [carregado, setCarregado] = useState(false)

  useEffect(() => {
    let ativo = true
    supabase
      .from('sge_contas_receber')
      .select('updated_at')
      .order('updated_at', { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (!ativo) return
        const ts = data?.[0]?.updated_at
        setUltimaSync(ts ? new Date(ts) : null)
        setCarregado(true)
      })
    return () => {
      ativo = false
    }
  }, [])

  const horasDesdeSync = ultimaSync ? (Date.now() - ultimaSync.getTime()) / 3600000 : null
  const atrasado = horasDesdeSync != null && horasDesdeSync > LIMITE_ATRASO_HORAS

  return { ultimaSync, horasDesdeSync, atrasado, carregado }
}
