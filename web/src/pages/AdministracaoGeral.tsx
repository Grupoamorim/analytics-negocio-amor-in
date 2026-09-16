import { useEffect, useMemo, useRef, useState } from 'react'
import { Gauge, FileDown, AlertTriangle, ShieldCheck } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { exportarElementoParaPdf } from '@/utils/exportarPdf'
import { useCRM } from '@/context/CRMContext'
import EmpresaFilterBar from '@/components/EmpresaFilterBar'
import PeriodoFiltroBar from '@/components/PeriodoFiltroBar'
import { usePeriodoFiltro, rotuloDoFiltro } from '@/hooks/usePeriodoFiltro'
import { useFinanceiroDashboard } from '@/hooks/useFinanceiroDashboard'
import { useCaixaSnapshots } from '@/hooks/useCaixaSnapshots'
import KpiCard from '@/components/dashboard/KpiCard'
import {
  useMetasNegocio,
  metaSomaIntervalo,
  metaBatidaSemReajuste,
  intervaloDaMeta,
  METRICA_LABEL,
  rotuloPeriodoMeta,
  type MetricaMeta,
} from '@/hooks/useMetasNegocio'
import type { PontoDiario } from '@/utils/pace'
import { useEscolasVisitadas } from '@/hooks/useEscolasVisitadas'
import { calcularPace } from '@/utils/pace'
import PaceBand from '@/components/dashboard/PaceBand'
import RetrospectivaPace from '@/components/dashboard/RetrospectivaPace'
import RankingGamificado from '@/components/dashboard/RankingGamificado'
import OportunidadesPanel from '@/components/dashboard/OportunidadesPanel'
import EscolasVisitadasLog from '@/components/dashboard/EscolasVisitadasLog'
import CaixaFimPeriodoCard from '@/components/dashboard/CaixaFimPeriodoCard'
import { pontosComerciais } from '@/utils/comercialMetrics'

const HOJE = new Date().toISOString().slice(0, 10)

