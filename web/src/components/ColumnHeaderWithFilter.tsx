import { cn } from '@/lib/utils'
import {
  TableFilterPopover,
  type FilterVal,
  type FilterModeSet,
} from '@/components/TableFilterPopover'

export type ColumnFilterKey =
  | 'empresa'
  | 'curso'
  | 'faculdade'
  | 'cidade'
  | 'anoFormatura'
  | 'etapaFunil'
  | 'dataCadastro'
  | 'dataFechamento'
  | 'primeiroContato'

interface ColumnHeaderWithFilterProps {
  colKey: ColumnFilterKey
  title: string
  align?: 'left' | 'center' | 'right'
  modeSet: FilterModeSet
  uniqueValues?: string[]
  rangeInputType?: 'text' | 'date'
  rangeSuggestions?: string[]
  value: FilterVal | undefined
  onChange: (next: FilterVal | undefined) => void
  onSort?: (direction: 'asc' | 'desc') => void
  isSorted?: 'asc' | 'desc' | false
}

/** Cabeçalho de coluna com o mesmo popover de filtro (é / não é / entre) usado na barra de cima. */
export function ColumnHeaderWithFilter({
  title,
  align = 'left',
  modeSet,
  uniqueValues,
  rangeInputType,
  rangeSuggestions,
  value,
  onChange,
  onSort,
  isSorted,
}: ColumnHeaderWithFilterProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-1.5',
        align === 'center' && 'justify-center',
        align === 'right' && 'justify-end',
      )}
    >
      <span>{title}</span>
      <TableFilterPopover
        title={title}
        modeSet={modeSet}
        uniqueValues={uniqueValues}
        rangeInputType={rangeInputType}
        rangeSuggestions={rangeSuggestions}
        value={value}
        onChange={onChange}
        onSort={onSort}
        isSorted={isSorted}
      />
    </div>
  )
}
