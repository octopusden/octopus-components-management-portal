import * as React from 'react'
import { cn } from '../../lib/utils'

export interface FilterBarProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * When true, the row uses `items-end` so labelled controls (Label
   * stacked above Input/Select) line up at their bottom edge. When false
   * (default) the row uses `items-center` for label-less, compact rows.
   */
  withLabels?: boolean
}

/**
 * Page-level filter row wrapper. Consolidates the two divergent inline
 * patterns the portal had before §7.0.5: an inline `flex flex-wrap
 * items-center gap-3` (ComponentFilters) vs. a card-wrapped `flex
 * flex-wrap items-end gap-3 rounded-md border bg-card px-4 py-3`
 * (AuditLogFilters). Both prototypes (`index.html`, `audit-log.html`)
 * show the row inline without a card; we drop the card and toggle
 * `items-*` per `withLabels`.
 *
 * `data-testid="filter-bar"` allows visual specs to assert the unified
 * structure across pages without targeting page-specific markup.
 */
export function FilterBar({
  withLabels = false,
  className,
  ...props
}: FilterBarProps) {
  return (
    <div
      data-testid="filter-bar"
      {...props}
      className={cn(
        'flex flex-wrap gap-3',
        withLabels ? 'items-end' : 'items-center',
        className,
      )}
    />
  )
}
