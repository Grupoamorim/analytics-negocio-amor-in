import { useState, useMemo } from 'react'
import { Search, ChevronDown, ArrowUp, ArrowDown } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'

export type ColumnFilterKey =
  | 'empresa'
  | 'curso'
  | 'faculdade'
  | 'cidade'
  | 'anoFormatura'
  | 'status'

interface ColumnHeaderWithFilterProps {
  colKey: ColumnFilterKey
  title: string
  align?: 'left' | 'center' | 'right'
  uniqueValues: string[]
  selectedValues?: string[]
  onToggleValue: (val: string) => void
  onSelectAll: () => void
  onClear: () => void
  /** Se informado, exibe atalhos "Classificar A-Z / Z-A" que ordenam a tabela por esta coluna. */
  onSort?: (direction: 'asc' | 'desc') => void
  isSorted?: 'asc' | 'desc' | false
}

export function ColumnHeaderWithFilter({
  colKey: _colKey,
  title,
  align = 'left',
  uniqueValues,
  selectedValues,
  onToggleValue,
  onSelectAll,
  onClear,
  onSort,
  isSorted,
}: ColumnHeaderWithFilterProps) {
  const [open, setOpen] = useState(false)
  const [searchCol, setSearchCol] = useState('')

  const isFiltered = selectedValues !== undefined
  const activeSelected = isFiltered ? selectedValues : uniqueValues

  const visibleVals = useMemo(() => {
    if (!searchCol.trim()) return uniqueValues
    const q = searchCol.toLowerCase().trim()
    return uniqueValues.filter((v) => v.toLowerCase().includes(q))
  }, [uniqueValues, searchCol])

  return (
    <div
      className={cn(
        'flex items-center gap-1.5',
        align === 'center' && 'justify-center',
        align === 'right' && 'justify-end',
      )}
    >
      <span>{title}</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              'p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors focus:outline-none cursor-pointer',
              isFiltered || isSorted
                ? 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/80 font-bold'
                : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200',
            )}
            title={`Filtrar/ordenar por ${title}`}
          >
            {isSorted ? (
              isSorted === 'asc' ? (
                <ArrowUp className="h-3.5 w-3.5" />
              ) : (
                <ArrowDown className="h-3.5 w-3.5" />
              )
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-3 space-y-3 z-50 shadow-xl" align="start">
          <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-slate-800">
            <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              Filtrar {title}
            </span>
            {isFiltered && (
              <Badge
                variant="outline"
                className="text-[10px] bg-orange-50 dark:bg-orange-950/50 text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-800"
              >
                {activeSelected.length} de {uniqueValues.length}
              </Badge>
            )}
          </div>

          {/* Atalhos de ordenação */}
          {onSort && (
            <div className="flex items-center gap-1.5 pb-2 border-b border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  onSort('asc')
                  setOpen(false)
                }}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 text-[11px] font-medium rounded-md py-1.5 border cursor-pointer transition-colors',
                  isSorted === 'asc'
                    ? 'bg-orange-600 text-white border-orange-600'
                    : 'text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800',
                )}
              >
                <ArrowUp className="h-3 w-3" /> A-Z
              </button>
              <button
                type="button"
                onClick={() => {
                  onSort('desc')
                  setOpen(false)
                }}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 text-[11px] font-medium rounded-md py-1.5 border cursor-pointer transition-colors',
                  isSorted === 'desc'
                    ? 'bg-orange-600 text-white border-orange-600'
                    : 'text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800',
                )}
              >
                <ArrowDown className="h-3 w-3" /> Z-A
              </button>
            </div>
          )}

          {/* Local search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input
              placeholder="Pesquisar opções..."
              value={searchCol}
              onChange={(e) => setSearchCol(e.target.value)}
              className="h-8 text-xs pl-8 bg-slate-50 dark:bg-slate-950"
            />
          </div>

          {/* Quick Actions: Selecionar todos / Limpar */}
          <div className="flex items-center justify-between text-[11px] pt-1">
            <button
              type="button"
              onClick={onSelectAll}
              className="text-orange-600 dark:text-orange-400 hover:underline font-medium cursor-pointer"
            >
              Selecionar todos
            </button>
            <button
              type="button"
              onClick={onClear}
              className="text-slate-500 hover:underline cursor-pointer"
            >
              Limpar
            </button>
          </div>

          {/* Options list with checkboxes */}
          <div className="max-h-48 overflow-y-auto space-y-1 py-1 border-y border-slate-100 dark:border-slate-800">
            {visibleVals.length === 0 ? (
              <div className="text-center py-3 text-xs text-slate-400">
                Nenhuma opção encontrada
              </div>
            ) : (
              visibleVals.map((val) => {
                const isChecked = activeSelected.includes(val)
                return (
                  <label
                    key={val}
                    className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800/60 cursor-pointer text-xs text-slate-700 dark:text-slate-300"
                  >
                    <Checkbox checked={isChecked} onCheckedChange={() => onToggleValue(val)} />
                    <span className="truncate flex-1" title={val}>
                      {val}
                    </span>
                  </label>
                )
              })
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
