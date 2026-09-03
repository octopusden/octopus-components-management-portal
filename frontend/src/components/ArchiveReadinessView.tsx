import { RefreshCw } from 'lucide-react'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { StatusBanner } from './ui/status-banner'
import { InlineError } from './ui/inline-error'
import { SkeletonBlock } from './ui/skeleton-block'
import {
  targetKindLabel,
  failedReasonFor,
  unknownWordingFor,
  sharedTargetCount,
  issueTrackerUrl,
} from '../lib/archiveReadiness'
import type { ArchiveReadinessEntry, ArchiveReadinessResponse } from '../lib/types'

export interface ArchiveReadinessViewProps {
  isLoading: boolean
  isError: boolean
  data: ArchiveReadinessResponse | undefined
  onRetry: () => void
  /** Base URL for the issue tracker; undefined/empty when unconfigured — open issues still list, without links. */
  jiraBaseUrl?: string
}

/**
 * Presents CRS's archive-readiness answer for a component: per-target rows,
 * the shared-target summary, and the states around the answer itself
 * (loading, request failure, "nothing was checked"). Purely presentational —
 * gating whether Archive can be confirmed reads `data.ready` at the call
 * site (ComponentDetailPage), not this component (design.md decision 2).
 *
 * Modelled on TeamCityValidationsTab's per-finding card layout.
 */
export function ArchiveReadinessView({ isLoading, isError, data, onRetry, jiraBaseUrl }: ArchiveReadinessViewProps) {
  if (isLoading) {
    return (
      <div data-testid="archive-readiness-loading" className="space-y-3">
        <SkeletonBlock height="h-16" />
        <SkeletonBlock height="h-16" />
        <SkeletonBlock height="h-16" />
      </div>
    )
  }

  if (isError) {
    return (
      <div data-testid="archive-readiness-request-error">
        <InlineError message="Could not check whether this component is ready to archive. Try again." />
      </div>
    )
  }

  if (!data) return null

  const { entries } = data
  const sharedCount = sharedTargetCount(entries)

  if (entries.length === 0) {
    return (
      <StatusBanner data-testid="archive-readiness-no-checks" variant="info">
        No archive-readiness checks ran for this component — nothing configured on the registry
        side covers it.
      </StatusBanner>
    )
  }

  return (
    <div className="space-y-4">
      {/* Summary line only when MORE THAN ONE target was left as-is — a single one is
          already visible in its own row and doesn't need restating (spec.md scenario
          "One such entry produces no summary line"). */}
      {sharedCount > 1 && (
        <StatusBanner data-testid="archive-readiness-shared-summary" variant="info">
          {sharedCount} targets were not required to be archived, because other live components
          still use them.
        </StatusBanner>
      )}
      <div className="space-y-3">
        {entries.map((entry, i) => (
          <ArchiveReadinessEntryRow
            // No stable server id on this shape — index-prefixed key, same as TeamCityValidationsTab.
            key={`${i}-${entry.targetKind}-${entry.targetId}`}
            entry={entry}
            jiraBaseUrl={jiraBaseUrl}
            onRetry={onRetry}
          />
        ))}
      </div>
    </div>
  )
}

function outcomeTone(entry: ArchiveReadinessEntry): 'success' | 'destructive' | 'warning' {
  if (entry.outcome === 'PASSED') return 'success'
  if (entry.outcome === 'UNKNOWN') return 'warning'
  return 'destructive'
}

function ArchiveReadinessEntryRow({
  entry,
  jiraBaseUrl,
  onRetry,
}: {
  entry: ArchiveReadinessEntry
  jiraBaseUrl?: string
  onRetry: () => void
}) {
  const shared = entry.outcome === 'PASSED' && entry.sharedWith.length > 0
  const unknown = entry.outcome === 'UNKNOWN' ? unknownWordingFor(entry.reasonKind) : null

  return (
    <div
      data-testid="archive-readiness-entry"
      data-outcome={entry.outcome}
      className="rounded-md border p-4 space-y-2.5"
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium text-muted-foreground">{targetKindLabel(entry.targetKind)}</span>
        <span className="text-sm font-mono">{entry.targetId}</span>
        <Badge variant={outcomeTone(entry)} className="uppercase tracking-wide">
          {entry.outcome}
        </Badge>
      </div>

      {entry.outcome === 'PASSED' && !shared && entry.reason && (
        <p className="text-sm text-muted-foreground">{entry.reason}</p>
      )}

      {shared && (
        <p className="text-sm text-muted-foreground">
          Not required to be archived — also used by {entry.sharedWith.join(', ')}.
        </p>
      )}

      {entry.outcome === 'FAILED' && (
        <p className="text-sm text-destructive">{entry.reason ?? failedReasonFor(entry.targetKind)}</p>
      )}

      {unknown && (
        <div className="flex items-center gap-3 flex-wrap">
          <p className="text-sm text-[color:var(--color-badge-yellow-fg)]">{entry.reason ?? unknown.message}</p>
          {unknown.retryable && (
            <Button variant="outline" size="sm" onClick={onRetry}>
              <RefreshCw className="h-3.5 w-3.5" />
              Retry
            </Button>
          )}
        </div>
      )}

      {entry.openIssues.length > 0 && (
        <ul className="space-y-1 pl-1">
          {entry.openIssues.map((issue) => {
            const url = issueTrackerUrl(jiraBaseUrl, issue.key)
            return (
              <li key={issue.key} className="text-sm">
                {url ? (
                  <a href={url} target="_blank" rel="noopener noreferrer" className="font-mono text-primary hover:underline">
                    {issue.key}
                  </a>
                ) : (
                  <span className="font-mono">{issue.key}</span>
                )}
                {' — '}
                <span>{issue.summary}</span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
