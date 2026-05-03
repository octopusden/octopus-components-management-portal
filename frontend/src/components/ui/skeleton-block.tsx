import * as React from 'react'
import { cn } from '../../lib/utils'

export interface SkeletonBlockProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Tailwind height utility, e.g. `'h-4'`, `'h-64'`. Default: `'h-4'`. */
  height?: string
  /** Tailwind width utility, e.g. `'w-1/4'`, `'w-24'`, `'w-full'`. Default: `'w-full'`. */
  width?: string
}

/**
 * Single-block skeleton placeholder. Composes Tailwind sizing utilities
 * with a muted background + pulse animation. For full table loading
 * states use `<SkeletonTable>` instead — it composes SkeletonBlock for
 * each cell.
 *
 * `data-testid="skeleton-block"` exposed for visual specs; can be
 * overridden by a caller-supplied `data-testid` for finer-grained
 * targeting if needed.
 */
export function SkeletonBlock({
  height = 'h-4',
  width = 'w-full',
  className,
  ...props
}: SkeletonBlockProps) {
  return (
    <div
      data-testid="skeleton-block"
      {...props}
      className={cn('bg-muted animate-pulse rounded', height, width, className)}
    />
  )
}
