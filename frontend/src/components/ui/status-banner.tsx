import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const statusBannerVariants = cva(
  'rounded-md border p-3 text-sm',
  {
    variants: {
      variant: {
        destructive:
          'border-destructive/40 bg-destructive/10 text-destructive',
        warning:
          'border-[color:var(--color-badge-yellow-fg)]/40 bg-[color:var(--color-badge-yellow-bg)] text-[color:var(--color-badge-yellow-fg)]',
        info:
          'border-[color:var(--color-badge-blue-fg)]/40 bg-[color:var(--color-badge-blue-bg)] text-[color:var(--color-badge-blue-fg)]',
      },
    },
    defaultVariants: {
      variant: 'destructive',
    },
  }
)

export interface StatusBannerProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof statusBannerVariants> {}

/**
 * Embedded status banner — sits ABOVE existing rendered content (form
 * validation errors, partial-fail in a migration panel, etc.). For
 * page-level "initial load failed" use `<InlineError>` instead.
 *
 * `data-testid="status-banner"` is the default; callers can override it
 * via the standard `data-testid` HTML attribute (some tests, like
 * `MigrationHistoryPanel.tsx`'s history-stuck-banner, already rely on
 * a more specific testid). Same pattern for `role`.
 */
export function StatusBanner({
  className,
  variant,
  ...props
}: StatusBannerProps) {
  return (
    <div
      data-testid="status-banner"
      data-variant={variant ?? 'destructive'}
      role="status"
      {...props}
      className={cn(statusBannerVariants({ variant }), className)}
    />
  )
}
