import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'

export type PeriodoTipoConhecimento = 'mensal' | 'trimestral' | 'semestral' | 'anual' | 'geral'

export interface ConhecimentoEmpresa {
  id: string
  ano: number | null
  periodoTipo: PeriodoTipoConhecimento
  periodoValor: number | null
  titulo: string
  conteudo: string
  origem: 'ia' | 'manual'
  createdAt: string
  updatedAt: string
}

function mapRow(r: any): ConhecimentoEmpresa {
  return {
    id: r.id,
    ano: r.ano,
    periodoTipo: r.periodo_tipo,
    periodoValor: r.periodo_valor,
    titulo: r.titulo,
    conteudo: r.conteudo,
    origem: r.origem,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

/** Base de conhecimento da empresa — registros organizados por período, alimentados pela IA
 * (aba Consultor de Metas, botão "Organizar na base de conhecimento") ou digitados na mão aqui
 * mesmo. Salvar de novo pro mesmo ano/período/título ATUALIZA o registro existente em vez de
 * duplicar — é assim que evita virar um textão gigante com o tempo. */
export function useConhecimentoEmpresa() {
  const [registros, setRegistros] = useState<ConhecimentoEmpresa[]>([])
  const [loading, setLoading] = useState(true)

  const recarregar = useCallback(async () => {
    setLoading(true)
    const { data } = await (supabase as any)
      .from('conhecimento_empresa')
      .select('*')
      .order('ano', { ascending: false })
      .order('periodo_valor', { ascending: false })
    setRegistros((data || []).map(mapRow))
    setLoading(false)
  }, [])

  useEffect(() => {
    recarregar()
  }, [recarregar])

  const buscarExistente = useCallback(
    (ano: number | null, periodoTipo: PeriodoTipoConhecimento, periodoValor: number | null, titulo: string) =>
      registros.find(
        (r) =>
          r.ano === ano &&
          r.periodoTipo === periodoTipo &&
          r.periodoValor === periodoValor &&
          r.titulo.trim().toLowerCase() === titulo.trim().toLowerCase(),
      ) || null,
    [registros],
  )

  const salvar = useCallback(
    async (v: {
      id?: string
      ano: number | null
      periodoTipo: PeriodoTipoConhecimento
      periodoValor: number | null
      titulo: string
      conteudo: string
      origem: 'ia' | 'manual'
    }) => {
      const payload = {
        ano: v.ano,
        periodo_tipo: v.periodoTipo,
        periodo_valor: v.periodoValor,
        titulo: v.titulo,
        conteudo: v.conteudo,
        origem: v.origem,
        updated_at: new Date().toISOString(),
      }
      const existente = v.id ? null : buscarExistente(v.ano, v.periodoTipo, v.periodoValor, v.titulo)
      const idAlvo = v.id || existente?.id
      const { error } = idAlvo
        ? await (supabase as any).from('conhecimento_empresa').update(payload).eq('id', idAlvo)
        : await (supabase as any).from('conhecimento_empresa').insert(payload)
      if (error) throw error
      await recarregar()
    },
    [recarregar, buscarExistente],
  )

  const remover = useCallback(
    async (id: string) => {
      const { error } = await (supabase as any).from('conhecimento_empresa').delete().eq('id', id)
      if (error) throw error
      await recarregar()
    },
    [recarregar],
  )

  return { registros, loading, recarregar, salvar, remover, buscarExistente }
}
