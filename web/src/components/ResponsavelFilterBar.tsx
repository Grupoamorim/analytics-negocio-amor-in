import { useMemo } from 'react'
import { UserCircle2, Users2, RotateCcw } from 'lucide-react'
import { useAcesso } from '@/context/AcessoContext'

/**
 * Barra fina de filtro "Responsável" — aparece nas telas comerciais.
 * Usuário comum começa vendo só o que é dele (padrão a cada reload); pode
 * trocar para "Todos" ou para outra pessoa, mas ao atualizar a página volta
 * para o dele. Admin começa em "Todos".
 */
export default function ResponsavelFilterBar({ className }: { className?: string }) {
  const { usuarios, responsavelFiltro, setResponsavelFiltro, nome, isAdmin, filtroPessoalAtivo } =
    useAcesso()

  const opcoes = useMemo(() => {
    const nomes = Array.from(new Set(usuarios.map((u) => u.nome).filter(Boolean)))
    nomes.sort((a, b) => a.localeCompare(b, 'pt-BR'))
    return nomes
  }, [usuarios])

  const valor = responsavelFiltro ?? '__todos__'
  const vendoProprio = !!responsavelFiltro && responsavelFiltro === nome

  return (
    <div
      className={`flex flex-wrap items-center gap-2 text-[11px] ${className || ''}`}
    >
      <span className="inline-flex items-center gap-1.5 font-semibold text-slate-400">
        {filtroPessoalAtivo ? (
          <UserCircle2 className="w-3.5 h-3.5 text-orange-400" />
        ) : (
          <Users2 className="w-3.5 h-3.5 text-orange-400" />
        )}
        Responsável:
      </span>

      <select
        value={valor}
        onChange={(e) =>
          setResponsavelFiltro(e.target.value === '__todos__' ? null : e.target.value)
        }
        className="bg-[#0a0f14] border border-white/[0.1] rounded-lg px-2 py-1 text-slate-200 text-[11px] focus:outline-none focus:ring-1 focus:ring-orange-500"
      >
        <option value="__todos__">Todos (empresa inteira)</option>
        {opcoes.map((n) => (
          <option key={n} value={n}>
            {n === nome ? `${n} (você)` : n}
          </option>
        ))}
      </select>

      {filtroPessoalAtivo && !vendoProprio && nome && (
        <button
          type="button"
          onClick={() => setResponsavelFiltro(nome)}
          className="inline-flex items-center gap-1 text-slate-400 hover:text-white transition-colors"
          title="Voltar a ver só o que é meu"
        >
          <RotateCcw className="w-3 h-3" /> Só o meu
        </button>
      )}

      {!isAdmin && (!filtroPessoalAtivo || !vendoProprio) && (
        <span className="text-slate-500">— volta pro seu ao atualizar a página</span>
      )}
    </div>
  )
}
