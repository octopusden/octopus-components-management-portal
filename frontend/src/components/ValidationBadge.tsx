import { useState } from 'react'
import { AlertTriangle, Copy } from 'lucide-react'
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
 * Inline "Validation Problems" indicator. Renders NOTHING (null) for a clean,
 * absent-from-report, OR check-failed component — it only flags components with
 * a genuine, actionable problem, as a bare red AlertTriangle shown immediately
 * before the component name in the list. (A failed check is a system condition
 * surfaced once at report level on the list page, not a per-component problem.)
 * On hover/focus a tooltip lists each problem's
 * message plus a few example versions (the quick peek). Clicking (or Enter/Space)
 * opens a Dialog with the FULL, untruncated list of every problem and every
 * version — rendered from the already-loaded ComponentValidation (no extra
 * fetch). Relies on the <TooltipProvider> mounted in App (same as FieldInfo).
 */
export function ValidationBadge({ validation }: ValidationBadgeProps) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)

  // Invisible inline for clean / unmatched / non-admin (absent) components — no
  // placeholder, no pill: just nothing rendered before the name.
  if (!validation || !hasValidationIssue(validation)) {
    return null
  }

  // hasValidationIssue() guards above, so we only reach here with genuine
  // problems — a failed check never renders a badge (it is a system condition
  // shown once at report level, not a per-component problem).
  const count = validationBadgeCount(validation)
  const label = `${count} validation problem${count === 1 ? '' : 's'}`

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
            className="inline-flex shrink-0 cursor-pointer rounded-sm text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-sm whitespace-normal leading-snug">
          <div className="flex flex-col gap-2">
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
