import { useMemo, useState } from 'react'
import { Gauge } from 'lucide-react'
import { useCRM } from '@/context/CRMContext'
import EmpresaFilterBar from '@/components/EmpresaFilterBar'
import { useFinanceiroDashboard } from '@/hooks/useFinanceiroDashboard'
import { useMetasNegocio } from '@/hooks/useMetasNegocio'
import PaceBand from '@/components/dashboard/PaceBand'
import { pontosComerciais } from '@/utils/comercialMetrics'

const HOJE = new Date().toISOString().slice(0, 10)

// Dashboard Geral (Administração) — junta num só lugar o PACE das metas que hoje
// ficam espalhadas: receita/adesões (Painel Financeiro) e contratos/alunos
// (Painel Comercial). Não recalcula nada novo, só compõe os mesmos hooks e o
// mesmo PaceBand já usados nessas duas páginas. Cada PaceBand sempre mostra a
// meta vigente hoje (mês > trimestre > ano) — igual ao Painel Comercial e ao
// Painel Financeiro, que também não têm um filtro de período pra "navegar" a
// meta: o pace é sempre sobre o ritmo atual, não sobre um período arbitrário.
export default function AdministracaoGeral() {
  const { leads = [] } = useCRM()
  const [selectedEmpresas, setSelectedEmpresas] = useState<string[]>([])

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
  // usados aqui só pra satisfazer a assinatura do hook, igual ao restante do app.
  const { pontosDiarios } = useFinanceiroDashboard(HOJE, HOJE, selectedEmpresas)
  const pontosReceita = useMemo(() => pontosDiarios('receita'), [pontosDiarios])
  const pontosAdesoes = useMemo(() => pontosDiarios('adesoes'), [pontosDiarios])
  const pontosContratos = useMemo(() => pontosComerciais(leadsFiltrados, 'contratos'), [leadsFiltrados])
  const pontosAlunos = useMemo(() => pontosComerciais(leadsFiltrados, 'alunos'), [leadsFiltrados])

  const { metaVigente } = useMetasNegocio()
  const metaReceita = metaVigente('receita', HOJE)
  const metaAdesoes = metaVigente('adesoes', HOJE)
  const metaContratos = metaVigente('contratos', HOJE)
  const metaAlunos = metaVigente('alunos', HOJE)

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-white/[0.06]">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-white tracking-tight flex items-center gap-2">
            <Gauge className="w-6 h-6 text-orange-400" /> Dashboard Geral
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            PACE da empresa inteira — receita, adesões, contratos e alunos fechados, tudo contra a meta
            do período.
          </p>
        </div>
        <EmpresaFilterBar options={empresaOptions} selected={selectedEmpresas} onChange={setSelectedEmpresas} />
      </div>

      <PaceBand titulo="Meta de receita" metrica="receita" meta={metaReceita} pontos={pontosReceita} />
      <PaceBand titulo="Meta de adesões" metrica="adesoes" meta={metaAdesoes} pontos={pontosAdesoes} />
      <PaceBand titulo="Meta de contratos fechados" metrica="contratos" meta={metaContratos} pontos={pontosContratos} />
      <PaceBand titulo="Meta de alunos fechados" metrica="alunos" meta={metaAlunos} pontos={pontosAlunos} />
    </div>
  )
}
