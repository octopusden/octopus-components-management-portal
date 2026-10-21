import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useAdminMode } from '@/lib/adminModeStore'
import { useHistoryMigrationJob, useMigrationJob } from '@/hooks/useMigration'
import { useTeamCityResyncJob } from '@/hooks/useTeamCityResync'
import { useTeamCityValidationJob } from '@/hooks/useTeamCityValidation'
import {
  useCheckoutLayoutDiffJob,
  useCheckoutLayoutDiffReport,
  useCheckoutLayoutSyncJob,
  useRunCheckoutLayoutDiff,
  useRunCheckoutLayoutSync,
} from '@/hooks/useTeamCityCheckoutLayout'
import { API_BASE } from '@/lib/api'
import { formatLocalDateTime } from '@/lib/date'
import { formatMigrationError } from '@/lib/migrationErrors'
import { isDiffReplacedConflict } from '@/lib/migrationConflict'
import { buildProposedChangeLines, countChangedFields, summarizeKeys } from '@/lib/checkoutLayoutRows'
import { PLACEMENT_STATUS_BUCKETS, checkoutLayoutStatusInfo, type CheckoutLayoutStatusBucket } from '@/lib/checkoutLayoutStatus'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RelativeTime } from '@/components/ui/RelativeTime'
import { StatusBanner } from '@/components/ui/status-banner'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { StatCard } from './StatCard'
import type {
  CheckoutLayoutRowDiff,
  TeamcityCheckoutLayoutDiffJobResponse,
  TeamcityCheckoutLayoutSyncJobResponse,
} from '@/lib/types'

// The default view (no bucket picked, "Show all" off) — everything that
// might need an operator's attention, without the "can't derive" /
// "nothing to do" noise.
const DEFAULT_BUCKETS: CheckoutLayoutStatusBucket[] = ['ready', 'needsLook']
const ALL_BUCKET_IDS: CheckoutLayoutStatusBucket[] = PLACEMENT_STATUS_BUCKETS.map((b) => b.id)

/** Only a RESOLVED row has something Sync can write. */
const isReady = (row: CheckoutLayoutRowDiff) => row.status === 'RESOLVED'

/** The changed fields, one per line; "no change" for a derived row with none; empty for a report-only row. */
function ProposedChangeCell({ row }: { row: CheckoutLayoutRowDiff }) {
  const lines = buildProposedChangeLines(row)
  if (lines.length > 0) {
    return (
      <ul className="space-y-0.5 text-xs">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    )
  }
  if (checkoutLayoutStatusInfo(row.status).derived) return <span className="text-xs text-muted-foreground">no change</span>
  return null
}

/** Status badge — human label, raw code as the tooltip so it cross-references the CSV/HTML report. */
function StatusChip({ status }: { status: string }) {
  const { tone, label } = checkoutLayoutStatusInfo(status)
  return (
    <Badge variant={tone} title={status}>
      {label}
    </Badge>
  )
}

function CheckoutLayoutRow({
  row,
  checked,
  onToggle,
}: {
  row: CheckoutLayoutRowDiff
  checked: boolean
  onToggle: (componentId: string, checked: boolean) => void
}) {
  return (
    <TableRow>
      <TableCell>
        <label className="flex items-center gap-2 font-medium">
          <input
            type="checkbox"
            aria-label={`Select ${row.componentKey}`}
            checked={checked}
            disabled={!isReady(row)}
            onChange={(e) => onToggle(row.componentId, e.target.checked)}
            className="h-4 w-4 rounded border-input accent-primary disabled:cursor-not-allowed disabled:opacity-50"
          />
          {row.componentKey}
        </label>
      </TableCell>
      <TableCell>
        <StatusChip status={row.status} />
      </TableCell>
      <TableCell>
        <ProposedChangeCell row={row} />
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">{row.notes.join('; ')}</TableCell>
    </TableRow>
  )
}

