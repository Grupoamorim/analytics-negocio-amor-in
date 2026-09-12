import { useMemo, useState } from 'react'
import { Gauge } from 'lucide-react'
import { useCRM } from '@/context/CRMContext'
import EmpresaFilterBar from '@/components/EmpresaFilterBar'
import PeriodoFiltroBar from '@/components/PeriodoFiltroBar'
import { usePeriodoFiltro, rotuloDoFiltro } from '@/hooks/usePeriodoFiltro'
import { useFinanceiroDashboard } from '@/hooks/useFinanceiroDashboard'
import { useMetasNegocio, metaSomaIntervalo, type MetricaMeta } from '@/hooks/useMetasNegocio'
import { useEscolasVisitadas } from '@/hooks/useEscolasVisitadas'
import { calcularPace } from '@/utils/pace'
import PaceBand from '@/components/dashboard/PaceBand'
import RetrospectivaPace from '@/components/dashboard/RetrospectivaPace'
import RankingGamificado from '@/components/dashboard/RankingGamificado'
import EscolasVisitadasLog from '@/components/dashboard/EscolasVisitadasLog'
import CaixaFimPeriodoCard from '@/components/dashboard/CaixaFimPeriodoCard'
import { pontosComerciais } from '@/utils/comercialMetrics'

const HOJE = new Date().toISOString().slice(0, 10)

// Dashboard Geral (Administração) — junta num só lugar o PACE das metas que hoje
// ficam espalhadas: receita/adesões (Painel Financeiro) e contratos/alunos
// (Painel Comercial). Não recalcula nada novo, só compõe os mesmos hooks e o
// mesmo PaceBand já usados nessas duas páginas. O filtro de período (igual ao
// resto do site) troca qual período os 4 PaceBands mostram — dá pra "pré-
// visualizar" qualquer mês/trimestre/semestre/ano, não só o vigente hoje.
export default function AdministracaoGeral() {
  const { leads = [], deals = [] } = useCRM()
  const [selectedEmpresas, setSelectedEmpresas] = useState<string[]>([])
  const f = usePeriodoFiltro('trimestre')

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
  const pontosAdesoes = useMemo(() => pontosDiarios('adesoes'), [pontosDiarios])
  const pontosResultado = useMemo(() => pontosDiarios('resultado'), [pontosDiarios])
  const pontosContratos = useMemo(() => pontosComerciais(leadsFiltrados, 'contratos'), [leadsFiltrados])
  const pontosAlunos = useMemo(() => pontosComerciais(leadsFiltrados, 'alunos'), [leadsFiltrados])
  const pontosVgv = useMemo(() => pontosComerciais(leadsFiltrados, 'vgv'), [leadsFiltrados])

  const escolasVisitadas = useEscolasVisitadas()
  const pontosEscolas = useMemo(
    () => escolasVisitadas.visitas.map((v) => ({ data: v.data, valor: 1 })),
    [escolasVisitadas.visitas],
  )

  const { metas, metaVigente } = useMetasNegocio()
  const rotuloFiltro = rotuloDoFiltro(f)
  const overrideDoFiltro = (metrica: MetricaMeta) => {
    const { valor, mesesComMeta } = metaSomaIntervalo(metas, metrica, f.dtIni, f.dtFim)
    return { ini: f.dtIni, fim: f.dtFim, rotulo: rotuloFiltro, valorMeta: valor, temMeta: mesesComMeta > 0 }
  }

  // Margem líquida do período filtrado = resultado líquido ÷ receita, só informativo (não é uma
  // meta própria — proporções não somam dia a dia como calcularPace espera).
  const realizadoReceitaFiltro = calcularPace(0, f.dtIni, f.dtFim, pontosReceita).realizado
  const realizadoResultadoFiltro = calcularPace(0, f.dtIni, f.dtFim, pontosResultado).realizado
  const margemFiltro = realizadoReceitaFiltro > 0 ? (realizadoResultadoFiltro / realizadoReceitaFiltro) * 100 : null

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-white/[0.06]">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-white tracking-tight flex items-center gap-2">
            <Gauge className="w-6 h-6 text-orange-400" /> Dashboard Geral
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            PACE da empresa inteira — receita, adesões, contratos e alunos fechados, tudo contra a meta
            do período escolhido no filtro abaixo.
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            Realizado 100% automático: puxa direto do SGE (pagamentos, adesões e turmas fechadas),
            sincronizado sozinho a cada 3-12h — nada aqui é digitado à mão.
          </p>
        </div>
        <EmpresaFilterBar options={empresaOptions} selected={selectedEmpresas} onChange={setSelectedEmpresas} />
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
        titulo="Meta de adesões"
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
      <PaceBand
        titulo="Meta de alunos fechados"
        metrica="alunos"
        meta={null}
        pontos={pontosAlunos}
        periodoOverride={overrideDoFiltro('alunos')}
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

      <CaixaFimPeriodoCard meta={metaVigente('caixa', HOJE)} />

      <RankingGamificado leads={leadsFiltrados} deals={deals} />

      <RetrospectivaPace
        metas={metas}
        metricas={[
          { metrica: 'receita', pontos: pontosReceita },
          { metrica: 'adesoes', pontos: pontosAdesoes },
          { metrica: 'contratos', pontos: pontosContratos },
          { metrica: 'alunos', pontos: pontosAlunos },
          { metrica: 'resultado_liquido', pontos: pontosResultado },
          { metrica: 'vgv', pontos: pontosVgv },
          { metrica: 'escolas_visitadas', pontos: pontosEscolas },
        ]}
      />
    </div>
  )
}
