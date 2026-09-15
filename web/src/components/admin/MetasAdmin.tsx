import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { Target, Trash2, Pencil, Sparkles } from 'lucide-react'
import {
  useMetasNegocio,
  METRICA_LABEL,
  rotuloPeriodoMeta,
  type MetricaMeta,
  type EscopoMeta,
  type MetaNegocio,
} from '@/hooks/useMetasNegocio'
import { callGemini, getGeminiApiKey } from '@/utils/geminiApi'

/** Quando o Lucas deixa pessimista e otimista em branco, a IA sugere os dois com base no
 * histórico real de metas batidas/perdidas dessa métrica (não um percentual fixo) — só entra em
 * ação se a chave do Gemini estiver configurada; sem chave, fica em branco igual sempre foi. */
async function sugerirCenariosComIA(
  metrica: MetricaMeta,
  valorMeta: number,
  historico: MetaNegocio[],
): Promise<{ pessimista: number; otimista: number } | null> {
  const linhas = historico
    .filter((h) => h.metrica === metrica)
    .slice(0, 12)
    .map((h) => {
      const desfecho = h.reajusteAplicado
        ? 'bateu e passou da meta'
        : h.decisao
          ? `não bateu (${h.decisao})`
          : 'ainda sem desfecho registrado'
      return `- ${rotuloPeriodoMeta(h)}: normal ${h.valorMeta}${h.valorMetaPessimista != null ? `, pessimista ${h.valorMetaPessimista}` : ''}${h.valorMetaOtimista != null ? `, otimista ${h.valorMetaOtimista}` : ''} — ${desfecho}`
    })

  const prompt = `Você é um diretor comercial/financeiro sênior de uma empresa de fotografia de formaturas.
Com base no histórico de metas de "${METRICA_LABEL[metrica]}" abaixo, sugira valores realistas de cenário PESSIMISTA (conservador) e OTIMISTA (alta performance) para uma meta normal de ${valorMeta}.

HISTÓRICO:
${linhas.join('\n') || 'Sem histórico registrado ainda para essa métrica — use bom senso (pessimista ~15% abaixo da normal, otimista ~15% acima).'}

Responda SOMENTE em JSON válido, sem markdown, sem texto extra, no formato exato:
{"pessimista": <número>, "otimista": <número>}`

  const res = await callGemini(prompt)
  const match = res.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[0])
    const pessimista = Number(parsed.pessimista)
    const otimista = Number(parsed.otimista)
    if (!Number.isFinite(pessimista) || !Number.isFinite(otimista)) return null
    return { pessimista, otimista }
  } catch {
    return null
  }
}

const NOMES_MES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