/** The pulsing progress block shown while a job runs. */
function JobProgress({ testId, message }: { testId: string; message: string }) {
  return (
    <div data-testid={testId} className="rounded-md border bg-card p-3 space-y-2 text-sm" aria-busy="true" aria-live="polite">
      <div className="font-medium">{message}</div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-primary/60 animate-pulse" />
      </div>
    </div>
  )
}

/** The other async job kind that is running, if any, for the "wait for it" hint. */
function describeOtherRunningJob(running: {
  components: boolean
  history: boolean
  resync: boolean
  validation: boolean
}): string | null {
  if (running.components) return 'Components migration'
  if (running.history) return 'History migration'
  if (running.resync) return 'TeamCity sync'
  if (running.validation) return 'TC validation'
  return null
}

/** Run Diff button, its progress block and its failure banners. */
function CheckoutLayoutDiffControls({
  adminMode,
  disabled,
  pending,
  onRequestRun,
  otherRunningLabel,
  job,
  startError,
}: {
  adminMode: boolean
  disabled: boolean
  pending: boolean
  onRequestRun: () => void
  /** The other admin job that is running, if any. */
  otherRunningLabel: string | null
  job: TeamcityCheckoutLayoutDiffJobResponse | null
  startError: unknown
}) {
  const running = job?.state === 'RUNNING'
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant={adminMode ? 'destructive' : 'default'}
          onClick={onRequestRun}
          disabled={disabled}
          aria-busy={running || pending}
        >
          {(running || pending) && <Loader2 className="animate-spin" aria-hidden="true" />}
          {running ? 'Running Diff…' : pending ? 'Starting…' : 'Run Diff'}
        </Button>
        {!adminMode && (
          <span className="text-xs text-muted-foreground">Arm Admin mode above to run Diff or Sync.</span>
        )}
        {adminMode && otherRunningLabel && !running && (
          <span className="text-xs text-muted-foreground">{otherRunningLabel} is running — wait for it to finish.</span>
        )}
        {job?.finishedAt && !running && (
          <span className="ml-auto text-xs text-muted-foreground">
            Last run <RelativeTime ts={job.finishedAt} />
          </span>
        )}
      </div>

      {running && (
        <JobProgress
          testId="tc-checkout-layout-diff-progress"
          message="Deriving checkout layout from TeamCity for every in-scope component…"
        />
      )}
      {job?.state === 'FAILED' && job.errorMessage && (
        <StatusBanner variant="destructive">Diff failed: {job.errorMessage}</StatusBanner>
      )}
      {startError != null && <StatusBanner variant="destructive">{formatMigrationError(startError)}</StatusBanner>}
    </>
  )
}

/**
 * Clickable bucket counts, a "Show all (N)" toggle, "Report from <local
 * time>", and the Diff report links — all next to the table they describe.
 */
function CheckoutLayoutSummaryBar({
  bucketCounts,
  totalCount,
  bucketFilter,
  showAll,
  onToggleBucket,
  onToggleShowAll,
  reportGeneratedAt,
}: {
  bucketCounts: Record<CheckoutLayoutStatusBucket, number>
  totalCount: number
  bucketFilter: CheckoutLayoutStatusBucket | null
  showAll: boolean
  onToggleBucket: (bucket: CheckoutLayoutStatusBucket) => void
  onToggleShowAll: () => void
  reportGeneratedAt: string | null
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      {PLACEMENT_STATUS_BUCKETS.map(({ id, label }) => (
        <Button
          key={id}
          type="button"
          variant="outline"
          size="sm"
          aria-pressed={bucketFilter === id}
          className={bucketFilter === id ? 'bg-accent' : ''}
          onClick={() => onToggleBucket(id)}
        >
          {label} ({bucketCounts[id]})
        </Button>
      ))}
      <Button type="button" variant="ghost" size="sm" aria-pressed={showAll} onClick={onToggleShowAll}>
        Show all ({totalCount})
      </Button>
      <span className="text-xs text-muted-foreground">Report from {formatLocalDateTime(reportGeneratedAt)}</span>
      <a
        href={`${API_BASE}/admin/teamcity-checkout-layout/diff/report.html`}
        target="_blank"
        rel="noopener noreferrer"
        className="ml-auto text-primary hover:underline"
      >
        Open report (HTML)
      </a>
      <a href={`${API_BASE}/admin/teamcity-checkout-layout/diff/report.csv`} className="text-primary hover:underline">
        Download CSV
      </a>
    </div>
  )
}

