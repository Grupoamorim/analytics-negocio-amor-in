// Lista de faculdades conhecidas por cidade, usada nos dropdowns de Captação.
// Se retroalimenta sozinha: toda vez que alguém cadastra uma combinação nova
// (cidade + faculdade), ela é gravada aqui e passa a aparecer para os próximos.
import { supabase } from '@/lib/supabase/client'

export type CidadeFaculdadesMap = Record<string, string[]>

export async function fetchCidadeFaculdades(): Promise<CidadeFaculdadesMap> {
  const { data, error } = await supabase
    .from('mercado_faculdades')
    .select('cidade, faculdade')
    .order('faculdade')
  if (error || !data) return {}
  const map: CidadeFaculdadesMap = {}
  for (const row of data) {
    if (!map[row.cidade]) map[row.cidade] = []
    if (!map[row.cidade].includes(row.faculdade)) map[row.cidade].push(row.faculdade)
  }
  return map
}

export async function ensureCidadeFaculdade(cidade: string, faculdade: string): Promise<void> {
  const c = cidade.trim()
  const f = faculdade.trim()
  if (!c || !f) return
  await supabase
    .from('mercado_faculdades')
    .upsert({ cidade: c, faculdade: f }, { onConflict: 'cidade,faculdade', ignoreDuplicates: true })
}
