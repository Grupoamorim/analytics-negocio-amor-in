import { Trophy, Medal, Award, Users } from 'lucide-react'
import SectionTitle from './SectionTitle'
import { rankingPorResponsavel, type LinhaRanking } from '@/utils/comercialMetrics'
import type { Lead, Deal } from '@/types/crm'

const AVATAR_COLORS = ['#F97316', '#EA580C', '#0EA5E9', '#8B5CF6', '#10B981', '#EF4444']
function corPorNome(nome: string): string {
  let hash = 0
  for (let i = 0; i < nome.length; i++) hash = (hash * 31 + nome.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}
function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/)
  return ((partes[0]?.[0] || '') + (partes[1]?.[0] || '')).toUpperCase() || '?'
}

const PODIO_STYLE = [
  { icon: Trophy, cor: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30', anel: 'ring-amber-400/60' },
  { icon: Medal, cor: 'text-slate-300', bg: 'bg-white/[0.04] border-white/[0.12]', anel: 'ring-slate-300/50' },
  { icon: Award, cor: 'text-orange-700', bg: 'bg-orange-900/10 border-orange-700/30', anel: 'ring-orange-700/50' },
]

/** Ranking gamificado dos responsáveis por turma — mesmo dado de sempre
 * (rankingPorResponsavel, já usado no Painel Comercial como tabela simples),
 * só que aqui em pódio: top 3 em destaque com medalha, resto em lista. */
export default function RankingGamificado({ leads, deals }: { leads: Lead[]; deals: Deal[] }) {
  const ranking = rankingPorResponsavel(leads, deals)
    .filter((r) => r.chave !== 'Sem responsável')
    .sort((a, b) => b.ganhas - a.ganhas || b.alunosFechados - a.alunosFechados)

  if (ranking.length === 0) {
    return null
  }

  const top3 = ranking.slice(0, 3)
  const resto = ranking.slice(3)

  return (
    <div className="bg-[#111820] border border-white/[0.06] rounded-xl p-6 shadow-lg space-y-4">
      <SectionTitle ajuda="Ranking por responsável de turma (Closer/SDR), ordenado por turmas ganhas — mesmo dado do Ranking de Vendedores no Painel Comercial, só que em formato de pódio.">
        Ranking Gamificado — quem está na frente
      </SectionTitle>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {top3.map((r, i) => {
          const st = PODIO_STYLE[i]
          const Icon = st.icon
          return (
            <div key={r.chave} className={`rounded-xl border p-4 flex flex-col items-center text-center gap-2 ${st.bg}`}>
              <Icon className={`w-6 h-6 ${st.cor}`} />
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold text-white ring-2 ${st.anel}`}
                style={{ backgroundColor: corPorNome(r.chave) }}
              >
                {iniciais(r.chave)}
              </div>
              <div className="text-sm font-semibold text-white truncate max-w-full">{r.chave}</div>
              <div className="text-2xl font-bold text-white">{r.ganhas}</div>
              <div className="text-[10px] text-slate-400 uppercase tracking-wide">turmas fechadas</div>
              <div className="flex items-center gap-3 text-[11px] text-slate-400 pt-1 border-t border-white/[0.06] w-full justify-center">
                <span>
                  Win rate{' '}
                  <strong className="text-slate-200">
                    {r.ganhas + r.perdidas > 0 ? `${r.winRate.toFixed(0)}%` : '—'}
                  </strong>
                </span>
                <span>
                  Alunos <strong className="text-slate-200">{r.alunosFechados}</strong>
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {resto.length > 0 && (
        <div className="divide-y divide-white/[0.04] pt-2 border-t border-white/[0.06]">
          {resto.map((r: LinhaRanking, i) => (
            <div key={r.chave} className="flex items-center gap-3 py-2 text-xs">
              <span className="w-5 text-slate-500 font-semibold text-right">{i + 4}º</span>
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0"
                style={{ backgroundColor: corPorNome(r.chave) }}
              >
                {iniciais(r.chave)}
              </div>
              <span className="text-slate-200 font-medium flex-1 truncate">{r.chave}</span>
              <span className="text-slate-400">
                <Users className="w-3 h-3 inline mr-1" />
                {r.ganhas} ganhas
              </span>
              <span className="text-slate-500">
                {r.ganhas + r.perdidas > 0 ? `${r.winRate.toFixed(0)}% win` : '—'}
              </span>
              <span className="text-white font-semibold w-16 text-right">{r.alunosFechados} alunos</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