export default function MetasAdmin() {
  const { toast } = useToast()
  const { metas, loading, salvar, remover } = useMetasNegocio()

  const anoAtual = new Date().getFullYear()
  const [editId, setEditId] = useState<string | null>(null)
  const [metrica, setMetrica] = useState<MetricaMeta>('receita')
  const [escopo, setEscopo] = useState<EscopoMeta>('mensal')
  const [ano, setAno] = useState(anoAtual)
  const [periodo, setPeriodo] = useState(new Date().getMonth() + 1)
  const [valor, setValor] = useState('')
  const [valorPessimista, setValorPessimista] = useState('')
  const [valorOtimista, setValorOtimista] = useState('')
  const [contexto, setContexto] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [gerandoCenariosIA, setGerandoCenariosIA] = useState(false)

  const anos = useMemo(() => [anoAtual - 1, anoAtual, anoAtual + 1, anoAtual + 2], [anoAtual])

  function resetForm() {
    setEditId(null)
    setMetrica('receita')
    setEscopo('mensal')
    setAno(anoAtual)
    setPeriodo(new Date().getMonth() + 1)
    setValor('')
    setValorPessimista('')
    setValorOtimista('')
    setContexto('')
  }

  function carregarParaEdicao(m: MetaNegocio) {
    setEditId(m.id)
    setMetrica(m.metrica)
    setEscopo(m.escopo)
    setAno(m.ano)
    setPeriodo(m.periodo || 1)
    setValor(String(m.valorMeta))
    setValorPessimista(m.valorMetaPessimista == null ? '' : String(m.valorMetaPessimista))
    setValorOtimista(m.valorMetaOtimista == null ? '' : String(m.valorMetaOtimista))
    setContexto(m.contexto)
  }

  /** Converte o texto do campo (aceita "1.500,50" ou "1500.5") pra número, ou null se vazio. */
  function paraNumero(texto: string): number | null {
    if (!texto.trim()) return null
    const n = Number(texto.replace(/\./g, '').replace(',', '.'))
    return Number.isFinite(n) ? n : null
  }

  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault()
    const v = Number(String(valor).replace(/\./g, '').replace(',', '.'))
    if (!Number.isFinite(v) || v < 0) {
      toast({ title: 'Valor inválido', variant: 'destructive' })
      return
    }
    let vPessimista = paraNumero(valorPessimista)
    let vOtimista = paraNumero(valorOtimista)
    if ((valorPessimista.trim() && vPessimista === null) || (valorOtimista.trim() && vOtimista === null)) {
      toast({ title: 'Meta pessimista/otimista inválida', variant: 'destructive' })
      return
    }
    let cenariosGeradosPorIA = false
    setSalvando(true)
    try {
      if (vPessimista === null && vOtimista === null && getGeminiApiKey()) {
        setGerandoCenariosIA(true)
        try {
          const sugestao = await sugerirCenariosComIA(metrica, v, metas)
          if (sugestao) {
            vPessimista = sugestao.pessimista
            vOtimista = sugestao.otimista
            cenariosGeradosPorIA = true
          }
        } catch {
          // sem sugestão da IA, segue com os cenários em branco igual sempre foi
        } finally {
          setGerandoCenariosIA(false)
        }
      }
      await salvar({
        id: editId || undefined,
        metrica,
        escopo,
        ano,
        periodo: escopo === 'anual' ? 0 : periodo,
        valorMeta: v,
        valorMetaPessimista: vPessimista,
        valorMetaOtimista: vOtimista,
        contexto,
        cenariosGeradosPorIA,
      })
      toast({
        title: editId ? 'Meta atualizada' : 'Meta cadastrada',
        description: cenariosGeradosPorIA
          ? `Pessimista/otimista sugeridos pela IA: ${vPessimista!.toLocaleString('pt-BR')} / ${vOtimista!.toLocaleString('pt-BR')}`
          : undefined,
      })
      resetForm()
    } catch (err: any) {
      toast({ title: 'Erro ao salvar', description: err.message, variant: 'destructive' })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-[#111820] border border-white/[0.06] rounded-xl p-5">
        <h2 className="text-sm font-semibold text-white mb-1 flex items-center gap-2">
          <Target className="w-4 h-4 text-orange-400" /> Metas do Negócio
        </h2>
        <p className="text-xs text-slate-400 mb-4">
          Defina metas de receita, alunos fechados (adesões) ou contratos por mês, trimestre (T1–T4) ou ano. O
          texto de contexto/estratégia é usado pela IA no painel para dizer o que fazer pra bater a
          meta. A meta mais específica que cobre a data manda (mês &gt; trimestre &gt; ano). Pode
          escrever "Q3" ou "T3" à vontade no contexto — a IA entende os dois como o mesmo trimestre.
        </p>

        <form onSubmit={handleSalvar} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <label className="text-xs text-slate-400 flex flex-col gap-1">
            Métrica
            <select
              value={metrica}
              onChange={(e) => setMetrica(e.target.value as MetricaMeta)}
              className="bg-[#0a0f14] border border-white/[0.1] rounded-lg px-2 py-2 text-slate-200 text-xs"
            >
              {(Object.keys(METRICA_LABEL) as MetricaMeta[]).map((m) => (
                <option key={m} value={m}>
                  {METRICA_LABEL[m]}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs text-slate-400 flex flex-col gap-1">
            Escopo
            <select
              value={escopo}
              onChange={(e) => setEscopo(e.target.value as EscopoMeta)}
              className="bg-[#0a0f14] border border-white/[0.1] rounded-lg px-2 py-2 text-slate-200 text-xs"
            >
              <option value="mensal">Mensal</option>
              <option value="trimestral">Trimestral</option>
              <option value="anual">Anual</option>
            </select>
          </label>

          <div className="flex gap-2">
            <label className="text-xs text-slate-400 flex flex-col gap-1 flex-1">
              Ano
              <select
                value={ano}
                onChange={(e) => setAno(Number(e.target.value))}
                className="bg-[#0a0f14] border border-white/[0.1] rounded-lg px-2 py-2 text-slate-200 text-xs"
              >
                {anos.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </label>
            {escopo === 'mensal' && (
              <label className="text-xs text-slate-400 flex flex-col gap-1 flex-1">
                Mês
                <select
                  value={periodo}
                  onChange={(e) => setPeriodo(Number(e.target.value))}
                  className="bg-[#0a0f14] border border-white/[0.1] rounded-lg px-2 py-2 text-slate-200 text-xs"
                >
                  {NOMES_MES.map((n, i) => (
                    <option key={n} value={i + 1}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {escopo === 'trimestral' && (
              <label className="text-xs text-slate-400 flex flex-col gap-1 flex-1">
                Trimestre
                <select
                  value={periodo}
                  onChange={(e) => setPeriodo(Number(e.target.value))}
                  className="bg-[#0a0f14] border border-white/[0.1] rounded-lg px-2 py-2 text-slate-200 text-xs"
                >
                  {[1, 2, 3, 4].map((t) => (
                    <option key={t} value={t}>
                      T{t}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <div className="sm:col-span-2 lg:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="text-xs text-slate-400 flex flex-col gap-1">
              Meta pessimista (opcional) {metrica === 'receita' ? '(R$)' : '(quantidade)'}
              <input
                type="text"
                value={valorPessimista}
                onChange={(e) => setValorPessimista(e.target.value)}
                placeholder="Ex: 120000"
                className="bg-[#0a0f14] border border-white/[0.1] rounded-lg px-3 py-2 text-slate-200 text-xs"
              />
            </label>
            <label className="text-xs text-slate-400 flex flex-col gap-1">
              Meta normal {metrica === 'receita' ? '(R$)' : '(quantidade)'}
              <input
                type="text"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder={metrica === 'receita' ? 'Ex: 150000' : 'Ex: 40'}
                className="bg-[#0a0f14] border border-white/[0.1] rounded-lg px-3 py-2 text-slate-200 text-xs"
              />
            </label>
            <label className="text-xs text-slate-400 flex flex-col gap-1">
              Meta otimista (opcional) {metrica === 'receita' ? '(R$)' : '(quantidade)'}
              <input
                type="text"
                value={valorOtimista}
                onChange={(e) => setValorOtimista(e.target.value)}
                placeholder="Ex: 180000"
                className="bg-[#0a0f14] border border-white/[0.1] rounded-lg px-3 py-2 text-slate-200 text-xs"
              />
            </label>
          </div>
          <p className="text-[11px] text-slate-500 sm:col-span-2 lg:col-span-3 -mt-2">
            Pessimista e otimista são opcionais. Deixe os dois em branco e a IA sugere automaticamente
            com base no histórico dessa métrica (precisa da chave do Gemini em Administração → IA) —
            preencha na mão se quiser definir você mesmo. Quando a meta normal é batida e o período
            fecha, os cenários são reajustados sozinhos pro próximo período (otimista vira normal,
            normal vira pessimista, nova otimista é criada).
          </p>

          <label className="text-xs text-slate-400 flex flex-col gap-1 sm:col-span-2 lg:col-span-3">
            Contexto / estratégia (a IA usa isso pra orientar as ações)
            <textarea
              value={contexto}
              onChange={(e) => setContexto(e.target.value)}
              rows={3}
              placeholder="Ex: Meta puxada pelas turmas de Medicina de FASA e UESB que fecham este trimestre. Prioridade: reunião de turma agendada até dia 15, follow-up de proposta 2x/semana. Concorrente X está agressivo em preço na UNEX."
              className="bg-[#0a0f14] border border-white/[0.1] rounded-lg px-3 py-2 text-slate-200 text-xs resize-y"
            />
          </label>

          <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-3">
            <Button
              type="submit"
              disabled={salvando || !valor}
              className="bg-orange-500 hover:bg-orange-600 text-white text-xs"
            >
              {gerandoCenariosIA
                ? 'Gerando cenários com IA…'
                : salvando
                  ? 'Salvando…'
                  : editId
                    ? 'Atualizar meta'
                    : 'Cadastrar meta'}
            </Button>
            {editId && (
              <button type="button" onClick={resetForm} className="text-xs text-slate-400 hover:text-white">
                Cancelar edição
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="bg-[#111820] border border-white/[0.06] rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-3">Metas cadastradas</h3>
        {loading ? (
          <div className="text-sm text-slate-400">Carregando…</div>
        ) : metas.length === 0 ? (
          <div className="text-sm text-slate-500">Nenhuma meta cadastrada ainda.</div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-500 text-[10px] uppercase border-b border-white/[0.06]">
                <th className="py-2 pr-3">Métrica</th>
                <th className="py-2 px-2">Período</th>
                <th className="py-2 px-2 text-right">Meta</th>
                <th className="py-2 px-2">Contexto</th>
                <th className="py-2 pl-2 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {metas.map((m) => (
                <tr key={m.id} className="hover:bg-white/[0.02]">
                  <td className="py-2.5 pr-3 text-slate-200">{METRICA_LABEL[m.metrica]}</td>
                  <td className="py-2.5 px-2 text-slate-300">{rotuloPeriodoMeta(m)}</td>
                  <td className="py-2.5 px-2 text-right text-white font-semibold">
                    {m.metrica === 'receita'
                      ? `R$ ${m.valorMeta.toLocaleString('pt-BR')}`
                      : m.valorMeta.toLocaleString('pt-BR')}
                    {(m.valorMetaPessimista != null || m.valorMetaOtimista != null) && (
                      <div className="text-[10px] font-normal text-slate-500 flex items-center justify-end gap-1">
                        {m.valorMetaPessimista != null && `pess. ${m.valorMetaPessimista.toLocaleString('pt-BR')}`}
                        {m.valorMetaPessimista != null && m.valorMetaOtimista != null && ' · '}
                        {m.valorMetaOtimista != null && `otim. ${m.valorMetaOtimista.toLocaleString('pt-BR')}`}
                        {m.cenariosGeradosPorIA && (
                          <span
                            title="Pessimista/otimista sugeridos pela IA"
                            className="inline-flex items-center gap-0.5 text-orange-400"
                          >
                            <Sparkles className="w-2.5 h-2.5" />
                          </span>
                        )}
                      </div>
                    )}
                    {m.reajusteAplicado && (
                      <div className="text-[10px] font-normal text-emerald-400">reajustada automaticamente</div>
                    )}
                  </td>
                  <td className="py-2.5 px-2 text-slate-500 max-w-[280px] truncate" title={m.contexto}>
                    {m.contexto || '—'}
                  </td>
                  <td className="py-2.5 pl-2 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => carregarParaEdicao(m)}
                      className="text-slate-400 hover:text-orange-400 p-1"
                      title="Editar"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm('Remover esta meta?')) remover(m.id)
                      }}
                      className="text-slate-400 hover:text-rose-400 p-1"
                      title="Remover"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
