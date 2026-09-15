import { useEffect, useMemo, useRef, useState } from 'react'
import { Gauge, FileDown } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { exportarElementoParaPdf } from '@/utils/exportarPdf'
import { useCRM } from '@/context/CRMContext'
import EmpresaFilterBar from '@/components/EmpresaFilterBar'
import PeriodoFiltroBar from '@/components/PeriodoFiltroBar'
import { usePeriodoFiltro, rotuloDoFiltro } from '@/hooks/usePeriodoFiltro'
import { useFinanceiroDashboard } from '@/hooks/useFinanceiroDashboard'
import {
  useMetasNegocio,
  metaSomaIntervalo,
  metaBatidaSemReajuste,
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
  const { pontosDiarios } = useFinanceiroDashboard(HOJE, HOJE, selectedEmpresas)
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
  const overrideDoFiltro = (metrica: MetricaMeta) => {
    const { valor, valorPessimista, valorOtimista, mesesComMeta } = metaSomaIntervalo(metas, metrica, f.dtIni, f.dtFim)
    return {
      ini: f.dtIni,
      fim: f.dtFim,
      rotulo: rotuloFiltro,
      valorMeta: valor,
      valorMetaPessimista: valorPessimista,
      valorMetaOtimista: valorOtimista,
      temMeta: mesesComMeta > 0,
    }
  }

  // Margem líquida do período filtrado = resultado líquido ÷ receita, só informativo (não é uma
  // meta própria — proporções não somam dia a dia como calcularPace espera).
  const realizadoReceitaFiltro = calcularPace(0, f.dtIni, f.dtFim, pontosReceita).realizado
  const realizadoResultadoFiltro = calcularPace(0, f.dtIni, f.dtFim, pontosResultado).realizado
  const margemFiltro = realizadoReceitaFiltro > 0 ? (realizadoResultadoFiltro / realizadoReceitaFiltro) * 100 : null

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
