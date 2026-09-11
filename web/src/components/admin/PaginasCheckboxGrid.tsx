import { PAGINAS, type PaginaDef } from '@/utils/paginas'

const ORDEM_GRUPOS: PaginaDef['grupo'][] = ['Comercial', 'Financeiro', 'Operação', 'Geral']

/** Grade de checkboxes das abas do menu, agrupada por setor (Comercial/Financeiro/
 * Operação/Geral) com um checkbox "mestre" por grupo — marca/desmarca todas as abas
 * daquele setor de uma vez. Usado no convite de usuário e na edição de acesso de
 * usuário existente (Admin > Usuários), pra não ter que marcar aba por aba. */
export default function PaginasCheckboxGrid({
  value,
  onChange,
}: {
  value: string[]
  onChange: (next: string[]) => void
}) {
  const porGrupo = ORDEM_GRUPOS.map((grupo) => ({
    grupo,
    paginas: PAGINAS.filter((p) => p.grupo === grupo),
  })).filter((g) => g.paginas.length > 0)

  function toggle(path: string) {
    onChange(value.includes(path) ? value.filter((x) => x !== path) : [...value, path])
  }

  function toggleGrupo(paginasDoGrupo: PaginaDef[]) {
    const paths = paginasDoGrupo.map((p) => p.path)
    const todasMarcadas = paths.every((p) => value.includes(p))
    onChange(todasMarcadas ? value.filter((x) => !paths.includes(x)) : Array.from(new Set([...value, ...paths])))
  }

  return (
    <div className="flex flex-wrap gap-x-8 gap-y-3">
      {porGrupo.map(({ grupo, paginas }) => {
        const paths = paginas.map((p) => p.path)
        const todasMarcadas = paths.every((p) => value.includes(p))
        const algumaMarcada = paths.some((p) => value.includes(p))
        return (
          <div key={grupo} className="min-w-[168px]">
            <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-200 mb-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={todasMarcadas}
                ref={(el) => {
                  if (el) el.indeterminate = !todasMarcadas && algumaMarcada
                }}
                onChange={() => toggleGrupo(paginas)}
                className="accent-orange-500"
              />
              {grupo}
            </label>
            <div className="flex flex-col gap-1 border-l border-white/[0.06] ml-[3px] pl-3">
              {paginas.map((pg) => (
                <label
                  key={pg.path}
                  className="flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-slate-200 cursor-pointer select-none"
                >
                  <input
                    type="checkbox"
                    checked={value.includes(pg.path)}
                    onChange={() => toggle(pg.path)}
                    className="accent-orange-500"
                  />
                  {pg.label}
                </label>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
