import { Badge } from './ui/badge'
import type { ComponentValidation } from '../lib/types'
import { problemExampleVersions } from '../lib/validation'

interface ValidationProblemsListProps {
  validation: ComponentValidation
}

/**
 * The FULL, untruncated rendering of a component's validation problems — shared
 * by the badge's "see all" dialog and the detail page's Validation Problems
 * section. Unlike the badge tooltip (a glance affordance capped at a few example
 * versions with a "+N more" line), this lists EVERY problem and its COMPLETE
 * `details.versions` array in a scrollable monospace block.
 *
 * A failed check (`checkFailed`) is surfaced as its own "Check failed" block —
 * NOT silently rendered as clean — so a component we could not verify reads
 * honestly. No host/URL is shown: only versions, messages, severity and type.
 */
export function ValidationProblemsList({ validation }: ValidationProblemsListProps) {
  return (
    <div className="flex flex-col gap-4">
      {validation.checkFailed && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
          <div className="font-semibold">Check failed</div>
          <p className="text-sm text-muted-foreground">
            This component could not be verified — the result is not a clean pass.
          </p>
          {validation.checkError && (
            <p className="mt-1 text-xs font-mono opacity-90">{validation.checkError}</p>
          )}
        </div>
      )}

      {validation.problems.map((p, i) => {
        const versions = problemExampleVersions(p)
        return (
          <div key={`${p.type}-${i}`} className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={p.severity === 'WARNING' ? 'warning' : 'destructive'}>
                {p.severity}
              </Badge>
              <span className="text-xs font-mono text-muted-foreground">{p.type}</span>
            </div>
            <div className="font-medium">{p.message}</div>
            {versions.length > 0 && (
              <pre className="max-h-64 overflow-auto rounded-md border bg-muted/30 p-3 font-mono text-xs leading-relaxed">
                <code>
                  {versions.map((v, j) => (
                    <span key={`${i}-${j}-${v}`} className="block">
                      {v}
                    </span>
                  ))}
                </code>
              </pre>
            )}
          </div>
        )
      })}
    </div>
  )
}
