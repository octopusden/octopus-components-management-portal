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
import { SkeletonTable } from './ui/skeleton-table'
import { AuditDiffViewer } from './AuditDiffViewer'
import type { AuditLogEntry } from '../lib/types'
import { cn } from '../lib/utils'

interface AuditLogTableProps {
  data: AuditLogEntry[]
  isLoading: boolean
}

// Action → semantic Badge variant. CRS emits CREATE/UPDATE/DELETE/RENAME
// (see ComponentManagementServiceImpl + GitHistoryImportServiceImpl).
// MIGRATE/ARCHIVE are intentionally absent — CRS does not emit them.
const ACTION_BADGE_VARIANT: Record<string, BadgeProps['variant']> = {
  CREATE: 'success',
  UPDATE: 'warning',
  DELETE: 'destructive',
  RENAME: 'warning',
}

function formatDate(dateStr: string): string {
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

function diffSummary(entry: AuditLogEntry): string | null {
  if (!entry.changeDiff) return null
  const keys = Object.keys(entry.changeDiff)
  if (keys.length === 0) return null
  if (keys.length <= 3) return keys.join(', ')
  return `${keys.slice(0, 3).join(', ')} +${keys.length - 3} more`
}

export function AuditLogTable({ data, isLoading }: AuditLogTableProps) {
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
            <TableHead>Entity ID</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Changed Fields</TableHead>
          </TableRow>
        </TableHeader>
        {isLoading ? (
          <SkeletonTable rows={5} cols={7} showHeader={false} />
        ) : (
        <TableBody>
          {data.length === 0
            ? (
              <TableRow>
                <TableCell colSpan={7} className="p-0">
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
                        {formatDate(entry.changedAt)}
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
                            {entry.entityId}
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
                    </TableRow>
                    {isExpanded && (
                      <TableRow key={`${entry.id}-diff`}>
                        <TableCell colSpan={7} className="bg-muted/20 p-4">
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
