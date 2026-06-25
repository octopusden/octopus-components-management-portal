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
 * Only genuine, actionable problems are rendered. A failed check
 * (`checkFailed`) is NOT shown here — it is a system condition (we could not
 * verify the component, e.g. a downstream service was briefly unreachable),
 * surfaced once at report level on the list page, never as a per-component
 * problem. No host/URL or raw exception text is shown anywhere.
 */
export function ValidationProblemsList({ validation }: ValidationProblemsListProps) {
  return (
    <div className="flex flex-col gap-4">
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
