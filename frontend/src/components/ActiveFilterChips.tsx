import { FilterChips } from './ui/FilterChips'
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
  const chips = describeFilterChips(filter, preset).map((c) => ({ ...c, id: `${c.key}:${c.value ?? ''}` }))
  return <FilterChips chips={chips} onRemove={(c) => onRemove(c.key, c.value)} onClearAll={onClearAll} />
}
