// Adesões > Turmas Fechadas — planilha de acompanhamento individual de alunos
// por turma já convertida, em paralelo ao funil padrão (pedido do Lucas: além
// de saber que a turma fechou, quer contatar aluno a aluno pelo WhatsApp e
// medir quanto disso vira adesão, comparando com quem fechou pelo funil
// padrão ou sem nunca ter sido contatado por essa ação específica).
import { useEffect, useMemo, useState } from 'react'
import {
  FileSpreadsheet,
  MessageSquare,
  MessageSquareOff,
  ThumbsDown,
  CheckCircle2,
  Users,
} from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { fetchAllRows } from '@/utils/fetchAllRows'
import { useToast } from '@/hooks/use-toast'
import { SortControl, sortByField, type SortDirection } from '@/components/SortControl'
import { listarPlanilhaAlunosPorTurmas, type PlanilhaAluno } from '@/utils/planilhaAlunos'
import PlanilhaAlunosModal from '@/components/PlanilhaAlunosModal'

interface TurmaFechada {
  id: string
  curso: string | null
  faculdade: string | null
  turma: string | null
  anoFormatura: string | null
  cidade: string | null
  empresa: string | null
  alunosFechados: number
  dataFechamento: string
}

type Janela = '30' | '60' | 'trimestre' | 'semestre' | 'ano'

const JANELAS: { value: Janela; label: string; dias: number }[] = [
  { value: '30', label: 'Últimos 30 dias', dias: 30 },
  { value: '60', label: 'Últimos 60 dias', dias: 60 },
  { value: 'trimestre', label: 'Trimestre', dias: 90 },
  { value: 'semestre', label: 'Semestre', dias: 180 },
  { value: 'ano', label: 'Anual', dias: 365 },
]

function nomeTurma(t: TurmaFechada): string {
  const partes = [t.empresa, t.curso, t.faculdade, t.turma, t.anoFormatura, t.cidade].filter(Boolean)
  return partes.length > 0 ? partes.join(' ') : 'Turma sem nome'
}

const SORTS = [
  { value: 'dataFechamento', label: 'Data que fechou' },
  { value: 'nome', label: 'Turma (A-Z)' },
  { value: 'alunosFechados', label: 'Alunos fechados' },
]

