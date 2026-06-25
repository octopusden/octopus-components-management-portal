import { X } from 'lucide-react'
import { Button } from './ui/button'
import { cn } from '../lib/utils'
import type { ComponentFilter } from '../lib/types'
import type { PresetId } from '../lib/listPresets'
import { describeFilterChips } from '../lib/filterChips'

interface ActiveFilterChipsProps {
  filter: ComponentFilter
  preset: PresetId | null
  /**
   * Remove a single filter. `value` is present for multi-value array chips (drop
   * just that value) and undefined for scalar/tri-state/preset chips (clear the
   * whole field).
   */
  onRemove: (key: keyof ComponentFilter | 'preset', value: string | undefined) => void
  onClearAll: () => void
}

/**
 * Row of removable active-filter chips below the filter bar (spec §1.2). Each
 * chip's × clears just that filter; "Clear all" resets everything. Renders
 * nothing when no filter is active.
 */
export function ActiveFilterChips({
  filter,
  preset,
  onRemove,
  onClearAll,
}: ActiveFilterChipsProps) {
  const chips = describeFilterChips(filter, preset)
  if (chips.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="active-filter-chips">
      {chips.map((chip) => (
        <span
          key={`${chip.key}:${chip.value ?? ''}`}
          className={cn(
            'inline-flex items-center gap-1 rounded-full border bg-muted px-2.5 py-0.5',
            'text-xs text-foreground',
          )}
        >
          {chip.label}
          <button
            type="button"
            aria-label={`Remove ${chip.label}`}
            onClick={() => onRemove(chip.key, chip.value)}
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