/**
 * The report table area: empty states for "no report yet" / "no in-scope
 * rows" / "nothing needs attention" / "no rows match the filters", else one
 * table row per component.
 */
function CheckoutLayoutResultsArea({
  hasReport,
  totalRows,
  textFilteredCount,
  visibleRows,
  isDefaultView,
  onShowAll,
  selected,
  onToggleComponent,
}: {
  hasReport: boolean
  totalRows: number
  textFilteredCount: number
  visibleRows: CheckoutLayoutRowDiff[]
  isDefaultView: boolean
  onShowAll: () => void
  selected: Set<string>
  onToggleComponent: (componentId: string, checked: boolean) => void
}) {
  if (!hasReport) {
    return (
      <EmptyState
        message="Run Diff to see the current TeamCity ↔ CRS checkout layout report. Where TeamCity checks out each VCS root (Checkout Directory / Source Path) and where it builds (Build Working Directory)."
        className="py-8"
      />
    )
  }
  if (totalRows === 0) {
    return <EmptyState message="The latest Diff found no in-scope rows." className="py-8" />
  }
  if (visibleRows.length === 0) {
    if (isDefaultView && textFilteredCount > 0) {
      return (
        <EmptyState
          message={
            <>
              All {textFilteredCount} components in sync — nothing to do.{' '}
              <button type="button" className="text-primary hover:underline" onClick={onShowAll}>
                Show all ({textFilteredCount})
              </button>
            </>
          }
          className="py-8"
        />
      )
    }
    return <EmptyState message="No rows match these filters." className="py-8" />
  }
  return (
    <div className="rounded-md border max-h-[28rem] overflow-y-auto">
      <Table className="table-fixed">
        <TableHeader className="sticky top-0 z-10 bg-background">
          <TableRow>
            <TableHead>Component</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Proposed change</TableHead>
            <TableHead>Note</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visibleRows.map((row) => (
            <CheckoutLayoutRow
              key={row.configurationRowId}
              row={row}
              checked={selected.has(row.componentId)}
              onToggle={onToggleComponent}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

/**
 * Sync button, its progress block and failure banners, and the COMPLETED
 * result summary (counts, per-component outcomes, rollback CSV link).
 */
function CheckoutLayoutSyncControls({
  adminMode,
  disabled,
  blockedReason,
  pending,
  onRequestRun,
  selectedCount,
  notice,
  job,
  startError,
}: {
  adminMode: boolean
  disabled: boolean
  blockedReason: string | null
  pending: boolean
  onRequestRun: () => void
  selectedCount: number
  notice: string | null
  job: TeamcityCheckoutLayoutSyncJobResponse | null
  startError: unknown
}) {
  const running = job?.state === 'RUNNING'
  const result = job?.state === 'COMPLETED' ? job.result : null
  return (
    <>
      <div className="flex flex-wrap items-center gap-3 border-t pt-4">
        <Button
          type="button"
          variant={adminMode ? 'destructive' : 'default'}
          onClick={onRequestRun}
          disabled={disabled}
          aria-busy={running || pending}
        >
          {(running || pending) && <Loader2 className="animate-spin" aria-hidden="true" />}
          {running ? 'Syncing…' : pending ? 'Starting…' : `Sync selected (${selectedCount})`}
        </Button>
        {blockedReason && <span className="text-xs text-muted-foreground">{blockedReason}</span>}
        {job?.finishedAt && !running && (
          <span className="text-xs text-muted-foreground">
            Last sync <RelativeTime ts={job.finishedAt} />
          </span>
        )}
      </div>

      {notice && <StatusBanner variant="warning">{notice}</StatusBanner>}
      {running && (
        <JobProgress
          testId="tc-checkout-layout-sync-progress"
          message="Writing the selected rows through the registry write path…"
        />
      )}
      {job?.state === 'FAILED' && job.errorMessage && (
        <StatusBanner variant="destructive">Sync failed: {job.errorMessage}</StatusBanner>
      )}
      {startError != null && <StatusBanner variant="destructive">{formatMigrationError(startError)}</StatusBanner>}

      {result && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            <StatCard label="Requested" value={result.requested} />
            <StatCard label="Applied" value={result.applied} />
            <StatCard label="Skipped" value={result.skipped} />
            <StatCard label="Failed" value={result.failed} />
          </div>
          <details className="rounded-md border p-3 text-sm">
            <summary className="cursor-pointer font-medium">
              Results ({result.components.length} component
              {result.components.length === 1 ? '' : 's'})
            </summary>
            <ul className="mt-2 space-y-1 text-xs">
              {result.components.map((c) => (
                <li key={c.componentId}>
                  <span className="font-medium">{c.componentKey}</span>:{' '}
                  {c.rows.map((r) => r.outcome).join(', ')}
                </li>
              ))}
            </ul>
          </details>
          <a
            href={`${API_BASE}/admin/teamcity-checkout-layout/sync/report.csv`}
            className="text-sm text-primary hover:underline"
          >
            Download rollback trace (CSV)
          </a>
        </div>
      )}
    </>
  )
}

/**
 * Admin panel for the TeamCity -> CRS VCS checkout-layout Diff/Sync jobs. Mirrors
 * TeamCityResyncPanel/TeamCityValidationPanel's async-job pattern for Run Diff,
 * plus a filterable result table (one row per component) and a second async job
 * (Sync) that writes the selection back through CRS.
 *
 * ponytail: this panel cross-disables against the other four admin job panels,
 * but they don't yet cross-disable against Diff/Sync (they'd need the same two
 * extra hook reads apiece). Clicking one of them while a Diff/Sync runs still
 * works safely — the shared MigrationLifecycleGate answers 409 and
 * formatMigrationError renders it — it just isn't greyed out in advance.
 */
export function TeamCityCheckoutLayoutPanel() {
  const diffJob = useCheckoutLayoutDiffJob()
  const diffJobData = diffJob.data ?? null
  const diffRunning = diffJobData?.state === 'RUNNING'
  const startDiff = useRunCheckoutLayoutDiff()

  const report = useCheckoutLayoutDiffReport()
  const rows = useMemo(
    () => [...(report.data?.rows ?? [])].sort((a, b) => a.componentKey.localeCompare(b.componentKey)),
    [report.data],
  )

  const syncJob = useCheckoutLayoutSyncJob()
  const syncJobData = syncJob.data ?? null
  const syncRunning = syncJobData?.state === 'RUNNING'
  const startSync = useRunCheckoutLayoutSync()

  const adminMode = useAdminMode((s) => s.enabled)
  const [confirmDiffOpen, setConfirmDiffOpen] = useState(false)
  const [confirmSyncOpen, setConfirmSyncOpen] = useState(false)
  const [bucketFilter, setBucketFilter] = useState<CheckoutLayoutStatusBucket | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [textFilter, setTextFilter] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [syncNotice, setSyncNotice] = useState<string | null>(null)

  // Cross-disable against the other four async job kinds — all six share one
  // MigrationLifecycleGate slot on the backend.
  const otherRunningLabel = describeOtherRunningJob({
    components: useMigrationJob().data?.state === 'RUNNING',
    history: useHistoryMigrationJob().data?.state === 'RUNNING',
    resync: useTeamCityResyncJob().data?.state === 'RUNNING',
    validation: useTeamCityValidationJob().data?.state === 'RUNNING',
  })

  // CRS serves the report from the last COMPLETED run even while a newer Diff
  // is running or has failed, so the report's own diffId is the source of
  // truth: Sync only when the latest Diff job is the one that produced it.
  const isReportCurrent =
    !!report.data?.diffId && diffJobData?.state === 'COMPLETED' && diffJobData.id === report.data.diffId
  // A new report, or a newer Diff job (this client's or another admin's), makes
  // the selection stale: drop it so Sync is never asked to act on old rows.
  useEffect(() => {
    setSelected(new Set())
  }, [isReportCurrent, report.data?.diffId])

  const textFilteredRows = useMemo(
    () =>
      textFilter
        ? rows.filter((row) => row.componentKey.toLowerCase().includes(textFilter.toLowerCase()))
        : rows,
    [rows, textFilter],
  )

  const bucketCounts = useMemo(() => {
    const counts: Record<CheckoutLayoutStatusBucket, number> = { ready: 0, needsLook: 0, cantDerive: 0, nothingToDo: 0 }
    for (const row of textFilteredRows) counts[checkoutLayoutStatusInfo(row.status).bucket] += 1
    return counts
  }, [textFilteredRows])

  const isDefaultView = bucketFilter === null && !showAll
  const visibleRows = useMemo(() => {
    const visibleBuckets = bucketFilter ? [bucketFilter] : showAll ? ALL_BUCKET_IDS : DEFAULT_BUCKETS
    return textFilteredRows.filter((row) => visibleBuckets.includes(checkoutLayoutStatusInfo(row.status).bucket))
  }, [textFilteredRows, bucketFilter, showAll])

  const readyRows = visibleRows.filter(isReady)
  const allReadySelected = readyRows.length > 0 && readyRows.every((r) => selected.has(r.componentId))
  const someReadySelected = selected.size > 0 && !allReadySelected

  // React has no `indeterminate` prop for a native checkbox — it's a DOM-only
  // property, set imperatively so a partial selection doesn't read
  // identically to "none selected" for screen-reader / assistive-tech users.
  const selectAllRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someReadySelected
  }, [someReadySelected])

  function toggleComponent(componentId: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) next.add(componentId)
      else next.delete(componentId)
      return next
    })
  }

  function toggleSelectAllReady(checked: boolean) {
    setSelected(checked ? new Set(readyRows.map((r) => r.componentId)) : new Set())
  }

  function toggleBucket(bucket: CheckoutLayoutStatusBucket) {
    setBucketFilter((prev) => (prev === bucket ? null : bucket))
  }

  function toggleShowAll() {
    setShowAll((prev) => !prev)
    setBucketFilter(null)
  }

  async function runDiff() {
    setConfirmDiffOpen(false)
    await startDiff.mutateAsync().catch(() => undefined)
  }

  async function runSync() {
    setConfirmSyncOpen(false)
    setSyncNotice(null)
    // The report's own id, not /diff/job's: the selection was made from these rows,
    // and CRS refuses the Sync if a newer Diff has replaced them.
    const diffId = report.data?.diffId
    if (!diffId) return
    try {
      await startSync.mutateAsync({ diffId, componentIds: [...selected] })
    } catch (err) {
      if (isDiffReplacedConflict(err)) {
        setSyncNotice('The Diff was replaced — re-run Diff.')
        setSelected(new Set())
      }
    }
  }

  const diffButtonDisabled = !adminMode || diffRunning || startDiff.isPending || !!otherRunningLabel || syncRunning
  const syncBlockedReason =
    diffRunning || !report.data?.diffId || !diffJobData || isReportCurrent
      ? null
      : diffJobData.state === 'FAILED'
        ? 'The latest Diff failed — the report shown is from the previous run; re-run Diff to sync.'
        : 'The report shown is not from the latest Diff; re-run Diff to sync.'
  const syncButtonDisabled =
    !adminMode ||
    syncRunning ||
    startSync.isPending ||
    !!otherRunningLabel ||
    diffRunning ||
    selected.size === 0 ||
    !isReportCurrent

  const selectedKeys = rows.filter((r) => selected.has(r.componentId)).map((r) => r.componentKey)
  const changedFieldCount = countChangedFields(rows, selected)

  return (
    <div className="space-y-4">
      <CheckoutLayoutDiffControls
        adminMode={adminMode}
        disabled={diffButtonDisabled}
        pending={startDiff.isPending}
        onRequestRun={() => setConfirmDiffOpen(true)}
        otherRunningLabel={otherRunningLabel}
        job={diffJobData}
        startError={startDiff.error}
      />

      {(
        [
          ['Report', report],
          ['Diff job', diffJob],
          ['Sync job', syncJob],
        ] as const
      ).map(
        ([label, q]) =>
          q.isError && (
            <StatusBanner key={label} variant="destructive">
              {label}: {formatMigrationError(q.error)}
            </StatusBanner>
          ),
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="tc-checkout-layout-text-filter" className="text-xs text-muted-foreground">
            Component
          </Label>
          <Input
            id="tc-checkout-layout-text-filter"
            className="w-56"
            placeholder="Filter by component key"
            value={textFilter}
            onChange={(e) => setTextFilter(e.target.value)}
          />
        </div>
      </div>

      {!!report.data && (
        <CheckoutLayoutSummaryBar
          bucketCounts={bucketCounts}
          totalCount={textFilteredRows.length}
          bucketFilter={bucketFilter}
          showAll={showAll}
          onToggleBucket={toggleBucket}
          onToggleShowAll={toggleShowAll}
          reportGeneratedAt={report.data?.generatedAt ?? null}
        />
      )}

      <label className="flex w-fit items-center gap-2 text-sm">
        <input
          ref={selectAllRef}
          type="checkbox"
          aria-label={`Select all visible ready (${readyRows.length})`}
          checked={allReadySelected}
          disabled={readyRows.length === 0}
          onChange={(e) => toggleSelectAllReady(e.target.checked)}
          className="h-4 w-4 rounded border-input accent-primary disabled:cursor-not-allowed disabled:opacity-50"
        />
        Select all visible ready ({readyRows.length})
      </label>

      <CheckoutLayoutResultsArea
        hasReport={!!report.data}
        totalRows={rows.length}
        textFilteredCount={textFilteredRows.length}
        visibleRows={visibleRows}
        isDefaultView={isDefaultView}
        onShowAll={toggleShowAll}
        selected={selected}
        onToggleComponent={toggleComponent}
      />

      <CheckoutLayoutSyncControls
        adminMode={adminMode}
        disabled={syncButtonDisabled}
        blockedReason={syncBlockedReason}
        pending={startSync.isPending}
        onRequestRun={() => setConfirmSyncOpen(true)}
        selectedCount={selected.size}
        notice={syncNotice}
        job={syncJobData}
        startError={isDiffReplacedConflict(startSync.error) ? null : startSync.error}
      />

      <Dialog open={confirmDiffOpen} onOpenChange={setConfirmDiffOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Run the checkout paths Diff?</DialogTitle>
            <DialogDescription>
              Derives checkout layout (Checkout Directory, Source Path, Build Working Directory) from
              every in-scope component's linked TeamCity compile configuration(s) and compares it
              against the registry's stored values. Read-only — nothing is written. The operation
              runs in the background; progress appears in this tab.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmDiffOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={runDiff}>
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmSyncOpen} onOpenChange={setConfirmSyncOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sync {selected.size} component{selected.size === 1 ? '' : 's'}?</DialogTitle>
            <DialogDescription>
              Writes the derived checkout layout for the selected base configurations through the same
              validation, name-derivation and audit path a manual edit uses. Rows that changed on
              either side since this Diff ran are skipped, not overwritten blind.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <div>{summarizeKeys(selectedKeys)}</div>
            <div>
              {changedFieldCount} field{changedFieldCount === 1 ? '' : 's'} will be written.
            </div>
            <div className="text-muted-foreground">
              Only base configurations are written. A before/after CSV is kept for rollback.
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmSyncOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={runSync}>
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
