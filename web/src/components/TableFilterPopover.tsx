import { useMemo, useState } from 'react'
import { Search, Filter, ArrowUp, ArrowDown } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'

export type EnumFilter = { kind: 'enum'; mode: 'is' | 'not'; values: string[] }
export type RangeFilter = { kind: 'range'; from: string; to: string }
export type FilterVal = EnumFilter | RangeFilter

/** Modos oferecidos por coluna. enum = É / NÃO É; range = ESTÁ ENTRE. */
export type FilterModeSet = 'enum' | 'range' | 'enum+range'

interface TableFilterPopoverProps {
  title: string
  modeSet: FilterModeSet
  /** Só usado por enum: todos os valores possíveis da coluna. */
  uniqueValues?: string[]
  /** input de faixa: 'text' (ex ano 2028.1) ou 'date'. */
  rangeInputType?: 'text' | 'date'
  /** valores para o <datalist> do range de texto. */
  rangeSuggestions?: string[]
  value: FilterVal | undefined
  onChange: (next: FilterVal | undefined) => void
  /** trigger customizado (ex: botão da barra de filtros). Se ausente, usa um ícone de funil. */
  trigger?: React.ReactNode
  /** atalhos de ordenação (usados no cabeçalho de coluna). */
  onSort?: (direction: 'asc' | 'desc') => void
  isSorted?: 'asc' | 'desc' | false
  align?: 'start' | 'center' | 'end'
}

