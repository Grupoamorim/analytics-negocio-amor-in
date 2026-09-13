import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import type { MetricaMeta } from './useMetasNegocio'

export type MarcoStatus = 'pendente' | 'concluido' | 'cancelado'
export type MarcoDecisao = 'realocado' | 'descartado' | 'substituido'

export interface MetaMarco {
  id: string
  titulo: string
  descricao: string
  metrica: MetricaMeta | null
  metaNegocioId: string | null
  prazo: string | null // YYYY-MM-DD
  pontos: number
  ordem: number | null
  status: MarcoStatus
  concluidoEm: string | null
  explicacao: string | null
  decisao: MarcoDecisao | null
  origem: 'manual' | 'ia'
  riscoRealista: string | null
  createdAt: string
  updatedAt: string
}

function mapRow(r: any): MetaMarco {
  return {
    id: r.id,
    titulo: r.titulo,
    descricao: r.descricao,
    metrica: r.metrica ?? null,
    metaNegocioId: r.meta_negocio_id ?? null,
    prazo: r.prazo ?? null,
    pontos: Number(r.pontos ?? 10),
    ordem: r.ordem ?? null,
    status: r.status,
    concluidoEm: r.concluido_em ?? null,
    explicacao: r.explicacao ?? null,
    decisao: r.decisao ?? null,
    origem: r.origem,
    riscoRealista: r.risco_realista ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

/** Um marco conta como atrasado quando o prazo já passou e ele continua pendente — nunca
 * armazenado no banco, sempre recalculado a partir da data real de hoje. */
export function marcoEstaAtrasado(m: Pick<MetaMarco, 'prazo' | 'status'>): boolean {
  if (!m.prazo || m.status !== 'pendente') return false
  return m.prazo < new Date().toISOString().slice(0, 10)
}

export function useMetasMarcos() {
  const [marcos, setMarcos] = useState<MetaMarco[]>([])
  const [loading, setLoading] = useState(true)

  const recarregar = useCallback(async () => {
    setLoading(true)
    const { data } = await (supabase as any)
      .from('metas_marcos')
      .select('*')
      .order('ordem', { ascending: true, nullsFirst: false })
      .order('prazo', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })
    setMarcos((data || []).map(mapRow))
    setLoading(false)
  }, [])

  useEffect(() => {
    recarregar()
  }, [recarregar])

  const salvar = useCallback(
    async (
      m: Partial<Omit<MetaMarco, 'id' | 'createdAt' | 'updatedAt'>> & { id?: string; titulo: string; descricao: string },
    ) => {
      const payload = {
        titulo: m.titulo,
        descricao: m.descricao,
        metrica: m.metrica ?? null,
        meta_negocio_id: m.metaNegocioId ?? null,
        prazo: m.prazo ?? null,
        pontos: m.pontos ?? 10,
        ordem: m.ordem ?? null,
        status: m.status ?? 'pendente',
        concluido_em: m.concluidoEm ?? null,
        explicacao: m.explicacao ?? null,
        decisao: m.decisao ?? null,
        origem: m.origem ?? 'manual',
        risco_realista: m.riscoRealista ?? null,
        updated_at: new Date().toISOString(),
      }
      const q = m.id
        ? (supabase as any).from('metas_marcos').update(payload).eq('id', m.id)
        : (supabase as any).from('metas_marcos').insert(payload)
      const { error } = await q
      if (error) throw error
      await recarregar()
    },
    [recarregar],
  )

  const remover = useCallback(
    async (id: string) => {
      const { error } = await (supabase as any).from('metas_marcos').delete().eq('id', id)
      if (error) throw error
      await recarregar()
    },
    [recarregar],
  )

  const marcarConcluido = useCallback(
    async (id: string, concluido: boolean) => {
      const { error } = await (supabase as any)
        .from('metas_marcos')
        .update({
          status: concluido ? 'concluido' : 'pendente',
          concluido_em: concluido ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
      if (error) throw error
      await recarregar()
    },
    [recarregar],
  )

  const registrarExplicacao = useCallback(
    async (id: string, texto: string) => {
      const { error } = await (supabase as any)
        .from('metas_marcos')
        .update({ explicacao: texto, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
      await recarregar()
    },
    [recarregar],
  )

  /** Aplica a decisão tomada (junto com o Consultor de Metas ou direto no painel) sobre um marco
   * atrasado: realocar pra um novo prazo (volta a pendente, limpa explicação/decisão), descartar
   * (cancela, guarda o motivo pra auditoria) ou substituir (cancela — o marco novo nasce à parte,
   * via `salvar` normal). */
  const aplicarDecisao = useCallback(
    async (id: string, decisao: MarcoDecisao, novoPrazo?: string) => {
      const payload =
        decisao === 'realocado'
          ? { prazo: novoPrazo ?? null, status: 'pendente', explicacao: null, decisao: null, updated_at: new Date().toISOString() }
          : { status: 'cancelado', decisao, updated_at: new Date().toISOString() }
      const { error } = await (supabase as any).from('metas_marcos').update(payload).eq('id', id)
      if (error) throw error
      await recarregar()
    },
    [recarregar],
  )

  return { marcos, loading, recarregar, salvar, remover, marcarConcluido, registrarExplicacao, aplicarDecisao }
}
