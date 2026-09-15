import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import SectionTitle from './SectionTitle'
import BotaoAnaliseIA from '@/components/BotaoAnaliseIA'
import { oportunidadesPorFaculdade } from '@/utils/oportunidadesCurso'
import type { Lead } from '@/types/crm'

/** Painel de cross-sell real: faculdades onde já fechamos turma, mas ainda faltam cursos que
 * já vendemos em outra faculdade do portfólio. Mesmo cálculo do slide "Oportunidades" de
 * Relatórios — aqui como card de dashboard, sempre visível (sem precisar abrir a apresentação). */
export default function OportunidadesPanel({ leads, limite = 6 }: { leads: Lead[]; limite?: number }) {
  const oportunidades = useMemo(() => oportunidadesPorFaculdade(leads), [leads])
  const top = oportunidades.slice(0, limite)

  return (
    <div className="bg-[#111820] border border-white/[0.06] rounded-xl p-6 shadow-lg">
      <SectionTitle
        ajuda="Cross-sell real: faculdades onde já fechamos pelo menos 1 turma, mas ainda não vendemos ali um curso que já vendemos em outra faculdade do portfólio — não é mercado inventado, é venda comprovada em outro lugar. Laranja = curso-âncora (Medicina, Odontologia, Direito), prioridade, mas todo curso entra na análise."
        right={
          <div className="flex items-center gap-3">
            {top.length > 0 && (
              <BotaoAnaliseIA
                compact
                label="Analisar oportunidades com IA"
                promptBuilder={() => `Você é um diretor comercial sênior de uma empresa de fotografia de formaturas.
Analise as oportunidades de cross-sell abaixo (faculdades onde já fechamos turma, mas faltam cursos que já vendemos em outra faculdade) e responda em português, direto e prático, em no máximo 6 linhas: 1) qual oportunidade priorizar primeiro e por quê; 2) 2-3 ações concretas para atacar essas faculdades.

Oportunidades (faculdade — turmas já fechadas — cursos faltantes):
${top.map((o) => `${o.faculdade}${o.cidade ? ` (${o.cidade})` : ''}: ${o.turmasConvertidas} turma(s) fechada(s); faltam ${o.cursosFaltantes.slice(0, 6).map((c) => `${c.curso}${c.ancora ? ' [âncora]' : ''}`).join(', ')}`).join('\n')}`}
              />
            )}
            <Link to="/relatorios" className="text-xs text-orange-400 hover:underline flex items-center gap-1">
              Ver no Relatório <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        }
      >
        Oportunidades — Próximo Ataque Estratégico
      </SectionTitle>

      {top.length === 0 ? (
        <p className="text-center text-xs text-slate-500 py-6">
          Nenhuma oportunidade de cross-sell identificada ainda — faltam turmas Convertido o
          suficiente para comparar faculdades.
        </p>
      ) : (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          {top.map((o) => (
            <div key={o.faculdade} className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.04]">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-white truncate">
                  {o.faculdade}
                  {o.cidade ? <span className="text-slate-500 font-normal"> · {o.cidade}</span> : null}
                </div>
                <div className="text-[10px] text-slate-400 whitespace-nowrap">
                  {o.turmasConvertidas} fechada{o.turmasConvertidas === 1 ? '' : 's'}
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {o.cursosFaltantes.slice(0, 6).map((c) => (
                  <span
                    key={c.curso}
                    className={`text-[10px] font-semibold px-2 py-1 rounded-full border ${
                      c.ancora
                        ? 'text-orange-300 border-orange-500/30 bg-orange-500/10'
                        : 'text-slate-300 border-white/10 bg-white/[0.03]'
                    }`}
                  >
                    {c.curso} · {c.faculdadesQueTem} fac.
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
