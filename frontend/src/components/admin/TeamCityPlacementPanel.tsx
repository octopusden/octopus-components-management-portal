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
import { formatMigrationError } from '@/lib/migrationErrors'
import { isDiffReplacedConflict } from '@/lib/migrationConflict'
import { getPlacementStatusTone, isPlacementRowSelectable } from '@/lib/placementStatus'
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
import type { PlacementDiffRowStatus, PlacementRowDiff, PlacementSyncResult } from '@/lib/types'

const STATUS_OPTIONS: PlacementDiffRowStatus[] = [
  'RESOLVED',
  'IN_SYNC',
  'INVALID',
  'CONFLICT',
  'MANUAL_EDIT',
  'UNEXPRESSIBLE',
  'NO_CHAIN',
  'OUTSIDE_TEMPLATES',
  'OUTSIDE_SCOPE',
  'COMPILE_PAUSED',
  'TC_ERROR',
]

/** "current → derived", or null when neither side has a value (nothing to show). */
function change(current: string | undefined, derived: string | undefined): string | null {
  if (current === undefined && derived === undefined) return null
  return `${current ?? '—'} → ${derived ?? '—'}`
}

function PlacementRow({
  row,
  checked,
  onToggle,
}: {
  row: PlacementRowDiff
  checked: boolean
  onToggle: (componentId: string, checked: boolean) => void
}) {
  const selectable = isPlacementRowSelectable(row)
  const bwd = change(row.currentBuildWorkingDirectory, row.derivedBuildWorkingDirectory)
  return (
    <TableRow>
      <TableCell>
        <input
          type="checkbox"
          aria-label={`Select ${row.componentKey} ${row.rowLabel}`}
          checked={checked}
          disabled={!selectable}
          onChange={(e) => onToggle(row.componentId, e.target.checked)}
          className="h-4 w-4 rounded border-input accent-primary disabled:cursor-not-allowed disabled:opacity-50"
        />
      </TableCell>
      <TableCell className="font-medium">{row.componentKey}</TableCell>
      <TableCell>
        {row.rowLabel === 'BASE' ? 'Base' : row.rowLabel} <span className="text-muted-foreground">{row.versionRange}</span>
      </TableCell>
      <TableCell>
        <Badge variant={getPlacementStatusTone(row.status)}>{row.status}</Badge>
      </TableCell>
      <TableCell>
        {row.entries.length === 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <ul className="space-y-1 text-xs">
            {row.entries.map((entry) => {
              const cd = change(entry.currentCheckoutDirectory, entry.derivedCheckoutDirectory)
              const sp = change(entry.currentSourcePath, entry.derivedSourcePath)
              return (
                <li key={entry.name}>
                  <span className="font-medium">{entry.name}</span>
                  {cd && <div>CD: {cd}</div>}
                  {sp && <div>SP: {sp}</div>}
                </li>
              )
            })}
          </ul>
        )}
      </TableCell>
      <TableCell className="text-xs">{bwd ?? <span className="text-muted-foreground">—</span>}</TableCell>
      <TableCell className="text-xs text-muted-foreground">{row.notes.join('; ')}</TableCell>
    </TableRow>
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
 * Run Diff button + its progress banner, failure banners, and report links.
 * Extracted out of TeamCityPlacementPanel so its own branching is scored on
 * its own function (SonarCloud S3776 — cognitive complexity).
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
  hasReport,
  reportGeneratedAt,
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
  hasReport: boolean
  reportGeneratedAt: string | null
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

      {hasReport && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <a
            href={`${API_BASE}/admin/teamcity-placement/diff/report.html`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            Open report (HTML)
          </a>
          <a
            href={`${API_BASE}/admin/teamcity-placement/diff/report.csv`}
            className="text-primary hover:underline"
          >
            Download CSV
          </a>
          <span className="text-xs text-muted-foreground">
            Generated <RelativeTime ts={reportGeneratedAt} />
          </span>
        </div>
      )}
    </>
  )
}

/**
 * The report table area: empty states for "no report yet" / "no in-scope
 * rows" / "no rows match the filters", else the filtered table.
 */
