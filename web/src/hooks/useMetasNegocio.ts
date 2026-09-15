import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { calcularPace, type PontoDiario } from '@/utils/pace'

// "alunos" existiu como métrica separada de "adesoes", mas as duas sempre leram o mesmo dado
// (adesões reais do SGE) — foram mescladas numa só em 2026-09-13 pra não duplicar meta/menu com
// o mesmo número por baixo. "Contratos" continua separado de propósito: conta TURMAS ganhas no
// funil, não alunos — uma turma tem vários alunos, então é um número genuinamente diferente.
export type MetricaMeta =
  | 'receita'
  | 'adesoes'
  | 'contratos'
  | 'resultado_liquido'
  | 'vgv'
  | 'escolas_visitadas'
  | 'caixa'
export type EscopoMeta = 'mensal' | 'trimestral' | 'anual'

export type MetaDecisao = 'realocado' | 'descartado' | 'repensado'

export interface MetaNegocio {
  id: string
  metrica: MetricaMeta
  escopo: EscopoMeta
  ano: number
  periodo: number // mensal 1-12 | trimestral 1-4 | anual 0
  valorMeta: number
  /** Cenário conservador — opcional, fica sem linha no gráfico enquanto não for cadastrado. */
  valorMetaPessimista: number | null
  /** Cenário de alta performance — opcional, mesma regra do pessimista. */
  valorMetaOtimista: number | null
  contexto: string
  /** Preenchido quando o período encerra sem a meta ser batida — explica o que aconteceu. */
  explicacao: string | null
  /** Uma vez definida, a meta para de aparecer como "precisa de decisão" no PaceBand. */
  decisao: MetaDecisao | null
  /** true quando pessimista/otimista foram sugeridos pela IA (campo deixado em branco no cadastro). */
  cenariosGeradosPorIA: boolean
  /** true quando o reajuste automático (bateu a meta -> otimista vira normal, normal vira
   * pessimista, nova otimista criada) já foi processado pro período seguinte desta meta. */
  reajusteAplicado: boolean
  updatedAt: string
}

export const METRICA_LABEL: Record<MetricaMeta, string> = {
  receita: 'Receita recebida (R$)',
  adesoes: 'Alunos fechados (adesões)',
  contratos: 'Contratos fechados (turmas)',
  resultado_liquido: 'Resultado líquido (R$)',
  vgv: 'VGV de novas vendas (R$)',
  escolas_visitadas: 'Escolas visitadas (Family Day)',
  caixa: 'Caixa fim de período (R$)',
}

export const METRICA_UNIDADE: Record<MetricaMeta, 'R$' | 'un'> = {
  receita: 'R$',
  adesoes: 'un',
  contratos: 'un',
  resultado_liquido: 'R$',
  vgv: 'R$',
  escolas_visitadas: 'un',
  caixa: 'R$',
}

function mapRow(r: any): MetaNegocio {
  return {
    id: r.id,
    metrica: r.metrica,
    escopo: r.escopo,
    ano: r.ano,
    periodo: r.periodo ?? 0,
    valorMeta: Number(r.valor_meta || 0),
    valorMetaPessimista: r.valor_meta_pessimista == null ? null : Number(r.valor_meta_pessimista),
    valorMetaOtimista: r.valor_meta_otimista == null ? null : Number(r.valor_meta_otimista),
    contexto: r.contexto || '',
    explicacao: r.explicacao ?? null,
    decisao: r.decisao ?? null,
    cenariosGeradosPorIA: !!r.cenarios_gerados_por_ia,
    reajusteAplicado: !!r.reajuste_aplicado,
    updatedAt: r.updated_at,
  }
}

/** Período seguinte ao informado, dentro do mesmo escopo — usado pelo reajuste automático pra
 * saber onde criar a próxima meta (mensal -> mês seguinte, trimestral -> trimestre seguinte,
 * anual -> ano seguinte, virando o ano quando necessário). */
