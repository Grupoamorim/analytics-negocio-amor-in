// Lista de cursos já conhecidos (vindos da tabela real de turmas), usada no
// dropdown de Curso da Captação — assim o cliente escolhe o mesmo nome que já
// existe no sistema, em vez de digitar uma variação (ex: "Direito" vs
// "direito" vs "DIREITO") que viraria um curso "separado" por engano.
import { supabase } from '@/lib/supabase/client'

export async function fetchCursosConhecidos(): Promise<string[]> {
  // Lê da view pública `turmas_captacao` (a tabela `turmas` não é legível por
  // anon — o formulário de captação é público).
  const { data, error } = await (supabase as any)
    .from('turmas_captacao')
    .select('curso')
    .not('curso', 'is', null)
  if (error || !data) return []
  const set = new Set<string>()
  for (const row of data) {
    const c = (row.curso || '').trim()
    if (c) set.add(c)
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'))
}