function PlacementResultsArea({
  hasReport,
  totalRows,
  filteredRows,
  selected,
  onToggleRow,
}: {
  hasReport: boolean
  totalRows: number
  filteredRows: PlacementRowDiff[]
  selected: Set<string>
  onToggleRow: (componentId: string, checked: boolean) => void
}) {
  if (!hasReport) {
    return <EmptyState message="Run Diff to see the current TeamCity ↔ CRS placement report." className="py-8" />
  }
  if (totalRows === 0) {
    return <EmptyState message="The latest Diff found no in-scope rows." className="py-8" />
  }
  if (filteredRows.length === 0) {
    return <EmptyState message="No rows match these filters." className="py-8" />
  }
  return (
    <div className="rounded-md border max-h-[28rem] overflow-y-auto">
      <Table className="table-fixed">
        <TableHeader className="sticky top-0 z-10 bg-background">
          <TableRow>
            <TableHead className="w-12">Select</TableHead>
            <TableHead>Component</TableHead>
            <TableHead>Row</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Placement (current → derived)</TableHead>
            <TableHead>Build Working Directory</TableHead>
            <TableHead>Notes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredRows.map((row) => (
            <PlacementRow key={row.configurationRowId} row={row} checked={selected.has(row.componentId)} onToggle={onToggleRow} />
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

/**
 * Sync button + its progress banner, failure banners, and the COMPLETED
 * result summary (summary counts, per-component outcomes, CSV trace link).
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
            Download sync report CSV (before/after trace)
          </a>
        </div>
      )}
    </>
  )
}

/**
 * Admin panel for the ONB-002 TeamCity -> CRS VCS-placement Diff/Sync jobs.
 * Mirrors TeamCityResyncPanel/TeamCityValidationPanel's async-job pattern for
 * Run Diff, plus a filterable result table and a second async job (Sync) for
 * writing the selection back through CRS.
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
  const [statusFilter, setStatusFilter] = useState('')
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
  useEffect(() => {
    setSelected(new Set())
  }, [report.data?.generatedAt])

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

  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        if (statusFilter && row.status !== statusFilter) return false
        if (textFilter && !row.componentKey.toLowerCase().includes(textFilter.toLowerCase())) return false
        return true
      }),
    [rows, statusFilter, textFilter],
  )

  const selectableRows = useMemo(() => rows.filter(isPlacementRowSelectable), [rows])
  const allResolvedSelected =
    selectableRows.length > 0 && selectableRows.every((row) => selected.has(row.componentId))
  const someResolvedSelected = selected.size > 0 && !allResolvedSelected

  // React has no `indeterminate` prop for a native checkbox — it's a DOM-only
  // property, set imperatively so a partial selection doesn't read
  // identically to "none selected" for screen-reader / assistive-tech users.
  const selectAllRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someResolvedSelected
  }, [someResolvedSelected])

  function toggleRow(componentId: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) next.add(componentId)
      else next.delete(componentId)
      return next
    })
  }

  function toggleSelectAllResolved(checked: boolean) {
    setSelected(checked ? new Set(selectableRows.map((row) => row.componentId)) : new Set())
  }

  async function runDiff() {
    setConfirmDiffOpen(false)
    await startDiff.mutateAsync().catch(() => undefined)
  }

  async function runSync() {
    setConfirmSyncOpen(false)
    setSyncNotice(null)
    const diffId = diffJobData?.id
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
    // The report + selection can still show a previous COMPLETED Diff's rows
    // while /diff/job now names a newer run — only a COMPLETED job has a
    // result CRS's own 409 guard will accept a Sync against (review finding).
    diffJobData?.state !== 'COMPLETED'

  const runningOtherLabel = describeOtherRunningJob({ componentsRunning, historyRunning, resyncRunning, validationRunning })

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
        hasReport={!!report.data}
        reportGeneratedAt={report.data?.generatedAt ?? null}
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="tc-placement-status-filter" className="text-xs text-muted-foreground">
            Status
          </Label>
          <select
            id="tc-placement-status-filter"
            className="h-9 w-48 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
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

      <label className="flex w-fit items-center gap-2 text-sm">
        <input
          ref={selectAllRef}
          type="checkbox"
          aria-label="Select all resolved"
          checked={allResolvedSelected}
          disabled={selectableRows.length === 0}
          onChange={(e) => toggleSelectAllResolved(e.target.checked)}
          className="h-4 w-4 rounded border-input accent-primary disabled:cursor-not-allowed disabled:opacity-50"
        />
        Select all resolved ({selectableRows.length})
      </label>

      <PlacementResultsArea
        hasReport={!!report.data}
        totalRows={rows.length}
        filteredRows={filteredRows}
        selected={selected}
        onToggleRow={toggleRow}
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
            <DialogTitle>Run TeamCity placement Diff?</DialogTitle>
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
              Writes the derived placement for the {selected.size} selected component
              {selected.size === 1 ? '' : 's'} through the same validation, name-derivation and
              audit path a manual edit uses. Rows that changed on either side since this Diff ran
              are skipped, not overwritten blind.
            </DialogDescription>
          </DialogHeader>
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
