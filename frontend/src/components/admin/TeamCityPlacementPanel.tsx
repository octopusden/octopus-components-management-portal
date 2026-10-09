import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useAdminMode } from '@/lib/adminModeStore'
import { useHistoryMigrationJob, useMigrationJob } from '@/hooks/useMigration'
import { useTeamCityResyncJob } from '@/hooks/useTeamCityResync'
import { useTeamCityValidationJob } from '@/hooks/useTeamCityValidation'
import {
  usePlacementDiffJob,
  usePlacementDiffReport,
  usePlacementSyncJob,
  useRunPlacementDiff,
  useRunPlacementSync,
} from '@/hooks/useTeamCityPlacement'
import { API_BASE } from '@/lib/api'
import { formatLocalDateTime } from '@/lib/date'
import { formatMigrationError } from '@/lib/migrationErrors'
import { isDiffReplacedConflict } from '@/lib/migrationConflict'
import {
  appliesToLabel,
  buildProposedChangeLines,
  countChangedFields,
  groupPlacementRows,
  summarizeKeys,
  wasRowDerived,
  type PlacementComponentGroup,
} from '@/lib/placementGrouping'
import {
  getPlacementStatusBucket,
  getPlacementStatusLabel,
  getPlacementStatusTone,
  PLACEMENT_STATUS_BUCKETS,
  type PlacementStatusBucket,
} from '@/lib/placementStatus'
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
import type { PlacementRowDiff, PlacementSyncResult } from '@/lib/types'

// The default view (no bucket picked, "Show all" off) — everything that
// might need an operator's attention, without the "can't derive" /
// "nothing to do" noise.
const DEFAULT_BUCKETS: PlacementStatusBucket[] = ['ready', 'needsLook']
const ALL_BUCKET_IDS: PlacementStatusBucket[] = PLACEMENT_STATUS_BUCKETS.map((b) => b.id)

/** One line of the "Proposed change" cell, or "no change" / nothing per the design brief. */
function ProposedChangeCell({ row }: { row: PlacementRowDiff }) {
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
  if (wasRowDerived(row)) return <span className="text-xs text-muted-foreground">no change</span>
  return null
}

/** Status badge — human label, raw code as the tooltip so it cross-references the CSV/HTML report. */
function StatusChip({ status, className }: { status: PlacementRowDiff['status']; className?: string }) {
  return (
    <Badge variant={getPlacementStatusTone(status)} title={status} className={className}>
      {getPlacementStatusLabel(status)}
    </Badge>
  )
}

