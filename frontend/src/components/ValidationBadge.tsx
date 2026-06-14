import { AlertTriangle } from 'lucide-react'
import { Badge } from './ui/badge'
import { Tooltip, TooltipTrigger, TooltipContent } from './ui/tooltip'
import type { ComponentValidation } from '../lib/types'
import {
  hasValidationIssue,
  problemExampleVersions,
  validationBadgeCount,
} from '../lib/validation'

// How many example versions to show inline in the tooltip before truncating
// with a "+N more" line. The full list can be large; the badge is a glance
// affordance, not the full report.
const MAX_EXAMPLE_VERSIONS = 5

interface ValidationBadgeProps {
  validation: ComponentValidation | undefined
}

/**
 * Per-row "Validation Problems" indicator. Renders nothing for a clean (or
 * absent-from-report) component — only flags components that have problems or a
 * failed check. The badge shows a count and, on hover/focus, a tooltip listing
 * each problem's message plus a few example versions. Relies on the
 * <TooltipProvider> mounted in App (same as FieldInfo).
 */
export function ValidationBadge({ validation }: ValidationBadgeProps) {
  if (!hasValidationIssue(validation) || !validation) {
    return <span className="text-muted-foreground">—</span>
  }

  // A failed check (no problems learned) is a "could not verify" state — render
  // a neutral-but-attention badge distinct from confirmed problems.
  const onlyCheckFailed = validation.problems.length === 0 && validation.checkFailed
  const count = validationBadgeCount(validation)
  const label = onlyCheckFailed
    ? 'Validation check failed'
    : `${count} validation problem${count === 1 ? '' : 's'}`

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className="inline-flex cursor-help rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Badge
            variant={onlyCheckFailed ? 'warning' : 'destructive'}
            className="gap-1 font-mono"
          >
            <AlertTriangle className="h-3 w-3" aria-hidden="true" />
            {onlyCheckFailed ? 'check failed' : count}
          </Badge>
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-sm whitespace-normal leading-snug">
        <div className="flex flex-col gap-2">
          {validation.checkFailed && (
            <div>
              <div className="font-semibold">Check failed</div>
              {validation.checkError && (
                <div className="text-xs opacity-90">{validation.checkError}</div>
              )}
            </div>
          )}
          {validation.problems.map((p, i) => {
            const versions = problemExampleVersions(p)
            const shown = versions.slice(0, MAX_EXAMPLE_VERSIONS)
            const overflow = versions.length - shown.length
            return (
              <div key={`${p.type}-${i}`}>
                <div className="font-semibold">{p.message}</div>
                {shown.length > 0 && (
                  <ul className="mt-1 list-disc pl-4 text-xs font-mono">
                    {shown.map((v, j) => (
                      <li key={`${i}-${j}-${v}`}>{v}</li>
                    ))}
                    {overflow > 0 && (
                      <li className="list-none opacity-80">+{overflow} more</li>
                    )}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}
