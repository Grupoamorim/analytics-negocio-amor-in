import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'

export type MetricaMeta = 'receita' | 'adesoes' | 'contratos' | 'alunos'
export type EscopoMeta = 'mensal' | 'trimestral' | 'anual'

export interface MetaNegocio {
  id: string
  metrica: MetricaMeta
  escopo: EscopoMeta
  ano: number
  periodo: number // mensal 1-12 | trimestral 1-4 | anual 0
  valorMeta: number
  contexto: string
  updatedAt: string
}

export const METRICA_LABEL: Record<MetricaMeta, string> = {
  receita: 'Receita recebida (R$)',
  adesoes: 'Adesões (quantidade)',
  contratos: 'Contratos fechados (turmas)',
  alunos: 'Alunos fechados',
}

export const METRICA_UNIDADE: Record<MetricaMeta, 'R$' | 'un'> = {
  receita: 'R$',
  adesoes: 'un',
  contratos: 'un',
  alunos: 'un',
}

function mapRow(r: any): MetaNegocio {
  return {
    id: r.id,
    metrica: r.metrica,
    escopo: r.escopo,
    ano: r.ano,
    periodo: r.periodo ?? 0,
    valorMeta: Number(r.valor_meta || 0),
    contexto: r.contexto || '',
    updatedAt: r.updated_at,
  }
}

/** Intervalo [ini,fim] (YYYY-MM-DD) coberto por uma meta. */
export function intervaloDaMeta(m: Pick<MetaNegocio, 'escopo' | 'ano' | 'periodo'>): {
  ini: string
  fim: string
} {
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  if (m.escopo === 'mensal') {
    const mes = Math.min(12, Math.max(1, m.periodo || 1))
    return { ini: iso(new Date(m.ano, mes - 1, 1)), fim: iso(new Date(m.ano, mes, 0)) }
  }
  if (m.escopo === 'trimestral') {
    const t = Math.min(4, Math.max(1, m.periodo || 1))
    const inicioMes = (t - 1) * 3
    return { ini: iso(new Date(m.ano, inicioMes, 1)), fim: iso(new Date(m.ano, inicioMes + 3, 0)) }
  }
  return { ini: iso(new Date(m.ano, 0, 1)), fim: iso(new Date(m.ano, 11, 31)) }
}

export function rotuloPeriodoMeta(m: Pick<MetaNegocio, 'escopo' | 'ano' | 'periodo'>): string {
  const NOMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  if (m.escopo === 'mensal') return `${NOMES[(m.periodo || 1) - 1]}/${m.ano}`
  if (m.escopo === 'trimestral') return `T${m.periodo || 1}/${m.ano}`
  return `Ano ${m.ano}`
}

export function useMetasNegocio() {
  const [metas, setMetas] = useState<MetaNegocio[]>([])
  const [loading, setLoading] = useState(true)

  const recarregar = useCallback(async () => {
    setLoading(true)
    const { data } = await (supabase as any)
      .from('metas_negocio')
      .select('*')
      .order('ano', { ascending: false })
      .order('escopo')
      .order('periodo')
    setMetas((data || []).map(mapRow))
    setLoading(false)
  }, [])

  useEffect(() => {
    recarregar()
  }, [recarregar])

  const salvar = useCallback(
    async (m: Omit<MetaNegocio, 'id' | 'updatedAt'> & { id?: string }) => {
      const payload = {
        metrica: m.metrica,
        escopo: m.escopo,
        ano: m.ano,
        periodo: m.escopo === 'anual' ? 0 : m.periodo,
        valor_meta: m.valorMeta,
        contexto: m.contexto || null,
        updated_at: new Date().toISOString(),
      }
      const q = m.id
        ? (supabase as any).from('metas_negocio').update(payload).eq('id', m.id)
        : (supabase as any).from('metas_negocio').upsert(payload, {
            onConflict: 'metrica,escopo,ano,periodo',
          })
      const { error } = await q
      if (error) throw error
      await recarregar()
    },
    [recarregar],
  )

  const remover = useCallback(
    async (id: string) => {
      const { error } = await (supabase as any).from('metas_negocio').delete().eq('id', id)
      if (error) throw error
      await recarregar()
    },
    [recarregar],
  )

  /**
   * Meta vigente para uma métrica numa data de referência — pega a mais
   * específica que cobre a data: mensal > trimestral > anual.
   */
  const metaVigente = useCallback(
    (metrica: MetricaMeta, ref: string): MetaNegocio | null => {
      const candidatas = metas
        .filter((m) => m.metrica === metrica)
        .filter((m) => {
          const { ini, fim } = intervaloDaMeta(m)
          return ref >= ini && ref <= fim
        })
      const ordem: Record<EscopoMeta, number> = { mensal: 0, trimestral: 1, anual: 2 }
      candidatas.sort((a, b) => ordem[a.escopo] - ordem[b.escopo])
      return candidatas[0] || null
    },
    [metas],
  )

  return { metas, loading, recarregar, salvar, remover, metaVigente }
}