function PlacementDetailRow({ row }: { row: PlacementRowDiff }) {
  return (
    <TableRow>
      <TableCell className="pl-10 text-sm">{appliesToLabel(row)}</TableCell>
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

function ComponentGroupRows({
  group,
  checked,
  onToggle,
}: {
  group: PlacementComponentGroup
  checked: boolean
  onToggle: (componentId: string, checked: boolean) => void
}) {
  return (
    <>
      <TableRow className="bg-muted/40 hover:bg-muted/40">
        <TableCell colSpan={4}>
          <label className="flex items-center gap-2 font-medium">
            <input
              type="checkbox"
              aria-label={`Select ${group.componentKey}`}
              checked={checked}
              disabled={!group.selectable}
              onChange={(e) => onToggle(group.componentId, e.target.checked)}
              className="h-4 w-4 rounded border-input accent-primary disabled:cursor-not-allowed disabled:opacity-50"
            />
            {group.componentKey}
            {group.statuses.map((status) => (
              <StatusChip key={status} status={status} className="font-normal" />
            ))}
          </label>
        </TableCell>
      </TableRow>
      {group.rows.map((row) => (
        <PlacementDetailRow key={row.configurationRowId} row={row} />
      ))}
    </>
  )
}

/** Which of the other four async job kinds (if any) is currently running, for the "wait for it" hint. */
function describeOtherRunningJob(flags: {
  componentsRunning: boolean
  historyRunning: boolean
  resyncRunning: boolean
  validationRunning: boolean
}): string {
  if (flags.componentsRunning) return 'Components migration'
  if (flags.historyRunning) return 'History migration'
  if (flags.resyncRunning) return 'TC resync'
  return 'TC validation'
}

/**
 * Run Diff button + its progress banner and failure banners. The report
 * links + "Report from" now live in PlacementSummaryBar, below the table
 * filters, so they sit next to what they describe.
 */
function PlacementDiffControls({
  adminMode,
  diffButtonDisabled,
  diffRunning,
  diffPending,
  onRequestRun,
  otherKindRunning,
  runningOtherLabel,
  diffFinishedAt,
  diffFailed,
  diffErrorMessage,
  startDiffIsError,
  startDiffError,
}: {
  adminMode: boolean
  diffButtonDisabled: boolean
  diffRunning: boolean
  diffPending: boolean
  onRequestRun: () => void
  otherKindRunning: boolean
  runningOtherLabel: string
  diffFinishedAt: string | null | undefined
  diffFailed: boolean
  diffErrorMessage: string | null | undefined
  startDiffIsError: boolean
  startDiffError: unknown
}) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant={adminMode ? 'destructive' : 'default'}
          onClick={onRequestRun}
          disabled={diffButtonDisabled}
          aria-busy={diffRunning || diffPending}
        >
          {(diffRunning || diffPending) && <Loader2 className="animate-spin" aria-hidden="true" />}
          {diffRunning ? 'Running Diff…' : diffPending ? 'Starting…' : 'Run Diff'}
        </Button>
        {!adminMode && (
          <span className="text-xs text-muted-foreground">Arm Admin mode above to run Diff or Sync.</span>
        )}
        {adminMode && otherKindRunning && !diffRunning && (
          <span className="text-xs text-muted-foreground">{runningOtherLabel} is running — wait for it to finish.</span>
        )}
        {diffFinishedAt && !diffRunning && (
          <span className="ml-auto text-xs text-muted-foreground">
            Last run <RelativeTime ts={diffFinishedAt} />
          </span>
        )}
      </div>

      {diffRunning && (
        <div
          data-testid="tc-placement-diff-progress"
          className="rounded-md border bg-card p-3 space-y-2 text-sm"
          aria-busy="true"
          aria-live="polite"
        >
          <div className="font-medium">Deriving placement from TeamCity for every in-scope component…</div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary/60 animate-pulse" />
          </div>
        </div>
      )}

      {diffFailed && diffErrorMessage && (
        <StatusBanner variant="destructive">Diff failed: {diffErrorMessage}</StatusBanner>
      )}
      {startDiffIsError && (
        <StatusBanner variant="destructive">{formatMigrationError(startDiffError)}</StatusBanner>
      )}
    </>
  )
}

/**
 * Clickable bucket counts (replace the native status `<select>`), a
 * "Show all (N)" toggle, "Report from <local time>", and the Diff report
 * links — all next to the table they describe.
 */
function PlacementSummaryBar({
  bucketCounts,
  totalCount,
  bucketFilter,
  showAll,
  onToggleBucket,
  onToggleShowAll,
  reportGeneratedAt,
}: {
  bucketCounts: Record<PlacementStatusBucket, number>
  totalCount: number
  bucketFilter: PlacementStatusBucket | null
  showAll: boolean
  onToggleBucket: (bucket: PlacementStatusBucket) => void
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
        href={`${API_BASE}/admin/teamcity-placement/diff/report.html`}
        target="_blank"
        rel="noopener noreferrer"
        className="ml-auto text-primary hover:underline"
      >
        Open report (HTML)
      </a>
      <a href={`${API_BASE}/admin/teamcity-placement/diff/report.csv`} className="text-primary hover:underline">
        Download CSV
      </a>
    </div>
  )
}

/**
 * The report table area: empty states for "no report yet" / "no in-scope
 * rows" / "nothing needs attention" / "no rows match the filters", else the
 * grouped-by-component table.
 */
