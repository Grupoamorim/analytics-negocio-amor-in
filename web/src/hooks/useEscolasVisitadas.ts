import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'

export interface EscolaVisitada {
  id: string
  data: string // YYYY-MM-DD
  escola: string
  cidade: string
  cursoAlvo: string
  responsavel: string
  observacao: string
  createdAt: string
}

function mapRow(r: any): EscolaVisitada {
  return {
    id: r.id,
    data: r.data,
    escola: r.escola,
    cidade: r.cidade || '',
    cursoAlvo: r.curso_alvo || '',
    responsavel: r.responsavel || '',
    observacao: r.observacao || '',
    createdAt: r.created_at,
  }
}

/** Log manual de visitas a escolas (prospecção de Family Day) — não existe fonte automática
 * pra isso (SGE/CRM não rastreiam essa atividade), então cada visita é lançada aqui e vira 1
 * ponto na série de pace da métrica `escolas_visitadas`. */
export function useEscolasVisitadas() {
  const [visitas, setVisitas] = useState<EscolaVisitada[]>([])
  const [loading, setLoading] = useState(true)

  const recarregar = useCallback(async () => {
    setLoading(true)
    const { data } = await (supabase as any)
      .from('escolas_visitadas')
      .select('*')
      .order('data', { ascending: false })
    setVisitas((data || []).map(mapRow))
    setLoading(false)
  }, [])

  useEffect(() => {
    recarregar()
  }, [recarregar])

  const adicionar = useCallback(
    async (v: {
      data: string
      escola: string
      cidade?: string
      cursoAlvo?: string
      responsavel?: string
      observacao?: string
    }) => {
      const { error } = await (supabase as any).from('escolas_visitadas').insert({
        data: v.data,
        escola: v.escola,
        cidade: v.cidade || null,
        curso_alvo: v.cursoAlvo || null,
        responsavel: v.responsavel || null,
        observacao: v.observacao || null,
      })
      if (error) throw error
      await recarregar()
    },
    [recarregar],
  )

  const remover = useCallback(
    async (id: string) => {
      const { error } = await (supabase as any).from('escolas_visitadas').delete().eq('id', id)
      if (error) throw error
      await recarregar()
    },
    [recarregar],
  )

  return { visitas, loading, recarregar, adicionar, remover }
}
