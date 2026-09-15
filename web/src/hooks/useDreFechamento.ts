// Fechamento de período do DRE — depois de conferido, o admin "fecha" o período e os valores
// daquele fechamento ficam congelados (não recalculam mais mesmo que dados financeiros mudem
// depois por reconciliação/correção retroativa). Só admin fecha/reabre; qualquer autenticado lê.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'

export interface LinhaDRE {
  label: string
  valor: number
  nivel: number
  destaque: boolean
  key: string | null
}

export interface DreFechamento {
  id: string
  dataIni: string
  dataFim: string
  empresas: string[]
  linhas: LinhaDRE[]
  margemBruta: number
  margemOperacional: number
  fechadoPorEmail: string | null
  fechadoEm: string
  reabertoEm: string | null
  reabertoPorEmail: string | null
}

const db = supabase as any

function mapRow(r: any): DreFechamento {
  return {
    id: r.id,
    dataIni: r.data_ini,
    dataFim: r.data_fim,
    empresas: r.empresas || [],
    linhas: r.linhas || [],
    margemBruta: Number(r.margem_bruta || 0),
    margemOperacional: Number(r.margem_operacional || 0),
    fechadoPorEmail: r.fechado_por_email,
    fechadoEm: r.fechado_em,
    reabertoEm: r.reaberto_em,
    reabertoPorEmail: r.reaberto_por_email,
  }
}

/** Normaliza a lista de empresas selecionadas pra uma chave estável (ordem não importa). */
function chaveEmpresas(empresas: string[]): string[] {
  return [...empresas].sort((a, b) => a.localeCompare(b))
}

/** PostgREST espera o literal de array do Postgres (`{a,b}`, `{}` se vazio) no filtro `.eq()` —
 * passar um array JS direto serializa errado (`empresas=eq.` sem valor) e a query volta 400. */
function literalArrayPg(valores: string[]): string {
  return `{${valores.map((v) => `"${v.replace(/"/g, '\\"')}"`).join(',')}}`
}

export function useDreFechamento(dataIni: string, dataFim: string, empresas: string[]) {
  const [fechamento, setFechamento] = useState<DreFechamento | null>(null)
  const [loading, setLoading] = useState(true)
  const empresasKey = chaveEmpresas(empresas)

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await db
        .from('dre_fechamentos')
        .select('*')
        .eq('data_ini', dataIni)
        .eq('data_fim', dataFim)
        .eq('empresas', literalArrayPg(empresasKey))
        .is('reaberto_em', null)
        .maybeSingle()
      if (error) throw error
      setFechamento(data ? mapRow(data) : null)
    } catch (e) {
      console.warn('Erro ao carregar fechamento do DRE:', e)
      setFechamento(null)
    } finally {
      setLoading(false)
    }
  }, [dataIni, dataFim, JSON.stringify(empresasKey)])

  useEffect(() => {
    carregar()
  }, [carregar])

  const fechar = useCallback(
    async (linhas: LinhaDRE[], margens: { bruta: number; operacional: number }, emailAdmin: string) => {
      const { error } = await db.from('dre_fechamentos').upsert(
        {
          data_ini: dataIni,
          data_fim: dataFim,
          empresas: empresasKey,
          linhas,
          margem_bruta: margens.bruta,
          margem_operacional: margens.operacional,
          fechado_por_email: emailAdmin,
          fechado_em: new Date().toISOString(),
          reaberto_em: null,
          reaberto_por_email: null,
        },
        { onConflict: 'data_ini,data_fim,empresas' },
      )
      if (error) throw error
      await carregar()
    },
    [dataIni, dataFim, JSON.stringify(empresasKey), carregar],
  )

  const reabrir = useCallback(
    async (emailAdmin: string) => {
      if (!fechamento) return
      const { error } = await db
        .from('dre_fechamentos')
        .update({ reaberto_em: new Date().toISOString(), reaberto_por_email: emailAdmin })
        .eq('id', fechamento.id)
      if (error) throw error
      await carregar()
    },
    [fechamento, carregar],
  )

  return { fechamento, loading, fechar, reabrir }
}
