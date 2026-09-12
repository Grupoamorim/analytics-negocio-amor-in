import { useState } from 'react'
import { Sparkles, Loader2, History } from 'lucide-react'
import SectionTitle from './SectionTitle'
import { calcularPace, addAnos, type PaceResultado, type PontoDiario } from '@/utils/pace'
import {
  intervaloDosMeses,
  metaSomaMeses,
  METRICA_LABEL,
  METRICA_UNIDADE,
  JANELAS_RETROSPECTIVA,
  type MetaNegocio,
  type MetricaMeta,
} from '@/hooks/useMetasNegocio'
import { callGemini, getGeminiApiKey } from '@/utils/geminiApi'

const HOJE = new Date().toISOString().slice(0, 10)
const ANO_ATUAL = new Date().getFullYear()

// Trimestre/semestre/ano agregam os meses cadastrados em metas_negocio (não dependem de
// um cadastro específico naquele escopo maior) — ver metaSomaMeses.
const JANELAS = JANELAS_RETROSPECTIVA

type Situacao = 'sem-meta' | 'nao-comecou' | 'em-andamento' | 'bateu' | 'nao-bateu'

interface LinhaRetro {
  label: string
  temMeta: boolean
  metaParcial: boolean
  situacao: Situacao
  pace: PaceResultado
  /** Realizado no mesmo período (mesmos meses), um ano atrás — null se não há dado. */
  anoAnteriorRealizado: number | null
}

function fmt(v: number, unidade: 'R$' | 'un'): string {
  if (unidade === 'R$') return `R$ ${Math.round(v).toLocaleString('pt-BR')}`
  return Math.round(v).toLocaleString('pt-BR')
}

function calcularRetrospectiva(metas: MetaNegocio[], metrica: MetricaMeta, pontos: PontoDiario[]): LinhaRetro[] {
  return JANELAS.map((j) => {
    const { valor, mesesComMeta, mesesTotal } = metaSomaMeses(metas, metrica, ANO_ATUAL, j.meses)
    const { ini, fim } = intervaloDosMeses(ANO_ATUAL, j.meses)
    const temMeta = mesesComMeta > 0
    const pace = calcularPace(valor, ini, fim, pontos)
    let situacao: Situacao
    if (!temMeta) situacao = 'sem-meta'
    else if (HOJE < ini) situacao = 'nao-comecou'
    else if (HOJE > fim) situacao = pace.status === 'batida' ? 'bateu' : 'nao-bateu'
    else situacao = 'em-andamento'

    // Mesmo período (mesmos meses), um ano atrás — pra comparar junto do meta x realizado.
    const iniAnt = addAnos(ini, -1)
    const fimAnt = addAnos(fim, -1)
    const anoAnteriorRealizado =
      HOJE > fimAnt ? calcularPace(0, iniAnt, fimAnt, pontos, fimAnt).realizado : null

    return {
      label: j.label,
      temMeta,
      metaParcial: temMeta && mesesComMeta < mesesTotal,
      situacao,
      pace,
      anoAnteriorRealizado,
    }
  })
}

const SITUACAO_STYLE: Record<Situacao, { txt: string; cls: string }> = {
  'sem-meta': { txt: 'Sem meta cadastrada', cls: 'text-slate-500' },
  'nao-comecou': { txt: 'Ainda não começou', cls: 'text-slate-500' },
  'em-andamento': { txt: 'Em andamento', cls: 'text-sky-400' },
  bateu: { txt: 'Bateu a meta', cls: 'text-emerald-400' },
  'nao-bateu': { txt: 'Não bateu', cls: 'text-rose-400' },
}

