import { Fragment, useState } from 'react'
import { ChevronDown, ChevronRight, Loader2, RefreshCw } from 'lucide-react'
import { useServiceEvents, type ServiceEventFilter } from '@/hooks/useServiceEvents'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { StatusBanner } from '@/components/ui/status-banner'
import { formatDateTimeShort } from '@/lib/system'
import type { ServiceEvent } from '@/lib/types'

const EVENT_TYPES = ['STARTUP', 'MIGRATION_COMPONENTS', 'MIGRATION_HISTORY', 'TEAMCITY_RESYNC', 'VALIDATION_SWEEP']
const SOURCES = ['crs', 'portal']
const STATUSES = ['RUNNING', 'COMPLETED', 'FAILED']

function statusVariant(status: string): 'success' | 'destructive' | 'info' | 'secondary' {
  switch (status) {
    case 'COMPLETED':
      return 'success'
    case 'FAILED':
      return 'destructive'
    case 'RUNNING':
      return 'info'
    default:
      return 'secondary'
  }
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: string[]
  onChange: (v: string) => void
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {label}
      <select
        className="rounded-md border bg-background px-2 py-1 text-xs text-foreground"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  )
}

/**
 * SYS-060/061: read-only journal of operational service events (redeploys, migrations,
 * TeamCity resync, portal validation sweeps) from both CRS and the portal. Polls every
 * 5s while any row is RUNNING; each row expands to show the raw `detail` payload.
 */
export function ServiceEventsPanel() {
  const [filter, setFilter] = useState<ServiceEventFilter>({})
  const [expanded, setExpanded] = useState<number | null>(null)

  // The hook polls itself while any row is RUNNING (see useServiceEvents).
  const { data, isLoading, isError, error, refetch, isFetching } = useServiceEvents({ filter })

  const events: ServiceEvent[] = data?.content ?? []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <FilterSelect
          label="Type"
          value={filter.eventType ?? ''}
          options={EVENT_TYPES}
          onChange={(v) => setFilter((f) => ({ ...f, eventType: v || undefined }))}
        />
        <FilterSelect
          label="Source"
          value={filter.source ?? ''}
          options={SOURCES}
          onChange={(v) => setFilter((f) => ({ ...f, source: v || undefined }))}
        />
        <FilterSelect
          label="Status"
          value={filter.status ?? ''}
          options={STATUSES}
          onChange={(v) => setFilter((f) => ({ ...f, status: v || undefined }))}
        />
        <Button size="sm" variant="outline" className="ml-auto" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </Button>
      </div>

      {isError && (
        <StatusBanner variant="destructive">
          Failed to load service events: {error instanceof Error ? error.message : String(error)}
        </StatusBanner>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="w-8 px-2 py-2">
                <span className="sr-only">Expand</span>
              </th>
              <th className="px-3 py-2 font-medium">Time</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">Source</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Triggered by</th>
              <th className="px-3 py-2 font-medium">Version</th>
              <th className="px-3 py-2 font-medium">Summary</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                </td>
              </tr>
            )}
            {!isLoading && events.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                  No service events recorded.
                </td>
              </tr>
            )}
            {events.map((e) => {
              const hasDetail = e.detail && Object.keys(e.detail).length > 0
              const isOpen = expanded === e.id
              return (
                <Fragment key={e.id}>
                  <tr className="border-t">
                    {/* Real, keyboard-accessible toggle button (not an onClick on the <tr>). */}
                    <td className="px-2 py-2 align-top">
                      {hasDetail && (
                        <button
                          type="button"
                          className="rounded p-0.5 text-muted-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
                          aria-expanded={isOpen}
                          aria-label={isOpen ? 'Collapse event detail' : 'Expand event detail'}
                          onClick={() => setExpanded(isOpen ? null : e.id)}
                        >
                          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-muted-foreground">
                      {formatDateTimeShort(e.startedAt)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 font-medium">{e.eventType}</td>
                    <td className="px-3 py-2">
                      <Badge variant="outline">{e.source}</Badge>
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={statusVariant(e.status)}>{e.status}</Badge>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{e.triggeredBy ?? '—'}</td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-muted-foreground">
                      {e.serviceVersion || '—'}
                    </td>
                    <td className="px-3 py-2">{e.summary ?? '—'}</td>
                  </tr>
                  {isOpen && hasDetail && (
                    <tr className="border-t bg-muted/20">
                      <td colSpan={8} className="px-3 py-2">
                        <pre className="overflow-x-auto text-xs text-muted-foreground">
                          {JSON.stringify(e.detail, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {data && data.totalElements > events.length && (
        <p className="text-xs text-muted-foreground">
          Showing {events.length} of {data.totalElements}. Narrow with filters above.
        </p>
      )}
    </div>
  )
}
