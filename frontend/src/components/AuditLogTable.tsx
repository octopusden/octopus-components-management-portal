import React, { useState } from 'react'
import { Link } from 'react-router'
import { ChevronDown, ChevronRight } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table'
import { Badge } from './ui/badge'
import type { BadgeProps } from './ui/badge'
import { Button } from './ui/button'
import { EmptyState } from './ui/empty-state'
import { RelativeTime } from './ui/RelativeTime'
import { SkeletonTable } from './ui/skeleton-table'
import { AuditDiffViewer } from './AuditDiffViewer'
import type { AuditLogEntry } from '../lib/types'
import { cn } from '../lib/utils'

interface AuditLogTableProps {
  data: AuditLogEntry[]
  isLoading: boolean
  /**
   * Sanitized Jira base URL (from `usePortalLinks`). When present, the Task
   * column renders `jiraTaskKey` as a link to `{base}/browse/{key}`; otherwise
   * the key is shown as plain text. Optional so the presentational table needs
   * no QueryClient in tests.
   */
  jiraBaseUrl?: string | null
}

const COLUMN_COUNT = 9

// Action → semantic Badge variant. CRS emits CREATE/UPDATE/DELETE/RENAME
// (see ComponentManagementServiceImpl) and MIGRATED for the git-history
// baseline (GitHistoryImportServiceImpl, SYS-049). MIGRATED gets the muted
// `secondary` variant — it is migration noise, hidden by default and only
// shown via the "Show migration" toggle.
const ACTION_BADGE_VARIANT: Record<string, BadgeProps['variant']> = {
  CREATE: 'success',
  UPDATE: 'warning',
  DELETE: 'destructive',
  RENAME: 'warning',
  MIGRATED: 'secondary',
}

/**
 * Full date-and-time tooltip for the When column. Audit entries can repeat
 * within a single day, so the precise instant (down to seconds) is kept one
 * hover away — the RelativeTime default (date-only) would collapse same-day
 * rows to the same tooltip. Falls back to the raw string on a parse error.
 */
function formatTimestamp(dateStr: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date(dateStr))
  } catch {
    return dateStr
  }
}

/**
 * The audit `entityId` is the component's UUID, not a human-readable key, so
 * we resolve a display key and keep the UUID only for routing.
 *
 * Resolution order, most to least authoritative:
 *  1. `entry.componentKey` — server-resolved (CRS AuditLogResponse). The only
 *     source that covers field-override rows (whose snapshot carries no key at
 *     all) and is correct for deleted components.
 *  2. value-snapshot `name` — component CREATE/UPDATE/DELETE/RENAME snapshots.
 *     `newValue` first (current key, and the post-rename name), then `oldValue`
 *     for DELETE rows where the new snapshot is null.
 *  3. value-snapshot `moduleName` — git-history (MIGRATED) snapshots key the
 *     component under `moduleName`, not `name`.
 *
 * Returns null when nothing usable is present so the caller can fall back to
 * the UUID. Fallbacks 2–3 keep older rows / a pre-field CRS readable.
 */
function componentKey(entry: AuditLogEntry): string | null {
  const candidates = [
    entry.componentKey,
    entry.newValue?.name,
    entry.oldValue?.name,
    entry.newValue?.moduleName,
    entry.oldValue?.moduleName,
  ]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate) return candidate
  }
  return null
}

function diffSummary(entry: AuditLogEntry): string | null {
  if (!entry.changeDiff) return null
  const keys = Object.keys(entry.changeDiff)
  if (keys.length === 0) return null
  if (keys.length <= 3) return keys.join(', ')
  return `${keys.slice(0, 3).join(', ')} +${keys.length - 3} more`
}

export function AuditLogTable({ data, isLoading, jiraBaseUrl }: AuditLogTableProps) {
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const toggleExpand = (id: number) => {
    setExpandedId((prev) => (prev === id ? null : id))
  }

  // Loading state keeps the real TableHeader (column widths must match
  // post-load) and only replaces the body rows via SkeletonTable.
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8" />
            <TableHead>Who</TableHead>
            <TableHead>When</TableHead>
            <TableHead>Entity Type</TableHead>
            <TableHead>Component Key</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Changed Fields</TableHead>
            <TableHead>Task</TableHead>
            <TableHead>Comment</TableHead>
          </TableRow>
        </TableHeader>
        {isLoading ? (
          <SkeletonTable rows={5} cols={COLUMN_COUNT} showHeader={false} />
        ) : (
        <TableBody>
          {data.length === 0
            ? (
              <TableRow>
                <TableCell colSpan={COLUMN_COUNT} className="p-0">
                  <EmptyState message="No audit log entries found." />
                </TableCell>
              </TableRow>
            )
            : data.map((entry) => {
                const isExpanded = expandedId === entry.id
                const summary = diffSummary(entry)
                const actionVariant = ACTION_BADGE_VARIANT[entry.action] ?? 'secondary'

                return (
                  <React.Fragment key={entry.id}>
                    <TableRow
                      className={cn('cursor-pointer', isExpanded && 'bg-muted/40')}
                      onClick={() => toggleExpand(entry.id)}
                    >
                      <TableCell className="pr-0">
                        <Button variant="ghost" size="icon" className="h-6 w-6" tabIndex={-1}>
                          {isExpanded
                            ? <ChevronDown className="h-4 w-4" />
                            : <ChevronRight className="h-4 w-4" />
                          }
                        </Button>
                      </TableCell>
                      <TableCell className="font-medium">
                        {entry.changedBy ?? <span className="text-muted-foreground italic">system</span>}
                      </TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        <RelativeTime
                          ts={entry.changedAt}
                          title={formatTimestamp(entry.changedAt)}
                        />
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                          {entry.entityType}
                        </span>
                      </TableCell>
                      <TableCell>
                        {entry.entityType === 'Component' ? (
                          <Link
                            to={`/components/${entry.entityId}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {componentKey(entry) ?? entry.entityId}
                          </Link>
                        ) : (
                          <span className="font-mono text-xs">{entry.entityId}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={actionVariant}>{entry.action}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {summary ?? '—'}
                      </TableCell>
                      <TableCell className="text-xs">
                        {entry.jiraTaskKey && jiraBaseUrl && (
                          <a
                            href={`${jiraBaseUrl}/browse/${entry.jiraTaskKey}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-primary hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {entry.jiraTaskKey}
                          </a>
                        )}
                        {entry.jiraTaskKey && !jiraBaseUrl && (
                          <span className="font-mono">{entry.jiraTaskKey}</span>
                        )}
                      </TableCell>
                      <TableCell
                        className="max-w-[220px] truncate text-xs text-muted-foreground"
                        title={entry.changeComment ?? undefined}
                      >
                        {entry.changeComment}
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow key={`${entry.id}-diff`}>
                        <TableCell colSpan={COLUMN_COUNT} className="bg-muted/20 p-4">
                          {entry.changeComment && (
                            <div className="text-xs text-muted-foreground mb-3">
                              Comment:{' '}
                              <span className="text-foreground whitespace-pre-wrap">{entry.changeComment}</span>
                            </div>
                          )}
                          {entry.correlationId && (
                            <div className="text-xs text-muted-foreground mb-3">
                              Correlation ID:{' '}
                              <span className="font-mono">{entry.correlationId}</span>
                            </div>
                          )}
                          <AuditDiffViewer entry={entry} />
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                )
              })}
        </TableBody>
        )}
      </Table>
    </div>
  )
}
