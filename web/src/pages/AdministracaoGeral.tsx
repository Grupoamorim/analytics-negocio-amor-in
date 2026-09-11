import { useMemo, useState } from 'react'
import { Gauge } from 'lucide-react'
import { useCRM } from '@/context/CRMContext'
import EmpresaFilterBar from '@/components/EmpresaFilterBar'
import PeriodoFiltroBar from '@/components/PeriodoFiltroBar'
import { usePeriodoFiltro, NOMES_MES, type PeriodoFiltroState } from '@/hooks/usePeriodoFiltro'
import { useFinanceiroDashboard } from '@/hooks/useFinanceiroDashboard'
import { useMetasNegocio, metaSomaIntervalo, type MetricaMeta } from '@/hooks/useMetasNegocio'
import PaceBand from '@/components/dashboard/PaceBand'
import RetrospectivaPace from '@/components/dashboard/RetrospectivaPace'
import RankingGamificado from '@/components/dashboard/RankingGamificado'
import { pontosComerciais } from '@/utils/comercialMetrics'

const HOJE = new Date().toISOString().slice(0, 10)

function rotuloDoFiltro(f: PeriodoFiltroState): string {
  if (f.periodo === 'mes') return `${NOMES_MES[f.mesRef - 1]}/${f.anoRef}`
  if (f.periodo === 'trimestre') return `T${f.trimestreRef}/${f.anoRef}`
  if (f.periodo === 'semestre') return `S${f.semestreRef}/${f.anoRef}`
  if (f.periodo === 'ano') return `Ano ${f.anoRef}`
  if (f.periodo === 'ate_hoje') return `Até hoje (${f.anoRef})`
  return `${f.dtIni} a ${f.dtFim}`
}

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
  const pontosContratos = useMemo(() => pontosComerciais(leadsFiltrados, 'contratos'), [leadsFiltrados])
  const pontosAlunos = useMemo(() => pontosComerciais(leadsFiltrados, 'alunos'), [leadsFiltrados])

  const { metas } = useMetasNegocio()
  const rotuloFiltro = rotuloDoFiltro(f)
  const overrideDoFiltro = (metrica: MetricaMeta) => {
    const { valor, mesesComMeta } = metaSomaIntervalo(metas, metrica, f.dtIni, f.dtFim)
    return { ini: f.dtIni, fim: f.dtFim, rotulo: rotuloFiltro, valorMeta: valor, temMeta: mesesComMeta > 0 }
  }

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

      <RankingGamificado leads={leadsFiltrados} deals={deals} />

      <RetrospectivaPace
        metas={metas}
        metricas={[
          { metrica: 'receita', pontos: pontosReceita },
          { metrica: 'adesoes', pontos: pontosAdesoes },
          { metrica: 'contratos', pontos: pontosContratos },
          { metrica: 'alunos', pontos: pontosAlunos },
        ]}
      />
    </div>
  )
}