// Dashboard Geral (Administração) — junta num só lugar o PACE das metas que hoje
// ficam espalhadas: receita/adesões (Painel Financeiro) e contratos (Painel
// Comercial). Não recalcula nada novo, só compõe os mesmos hooks e o mesmo
// PaceBand já usados nessas duas páginas. O filtro de período (igual ao resto
// do site) troca qual período os PaceBands mostram — dá pra "pré-visualizar"
// qualquer mês/trimestre/semestre/ano, não só o vigente hoje.
export default function AdministracaoGeral() {
  const { leads = [], deals = [] } = useCRM()
  const { toast } = useToast()
  const [selectedEmpresas, setSelectedEmpresas] = useState<string[]>([])
  const f = usePeriodoFiltro('ate_hoje')

  const empresaOptions = useMemo(() => {
    const s = new Set<string>()
    leads.forEach((l) => l.empresa && s.add(l.empresa))
    return Array.from(s).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [leads])

  const leadsFiltrados = useMemo(
    () =>
      selectedEmpresas.length === 0 ? leads : leads.filter((l) => l.empresa && selectedEmpresas.includes(l.empresa)),
    [leads, selectedEmpresas],
  )

  // dtIni/dtFim não afetam pontosDiarios (série completa, filtrada só por empresa) —
  // usados aqui só pra satisfazer a assinatura do hook, igual ao restante do app. O
  // recorte pro período escolhido no filtro acontece depois, dentro do calcularPace
  // de cada PaceBand (via periodoOverride).
  const { agregado, pontosDiarios } = useFinanceiroDashboard(HOJE, HOJE, selectedEmpresas)
  const { ultimoAte } = useCaixaSnapshots()
  const pontosReceita = useMemo(() => pontosDiarios('receita'), [pontosDiarios])
  // "Adesões" = "Alunos fechados" (mesmo dado, métrica única desde 2026-09-13 — antes existiam
  // como duas metas separadas mostrando o mesmo número por baixo).
  const pontosAdesoes = useMemo(() => pontosDiarios('adesoes'), [pontosDiarios])
  const pontosResultado = useMemo(() => pontosDiarios('resultado'), [pontosDiarios])
  const pontosContratos = useMemo(() => pontosComerciais(leadsFiltrados, 'contratos'), [leadsFiltrados])
  // "VGV" vem das adesões reais do SGE, não mais do valor potencial fictício que existia no
  // código antes — por isso ficava zerado/errado.
  const pontosVgv = useMemo(() => pontosDiarios('vgv'), [pontosDiarios])

  const escolasVisitadas = useEscolasVisitadas()
  const pontosEscolas = useMemo(
    () => escolasVisitadas.visitas.map((v) => ({ data: v.data, valor: 1 })),
    [escolasVisitadas.visitas],
  )

  const { metas, metaVigente, aplicarReajusteAutomatico } = useMetasNegocio()
  const rotuloFiltro = rotuloDoFiltro(f)

  // Reajuste automático: quando o período de uma meta fecha batido (realizado passou da meta
  // normal), a otimista vira a nova normal, a normal antiga vira a nova pessimista, e uma nova
  // otimista é criada com a mesma base — ver `aplicarReajusteAutomatico`. Só dispara pra período
  // já encerrado, nunca no meio dele. Roda aqui porque essa é a única tela que já tem o pace de
  // todas as métricas carregado ao mesmo tempo (caixa fica de fora — é saldo, não série diária,
  // tratado dentro do CaixaFimPeriodoCard).
  const processandoReajusteRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    const pares: { metrica: MetricaMeta; pontos: PontoDiario[] }[] = [
      { metrica: 'receita', pontos: pontosReceita },
      { metrica: 'adesoes', pontos: pontosAdesoes },
      { metrica: 'contratos', pontos: pontosContratos },
      { metrica: 'resultado_liquido', pontos: pontosResultado },
      { metrica: 'vgv', pontos: pontosVgv },
      { metrica: 'escolas_visitadas', pontos: pontosEscolas },
    ]
    for (const { metrica, pontos } of pares) {
      const batida = metaBatidaSemReajuste(metas, metrica, pontos, HOJE)
      if (batida && !processandoReajusteRef.current.has(batida.id)) {
        processandoReajusteRef.current.add(batida.id)
        aplicarReajusteAutomatico(batida.id)
          .then(() =>
            toast({
              title: `Meta de ${METRICA_LABEL[metrica]} reajustada`,
              description: `${rotuloPeriodoMeta(batida)} bateu e passou a meta normal — cenários do próximo período foram reajustados automaticamente.`,
            }),
          )
          .catch(() => processandoReajusteRef.current.delete(batida.id))
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metas, pontosReceita, pontosAdesoes, pontosContratos, pontosResultado, pontosVgv, pontosEscolas])
  // Corrigido em 2026-09-15: quando o período do filtro não tem meta mensal cadastrada em TODOS
  // os meses (ex: só até agosto, porque a meta de setembro em diante virou um cenário anual
  // "Plano Mestre"), a soma dos meses cadastrados ficava incompleta e nunca refletia o cenário
  // anual — o Financeiro mostrava certo (mês > trimestre > ano) e o Dashboard Geral não. Agora só
  // usa a soma mês a mês quando o período do filtro está 100% coberto por metas mensais; do
  // contrário cai pra mesma meta vigente do Financeiro (mês > trimestre > ano), com o próprio
  // período dela — não o do filtro, pra não distorcer o pace com uma meta anual dividida num
  // recorte parcial do ano.
  const overrideDoFiltro = (metrica: MetricaMeta) => {
    const { valor, valorPessimista, valorOtimista, mesesComMeta, mesesTotal } = metaSomaIntervalo(
      metas,
      metrica,
      f.dtIni,
      f.dtFim,
    )
    if (mesesComMeta > 0 && mesesComMeta === mesesTotal) {
      return {
        ini: f.dtIni,
        fim: f.dtFim,
        rotulo: rotuloFiltro,
        valorMeta: valor,
        valorMetaPessimista: valorPessimista,
        valorMetaOtimista: valorOtimista,
        temMeta: true,
      }
    }
    const vigente = metaVigente(metrica, HOJE)
    if (!vigente) {
      return { ini: f.dtIni, fim: f.dtFim, rotulo: rotuloFiltro, valorMeta: 0, temMeta: false }
    }
    const iv = intervaloDaMeta(vigente)
    return {
      ini: iv.ini,
      fim: iv.fim,
      rotulo: rotuloPeriodoMeta(vigente),
      valorMeta: vigente.valorMeta,
      valorMetaPessimista: vigente.valorMetaPessimista,
      valorMetaOtimista: vigente.valorMetaOtimista,
      temMeta: true,
    }
  }

  // Margem líquida do período filtrado = resultado líquido ÷ receita, só informativo (não é uma
  // meta própria — proporções não somam dia a dia como calcularPace espera).
  const realizadoReceitaFiltro = calcularPace(0, f.dtIni, f.dtFim, pontosReceita).realizado
  const realizadoResultadoFiltro = calcularPace(0, f.dtIni, f.dtFim, pontosResultado).realizado
  const margemFiltro = realizadoReceitaFiltro > 0 ? (realizadoResultadoFiltro / realizadoReceitaFiltro) * 100 : null

  // Inadimplência: mesma leitura do Financeiro/Painel Financeiro (parcelas vencidas e não pagas).
  const inadimplenciaPct =
    agregado.aReceberEmAberto > 0 ? (agregado.inadimplencia / agregado.aReceberEmAberto) * 100 : 0

  // Cobertura das contas (30 dias): pedido do Lucas no lugar do "ritmo R$/semana" — como as contas
  // dele são concentradas no início do mês (não um fluxo diário parelho), o que importa é se o
  // saldo em caixa dá conta do que vence nos próximos 30 dias, não um ritmo semanal de receita.
  const ultimoSaldo = ultimoAte(HOJE)
  const cobertura30 =
    ultimoSaldo && agregado.aPagarProx30 > 0 ? (ultimoSaldo.valor / agregado.aPagarProx30) * 100 : null

  const [exportando, setExportando] = useState(false)
  const handleExportar = async () => {
    setExportando(true)
    try {
      await exportarElementoParaPdf('dashboard-geral-conteudo', `Dashboard_Geral_${f.dtIni}_a_${f.dtFim}`)
    } catch (e: any) {
      toast({ title: 'Erro ao exportar PDF', description: e.message, variant: 'destructive' })
    } finally {
      setExportando(false)
    }
  }

  return (
    <div className="space-y-8 animate-fade-in" id="dashboard-geral-conteudo">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-white/[0.06]">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-white tracking-tight flex items-center gap-2">
            <Gauge className="w-6 h-6 text-orange-400" /> Dashboard Geral
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            PACE da empresa inteira — receita, alunos fechados (adesões) e contratos, tudo contra a
            meta do período escolhido no filtro abaixo.
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            Receita, alunos fechados (adesões) e VGV são automáticos: puxam direto do SGE
            (pagamentos e adesões reais), sincronizado sozinho a cada 3-12h. Só "Contratos
            fechados" ainda depende da Data de Fechamento cadastrada em Turmas.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <EmpresaFilterBar options={empresaOptions} selected={selectedEmpresas} onChange={setSelectedEmpresas} />
          <button
            type="button"
            onClick={handleExportar}
            disabled={exportando}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-300 bg-white/[0.04] border border-white/10 rounded-lg px-3 py-1.5 hover:bg-white/[0.08] disabled:opacity-50"
          >
            <FileDown className="w-3.5 h-3.5" /> {exportando ? 'Gerando PDF...' : 'Exportar PDF'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <KpiCard
          label="Inadimplência"
          value={`R$ ${Math.round(agregado.inadimplencia).toLocaleString('pt-BR')}`}
          icon={AlertTriangle}
          tom={inadimplenciaPct > 10 ? 'vermelho' : inadimplenciaPct > 5 ? 'ambar' : 'verde'}
          sub={`${inadimplenciaPct.toFixed(1)}% do total a receber em aberto`}
          ajuda="Parcelas com status 'atrasado' (venceram e não foram pagas). Referência saudável para o setor: abaixo de 5–10% do total a receber."
        />
        <KpiCard
          label="Cobertura das contas (30 dias)"
          value={cobertura30 === null ? '—' : `${cobertura30.toFixed(0)}%`}
          icon={ShieldCheck}
          tom={cobertura30 === null ? 'neutro' : cobertura30 >= 100 ? 'verde' : cobertura30 >= 70 ? 'ambar' : 'vermelho'}
          sub={
            ultimoSaldo
              ? `saldo ${Math.round(ultimoSaldo.valor).toLocaleString('pt-BR')} vs. contas a pagar ${Math.round(agregado.aPagarProx30).toLocaleString('pt-BR')}`
              : 'lance o saldo em caixa abaixo pra calcular'
          }
          ajuda="Último saldo em caixa lançado dividido pelas contas a pagar que vencem nos próximos 30 dias. Como as contas costumam ser concentradas no início do mês, isso diz melhor se dá pra cobrir do que um ritmo médio por semana."
        />
      </div>

      <PeriodoFiltroBar {...f} />

      <PaceBand
        titulo="Meta de receita"
        metrica="receita"
        meta={null}
        pontos={pontosReceita}
        periodoOverride={overrideDoFiltro('receita')}
      />
      <PaceBand
        titulo="Meta de alunos fechados (adesões)"
        metrica="adesoes"
        meta={null}
        pontos={pontosAdesoes}
        periodoOverride={overrideDoFiltro('adesoes')}
      />
      <PaceBand
        titulo="Meta de contratos fechados"
        metrica="contratos"
        meta={null}
        pontos={pontosContratos}
        periodoOverride={overrideDoFiltro('contratos')}
      />

      <div className="space-y-2">
        <PaceBand
          titulo="Meta de resultado líquido"
          metrica="resultado_liquido"
          meta={null}
          pontos={pontosResultado}
          periodoOverride={overrideDoFiltro('resultado_liquido')}
        />
        {margemFiltro !== null && (
          <p className="text-xs text-slate-400 px-1">
            Margem líquida do período ({rotuloFiltro}):{' '}
            <strong className={margemFiltro >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
              {margemFiltro.toFixed(1)}%
            </strong>{' '}
            (resultado líquido ÷ receita recebida — informativo, sem meta própria).
          </p>
        )}
      </div>

      <PaceBand
        titulo="Meta de VGV de novas vendas"
        metrica="vgv"
        meta={null}
        pontos={pontosVgv}
        periodoOverride={overrideDoFiltro('vgv')}
      />

      <PaceBand
        titulo="Meta de escolas visitadas"
        metrica="escolas_visitadas"
        meta={null}
        pontos={pontosEscolas}
        periodoOverride={overrideDoFiltro('escolas_visitadas')}
      />
      <EscolasVisitadasLog
        visitas={escolasVisitadas.visitas}
        loading={escolasVisitadas.loading}
        adicionar={escolasVisitadas.adicionar}
        remover={escolasVisitadas.remover}
      />

      <CaixaFimPeriodoCard
        meta={metaVigente('caixa', HOJE)}
        metas={metas}
        aplicarReajusteAutomatico={aplicarReajusteAutomatico}
      />

      <RankingGamificado leads={leadsFiltrados} deals={deals} />

      <OportunidadesPanel leads={leadsFiltrados} />

      <RetrospectivaPace
        metas={metas}
        metricas={[
          { metrica: 'receita', pontos: pontosReceita },
          { metrica: 'adesoes', pontos: pontosAdesoes },
          { metrica: 'contratos', pontos: pontosContratos },
          { metrica: 'resultado_liquido', pontos: pontosResultado },
          { metrica: 'vgv', pontos: pontosVgv },
          { metrica: 'escolas_visitadas', pontos: pontosEscolas },
        ]}
      />
    </div>
  )
}
