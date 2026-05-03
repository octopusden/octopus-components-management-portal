import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground hover:bg-primary/80',
        secondary: 'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
        destructive: 'border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80',
        outline: 'text-foreground',
        // Semantic variants — tokens defined in index.css `@theme` (PR-1).
        // Light + dormant dark values come from prototype theme.js.
        success:
          'border-transparent bg-[color:var(--color-badge-green-bg)] text-[color:var(--color-badge-green-fg)]',
        warning:
          'border-transparent bg-[color:var(--color-badge-yellow-bg)] text-[color:var(--color-badge-yellow-fg)]',
        info:
          'border-transparent bg-[color:var(--color-badge-blue-bg)] text-[color:var(--color-badge-blue-fg)]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  // CVA does NOT auto-emit data-variant; visual specs assert against this
  // attribute (`data-variant="success"` etc.). Spread props first so a
  // caller-supplied data-variant (rare, but possible) cannot accidentally
  // shadow the variant we resolved here.
  return (
    <div
      {...props}
      data-variant={variant ?? 'default'}
      className={cn(badgeVariants({ variant }), className)}
    />
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export { Badge, badgeVariants }
