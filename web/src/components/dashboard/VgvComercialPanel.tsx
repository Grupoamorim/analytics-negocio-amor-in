import { useMemo } from 'react'
import { DollarSign, Receipt, UserPlus } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import SectionTitle from './SectionTitle'
import KpiCard from './KpiCard'
import BotaoAnaliseIA from '@/components/BotaoAnaliseIA'
import type { FinanceiroDashboardAgregado } from '@/hooks/useFinanceiroDashboard'

const brl = (v: number) => `R$ ${Math.round(v).toLocaleString('pt-BR')}`

const MESES_NOME = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

function labelMes(chave: string): string {
  const [ano, mes] = chave.split('-')
  return `${MESES_NOME[Number(mes) - 1]}/${ano.slice(2)}`
}

/** Análise de VGV (valor das adesões reais do SGE) com os mesmos filtros de Período/Empresa do
 * topo do Painel Comercial — o "clicar pro lado" que grandes CRMs (Pipedrive, HubSpot) fazem pra
 * ver o funil em R$ e não só em quantidade, só que aqui como uma seção própria: KPI de VGV do
 * período + tendência mensal, tudo vindo de sge_adesoes (não mais do valor potencial fictício
 * que existia antes por turma). */
export default function VgvComercialPanel({
  agregado,
  rotuloPeriodo,
  loading,
}: {
  agregado: FinanceiroDashboardAgregado
  rotuloPeriodo: string
  loading: boolean
}) {
  const deltaValor =
    agregado.adesoesValorAnterior > 0
      ? ((agregado.adesoesValor - agregado.adesoesValorAnterior) / agregado.adesoesValorAnterior) * 100
      : null
  const deltaQtd =
    agregado.adesoesQtdAnterior > 0
      ? ((agregado.adesoesQtd - agregado.adesoesQtdAnterior) / agregado.adesoesQtdAnterior) * 100
      : null

  const grafico = useMemo(
    () => agregado.adesoesMensal.map((m) => ({ mes: labelMes(m.mes), valor: m.valor })),
    [agregado.adesoesMensal],
  )

  return (
    <div className="bg-[#111820] border border-white/[0.06] rounded-xl p-6 shadow-lg">
      <SectionTitle ajuda="VGV = soma do valor de contrato das adesões reais (aluno assinando plano), sincronizadas automaticamente do SGE — não é caixa/faturamento, é venda em competência. Mesmo dado usado em Adesões, agora com os filtros de Período e Empresa deste painel.">
        VGV — Valor Geral de Vendas ({rotuloPeriodo})
        <BotaoAnaliseIA
          compact
          label="Analisar VGV com IA"
          promptBuilder={() => `Você é um diretor comercial sênior de uma empresa de fotografia de formaturas.
Analise o VGV (Valor Geral de Vendas — valor de contrato das adesões, venda em competência, não caixa) do período abaixo e responda em português, direto e prático, em no máximo 6 linhas: 1) leitura do momento (acelerando/estável/desacelerando, comparado ao ano anterior); 2) 2-3 ações concretas para melhorar VGV e ticket médio no próximo período.

Período: ${rotuloPeriodo}
VGV no período: ${brl(agregado.adesoesValor)}${deltaValor !== null ? ` (${deltaValor >= 0 ? '+' : ''}${deltaValor.toFixed(0)}% vs. mesmo período ano passado)` : ' (sem comparativo do ano passado)'}
Adesões no período: ${agregado.adesoesQtd}${deltaQtd !== null ? ` (${deltaQtd >= 0 ? '+' : ''}${deltaQtd.toFixed(0)}% vs. ano passado)` : ''}
Ticket médio por adesão: ${brl(agregado.adesoesTicket)}
VGV mensal (últimos 12 meses): ${grafico.map((m) => `${m.mes}: ${brl(m.valor)}`).join(', ') || 'sem dados'}`}
        />
      </SectionTitle>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
        <KpiCard
          label="VGV no período"
          value={brl(agregado.adesoesValor)}
          sub="vs. mesmo período ano passado"
          icon={DollarSign}
          tom="neutro"
          delta={deltaValor}
          ajuda="Soma do valor de contrato de todas as adesões (alunos que assinaram) com data dentro do período filtrado."
        />
        <KpiCard
          label="Adesões no período"
          value={String(agregado.adesoesQtd)}
          sub="vs. mesmo período ano passado"
          icon={UserPlus}
          tom="neutro"
          delta={deltaQtd}
          ajuda="Quantidade de alunos que assinaram contrato (adesão) com data dentro do período filtrado."
        />
        <KpiCard
          label="Ticket médio por adesão"
          value={brl(agregado.adesoesTicket)}
          sub="VGV ÷ adesões no período"
          icon={Receipt}
          tom="neutro"
          ajuda="Valor médio de contrato por aluno que assinou no período — cai se estamos fechando planos menores, sobe se o mix está mais forte."
        />
      </div>

      <div className="mt-6">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
          VGV por mês (últimos 12 meses)
        </h3>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={grafico}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="mes" stroke="#64748b" fontSize={10} />
              <YAxis
                stroke="#64748b"
                fontSize={10}
                width={48}
                tickFormatter={(v) => `${(Number(v) / 1000).toFixed(0)}k`}
              />
              <Tooltip
                formatter={(v: number) => brl(Number(v))}
                contentStyle={{ background: '#0a0f14', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
              />
              <Bar dataKey="valor" name="VGV" fill="#f97316" radius={[4, 4, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        {grafico.length === 0 && !loading && (
          <p className="text-center text-xs text-slate-500 py-4">Nenhuma adesão registrada nos últimos 12 meses.</p>
        )}
      </div>
    </div>
  )
}
