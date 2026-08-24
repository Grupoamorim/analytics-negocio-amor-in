import type { Periodo, PeriodoFiltroState } from '@/hooks/usePeriodoFiltro'
import { NOMES_MES } from '@/hooks/usePeriodoFiltro'

/** Barra de filtro de período (Mês/Trimestre/Semestre/Ano/Até Hoje/
 * Personalizado) — mesmo componente usado no DRE e no Financeiro, pra manter
 * os dois consistentes. */
export default function PeriodoFiltroBar(f: PeriodoFiltroState) {
  return (
    <div className="bg-[#111820] border border-white/[0.06] rounded-xl p-4 space-y-3">
      {/* Linha 1: tipo de período */}
      <div className="flex items-center gap-2 flex-wrap">
        {(
          [
            ['mes', 'Mês'],
            ['trimestre', 'Trimestre'],
            ['semestre', 'Semestre'],
            ['ano', 'Ano'],
            ['ate_hoje', 'Até Hoje'],
            ['personalizado', 'Personalizado'],
          ] as [Periodo, string][]
        ).map(([p, label]) => (
          <button
            key={p}
            onClick={() => f.selecionarPeriodo(p)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${
              f.periodo === p
                ? 'bg-orange-500/15 text-orange-400 border-orange-500/30'
                : 'text-slate-400 border-white/[0.08] hover:text-white hover:bg-white/[0.05]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Linha 2: seletor de ano + sub-período (trimestre/semestre/mês específico) */}
      {f.periodo !== 'personalizado' && (
        <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-white/[0.06]">
          <label className="text-xs text-slate-500 flex items-center gap-1.5">
            Ano
            <select
              value={f.anoRef}
              onChange={(e) => f.setAnoRef(Number(e.target.value))}
              className="bg-[#0a0f14] border border-white/[0.1] rounded-lg px-2 py-1.5 text-slate-200 text-xs font-medium"
            >
              {f.anosDisponiveis.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>

          {f.periodo === 'trimestre' && (
            <div className="inline-flex rounded-lg bg-white/[0.03] p-1 border border-white/[0.06]">
              {([1, 2, 3, 4] as const).map((q) => (
                <button
                  key={q}
                  onClick={() => f.setTrimestreRef(q)}
                  className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                    f.trimestreRef === q ? 'bg-orange-500 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Q{q}
                </button>
              ))}
            </div>
          )}

          {f.periodo === 'semestre' && (
            <div className="inline-flex rounded-lg bg-white/[0.03] p-1 border border-white/[0.06]">
              {([1, 2] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => f.setSemestreRef(s)}
                  className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                    f.semestreRef === s ? 'bg-orange-500 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {s}º Semestre
                </button>
              ))}
            </div>
          )}

          {f.periodo === 'mes' && (
            <select
              value={f.mesRef}
              onChange={(e) => f.setMesRef(Number(e.target.value))}
              className="bg-[#0a0f14] border border-white/[0.1] rounded-lg px-2 py-1.5 text-slate-200 text-xs font-medium"
            >
              {NOMES_MES.map((nome, idx) => (
                <option key={nome} value={idx + 1}>
                  {nome}
                </option>
              ))}
            </select>
          )}

          <span className="text-xs text-slate-500 ml-auto">
            {new Date(`${f.dtIni}T00:00:00`).toLocaleDateString('pt-BR')} até{' '}
            {new Date(`${f.dtFim}T00:00:00`).toLocaleDateString('pt-BR')}
          </span>
        </div>
      )}

      {f.periodo === 'personalizado' && (
        <div className="flex items-center gap-3 flex-wrap pt-1 border-t border-white/[0.06]">
          <label className="text-xs text-slate-400">
            De{' '}
            <input
              type="date"
              value={f.dtIniInput}
              onChange={(e) => f.setDtIniInput(e.target.value)}
              className="ml-1 bg-[#0a0f14] border border-white/[0.1] rounded-lg px-2 py-1.5 text-slate-200 text-sm"
            />
          </label>
          <label className="text-xs text-slate-400">
            Até{' '}
            <input
              type="date"
              value={f.dtFimInput}
              onChange={(e) => f.setDtFimInput(e.target.value)}
              className="ml-1 bg-[#0a0f14] border border-white/[0.1] rounded-lg px-2 py-1.5 text-slate-200 text-sm"
            />
          </label>
          <button
            onClick={f.aplicarFiltroPersonalizado}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-orange-500 text-white hover:bg-orange-600 transition-colors"
          >
            Filtrar
          </button>
          {f.filtroAplicado && (
            <span className="text-xs text-emerald-400 font-medium flex items-center gap-1">
              ✓ Filtro aplicado — {new Date(`${f.dtIni}T00:00:00`).toLocaleDateString('pt-BR')} até{' '}
              {new Date(`${f.dtFim}T00:00:00`).toLocaleDateString('pt-BR')}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
