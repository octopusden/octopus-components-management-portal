import { X } from 'lucide-react'
import { Button } from './button'

export interface FilterChip {
  /** Stable identity (filter field, plus the value for multi-value chips). */
  id: string
  label: string
}

/**
 * Row of removable active-filter chips under a filter bar: each chip's × clears just that
 * filter, "Clear all" resets everything. Renders nothing when no filter is active. Shared by
 * the component list (ActiveFilterChips) and the audit log.
 */
export function FilterChips<C extends FilterChip>({
  chips,
  onRemove,
  onClearAll,
}: {
  chips: readonly C[]
  onRemove: (chip: C) => void
  onClearAll: () => void
}) {
  if (chips.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="active-filter-chips">
      {chips.map((chip) => (
        <span
          key={chip.id}
          className="inline-flex items-center gap-1 rounded-full border bg-muted px-2.5 py-0.5 text-xs text-foreground"
        >
          {chip.label}
          <button
            type="button"
            aria-label={`Remove ${chip.label}`}
            onClick={() => onRemove(chip)}
            className="-mr-0.5 rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        </span>
      ))}
      <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={onClearAll}>
        Clear all
      </Button>
    </div>
  )
}