export function TableFilterPopover({
  title,
  modeSet,
  uniqueValues = [],
  rangeInputType = 'text',
  rangeSuggestions = [],
  value,
  onChange,
  trigger,
  onSort,
  isSorted,
  align = 'start',
}: TableFilterPopoverProps) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')

  const canRange = modeSet === 'range' || modeSet === 'enum+range'
  const canEnum = modeSet === 'enum' || modeSet === 'enum+range'

  // "range" pode ser o modo escolhido mesmo sem valor ainda preenchido
  const [uiRange, setUiRange] = useState(value?.kind === 'range' || modeSet === 'range')

  // modo atual da UI
  const uiMode: 'is' | 'not' | 'range' =
    value?.kind === 'range' || (uiRange && canRange)
      ? 'range'
      : value?.kind === 'enum'
        ? value.mode
        : canEnum
          ? 'is'
          : 'range'

  const enumVal: EnumFilter =
    value?.kind === 'enum' ? value : { kind: 'enum', mode: 'is', values: [...uniqueValues] }
  const rangeVal: RangeFilter =
    value?.kind === 'range' ? value : { kind: 'range', from: '', to: '' }

  const active = value !== undefined
  const activeLabel =
    value?.kind === 'enum'
      ? `${value.values.length}${value.mode === 'not' ? ' (exceto)' : ''}`
      : value?.kind === 'range'
        ? `${value.from || '…'}–${value.to || '…'}`
        : ''

  const visibleVals = useMemo(() => {
    if (!q.trim()) return uniqueValues
    const s = q.toLowerCase().trim()
    return uniqueValues.filter((v) => v.toLowerCase().includes(s))
  }, [uniqueValues, q])

  const setMode = (m: 'is' | 'not' | 'range') => {
    if (m === 'range') {
      onChange(
        rangeVal.from || rangeVal.to
          ? { kind: 'range', from: rangeVal.from, to: rangeVal.to }
          : undefined,
      )
      setUiRange(true)
    } else {
      setUiRange(false)
      // ao entrar em is/not sem filtro anterior, começa "tudo selecionado" = sem filtro
      if (value?.kind === 'enum') onChange({ ...value, mode: m })
      else onChange(undefined)
    }
  }

  const toggleValue = (val: string) => {
    const base =
      value?.kind === 'enum' ? value.values : [...uniqueValues]
    const has = base.includes(val)
    const nextVals = has ? base.filter((v) => v !== val) : [...base, val]
    if (nextVals.length === uniqueValues.length && (value?.kind !== 'enum' || value.mode === 'is')) {
      onChange(undefined) // tudo selecionado no modo "é" = sem filtro
    } else {
      onChange({ kind: 'enum', mode: value?.kind === 'enum' ? value.mode : 'is', values: nextVals })
    }
  }

  const selectAll = () => onChange(undefined)
  const clearAll = () =>
    onChange({ kind: 'enum', mode: value?.kind === 'enum' ? value.mode : 'is', values: [] })

  const setRange = (patch: Partial<RangeFilter>) => {
    const next = { kind: 'range' as const, from: rangeVal.from, to: rangeVal.to, ...patch }
    onChange(next.from || next.to ? next : undefined)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger ?? (
          <button
            type="button"
            className={cn(
              'p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors focus:outline-none cursor-pointer',
              active || isSorted
                ? 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/80'
                : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200',
            )}
            title={`Filtrar/ordenar por ${title}`}
          >
            {isSorted === 'asc' ? (
              <ArrowUp className="h-3.5 w-3.5" />
            ) : isSorted === 'desc' ? (
              <ArrowDown className="h-3.5 w-3.5" />
            ) : (
              <Filter className="h-3.5 w-3.5" />
            )}
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3 space-y-2.5 z-50 shadow-xl" align={align}>
        <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-slate-800">
          <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
            Filtrar {title}
          </span>
          {active && (
            <Badge
              variant="outline"
              className="text-[10px] bg-orange-50 dark:bg-orange-950/50 text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-800"
            >
              {activeLabel}
            </Badge>
          )}
        </div>

        {onSort && (
          <div className="flex items-center gap-1.5 pb-1">
            <button
              type="button"
              onClick={() => {
                onSort('asc')
                setOpen(false)
              }}
              className={cn(
                'flex-1 flex items-center justify-center gap-1 text-[11px] rounded-md py-1 border cursor-pointer',
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
                'flex-1 flex items-center justify-center gap-1 text-[11px] rounded-md py-1 border cursor-pointer',
                isSorted === 'desc'
                  ? 'bg-orange-600 text-white border-orange-600'
                  : 'text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800',
              )}
            >
              <ArrowDown className="h-3 w-3" /> Z-A
            </button>
          </div>
        )}

        {/* seletor de modo */}
        {modeSet === 'enum+range' && (
          <div className="flex rounded-md border border-slate-200 dark:border-slate-700 overflow-hidden text-[11px] font-medium">
            {(['is', 'not', 'range'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cn(
                  'flex-1 py-1 cursor-pointer',
                  uiMode === m
                    ? 'bg-orange-600 text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800',
                )}
              >
                {m === 'is' ? 'é' : m === 'not' ? 'não é' : 'entre'}
              </button>
            ))}
          </div>
        )}
        {modeSet === 'enum' && (
          <div className="flex rounded-md border border-slate-200 dark:border-slate-700 overflow-hidden text-[11px] font-medium">
            {(['is', 'not'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cn(
                  'flex-1 py-1 cursor-pointer',
                  uiMode === m
                    ? 'bg-orange-600 text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800',
                )}
              >
                {m === 'is' ? 'é' : 'não é'}
              </button>
            ))}
          </div>
        )}

        {uiMode === 'range' && canRange ? (
          <div className="space-y-2">
            <label className="block text-[11px] text-slate-500">De</label>
            <input
              type={rangeInputType}
              list={`sug-${title}`}
              value={rangeVal.from}
              onChange={(e) => setRange({ from: e.target.value })}
              className="w-full h-8 text-xs rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2"
            />
            <label className="block text-[11px] text-slate-500">Até</label>
            <input
              type={rangeInputType}
              list={`sug-${title}`}
              value={rangeVal.to}
              onChange={(e) => setRange({ to: e.target.value })}
              className="w-full h-8 text-xs rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2"
            />
            {rangeSuggestions.length > 0 && (
              <datalist id={`sug-${title}`}>
                {rangeSuggestions.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            )}
            {active && (
              <button
                type="button"
                onClick={() => onChange(undefined)}
                className="text-[11px] text-slate-500 hover:underline"
              >
                Limpar faixa
              </button>
            )}
          </div>
        ) : canEnum ? (
          <>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <Input
                placeholder="Pesquisar opções..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="h-8 text-xs pl-8 bg-slate-50 dark:bg-slate-950"
              />
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <button
                type="button"
                onClick={selectAll}
                className="text-orange-600 dark:text-orange-400 hover:underline font-medium cursor-pointer"
              >
                Selecionar todos
              </button>
              <button
                type="button"
                onClick={clearAll}
                className="text-slate-500 hover:underline cursor-pointer"
              >
                Limpar
              </button>
            </div>
            <div className="max-h-48 overflow-y-auto space-y-0.5 py-1 border-y border-slate-100 dark:border-slate-800">
              {visibleVals.length === 0 ? (
                <div className="text-center py-3 text-xs text-slate-400">Nenhuma opção</div>
              ) : (
                visibleVals.map((val) => (
                  <label
                    key={val}
                    className="flex items-center gap-2 px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800/60 cursor-pointer text-xs text-slate-700 dark:text-slate-300"
                  >
                    <Checkbox
                      checked={enumVal.values.includes(val)}
                      onCheckedChange={() => toggleValue(val)}
                    />
                    <span className="truncate flex-1" title={val}>
                      {val}
                    </span>
                  </label>
                ))
              )}
            </div>
            {value?.kind === 'enum' && value.mode === 'not' && (
              <p className="text-[10px] text-slate-500">
                Mostra tudo <span className="font-semibold">exceto</span> os marcados.
              </p>
            )}
          </>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