export default function TurmasFechadasPlanilha() {
  const { toast } = useToast()
  const [carregando, setCarregando] = useState(true)
  const [turmas, setTurmas] = useState<TurmaFechada[]>([])
  const [planilhaPorTurma, setPlanilhaPorTurma] = useState<Record<string, PlanilhaAluno[]>>({})
  const [janela, setJanela] = useState<Janela>('30')
  const [busca, setBusca] = useState('')
  const [sortField, setSortField] = useState('dataFechamento')
  const [sortDir, setSortDir] = useState<SortDirection>('desc')
  const [turmaAberta, setTurmaAberta] = useState<TurmaFechada | null>(null)

  async function carregar() {
    setCarregando(true)
    try {
      const [turmasRaw, pagamentos] = await Promise.all([
        fetchAllRows<any>(() =>
          supabase
            .from('turmas')
            .select(
              'id, curso, faculdade, turma, ano_formatura, cidade, empresa, alunos_fechados, updated_at',
            )
            .eq('funil_status', 'Convertido'),
        ),
        fetchAllRows<any>(() =>
          supabase.from('pagamentos').select('turma_id, data_pagamento').not('data_pagamento', 'is', null),
        ),
      ])

      // Data de fechamento: usa o primeiro pagamento recebido daquela turma
      // (mesma base de caixa usada no DRE/Financeiro) — é a única data
      // confiável que já existe pra "quando a turma começou a fechar".
      // `deals.updated_at`/`turmas.updated_at` não servem: são tocados por
      // qualquer edição/sync, não só quando a turma fecha de verdade. Sem
      // nenhum pagamento ainda, cai no updated_at da turma como aproximação.
      const primeiroPagamentoPorTurma = new Map<string, string>()
      for (const p of pagamentos) {
        if (!p.turma_id || !p.data_pagamento) continue
        const atual = primeiroPagamentoPorTurma.get(p.turma_id)
        if (!atual || p.data_pagamento < atual) primeiroPagamentoPorTurma.set(p.turma_id, p.data_pagamento)
      }

      const lista: TurmaFechada[] = turmasRaw.map((t) => ({
        id: t.id,
        curso: t.curso,
        faculdade: t.faculdade,
        turma: t.turma,
        anoFormatura: t.ano_formatura,
        cidade: t.cidade,
        empresa: t.empresa,
        alunosFechados: t.alunos_fechados || 0,
        dataFechamento: primeiroPagamentoPorTurma.get(t.id) || t.updated_at,
      }))
      setTurmas(lista)

      const planilha = await listarPlanilhaAlunosPorTurmas(lista.map((t) => t.id))
      const porTurma: Record<string, PlanilhaAluno[]> = {}
      for (const a of planilha) {
        if (!porTurma[a.turmaId]) porTurma[a.turmaId] = []
        porTurma[a.turmaId].push(a)
      }
      setPlanilhaPorTurma(porTurma)
    } catch (e: any) {
      toast({ title: 'Erro ao carregar turmas fechadas', description: e.message, variant: 'destructive' })
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const turmasNoPeriodo = useMemo(() => {
    const dias = JANELAS.find((j) => j.value === janela)?.dias || 30
    const limite = new Date()
    limite.setDate(limite.getDate() - dias)
    const limiteISO = limite.toISOString()
    let arr = turmas.filter((t) => t.dataFechamento >= limiteISO)
    const b = busca.trim().toLowerCase()
    if (b) arr = arr.filter((t) => nomeTurma(t).toLowerCase().includes(b))
    return sortByField(arr, sortField, sortDir, (t, f) => (f === 'nome' ? nomeTurma(t) : (t as any)[f]))
  }, [turmas, janela, busca, sortField, sortDir])

  const dashboard = useMemo(() => {
    const turmaIds = new Set(turmasNoPeriodo.map((t) => t.id))
    const alunos = Object.entries(planilhaPorTurma)
      .filter(([turmaId]) => turmaIds.has(turmaId))
      .flatMap(([, lista]) => lista)

    const mensagensEnviadas = alunos.filter((a) => a.status !== 'pendente').length
    const semResposta = alunos.filter((a) => a.status === 'sem_resposta').length
    const negaram = alunos.filter((a) => a.status === 'negou').length
    const fechadosPlanilha = alunos.filter((a) => a.fechou).length
    const fechadosSemContato = alunos.filter((a) => a.fechou && a.status === 'fechado' && !a.chatWaId).length
    const alunosFechadosSGE = turmasNoPeriodo.reduce((acc, t) => acc + t.alunosFechados, 0)
    const fechadosFunilPadrao = Math.max(0, alunosFechadosSGE - fechadosPlanilha)

    return {
      mensagensEnviadas,
      semResposta,
      negaram,
      fechadosPlanilha,
      fechadosSemContato,
      fechadosFunilPadrao,
    }
  }, [turmasNoPeriodo, planilhaPorTurma])

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">
        Turmas que já fecharam, com planilha de alunos importada pra contato individual via WhatsApp —
        acompanhe quem foi contatado, quem respondeu e quem fechou por essa ação, separado de quem fechou
        pelo funil padrão.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {JANELAS.map((j) => (
          <button
            key={j.value}
            onClick={() => setJanela(j.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              janela === j.value
                ? 'bg-orange-500 text-white'
                : 'bg-[#111820] text-slate-400 border border-white/[0.06] hover:text-white'
            }`}
          >
            {j.label}
          </button>
        ))}
      </div>

      {/* Dashboard agregado */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Mensagens enviadas', value: dashboard.mensagensEnviadas, icon: MessageSquare, color: 'text-sky-400' },
          { label: 'Sem resposta', value: dashboard.semResposta, icon: MessageSquareOff, color: 'text-amber-400' },
          { label: 'Negaram', value: dashboard.negaram, icon: ThumbsDown, color: 'text-red-400' },
          { label: 'Fechados por essa ação', value: dashboard.fechadosPlanilha, icon: CheckCircle2, color: 'text-emerald-400' },
          { label: '— dos quais sem contato', value: dashboard.fechadosSemContato, icon: Users, color: 'text-slate-400' },
          { label: 'Fechados via funil padrão', value: dashboard.fechadosFunilPadrao, icon: FileSpreadsheet, color: 'text-orange-400' },
        ].map((c) => (
          <div key={c.label} className="bg-[#111820] border border-white/[0.06] rounded-xl p-4">
            <div className={`flex items-center gap-1.5 text-[11px] font-medium ${c.color}`}>
              <c.icon className="w-3.5 h-3.5" /> {c.label}
            </div>
            <div className="text-2xl font-bold text-white mt-1.5">{c.value}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar turma…"
          className="flex-1 min-w-[180px] bg-[#0a0f14] border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
        />
        <SortControl
          options={SORTS}
          field={sortField}
          direction={sortDir}
          onFieldChange={setSortField}
          onDirectionToggle={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
        />
      </div>

      {carregando ? (
        <div className="text-sm text-slate-400">Carregando…</div>
      ) : turmasNoPeriodo.length === 0 ? (
        <div className="text-sm text-slate-500 bg-[#111820] border border-white/[0.06] rounded-xl p-6 text-center">
          Nenhuma turma fechou nesse período.
        </div>
      ) : (
        <div className="bg-[#111820] border border-white/[0.06] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 text-xs uppercase border-b border-white/[0.06]">
                <th className="py-2.5 px-4">Turma</th>
                <th className="py-2.5 px-3">Fechou em</th>
                <th className="py-2.5 px-3 text-center">Alunos (SGE)</th>
                <th className="py-2.5 px-3 text-center">Na planilha</th>
                <th className="py-2.5 px-3 text-center">Fechados por essa ação</th>
                <th className="py-2.5 px-4 text-right">Ação</th>
              </tr>
            </thead>
            <tbody>
              {turmasNoPeriodo.map((t) => {
                const alunos = planilhaPorTurma[t.id] || []
                const fechadosPlanilha = alunos.filter((a) => a.fechou).length
                return (
                  <tr key={t.id} className="border-b border-white/[0.04] last:border-0">
                    <td className="py-2.5 px-4 text-slate-200 font-medium">{nomeTurma(t)}</td>
                    <td className="py-2.5 px-3 text-slate-400">
                      {new Date(t.dataFechamento).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="py-2.5 px-3 text-center text-slate-300">{t.alunosFechados}</td>
                    <td className="py-2.5 px-3 text-center text-slate-300">{alunos.length}</td>
                    <td className="py-2.5 px-3 text-center text-emerald-400 font-semibold">
                      {fechadosPlanilha}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <button
                        onClick={() => setTurmaAberta(t)}
                        className="inline-flex items-center gap-1.5 text-xs text-orange-400 hover:text-orange-300 font-medium"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5" />
                        {alunos.length > 0 ? 'Ver planilha' : 'Importar planilha'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {turmaAberta && (
        <PlanilhaAlunosModal
          turmaId={turmaAberta.id}
          turmaNome={nomeTurma(turmaAberta)}
          onClose={() => setTurmaAberta(null)}
          onChanged={carregar}
        />
      )}
    </div>
  )
}
