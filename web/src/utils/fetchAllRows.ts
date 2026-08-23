// O Supabase (PostgREST) limita cada resposta a no máximo 1000 linhas por padrão,
// mesmo sem you pedir isso. Páginas que agregam tabelas grandes (pagamentos,
// contas_pagar) SEM paginar acabam recebendo só uma fatia arbitrária dos dados
// e mostrando totais errados. Esta função pagina automaticamente até trazer tudo.
export async function fetchAllRows<T>(
  buildQuery: () => { range: (from: number, to: number) => Promise<{ data: T[] | null; error: unknown }> },
  pageSize = 1000,
): Promise<T[]> {
  let all: T[] = []
  let from = 0
  for (;;) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1)
    if (error) throw error
    const rows = data || []
    all = all.concat(rows)
    if (rows.length < pageSize) break
    from += pageSize
  }
  return all
}
