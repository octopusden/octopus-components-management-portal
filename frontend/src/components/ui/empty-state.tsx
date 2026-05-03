import * as React from 'react'
import { cn } from '../../lib/utils'

export interface EmptyStateProps {
  /** The message to display. Plain string or ReactNode. */
  message: React.ReactNode
  /** Optional leading icon. */
  icon?: React.ReactNode
  /** Extra classes on the wrapper. */
  className?: string
}

/**
 * Centred muted "no data" placeholder. Used inside Table cells (with the
 * caller spanning all columns) or as a standalone empty-list slot.
 *
 * Default vertical padding is `py-12` — a deliberate choice over `py-8`
 * to match the spacious feel of the prototype list page (`index.html`).
 */
export function EmptyState({ message, icon, className }: EmptyStateProps) {
  return (
    <div
      data-testid="empty-state"
      className={cn(
        'flex flex-col items-center justify-center gap-2 py-12 text-sm text-muted-foreground',
        className,
      )}
    >
      {icon}
      <span>{message}</span>
    </div>
  )
}
