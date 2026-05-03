import * as React from 'react'
import { cn } from '../../lib/utils'

export interface InlineErrorProps {
  /** The error message — string or ReactNode. */
  message: React.ReactNode
  /** Extra classes on the wrapper. */
  className?: string
}

/**
 * Page-level "load failed" block. Used as the entire body of a page when
 * an initial fetch errored out (no data has rendered yet).
 *
 * For embedded errors over already-rendered content (form validation,
 * partial-fail in a migration panel), use `<StatusBanner variant="destructive">`
 * instead — different semantics and slightly different visual weight.
 */
export function InlineError({ message, className }: InlineErrorProps) {
  return (
    <div
      data-testid="inline-error"
      role="alert"
      className={cn(
        'rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive',
        className,
      )}
    >
      {message}
    </div>
  )
}
