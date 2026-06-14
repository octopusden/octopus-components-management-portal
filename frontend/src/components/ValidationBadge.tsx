import { useState } from 'react'
import { AlertTriangle, Copy } from 'lucide-react'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Tooltip, TooltipTrigger, TooltipContent } from './ui/tooltip'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './ui/dialog'
import { ValidationProblemsList } from './ValidationProblemsList'
import { copyToClipboard } from '../lib/clipboard'
import { useToast } from '../hooks/use-toast'
import type { ComponentValidation } from '../lib/types'
import {
  allProblemVersions,
  hasValidationIssue,
  problemExampleVersions,
  validationBadgeCount,
} from '../lib/validation'

// How many example versions to show inline in the tooltip before truncating
// with a "+N more" line. The full list can be large; the badge is a glance
// affordance, not the full report — the click-through dialog shows the complete
// list with no truncation.
const MAX_EXAMPLE_VERSIONS = 5

interface ValidationBadgeProps {
  validation: ComponentValidation | undefined
}

/**
 * Per-row "Validation Problems" indicator. Renders nothing for a clean (or
 * absent-from-report) component — only flags components that have problems or a
 * failed check. The badge shows a count and, on hover/focus, a tooltip listing
 * each problem's message plus a few example versions (the quick peek). Clicking
 * (or Enter/Space) opens a Dialog with the FULL, untruncated list of every
 * problem and every version — rendered from the already-loaded
 * ComponentValidation (no extra fetch). Relies on the <TooltipProvider> mounted
 * in App (same as FieldInfo).
 */
export function ValidationBadge({ validation }: ValidationBadgeProps) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)

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

  const allVersions = allProblemVersions(validation)

  async function handleCopy() {
    try {
      await copyToClipboard(allVersions.join('\n'))
      toast({ title: 'Copied to clipboard' })
    } catch {
      toast({ title: 'Copy failed', variant: 'destructive' })
    }
  }

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={label}
            title="Click for the full list of validation problems"
            aria-haspopup="dialog"
            onClick={() => setOpen(true)}
            className="inline-flex cursor-pointer rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
            <div className="text-xs italic opacity-80">Click for the full list</div>
          </div>
        </TooltipContent>
      </Tooltip>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />
              Validation Problems
            </DialogTitle>
            <DialogDescription className="font-mono">{validation.component}</DialogDescription>
          </DialogHeader>

          <div className="max-h-[60vh] overflow-auto">
            <ValidationProblemsList validation={validation} />
          </div>

          {allVersions.length > 0 && (
            <DialogFooter className="sm:justify-start">
              <Button variant="outline" size="sm" onClick={handleCopy}>
                <Copy className="mr-1.5 h-4 w-4" />
                Copy versions
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
