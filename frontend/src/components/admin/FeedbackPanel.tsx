import { Fragment, useState } from 'react'
import { ChevronDown, ChevronRight, Loader2, RefreshCw } from 'lucide-react'
import {
  feedbackAttachmentUrl,
  useFeedbackList,
  useUpdateFeedbackStatus,
  type FeedbackAdminFilter,
} from '@/hooks/useFeedback'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { StatusBanner } from '@/components/ui/status-banner'
import { cn } from '@/lib/utils'
import { formatDateTimeShort } from '@/lib/system'
import type { FeedbackResponse, FeedbackStatus } from '@/lib/types'

const TYPES = ['BUG', 'IDEA', 'QUESTION']
const STATUSES: FeedbackStatus[] = ['NEW', 'IN_PROGRESS', 'RESOLVED']
const PAGE_SIZE = 20

function statusVariant(status: string): 'success' | 'info' | 'secondary' {
  switch (status) {
    case 'RESOLVED':
      return 'success'
    case 'IN_PROGRESS':
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
 * SYS-062: admin view of user feedback / problem reports. IMPORT_DATA-gated (via the
 * Admin page). Filter by type/status, expand a row to read the full message and view
 * screenshots, and advance the status (NEW → IN_PROGRESS → RESOLVED).
 */
export function FeedbackPanel() {
  const [filter, setFilter] = useState<FeedbackAdminFilter>({})
  const [expanded, setExpanded] = useState<number | null>(null)
  const { data, isLoading, isError, error, refetch, isFetching } = useFeedbackList({
    size: PAGE_SIZE,
    filter,
  })
  const updateStatus = useUpdateFeedbackStatus()

  const items: FeedbackResponse[] = data?.content ?? []
  const total = data?.totalElements ?? 0

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <FilterSelect
          label="Type"
          value={filter.type ?? ''}
          options={TYPES}
          onChange={(v) => setFilter((f) => ({ ...f, type: v || undefined }))}
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
          Failed to load feedback: {error instanceof Error ? error.message : String(error)}
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
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">From</th>
              <th className="px-3 py-2 font-medium">Title</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                </td>
              </tr>
            )}
            {!isLoading && items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                  No feedback yet.
                </td>
              </tr>
            )}
            {items.map((f) => {
              const isOpen = expanded === f.id
              return (
                <Fragment key={f.id}>
                  <tr className="border-t">
                    <td className="px-2 py-2 align-top">
                      <button
                        type="button"
                        className="rounded p-0.5 text-muted-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
                        aria-expanded={isOpen}
                        aria-label={isOpen ? 'Collapse feedback detail' : 'Expand feedback detail'}
                        onClick={() => setExpanded(isOpen ? null : f.id)}
                      >
                        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-muted-foreground">
                      {formatDateTimeShort(f.createdAt)}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant="outline">{f.type}</Badge>
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={statusVariant(f.status)}>{f.status}</Badge>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{f.submittedBy ?? '—'}</td>
                    <td className="px-3 py-2">{f.title ?? '—'}</td>
                  </tr>
                  {isOpen && (
                    <tr className="border-t bg-muted/20">
                      <td colSpan={6} className="px-3 py-3">
                        <FeedbackDetail
                          item={f}
                          onStatus={(status) => updateStatus.mutate({ id: f.id, status })}
                          statusPending={updateStatus.isPending}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {total > items.length && (
        <p className="text-xs text-muted-foreground">
          Showing {items.length} of {total}. Narrow with filters above.
        </p>
      )}
    </div>
  )
}

function FeedbackDetail({
  item,
  onStatus,
  statusPending,
}: {
  item: FeedbackResponse
  onStatus: (status: FeedbackStatus) => void
  statusPending: boolean
}) {
  return (
    <div className="space-y-3">
      <p className="whitespace-pre-wrap text-sm">{item.message}</p>

      {item.attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {item.attachments.map((a) => (
            <a
              key={a.id}
              href={feedbackAttachmentUrl(item.id, a.id)}
              target="_blank"
              rel="noreferrer"
              title={a.filename ?? 'screenshot'}
            >
              <img
                src={feedbackAttachmentUrl(item.id, a.id)}
                alt={a.filename ?? 'screenshot'}
                className="h-24 w-24 rounded border object-cover"
              />
            </a>
          ))}
        </div>
      )}

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {item.pageUrl && (
          <>
            <dt>Page</dt>
            <dd className="break-all">{item.pageUrl}</dd>
          </>
        )}
        {item.appVersion && (
          <>
            <dt>App version</dt>
            <dd>{item.appVersion}</dd>
          </>
        )}
        {item.updatedBy && (
          <>
            <dt>Last updated by</dt>
            <dd>
              {item.updatedBy}
              {item.updatedAt ? ` · ${formatDateTimeShort(item.updatedAt)}` : ''}
            </dd>
          </>
        )}
      </dl>

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Set status:</span>
        {STATUSES.map((s) => (
          <Button
            key={s}
            size="sm"
            variant={item.status === s ? 'default' : 'outline'}
            disabled={statusPending || item.status === s}
            onClick={() => onStatus(s)}
            className={cn('text-xs')}
          >
            {s}
          </Button>
        ))}
      </div>
    </div>
  )
}
