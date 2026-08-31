// Helper único de busca textual usado por todas as barras de busca do app
// (Funil, Turmas, Contatos, Mapa de Mercado, Notas, Transcrições, busca global...).
//
// Regras:
// - ignora acento e caixa ("médicina" acha "Medicina");
// - quebra a busca em termos por espaço e exige que TODOS apareçam no texto,
//   em qualquer ordem ("medicina fasa 23" acha "AIF Medicina FASA Turma 23"
//   mesmo com palavras no meio — o problema do "segundo nome" que não achava
//   nada era o texto inteiro ser comparado como uma substring contígua).

export function normalizeForSearch(s: unknown): string {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Termos da busca, normalizados e sem vazios. */
export function searchTerms(query: string): string[] {
  return normalizeForSearch(query).split(' ').filter(Boolean)
}

/**
 * true se todos os termos da busca aparecerem em `haystack`.
 * `haystack` pode ser uma string única ou várias partes (nome, curso, cidade...).
 * Busca vazia sempre casa.
 */
export function matchesSearch(
  haystack: string | Array<string | null | undefined>,
  query: string,
): boolean {
  const termos = searchTerms(query)
  if (termos.length === 0) return true
  const alvo = normalizeForSearch(
    Array.isArray(haystack) ? haystack.filter(Boolean).join(' ') : haystack,
  )
  return termos.every((t) => alvo.includes(t))
}
