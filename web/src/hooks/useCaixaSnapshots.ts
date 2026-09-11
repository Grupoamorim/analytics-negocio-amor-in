import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'

export interface CaixaSnapshot {
  id: string
  data: string // YYYY-MM-DD
  valor: number
  observacao: string
  createdAt: string
}

function mapRow(r: any): CaixaSnapshot {
  return {
    id: r.id,
    data: r.data,
    valor: Number(r.valor || 0),
    observacao: r.observacao || '',
    createdAt: r.created_at,
  }
}

/** Log manual do saldo em caixa — é um estoque (foto de um momento), não um fluxo somável dia a
 * dia como receita/despesa, então não passa pelo calcularPace: a comparação com a meta é sempre
 * "último saldo lançado até a data X" vs. o valor-alvo cadastrado em Metas. */
export function useCaixaSnapshots() {
  const [snapshots, setSnapshots] = useState<CaixaSnapshot[]>([])
  const [loading, setLoading] = useState(true)

  const recarregar = useCallback(async () => {
    setLoading(true)
    const { data } = await (supabase as any)
      .from('caixa_snapshots')
      .select('*')
      .order('data', { ascending: false })
    setSnapshots((data || []).map(mapRow))
    setLoading(false)
  }, [])

  useEffect(() => {
    recarregar()
  }, [recarregar])

  const adicionar = useCallback(
    async (v: { data: string; valor: number; observacao?: string }) => {
      const { error } = await (supabase as any).from('caixa_snapshots').upsert(
        { data: v.data, valor: v.valor, observacao: v.observacao || null },
        { onConflict: 'data' },
      )
      if (error) throw error
      await recarregar()
    },
    [recarregar],
  )

  const remover = useCallback(
    async (id: string) => {
      const { error } = await (supabase as any).from('caixa_snapshots').delete().eq('id', id)
      if (error) throw error
      await recarregar()
    },
    [recarregar],
  )

  /** Snapshot mais recente lançado até (e incluindo) a data informada — usado pra comparar com a
   * meta de um período que já passou ou está em andamento. */
  const ultimoAte = useCallback(
    (dataRef: string): CaixaSnapshot | null => {
      const candidatos = snapshots.filter((s) => s.data <= dataRef)
      return candidatos[0] || null // já vem ordenado desc por `data`
    },
    [snapshots],
  )

  return { snapshots, loading, recarregar, adicionar, remover, ultimoAte }
}
