// Estudo de oportunidades por Faculdade x Curso — "próximo ataque estratégico".
//
// Não existe no CRM uma base externa do mercado (todas as faculdades/cursos que existem por
// aí) — o Mapa de Mercado é a mesma base de Turmas (ver MarketMap.tsx). Então o único gap real
// e honesto que dá pra calcular é DENTRO do nosso próprio portfólio: em quais faculdades onde
// JÁ temos relação (pelo menos 1 turma Convertido) a gente ainda não vendeu um curso que já
// vendemos em outra faculdade qualquer. Isso não inventa mercado novo — só aponta cross-sell
// real dentro de instituições que já confiam na Amor In.
//
// Cursos-âncora (Medicina/Odontologia/Direito) entram sempre primeiro no ranking de "falta",
// por serem o carro-chefe do negócio — mas todo curso do portfólio entra na análise.

import type { Lead } from '@/types/crm'

const CURSOS_ANCORA = ['medicina', 'odontologia', 'direito']

// "Cursos" que não são curso de graduação (categoria de serviço/evento) — não fazem sentido
// como alvo de "curso que falta nessa faculdade".
const CURSOS_IGNORADOS = new Set([
  'prestacao de servico',
  'terceirao',
  'ensino medio',
  'estetica e cosmetica',
  'eventos extras',
])

function norm(s?: string | null): string {
  return (s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

export interface CursoFaltante {
  curso: string
  faculdadesQueTem: number
  ancora: boolean
}

export interface OportunidadeFaculdade {
  faculdade: string
  cidade: string
  turmasConvertidas: number
  cursosAtuais: string[]
  cursosFaltantes: CursoFaltante[]
}

/**
 * Pra cada faculdade com pelo menos 1 turma Convertido (relação comercial já comprovada),
 * lista os cursos que já vendemos em QUALQUER outra faculdade do portfólio mas ainda não
 * vendemos ali — ordenados com Medicina/Odontologia/Direito primeiro, depois pelo curso mais
 * validado (presente em mais faculdades). Faculdades sem nenhum gap não entram na lista.
 */
export function oportunidadesPorFaculdade(leads: Lead[]): OportunidadeFaculdade[] {
  const validos = leads.filter(
    (l) => l.faculdade?.trim() && l.curso?.trim() && !l.mesmaTurmaFisicaDe && !CURSOS_IGNORADOS.has(norm(l.curso)),
  )

  const labelPorCurso = new Map<string, string>()
  const faculdadesPorCurso = new Map<string, Set<string>>()
  for (const l of validos) {
    const ck = norm(l.curso)
    if (!labelPorCurso.has(ck)) labelPorCurso.set(ck, l.curso!.trim())
    if (!faculdadesPorCurso.has(ck)) faculdadesPorCurso.set(ck, new Set())
    faculdadesPorCurso.get(ck)!.add(norm(l.faculdade))
  }
  const cursosUniverso = Array.from(labelPorCurso.keys())

  interface Acc {
    faculdade: string
    cidade: string
    cursos: Set<string>
    convertidas: number
  }
  const porFaculdade = new Map<string, Acc>()
  for (const l of validos) {
    const fk = norm(l.faculdade)
    const e = porFaculdade.get(fk) || { faculdade: l.faculdade!.trim(), cidade: '', cursos: new Set(), convertidas: 0 }
    e.cursos.add(norm(l.curso))
    if (!e.cidade && l.cidade?.trim()) e.cidade = l.cidade.trim()
    if (norm(l.status) === 'convertido') e.convertidas += 1
    porFaculdade.set(fk, e)
  }

  const resultado: OportunidadeFaculdade[] = []
  for (const e of porFaculdade.values()) {
    if (e.convertidas === 0) continue // só faculdades com relação comercial já comprovada
    const faltantes: CursoFaltante[] = cursosUniverso
      .filter((ck) => !e.cursos.has(ck))
      .map((ck) => ({
        curso: labelPorCurso.get(ck)!,
        faculdadesQueTem: faculdadesPorCurso.get(ck)?.size || 0,
        ancora: CURSOS_ANCORA.includes(ck),
      }))
      .sort((a, b) => Number(b.ancora) - Number(a.ancora) || b.faculdadesQueTem - a.faculdadesQueTem)
    if (faltantes.length === 0) continue
    resultado.push({
      faculdade: e.faculdade,
      cidade: e.cidade,
      turmasConvertidas: e.convertidas,
      cursosAtuais: Array.from(e.cursos).map((ck) => labelPorCurso.get(ck)!),
      cursosFaltantes: faltantes,
    })
  }

  return resultado.sort((a, b) => {
    const aAncora = a.cursosFaltantes.some((c) => c.ancora) ? 1 : 0
    const bAncora = b.cursosFaltantes.some((c) => c.ancora) ? 1 : 0
    if (aAncora !== bAncora) return bAncora - aAncora
    return b.turmasConvertidas - a.turmasConvertidas
  })
}
