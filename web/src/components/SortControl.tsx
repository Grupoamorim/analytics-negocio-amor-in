import { ArrowUp, ArrowDown } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
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

/** Compara dois valores de forma genérica: números, datas (string ISO/BR) e texto (pt-BR, natural). */
export function compareValues(a: unknown, b: unknown): number {
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