function TabelaRetrospectiva({
  titulo,
  unidade,
  linhas,
}: {
  titulo: string
  unidade: 'R$' | 'un'
  linhas: LinhaRetro[]
}) {
  return (
    <div className="bg-[#111820] border border-white/[0.06] rounded-xl p-5">
      <h3 className="text-sm font-semibold text-white mb-3">{titulo}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[620px]">
          <thead>
            <tr className="text-left text-slate-500 text-[10px] uppercase border-b border-white/[0.06]">
              <th className="py-2 pr-3">Período</th>
              <th className="py-2 px-2 text-right">Meta</th>
              <th className="py-2 px-2 text-right">Realizado</th>
              <th className="py-2 px-2 text-right">Ano Anterior</th>
              <th className="py-2 pl-2">Situação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {linhas.map((l) => {
              const st = SITUACAO_STYLE[l.situacao]
              const deltaAnt =
                l.anoAnteriorRealizado !== null && l.anoAnteriorRealizado > 0
                  ? ((l.pace.realizado - l.anoAnteriorRealizado) / l.anoAnteriorRealizado) * 100
                  : null
              return (
                <tr key={l.label} className="hover:bg-white/[0.02]">
                  <td className="py-2.5 pr-3 text-slate-200 font-medium whitespace-nowrap">
                    {l.label}/{ANO_ATUAL}
                  </td>
                  <td className="py-2.5 px-2 text-right text-slate-300 whitespace-nowrap">
                    {l.temMeta ? fmt(l.pace.meta, unidade) : '—'}
                    {l.metaParcial && <span className="text-[10px] text-amber-400 ml-1">parcial</span>}
                  </td>
                  <td className="py-2.5 px-2 text-right text-white font-semibold whitespace-nowrap">
                    {fmt(l.pace.realizado, unidade)}
                  </td>
                  <td className="py-2.5 px-2 text-right whitespace-nowrap">
                    {l.anoAnteriorRealizado === null ? (
                      <span className="text-slate-500">—</span>
                    ) : (
                      <>
                        <span className="text-slate-300">{fmt(l.anoAnteriorRealizado, unidade)}</span>
                        {deltaAnt !== null && (
                          <span className={`ml-1 text-[10px] font-semibold ${deltaAnt >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            ({deltaAnt >= 0 ? '+' : ''}
                            {deltaAnt.toFixed(0)}%)
                          </span>
                        )}
                      </>
                    )}
                  </td>
                  <td className={`py-2.5 pl-2 font-medium whitespace-nowrap ${st.cls}`}>
                    {st.txt}
                    {l.situacao === 'em-andamento' && (
                      <span className="text-slate-500 font-normal">
                        {' '}
                        — {(l.pace.indicePace * 100).toFixed(0)}% do ritmo, projeção {fmt(l.pace.projecao, unidade)}
                      </span>
                    )}
                    {l.situacao === 'nao-bateu' && (
                      <span className="text-slate-500 font-normal"> — faltou {fmt(l.pace.faltam, unidade)}</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function linhaParaIA(metricaLabel: string, unidade: 'R$' | 'un', l: LinhaRetro): string | null {
  if (l.situacao === 'sem-meta' || l.situacao === 'nao-comecou') return null
  if (l.situacao === 'em-andamento') {
    return `${metricaLabel} — ${l.label}/${ANO_ATUAL}: meta ${fmt(l.pace.meta, unidade)}, realizado até hoje ${fmt(l.pace.realizado, unidade)} (${(l.pace.indicePace * 100).toFixed(0)}% do ritmo), projeção de fechamento ${fmt(l.pace.projecao, unidade)}.`
  }
  return `${metricaLabel} — ${l.label}/${ANO_ATUAL}: meta ${fmt(l.pace.meta, unidade)}, realizado ${fmt(l.pace.realizado, unidade)} — ${l.situacao === 'bateu' ? 'BATEU a meta' : 'NÃO bateu a meta'}.`
}

export default function RetrospectivaPace({
  metas,
  metricas,
}: {
  metas: MetaNegocio[]
  metricas: { metrica: MetricaMeta; pontos: PontoDiario[] }[]
}) {
  const comMeta = metricas.filter((m) => metas.some((x) => x.metrica === m.metrica))
  const retrospectivas = comMeta.map((m) => ({
    metrica: m.metrica,
    linhas: calcularRetrospectiva(metas, m.metrica, m.pontos),
  }))

  const [analise, setAnalise] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function analisarTrajetoria() {
    if (!getGeminiApiKey()) {
      setErro('Configure a chave do Gemini em Administração → IA.')
      return
    }
    setCarregando(true)
    setErro(null)
    try {
      const linhasTexto = retrospectivas
        .flatMap(({ metrica, linhas }) =>
          linhas
            .filter((l) => ['T1', 'T2', 'T3', 'T4', 'Ano'].includes(l.label))
            .map((l) => linhaParaIA(METRICA_LABEL[metrica], METRICA_UNIDADE[metrica], l))
            .filter((t): t is string => !!t),
        )
        .join('\n')

      const prompt = `Você é um diretor comercial/financeiro sênior de uma empresa de fotografia de formaturas.
Abaixo está o histórico real de metas x realizado de ${ANO_ATUAL}, por trimestre e no acumulado do ano.
Responda em português, direto e prático, em até 10 linhas:
1) um resumo de 1-2 frases do que bateu e do que não bateu até agora;
2) como está o ritmo do trimestre em andamento;
3) 3 a 5 ações concretas e priorizadas pros próximos meses pra manter ou recuperar o ritmo anual;
4) se algum trimestre à frente ainda não tem meta cadastrada, sugira um valor realista baseado no ritmo já observado (não invente fora do que os dados sustentam).

Convenção de trimestre: T1-T4 = trimestres 1 a 4 (T3 = "Q3" em inglês, terceiro trimestre).

DADOS REAIS:
${linhasTexto}`
      const res = await callGemini(prompt)
      setAnalise(res)
    } catch (e: any) {
      setErro(e?.message || 'Não foi possível analisar agora.')
    } finally {
      setCarregando(false)
    }
  }

  if (comMeta.length === 0) return null

  return (
    <div className="space-y-4">
      <SectionTitle ajuda="Trimestre, semestre e ano somam as metas mensais cadastradas dentro daquele período — se faltar mês cadastrado, a soma fica marcada como 'parcial'. Períodos futuros sem meta aparecem como 'ainda não começou'. A coluna 'Ano Anterior' mostra o realizado no mesmo período um ano atrás (só aparece quando esse período já terminou) e a variação % contra o realizado atual.">
        Retrospectiva {ANO_ATUAL} — objetivo x realizado x ano anterior
      </SectionTitle>

      {retrospectivas.map(({ metrica, linhas }) => (
        <TabelaRetrospectiva
          key={metrica}
          titulo={METRICA_LABEL[metrica]}
          unidade={METRICA_UNIDADE[metrica]}
          linhas={linhas}
        />
      ))}

      <div className="bg-[#111820] border border-white/[0.06] rounded-xl p-5">
        <div className="flex items-center gap-2 mb-1">
          <History className="w-4 h-4 text-orange-400" />
          <h3 className="text-sm font-semibold text-white">Próximos passos com IA</h3>
        </div>
        <p className="text-xs text-slate-400 mb-3">
          A IA lê a tabela acima (dados reais, sem invenção) e sugere o que fazer pra chegar na meta do ano.
        </p>
        <button
          type="button"
          onClick={analisarTrajetoria}
          disabled={carregando}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-orange-300 bg-orange-500/10 border border-orange-500/25 rounded-lg px-3 py-1.5 hover:bg-orange-500/20 disabled:opacity-50"
        >
          {carregando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          {carregando ? 'Analisando…' : 'Analisar trajetória e sugerir próximos passos'}
        </button>
        {erro && <p className="text-[11px] text-rose-400 mt-2">{erro}</p>}
        {analise && (
          <div className="mt-3 p-3 rounded-lg bg-white/[0.02] border border-white/[0.06] text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">
            {analise}
          </div>
        )}
      </div>
    </div>
  )
}