function PlacementResultsArea({
  hasReport,
  totalRows,
  textFilteredCount,
  visibleGroups,
  totalComponentCount,
  isDefaultView,
  onShowAll,
  selected,
  onToggleComponent,
}: {
  hasReport: boolean
  totalRows: number
  textFilteredCount: number
  visibleGroups: PlacementComponentGroup[]
  totalComponentCount: number
  isDefaultView: boolean
  onShowAll: () => void
  selected: Set<string>
  onToggleComponent: (componentId: string, checked: boolean) => void
}) {
  if (!hasReport) {
    return (
      <EmptyState
        message="Run Diff to see the current TeamCity ↔ CRS placement report. Where TeamCity checks out each VCS root (Checkout Directory / Source Path) and where it builds (Build Working Directory)."
        className="py-8"
      />
    )
  }
  if (totalRows === 0) {
    return <EmptyState message="The latest Diff found no in-scope rows." className="py-8" />
  }
  if (textFilteredCount === 0) {
    return <EmptyState message="No rows match these filters." className="py-8" />
  }
  if (visibleGroups.length === 0 && isDefaultView) {
    return (
      <EmptyState
        message={
          <>
            All {totalComponentCount} components in sync — nothing to do.{' '}
            <button type="button" className="text-primary hover:underline" onClick={onShowAll}>
              Show all ({textFilteredCount})
            </button>
          </>
        }
        className="py-8"
      />
    )
  }
  if (visibleGroups.length === 0) {
    return <EmptyState message="No rows match these filters." className="py-8" />
  }
  return (
    <div className="rounded-md border max-h-[28rem] overflow-y-auto">
      <Table className="table-fixed">
        <TableHeader className="sticky top-0 z-10 bg-background">
          <TableRow>
            <TableHead>Applies to</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Proposed change</TableHead>
            <TableHead>Note</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visibleGroups.map((group) => (
            <ComponentGroupRows
              key={group.componentId}
              group={group}
              checked={selected.has(group.componentId)}
              onToggle={onToggleComponent}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

/**
 * Sync button + its progress banner, failure banners, and the COMPLETED
 * result summary (summary counts, per-component outcomes, rollback CSV link).
 */
function PlacementSyncControls({
  adminMode,
  syncButtonDisabled,
  syncRunning,
  syncPending,
  onRequestRun,
  selectedCount,
  syncFinishedAt,
  syncNotice,
  syncFailed,
  syncErrorMessage,
  startSyncIsError,
  startSyncError,
  result,
}: {
  adminMode: boolean
  syncButtonDisabled: boolean
  syncRunning: boolean
  syncPending: boolean
  onRequestRun: () => void
  selectedCount: number
  syncFinishedAt: string | null | undefined
  syncNotice: string | null
  syncFailed: boolean
  syncErrorMessage: string | null | undefined
  startSyncIsError: boolean
  startSyncError: unknown
  result: PlacementSyncResult | null | undefined
}) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-3 border-t pt-4">
        <Button
          type="button"
          variant={adminMode ? 'destructive' : 'default'}
          onClick={onRequestRun}
          disabled={syncButtonDisabled}
          aria-busy={syncRunning || syncPending}
        >
          {(syncRunning || syncPending) && <Loader2 className="animate-spin" aria-hidden="true" />}
          {syncRunning ? 'Syncing…' : syncPending ? 'Starting…' : `Sync selected (${selectedCount})`}
        </Button>
        {syncFinishedAt && !syncRunning && (
          <span className="text-xs text-muted-foreground">
            Last sync <RelativeTime ts={syncFinishedAt} />
          </span>
        )}
      </div>

      {syncNotice && <StatusBanner variant="warning">{syncNotice}</StatusBanner>}

      {syncRunning && (
        <div
          data-testid="tc-placement-sync-progress"
          className="rounded-md border bg-card p-3 space-y-2 text-sm"
          aria-busy="true"
          aria-live="polite"
        >
          <div className="font-medium">Writing the selected rows through the registry write path…</div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary/60 animate-pulse" />
          </div>
        </div>
      )}

      {syncFailed && syncErrorMessage && (
        <StatusBanner variant="destructive">Sync failed: {syncErrorMessage}</StatusBanner>
      )}
      {startSyncIsError && (
        <StatusBanner variant="destructive">{formatMigrationError(startSyncError)}</StatusBanner>
      )}

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
            href={`${API_BASE}/admin/teamcity-placement/sync/report.csv`}
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
 * Admin panel for the ONB-002 TeamCity -> CRS VCS-placement Diff/Sync jobs.
 * Mirrors TeamCityResyncPanel/TeamCityValidationPanel's async-job pattern for
 * Run Diff, plus a component-grouped, filterable result table and a second
 * async job (Sync) for writing the selection back through CRS.
 *
 * Diff report + table are readable by anyone who can view components per the
 * design brief; in this version the whole `/admin` route already requires
 * `IMPORT_DATA` (see AdminSettingsPage's route), so that split isn't
 * re-implemented here — noted in the PR rather than restructuring routing.
 *
 * ponytail: unlike the other four admin job panels, this one cross-disables
 * against them, but they don't yet cross-disable against Diff/Sync (they'd
 * need the same two extra hook reads apiece). Clicking one of them while a
 * Diff/Sync is RUNNING still works safely — the shared MigrationLifecycleGate
 * 409s and the existing formatMigrationError path renders that banner — it
 * just isn't pre-emptively greyed out. Add the two hooks to those four panels
 * if that gap is worth the footprint.
 */
export function TeamCityPlacementPanel() {
  const queryClient = useQueryClient()

  const diffJob = usePlacementDiffJob()
  const diffJobData = diffJob.data ?? null
  const diffRunning = diffJobData?.state === 'RUNNING'
  const diffFailed = diffJobData?.state === 'FAILED'
  const startDiff = useRunPlacementDiff()

  const report = usePlacementDiffReport()
  const rows = useMemo(() => report.data?.rows ?? [], [report.data])

  const syncJob = usePlacementSyncJob()
  const syncJobData = syncJob.data ?? null
  const syncRunning = syncJobData?.state === 'RUNNING'
  const startSync = useRunPlacementSync()

  const adminMode = useAdminMode((s) => s.enabled)
  const [confirmDiffOpen, setConfirmDiffOpen] = useState(false)
  const [confirmSyncOpen, setConfirmSyncOpen] = useState(false)
  const [bucketFilter, setBucketFilter] = useState<PlacementStatusBucket | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [textFilter, setTextFilter] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [syncNotice, setSyncNotice] = useState<string | null>(null)

  // Cross-disable against the other four async job kinds — all six share one
  // MigrationLifecycleGate slot on the backend.
  const componentsJob = useMigrationJob()
  const componentsRunning = componentsJob.data?.state === 'RUNNING'
  const historyJob = useHistoryMigrationJob()
  const historyRunning = historyJob.data?.state === 'RUNNING'
  const resyncJob = useTeamCityResyncJob()
  const resyncRunning = resyncJob.data?.state === 'RUNNING'
  const validationJob = useTeamCityValidationJob()
  const validationRunning = validationJob.data?.state === 'RUNNING'
  const otherKindRunning = componentsRunning || historyRunning || resyncRunning || validationRunning

  // A previously selected component id can point at a row that no longer
  // exists (or no longer resolves) once a new Diff report lands — drop the
  // stale selection so Sync can never be asked to act on it.
  // A new Diff job id (this client's or another admin's) invalidates it too,
  // before the new report has landed.
  useEffect(() => {
    setSelected(new Set())
  }, [report.data?.generatedAt, diffJobData?.id])

  // Refresh the report + component caches once each job reaches COMPLETED —
  // covers the normal (poll-detected) path; the mutations' own onSuccess
  // handles the fast COMPLETED-on-start race (see useTeamCityPlacement.ts).
  useEffect(() => {
    if (diffJobData?.state === 'COMPLETED') {
      void queryClient.invalidateQueries({ queryKey: ['tc-placement-diff', 'report'] }).catch(() => {})
    }
  }, [diffJobData?.state, diffJobData?.id, queryClient])
  useEffect(() => {
    if (syncJobData?.state === 'COMPLETED' && syncJobData.result) {
      void queryClient.invalidateQueries({ queryKey: ['components'] }).catch(() => {})
      void queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] === 'component' }).catch(() => {})
    }
  }, [syncJobData?.state, syncJobData?.id, syncJobData?.result, queryClient])

  const textFilteredRows = useMemo(
    () =>
      textFilter
        ? rows.filter((row) => row.componentKey.toLowerCase().includes(textFilter.toLowerCase()))
        : rows,
    [rows, textFilter],
  )

  const bucketCounts = useMemo(() => {
    const counts: Record<PlacementStatusBucket, number> = { ready: 0, needsLook: 0, cantDerive: 0, nothingToDo: 0 }
    for (const row of textFilteredRows) counts[getPlacementStatusBucket(row.status)] += 1
    return counts
  }, [textFilteredRows])

  const isDefaultView = bucketFilter === null && !showAll
  const visibleRows = useMemo(() => {
    const visibleBuckets = bucketFilter ? [bucketFilter] : showAll ? ALL_BUCKET_IDS : DEFAULT_BUCKETS
    return textFilteredRows.filter((row) => visibleBuckets.includes(getPlacementStatusBucket(row.status)))
  }, [textFilteredRows, bucketFilter, showAll])
  const visibleGroups = useMemo(() => groupPlacementRows(visibleRows), [visibleRows])
  const allGroups = useMemo(() => groupPlacementRows(rows), [rows])
  const totalComponentCount = useMemo(() => groupPlacementRows(textFilteredRows).length, [textFilteredRows])

  const readyGroups = visibleGroups.filter((g) => g.selectable)
  const allReadySelected = readyGroups.length > 0 && readyGroups.every((g) => selected.has(g.componentId))
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
    setSelected(checked ? new Set(readyGroups.map((g) => g.componentId)) : new Set())
  }

  function toggleBucket(bucket: PlacementStatusBucket) {
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

  const diffButtonDisabled = !adminMode || diffRunning || startDiff.isPending || otherKindRunning || syncRunning
  const syncButtonDisabled =
    !adminMode ||
    syncRunning ||
    startSync.isPending ||
    otherKindRunning ||
    diffRunning ||
    selected.size === 0 ||
    !report.data?.diffId ||
    // CRS serves the report from the last COMPLETED run even while a newer
    // Diff is running, so the report's own diffId is the source of truth: Sync
    // only when it is the latest job and that job has completed.
    diffJobData?.state !== 'COMPLETED' ||
    diffJobData.id !== report.data?.diffId

  const runningOtherLabel = describeOtherRunningJob({ componentsRunning, historyRunning, resyncRunning, validationRunning })

  const selectedKeys = allGroups.filter((g) => selected.has(g.componentId)).map((g) => g.componentKey)
  const changedFieldCount = countChangedFields(allGroups, selected)

  return (
    <div className="space-y-4">
      <PlacementDiffControls
        adminMode={adminMode}
        diffButtonDisabled={diffButtonDisabled}
        diffRunning={diffRunning}
        diffPending={startDiff.isPending}
        onRequestRun={() => setConfirmDiffOpen(true)}
        otherKindRunning={otherKindRunning}
        runningOtherLabel={runningOtherLabel}
        diffFinishedAt={diffJobData?.finishedAt}
        diffFailed={diffFailed}
        diffErrorMessage={diffJobData?.errorMessage}
        startDiffIsError={startDiff.isError}
        startDiffError={startDiff.error}
      />

      {[report, diffJob, syncJob].map(
        (q, i) =>
          q.isError && (
            <StatusBanner key={i} variant="destructive">
              {formatMigrationError(q.error)}
            </StatusBanner>
          ),
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="tc-placement-text-filter" className="text-xs text-muted-foreground">
            Component
          </Label>
          <Input
            id="tc-placement-text-filter"
            className="w-56"
            placeholder="Filter by component key"
            value={textFilter}
            onChange={(e) => setTextFilter(e.target.value)}
          />
        </div>
      </div>

      {!!report.data && (
        <PlacementSummaryBar
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
          aria-label={`Select all visible ready (${readyGroups.length})`}
          checked={allReadySelected}
          disabled={readyGroups.length === 0}
          onChange={(e) => toggleSelectAllReady(e.target.checked)}
          className="h-4 w-4 rounded border-input accent-primary disabled:cursor-not-allowed disabled:opacity-50"
        />
        Select all visible ready ({readyGroups.length})
      </label>

      <PlacementResultsArea
        hasReport={!!report.data}
        totalRows={rows.length}
        textFilteredCount={textFilteredRows.length}
        visibleGroups={visibleGroups}
        totalComponentCount={totalComponentCount}
        isDefaultView={isDefaultView}
        onShowAll={toggleShowAll}
        selected={selected}
        onToggleComponent={toggleComponent}
      />

      <PlacementSyncControls
        adminMode={adminMode}
        syncButtonDisabled={syncButtonDisabled}
        syncRunning={syncRunning}
        syncPending={startSync.isPending}
        onRequestRun={() => setConfirmSyncOpen(true)}
        selectedCount={selected.size}
        syncFinishedAt={syncJobData?.finishedAt}
        syncNotice={syncNotice}
        syncFailed={syncJobData?.state === 'FAILED'}
        syncErrorMessage={syncJobData?.errorMessage}
        startSyncIsError={startSync.isError && !isDiffReplacedConflict(startSync.error)}
        startSyncError={startSync.error}
        result={syncJobData?.state === 'COMPLETED' ? syncJobData.result : null}
      />

      <Dialog open={confirmDiffOpen} onOpenChange={setConfirmDiffOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Run the checkout paths Diff?</DialogTitle>
            <DialogDescription>
              Derives placement (Checkout Directory, Source Path, Build Working Directory) from
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
              Writes the derived placement for the selected base configurations through the same
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
