import { useEffect, useMemo, useState } from 'react'
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
import type { PlacementDiffRowStatus, PlacementRowDiff } from '@/lib/types'

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
          role="checkbox"
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
      queryClient.invalidateQueries({ queryKey: ['tc-placement-diff', 'report'] })
    }
  }, [diffJobData?.state, diffJobData?.id, queryClient])
  useEffect(() => {
    if (syncJobData?.state === 'COMPLETED' && syncJobData.result) {
      queryClient.invalidateQueries({ queryKey: ['components'] })
      queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] === 'component' })
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
    selected.size === 0

  const runningOtherLabel = componentsRunning
    ? 'Components migration'
    : historyRunning
      ? 'History migration'
      : resyncRunning
        ? 'TC resync'
        : 'TC validation'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant={adminMode ? 'destructive' : 'default'}
          onClick={() => setConfirmDiffOpen(true)}
          disabled={diffButtonDisabled}
          aria-busy={diffRunning || startDiff.isPending}
        >
          {(diffRunning || startDiff.isPending) && <Loader2 className="animate-spin" aria-hidden="true" />}
          {diffRunning ? 'Running Diff…' : startDiff.isPending ? 'Starting…' : 'Run Diff'}
        </Button>
        {!adminMode && (
          <span className="text-xs text-muted-foreground">Arm Admin mode above to run Diff or Sync.</span>
        )}
        {adminMode && otherKindRunning && !diffRunning && (
          <span className="text-xs text-muted-foreground">{runningOtherLabel} is running — wait for it to finish.</span>
        )}
        {diffJobData?.finishedAt && !diffRunning && (
          <span className="ml-auto text-xs text-muted-foreground">
            Last run <RelativeTime ts={diffJobData.finishedAt} />
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

      {diffFailed && diffJobData?.errorMessage && (
        <StatusBanner variant="destructive">Diff failed: {diffJobData.errorMessage}</StatusBanner>
      )}
      {startDiff.isError && (
        <StatusBanner variant="destructive">{formatMigrationError(startDiff.error)}</StatusBanner>
      )}

      {report.data && (
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
            Generated <RelativeTime ts={report.data.generatedAt} />
          </span>
        </div>
      )}

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
          type="checkbox"
          role="checkbox"
          aria-label="Select all resolved"
          checked={allResolvedSelected}
          disabled={selectableRows.length === 0}
          onChange={(e) => toggleSelectAllResolved(e.target.checked)}
          className="h-4 w-4 rounded border-input accent-primary disabled:cursor-not-allowed disabled:opacity-50"
        />
        Select all resolved ({selectableRows.length})
      </label>

      {report.data && rows.length === 0 ? (
        <EmptyState message="The latest Diff found no in-scope rows." className="py-8" />
      ) : report.data && filteredRows.length === 0 ? (
        <EmptyState message="No rows match these filters." className="py-8" />
      ) : report.data ? (
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
                <PlacementRow key={row.configurationRowId} row={row} checked={selected.has(row.componentId)} onToggle={toggleRow} />
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <EmptyState message="Run Diff to see the current TeamCity ↔ CRS placement report." className="py-8" />
      )}

      <div className="flex flex-wrap items-center gap-3 border-t pt-4">
        <Button
          type="button"
          variant={adminMode ? 'destructive' : 'default'}
          onClick={() => setConfirmSyncOpen(true)}
          disabled={syncButtonDisabled}
          aria-busy={syncRunning || startSync.isPending}
        >
          {(syncRunning || startSync.isPending) && <Loader2 className="animate-spin" aria-hidden="true" />}
          {syncRunning ? 'Syncing…' : startSync.isPending ? 'Starting…' : `Sync selected (${selected.size})`}
        </Button>
        {syncJobData?.finishedAt && !syncRunning && (
          <span className="text-xs text-muted-foreground">
            Last sync <RelativeTime ts={syncJobData.finishedAt} />
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

      {syncJobData?.state === 'FAILED' && syncJobData.errorMessage && (
        <StatusBanner variant="destructive">Sync failed: {syncJobData.errorMessage}</StatusBanner>
      )}
      {startSync.isError && !isDiffReplacedConflict(startSync.error) && (
        <StatusBanner variant="destructive">{formatMigrationError(startSync.error)}</StatusBanner>
      )}

      {syncJobData?.state === 'COMPLETED' && syncJobData.result && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            <StatCard label="Requested" value={syncJobData.result.requested} />
            <StatCard label="Applied" value={syncJobData.result.applied} />
            <StatCard label="Skipped" value={syncJobData.result.skipped} />
            <StatCard label="Failed" value={syncJobData.result.failed} />
          </div>
          <a
            href={`${API_BASE}/admin/teamcity-placement/sync/report.csv`}
            className="text-sm text-primary hover:underline"
          >
            Download sync report CSV (before/after trace)
          </a>
        </div>
      )}

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
