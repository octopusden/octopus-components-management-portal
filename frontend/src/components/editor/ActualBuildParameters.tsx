import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Badge } from '../ui/badge'
import { formatVersionRange } from '../../lib/versionRange'
import { dedupeActualDisagreements } from '../../lib/registeredBuildParameters'
import type { ActualRange, ActualDisagreement } from '../../lib/types'

interface ActualBuildParametersProps {
  ranges: ActualRange[]
  warnings: ActualDisagreement[]
  /** CRS reports this once per component, not per attribute — pass it for one attribute only. */
  actualDataUnavailable?: boolean
}

/**
 * Read-only RMS-registered ("ACTUAL") data for one build attribute
 * (`javaVersion` or `mavenVersion`). Never adds an edit affordance and never
 * affects the editability of the configured value it's rendered alongside.
 */
export function ActualBuildParameters({ ranges, warnings, actualDataUnavailable }: ActualBuildParametersProps) {
  const [expanded, setExpanded] = useState(false)

  if (actualDataUnavailable) {
    return (
      <div
        className="mt-1 flex items-center gap-1 rounded-md border border-[color:var(--color-badge-yellow-fg)]/30 bg-[color:var(--color-badge-yellow-bg)]/50 px-2 py-1 text-xs text-[color:var(--color-badge-yellow-fg)]"
        role="alert"
      >
        <AlertTriangle className="h-3 w-3" aria-hidden="true" />
        Registered build data unavailable
      </div>
    )
  }

  const disagreements = dedupeActualDisagreements(warnings)
  if (ranges.length === 0 && disagreements.length === 0) return null

  return (
    <div className="mt-1 space-y-1">
      {ranges.length > 0 && (
        <div className="text-xs text-muted-foreground">Registered by builds</div>
      )}
      {ranges.map((r, i) => (
        <div key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Badge variant="outline" className="text-xs font-mono h-5 px-1.5">
            {formatVersionRange(r.versionRange)}
          </Badge>
          <span>&rarr;</span>
          <span>{r.value}</span>
        </div>
      ))}

      {disagreements.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="inline-flex items-center gap-1 text-xs text-destructive hover:underline"
          >
            <AlertTriangle className="h-3 w-3" aria-hidden="true" />
            {disagreements.length === 1
              ? '1 range differs from the registered version'
              : `${disagreements.length} ranges differ from the registered version`}
          </button>
          {expanded && (
            <ul className="ml-4">
              {disagreements.map((w, i) => (
                <li key={i} className="flex items-center gap-1.5 text-xs text-destructive">
                  <span>{formatVersionRange(w.subRange)}</span>
                  <span>&rarr;</span>
                  <span>{w.actualValue}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
