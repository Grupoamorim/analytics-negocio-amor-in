import { useState } from 'react'
import { ArrowUp, ArrowDown, ArrowUpDown, Plus, X } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export interface SortOption {
  value: string
  label: string
}

export type SortDirection = 'asc' | 'desc'

interface SortControlProps {
  options: SortOption[]
  field: string
  direction: SortDirection
  onFieldChange: (field: string) => void
  onDirectionToggle: () => void
  className?: string
  triggerClassName?: string
}

export function SortControl({
  options,
  field,
  direction,
  onFieldChange,
  onDirectionToggle,
  className,
  triggerClassName,
}: SortControlProps) {
  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <Select value={field} onValueChange={onFieldChange}>
        <SelectTrigger className={cn('h-8 text-xs w-[168px]', triggerClassName)}>
          <SelectValue placeholder="Ordenar por" />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value} className="text-xs">
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-8 w-8 shrink-0"
        onClick={onDirectionToggle}
        title={direction === 'asc' ? 'Ordem crescente' : 'Ordem decrescente'}
      >
        {direction === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
      </Button>
    </div>
  )
}

/**
 * Compara dois valores de forma genérica: números, datas (string ISO/BR) e texto
 * (pt-BR, natural). Aceita arrays para ordenação em múltiplos níveis — ex:
 * [faculdade, anoFormatura] ordena por faculdade e, dentro da mesma faculdade,
 * por ano de formatura.
 */
export function compareValues(a: unknown, b: unknown): number {
  if (Array.isArray(a) || Array.isArray(b)) {
    const as = Array.isArray(a) ? a : [a]
    const bs = Array.isArray(b) ? b : [b]
    for (let i = 0; i < Math.max(as.length, bs.length); i++) {
      const cmp = compareValues(as[i], bs[i])
      if (cmp !== 0) return cmp
    }
    return 0
  }

  if (a == null && b == null) return 0
  if (a == null) return -1
  if (b == null) return 1

  if (typeof a === 'number' && typeof b === 'number') return a - b

  const as = String(a).trim()
  const bs = String(b).trim()
  if (as === '' && bs === '') return 0
  if (as === '') return -1
  if (bs === '') return 1

  const an = Number(as)
  const bn = Number(bs)
  if (!isNaN(an) && !isNaN(bn)) return an - bn

  return as.localeCompare(bs, 'pt-BR', { numeric: true, sensitivity: 'base' })
}

/** Ordena uma cópia do array com base num extrator de valor por campo e a direção. */
export function sortByField<T>(
  items: T[],
  field: string,
  direction: SortDirection,
  extract: (item: T, field: string) => unknown,
): T[] {
  const sorted = [...items].sort((a, b) => compareValues(extract(a, field), extract(b, field)))
  return direction === 'asc' ? sorted : sorted.reverse()
}

/** Um critério de ordenação: campo + direção, usado em listas de prioridade (estilo Notion). */
export interface SortRule {
  field: string
  direction: SortDirection
}

/**
 * Ordena por vários critérios em ordem de prioridade — o primeiro manda; os
 * seguintes só desempatam quando os anteriores derem igual. Cada critério
 * tem sua própria direção (um pode ser A-Z e outro Z-A ao mesmo tempo).
 */
export function sortByRules<T>(
  items: T[],
  rules: SortRule[],
  extract: (item: T, field: string) => unknown,
): T[] {
  if (rules.length === 0) return [...items]
  return [...items].sort((a, b) => {
    for (const rule of rules) {
      const cmp = compareValues(extract(a, rule.field), extract(b, rule.field))
      if (cmp !== 0) return rule.direction === 'asc' ? cmp : -cmp
    }
    return 0
  })
}

interface MultiSortControlProps {
  options: SortOption[]
  rules: SortRule[]
  onRulesChange: (rules: SortRule[]) => void
  className?: string
}

/**
 * Ordenação em múltiplos níveis, estilo Notion: adiciona critérios um a um,
 * cada um com seu campo e direção, aplicados em ordem de prioridade (o
 * primeiro da lista é o principal, os de baixo só desempatam).
 */
export function MultiSortControl({ options, rules, onRulesChange, className }: MultiSortControlProps) {
  const [open, setOpen] = useState(false)
  const usedFields = new Set(rules.map((r) => r.field))
  const availableForNew = options.filter((o) => !usedFields.has(o.value))

  const updateRule = (idx: number, patch: Partial<SortRule>) => {
    onRulesChange(rules.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  }
  const removeRule = (idx: number) => {
    onRulesChange(rules.filter((_, i) => i !== idx))
  }
  const addRule = () => {
    if (availableForNew.length === 0) return
    onRulesChange([...rules, { field: availableForNew[0].value, direction: 'asc' }])
  }

  const label = (field: string) => options.find((o) => o.value === field)?.label || field
  const summary =
    rules.length === 0 ? 'Ordenação' : rules.length === 1 ? label(rules[0].field) : `${label(rules[0].field)} +${rules.length - 1}`

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn('h-9 text-xs gap-1.5', rules.length > 0 && 'border-orange-300 dark:border-orange-800', className)}
        >
          <ArrowUpDown className="h-3.5 w-3.5" />
          {summary}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3 space-y-2.5 z-50" align="start">
        <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 pb-1 border-b border-slate-100 dark:border-slate-800">
          Ordenação
        </div>
        {rules.length === 0 && (
          <p className="text-xs text-slate-500 py-1">Sem ordenação ativa. Adicione um critério abaixo.</p>
        )}
        <div className="space-y-2">
          {rules.map((rule, idx) => (
            <div key={idx} className="flex items-center gap-1.5">
              <span className="text-[10px] w-5 text-slate-400 shrink-0 text-center">{idx + 1}ª</span>
              <Select value={rule.field} onValueChange={(val) => updateRule(idx, { field: val })}>
                <SelectTrigger className="h-8 text-xs flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {options
                    .filter((o) => o.value === rule.field || !usedFields.has(o.value))
                    .map((o) => (
                      <SelectItem key={o.value} value={o.value} className="text-xs">
                        {o.label}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => updateRule(idx, { direction: rule.direction === 'asc' ? 'desc' : 'asc' })}
                title={rule.direction === 'asc' ? 'Ordem crescente' : 'Ordem decrescente'}
              >
                {rule.direction === 'asc' ? (
                  <ArrowUp className="h-3.5 w-3.5" />
                ) : (
                  <ArrowDown className="h-3.5 w-3.5" />
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-slate-400 hover:text-red-500"
                onClick={() => removeRule(idx)}
                title="Remover critério"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-xs h-8 w-full justify-start text-slate-500 dark:text-slate-400"
          onClick={addRule}
          disabled={availableForNew.length === 0}
        >
          <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar ordenação
        </Button>
      </PopoverContent>
    </Popover>
  )
}