export function proximoPeriodo(
  escopo: EscopoMeta,
  ano: number,
  periodo: number,
): { ano: number; periodo: number } {
  if (escopo === 'anual') return { ano: ano + 1, periodo: 0 }
  const max = escopo === 'mensal' ? 12 : 4
  return periodo >= max ? { ano: ano + 1, periodo: 1 } : { ano, periodo: periodo + 1 }
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

/** [ini,fim] (YYYY-MM-DD) coberto por um conjunto de meses (1-12) de um ano — usado pra
 * retrospectiva por trimestre/semestre/ano, que agrega os meses em vez de depender de um
 * cadastro específico daquele escopo maior. */
export function intervaloDosMeses(ano: number, meses: number[]): { ini: string; fim: string } {
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  const min = Math.min(...meses)
  const max = Math.max(...meses)
  return { ini: iso(new Date(ano, min - 1, 1)), fim: iso(new Date(ano, max, 0)) }
}

/** Soma as metas mensais cadastradas de uma métrica cujo intervalo cai inteiro dentro de
 * [ini,fim] — funciona pra qualquer período (mês/trimestre/semestre/ano/personalizado), não só
 * os fixos T1-T4. Não inventa mês sem meta cadastrada — só soma o que existe, e informa quantos
 * meses de calendário o período tem vs. quantos têm meta, pra UI avisar quando é parcial. */
export function metaSomaIntervalo(
  metas: MetaNegocio[],
  metrica: MetricaMeta,
  ini: string,
  fim: string,
): {
  valor: number
  valorPessimista: number | null
  valorOtimista: number | null
  mesesComMeta: number
  mesesTotal: number
} {
  const dentro = metas.filter((m) => {
    if (m.metrica !== metrica || m.escopo !== 'mensal') return false
    const iv = intervaloDaMeta(m)
    return iv.ini >= ini && iv.fim <= fim
  })
  const valor = dentro.reduce((acc, m) => acc + m.valorMeta, 0)

  // Cenário anual, pra quando o Lucas cadastra pessimista/otimista só como total do ano (ex: vindo
  // do planner de metas), sem quebrar mês a mês igual faz com a meta padrão. Só existe um "ini"/"fim"
  // dentro de um único ano civil (filtros de período do site nunca cruzam ano) — se cruzar, não tem
  // como aplicar essa distribuição de forma confiável, então fica de fora.
  const anoIni = new Date(`${ini}T00:00:00`).getFullYear()
  const anoFim = new Date(`${fim}T00:00:00`).getFullYear()
  const anualDoAno =
    anoIni === anoFim ? metas.find((m) => m.metrica === metrica && m.escopo === 'anual' && m.ano === anoIni) : undefined
  const somaPadraoDoAno =
    anoIni === anoFim
      ? metas
          .filter((m) => m.metrica === metrica && m.escopo === 'mensal' && m.ano === anoIni)
          .reduce((acc, m) => acc + m.valorMeta, 0)
      : 0

  // Só soma o cenário se pelo menos um mês do intervalo tiver ele cadastrado — não inventa
  // pessimista/otimista pra mês que só tem a meta padrão preenchida. Quando nenhum mês do
  // intervalo tem o cenário mas existe um total anual cadastrado, distribui esse total
  // proporcionalmente ao peso real de cada mês na meta padrão (não inventa a forma da curva,
  // só escala o total real do cenário pela sazonalidade real já cadastrada).
  const somaCenario = (pick: (m: MetaNegocio) => number | null): number | null => {
    const comCenario = dentro.filter((m) => pick(m) != null)
    if (comCenario.length > 0) return comCenario.reduce((acc, m) => acc + (pick(m) || 0), 0)
    const anualValor = anualDoAno ? pick(anualDoAno) : null
    if (anualValor == null || somaPadraoDoAno <= 0) return null
    const pesoIntervalo = dentro.reduce((acc, m) => acc + m.valorMeta, 0)
    if (pesoIntervalo <= 0) return null
    return anualValor * (pesoIntervalo / somaPadraoDoAno)
  }
  const mesesTotal =
    (new Date(`${fim}T00:00:00`).getFullYear() - new Date(`${ini}T00:00:00`).getFullYear()) * 12 +
    (new Date(`${fim}T00:00:00`).getMonth() - new Date(`${ini}T00:00:00`).getMonth()) +
    1
  return {
    valor,
    valorPessimista: somaCenario((m) => m.valorMetaPessimista),
    valorOtimista: somaCenario((m) => m.valorMetaOtimista),
    mesesComMeta: dentro.length,
    mesesTotal,
  }
}

/** Soma as metas mensais cadastradas de uma métrica que caem dentro dos meses informados
 * (mesmo ano). Usado pela retrospectiva fixa (T1-T4/S1/S2/Ano) — por baixo, delega pro
 * intervalo equivalente em `metaSomaIntervalo`. */
export function metaSomaMeses(
  metas: MetaNegocio[],
  metrica: MetricaMeta,
  ano: number,
  meses: number[],
): { valor: number; mesesComMeta: number; mesesTotal: number } {
  const { ini, fim } = intervaloDosMeses(ano, meses)
  return metaSomaIntervalo(metas, metrica, ini, fim)
}

export function rotuloPeriodoMeta(m: Pick<MetaNegocio, 'escopo' | 'ano' | 'periodo'>): string {
  const NOMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  if (m.escopo === 'mensal') return `${NOMES[(m.periodo || 1) - 1]}/${m.ano}`
  if (m.escopo === 'trimestral') return `T${m.periodo || 1}/${m.ano}`
  return `Ano ${m.ano}`
}

/** Janelas fixas usadas na retrospectiva por trimestre/semestre/ano (RetrospectivaPace.tsx) e no
 * snapshot de metas enviado pra IA (utils/metasSnapshot.ts) — um único lugar pra essa definição. */
export const JANELAS_RETROSPECTIVA: { label: string; meses: number[] }[] = [
  { label: 'T1', meses: [1, 2, 3] },
  { label: 'T2', meses: [4, 5, 6] },
  { label: 'T3', meses: [7, 8, 9] },
  { label: 'T4', meses: [10, 11, 12] },
  { label: 'S1', meses: [1, 2, 3, 4, 5, 6] },
  { label: 'S2', meses: [7, 8, 9, 10, 11, 12] },
  { label: 'Ano', meses: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
]

/** Meta vigente pra uma métrica numa data de referência — pega a mais específica que cobre a
 * data (mensal > trimestral > anual). Função pura, reaproveitada pelo hook `useMetasNegocio` e
 * por lugares fora de componente React (ex: utils/metasSnapshot.ts). */
export function metaVigenteEm(metas: MetaNegocio[], metrica: MetricaMeta, ref: string): MetaNegocio | null {
  const candidatas = metas
    .filter((m) => m.metrica === metrica)
    .filter((m) => {
      const { ini, fim } = intervaloDaMeta(m)
      return ref >= ini && ref <= fim
    })
  const ordem: Record<EscopoMeta, number> = { mensal: 0, trimestral: 1, anual: 2 }
  candidatas.sort((a, b) => ordem[a.escopo] - ordem[b.escopo])
  return candidatas[0] || null
}

/** A meta "vigente" nunca pode estar com o período encerrado (por definição ela cobre hoje) — por
 * isso o aviso de "período vencido sem bater" precisa de uma busca separada: a meta mais recente
 * dessa métrica cujo período já acabou, ainda sem decisão registrada, e que não foi batida. */
export function metaVencidaSemDecisao(
  metas: MetaNegocio[],
  metrica: MetricaMeta,
  pontos: PontoDiario[],
  hoje: string,
): MetaNegocio | null {
  const candidatas = metas
    .filter((m) => m.metrica === metrica && !m.decisao)
    .map((m) => ({ m, iv: intervaloDaMeta(m) }))
    .filter(({ iv }) => iv.fim < hoje)
    .sort((a, b) => (a.iv.fim < b.iv.fim ? 1 : -1))

  for (const { m, iv } of candidatas) {
    const pace = calcularPace(m.valorMeta, iv.ini, iv.fim, pontos)
    if (pace.status !== 'batida') return m
  }
  return null
}

/** Data a partir da qual o reajuste automático passou a existir — nunca processa um período que
 * já tinha encerrado ANTES disso. Sem esse corte, na primeira vez que essa função roda ela acha
 * "o período fechado mais recente" de cada métrica em todo o histórico (todas as linhas antigas
 * nascem com reajuste_aplicado=false pela migration) e cria a meta do período seguinte a partir
 * daquele resultado antigo — que pode ser justamente o período vigente hoje, pisando na meta que
 * o Lucas cadastrou na mão pra agora. Com o corte, só entra período que fechar dali pra frente. */
export const REAJUSTE_AUTOMATICO_DESDE = '2026-09-15'

/** Meta mais recente dessa métrica cujo período já encerrou (depois de `REAJUSTE_AUTOMATICO_DESDE`),
 * foi batida (realizado >= meta normal) e ainda não passou pelo reajuste automático — dispara o
 * "ratchet" que faz a otimista virar a normal do próximo período, a normal virar a pessimista, e
 * cria uma nova otimista com a mesma base (ver `aplicarReajusteAutomatico`). Só olha a mais
 * recente, mesmo padrão de `metaVencidaSemDecisao`, pra não reprocessar um histórico inteiro de
 * uma vez. */
export function metaBatidaSemReajuste(
  metas: MetaNegocio[],
  metrica: MetricaMeta,
  pontos: PontoDiario[],
  hoje: string,
): MetaNegocio | null {
  const candidatas = metas
    .filter((m) => m.metrica === metrica && !m.reajusteAplicado)
    .map((m) => ({ m, iv: intervaloDaMeta(m) }))
    .filter(({ iv }) => iv.fim < hoje && iv.fim >= REAJUSTE_AUTOMATICO_DESDE)
    .sort((a, b) => (a.iv.fim < b.iv.fim ? 1 : -1))

  for (const { m, iv } of candidatas) {
    const pace = calcularPace(m.valorMeta, iv.ini, iv.fim, pontos)
    if (pace.status === 'batida') return m
  }
  return null
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
    async (
      m: Omit<MetaNegocio, 'id' | 'updatedAt' | 'explicacao' | 'decisao' | 'reajusteAplicado' | 'cenariosGeradosPorIA'> & {
        id?: string
        /** true quando pessimista/otimista foram sugeridos pela IA por terem ficado em branco. */
        cenariosGeradosPorIA?: boolean
      },
    ) => {
      const payload = {
        metrica: m.metrica,
        escopo: m.escopo,
        ano: m.ano,
        periodo: m.escopo === 'anual' ? 0 : m.periodo,
        valor_meta: m.valorMeta,
        valor_meta_pessimista: m.valorMetaPessimista,
        valor_meta_otimista: m.valorMetaOtimista,
        contexto: m.contexto || null,
        cenarios_gerados_por_ia: !!m.cenariosGeradosPorIA,
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

  const registrarExplicacao = useCallback(
    async (id: string, texto: string) => {
      const { error } = await (supabase as any)
        .from('metas_negocio')
        .update({ explicacao: texto, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
      await recarregar()
    },
    [recarregar],
  )

  /** Registra a decisão sobre uma meta cujo período encerrou sem ser batida — a partir daqui ela
   * para de pedir decisão no PaceBand. "Realocar" e "repensar como marco" não mexem no banco além
   * disso: o próximo passo (cadastrar a meta do novo período em Administração, ou criar um marco)
   * é uma ação manual separada, pra não duplicar a lógica de período que já existe em Admin. */
  const aplicarDecisao = useCallback(
    async (id: string, decisao: MetaDecisao) => {
      const { error } = await (supabase as any)
        .from('metas_negocio')
        .update({ decisao, updated_at: new Date().toISOString() })
        .eq('id', id)
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
    (metrica: MetricaMeta, ref: string): MetaNegocio | null => metaVigenteEm(metas, metrica, ref),
    [metas],
  )

  /**
   * Reajuste automático: quando uma meta é batida (realizado passa da normal), a otimista dela
   * vira a nova meta normal do período seguinte, a normal antiga vira a nova pessimista, e uma
   * nova otimista é criada mantendo a mesma distância (proporcional) que a otimista tinha da
   * normal antes. Só dispara quando o período já fechou (`metaBatidaSemReajuste`), nunca no meio
   * do período. Não sobrescreve uma meta que o Lucas já tenha cadastrado manualmente pro próximo
   * período — só marca a atual como reajustada e para por aí, pra não pisar em dado real. Sem
   * meta otimista cadastrada não tem "mesma base" pra herdar, então também só marca e não inventa
   * valor.
   */
  const aplicarReajusteAutomatico = useCallback(
    async (id: string) => {
      const m = metas.find((x) => x.id === id)
      if (!m) return

      if (m.valorMetaOtimista != null) {
        const { ano: novoAno, periodo: novoPeriodo } = proximoPeriodo(m.escopo, m.ano, m.periodo)
        const jaExiste = metas.some(
          (x) => x.metrica === m.metrica && x.escopo === m.escopo && x.ano === novoAno && x.periodo === novoPeriodo,
        )
        if (!jaExiste) {
          const gap = m.valorMetaOtimista - m.valorMeta
          const { error: errorInsert } = await (supabase as any).from('metas_negocio').insert({
            metrica: m.metrica,
            escopo: m.escopo,
            ano: novoAno,
            periodo: m.escopo === 'anual' ? 0 : novoPeriodo,
            valor_meta: m.valorMetaOtimista,
            valor_meta_pessimista: m.valorMeta,
            valor_meta_otimista: m.valorMetaOtimista + gap,
            contexto: `Reajustada automaticamente: a meta de ${rotuloPeriodoMeta(m)} foi batida e passou da meta normal.`,
            updated_at: new Date().toISOString(),
          })
          if (errorInsert) throw errorInsert
        }
      }

      const { error } = await (supabase as any)
        .from('metas_negocio')
        .update({ reajuste_aplicado: true, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
      await recarregar()
    },
    [metas, recarregar],
  )

  return {
    metas,
    loading,
    recarregar,
    salvar,
    remover,
    metaVigente,
    registrarExplicacao,
    aplicarDecisao,
    aplicarReajusteAutomatico,
  }
}
