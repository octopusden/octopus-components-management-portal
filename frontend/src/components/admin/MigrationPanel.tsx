import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useAdminMode } from '@/lib/adminModeStore'
import {
  useHistoryMigrationJob,
  useMigrationJob,
  useMigrationStatus,
  useRunMigration,
} from '@/hooks/useMigration'
import { toast } from '@/hooks/use-toast'
import { ApiError } from '@/lib/api'
import { formatMigrationError } from '@/lib/migrationErrors'
import { Button } from '@/components/ui/button'
import { RelativeTime } from '@/components/ui/RelativeTime'
import { StatusBanner } from '@/components/ui/status-banner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { JobState } from '@/lib/types'
import { StatCard } from './StatCard'

// Status counters poll every 3s while RUNNING — slower than the per-job
// poll (1s) because the DB row count moves at commit pace, not at component
// pace; 3s is the slowest cadence that still feels "live" for a multi-minute
// run while keeping load on /admin/migration-status modest.
const STATUS_POLL_INTERVAL_MS = 3_000

/**
 * Human-readable label for the current migration phase. Keeps the early
 * window (defaults loading, lazy git resolve) informative — a frozen
 * "Running…" with no movement was the original UX complaint that motivated
 * the phase field. Falls back to "Running…" only when the backend doesn't
 * report a phase (older CRS, omitted field).
 */
function phaseLabel(job: { phase?: 'DEFAULTS' | 'COMPONENTS' | null; currentComponent: string | null }): string {
  switch (job.phase) {
    case 'DEFAULTS':
      return 'Loading defaults from Git…'
    case 'COMPONENTS':
      return job.currentComponent ? `Migrating ${job.currentComponent}` : 'Resolving components from Git…'
    default:
      return 'Running…'
  }
}

/**
 * The progress bar must be indeterminate (animated, full-width) when there is
 * nothing measurable to show. Indeterminate when EITHER:
 *  - the phase is unknown / missing (older CRS, contract drift)
 *  - total === 0 (DEFAULTS phase, or COMPONENTS phase before
 *    gitResolver.getComponents() returned).
 *
 * P3 review fix: previously `!job.phase || job.total === 0` would treat an
 * unknown future phase string (e.g. backend ships 'WALKING' or a typo'd
 * 'COMPONNTS') as "phase known" because `!job.phase` is falsy on any
 * non-empty string — even though we don't know what label to render. Check
 * the union explicitly so unknown values fall back to indeterminate +
 * "Running…", matching the missing-field path.
 */
function indeterminate(job: { phase?: 'DEFAULTS' | 'COMPONENTS' | null; total: number }): boolean {
  const phaseKnown = job.phase === 'DEFAULTS' || job.phase === 'COMPONENTS'
  return !phaseKnown || job.total === 0
}

export function MigrationPanel() {
  const job = useMigrationJob()
  const jobData = job.data ?? null
  const isRunning = jobData?.state === 'RUNNING'
  // Poll status only while the job is RUNNING; otherwise the top tiles are
  // a cheap one-shot read on mount + invalidations on terminal transitions.
  const status = useMigrationStatus({
    refetchInterval: isRunning ? STATUS_POLL_INTERVAL_MS : false,
  })
  const startMigration = useRunMigration()
  const adminMode = useAdminMode((s) => s.enabled)
  const queryClient = useQueryClient()
  const [confirmOpen, setConfirmOpen] = useState(false)

  // Cross-disable against the history-migration card. The backend's
  // MigrationLifecycleGate would 409 a cross-kind start anyway, but the SPA
  // also disables the button so the user never sees that error path. React
  // Query dedupes the GET, so calling the hook here doesn't cost an extra
  // request — it's reading the same cache entry the history panel uses.
  const historyJob = useHistoryMigrationJob()
  const historyRunning = historyJob.data?.state === 'RUNNING'

  const isFailed = jobData?.state === 'FAILED'
  const isCompleted = jobData?.state === 'COMPLETED'
  const result = jobData?.result ?? null
  const failures = result?.components.results.filter((r) => !r.success) ?? []
  const processed = jobData ? jobData.migrated + jobData.failed + jobData.skipped : 0
  const progressPct =
    jobData && jobData.total > 0 ? Math.min(100, Math.round((processed * 100) / jobData.total)) : 0

  // Detect RUNNING → COMPLETED transition: toast + invalidate downstream queries.
  // status counters change after migration; component-defaults were rewritten by
  // ImportService.migrate() so any consumer (other admin tabs) needs a fresh read.
  const previousState = useRef<JobState | null>(null)
  useEffect(() => {
    const prev = previousState.current
    const curr = jobData?.state ?? null
    previousState.current = curr
    if (prev === 'RUNNING' && curr === 'COMPLETED' && result) {
      const c = result.components
      toast({
        title: 'Migration completed',
        description: `${c.migrated}/${c.total} migrated, ${c.failed} failed`,
      })
      queryClient.invalidateQueries({ queryKey: ['migration', 'status'] })
      queryClient.invalidateQueries({ queryKey: ['config', 'component-defaults'] })
    }
  }, [jobData?.state, result, queryClient])

  async function runMigration() {
    setConfirmOpen(false)
    // Errors surface through mutation.error → destructive block below.
    await startMigration.mutateAsync().catch(() => undefined)
  }

  const buttonDisabled = !adminMode || isRunning || startMigration.isPending || historyRunning

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Git" value={status.data?.git ?? '—'} />
        <StatCard label="DB" value={status.data?.db ?? '—'} />
        <StatCard label="Total" value={status.data?.total ?? '—'} />
      </div>

      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant={adminMode ? 'destructive' : 'default'}
          onClick={() => setConfirmOpen(true)}
          disabled={buttonDisabled}
          aria-busy={isRunning || startMigration.isPending}
        >
          {(isRunning || startMigration.isPending) && <Loader2 className="animate-spin" aria-hidden="true" />}
          {isRunning ? 'Running…' : startMigration.isPending ? 'Starting…' : 'Run migration'}
        </Button>
        {!adminMode && (
          <span className="text-xs text-muted-foreground">
            Arm Admin mode above to run migration.
          </span>
        )}
        {adminMode && historyRunning && !isRunning && (
          <span className="text-xs text-muted-foreground">
            History migration is running — wait for it to finish.
          </span>
        )}
        {jobData?.finishedAt && !isRunning && (
          <span className="ml-auto text-xs text-muted-foreground">
            Last run <RelativeTime ts={jobData.finishedAt} />
          </span>
        )}
      </div>

      {isRunning && jobData && (
        <div
          data-testid="migration-progress"
          className="rounded-md border bg-card p-3 space-y-2 text-sm"
          aria-busy={indeterminate(jobData) ? 'true' : 'false'}
          aria-live="polite"
        >
          <div className="flex items-center justify-between font-medium">
            <span>{phaseLabel(jobData)}</span>
            <span className="tabular-nums">
              {processed} / {jobData.total}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            {indeterminate(jobData) ? (
              // While total === 0 (DEFAULTS phase, or COMPONENTS phase before
              // the first per-component event) there is no determinate progress
              // to render. The animated full-width bar signals "work is
              // happening, just not yet measurable". Without this branch the
              // bar would stay frozen at 0/0 width — visually identical to a
              // hung process — defeating the whole purpose of the phase label.
              <div className="h-full bg-primary/60 animate-pulse" />
            ) : (
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${progressPct}%` }}
              />
            )}
          </div>
        </div>
      )}

      {isFailed && jobData?.errorMessage && (
        <StatusBanner variant="destructive">
          Migration failed: {jobData.errorMessage}
        </StatusBanner>
      )}

      {startMigration.isError && (
        startMigration.error instanceof ApiError && startMigration.error.status === 501 ? (
          // Transitional 501: CRS's ImportServiceImpl returns
          // UnsupportedOperationException until the MIG-039 import pipeline
          // lands. Surface a domain-specific banner rather than the generic
          // "501 Operation not implemented" — operators need to know this is
          // expected during the schema migration, not a deployment fault.
          <StatusBanner variant="warning">
            Migration is temporarily disabled while the schema-v2 import pipeline
            (MIG-039) is being implemented in CRS. The endpoint will return 501
            until that work merges; until then, component data is managed via
            the per-component Save buttons on the detail page.
          </StatusBanner>
        ) : (
          <StatusBanner variant="destructive">
            {formatMigrationError(startMigration.error)}
          </StatusBanner>
        )
      )}

      {isCompleted && result && (
        <div className="space-y-3">
          <div className="grid grid-cols-4 gap-3">
            <StatCard label="Total" value={result.components.total} />
            <StatCard label="Migrated" value={result.components.migrated} />
            <StatCard label="Failed" value={result.components.failed} />
            <StatCard label="Skipped" value={result.components.skipped} />
          </div>
          {failures.length > 0 && (
            <details className="rounded-md border p-3 text-sm">
              <summary className="cursor-pointer font-medium">
                Failed components ({failures.length})
              </summary>
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                {failures.map((f) => (
                  <li key={f.componentName}>
                    <span className="font-mono text-foreground">{f.componentName}</span>
                    {' — '}
                    {f.message}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Run full migration?</DialogTitle>
            <DialogDescription>
              This rewrites component defaults and migrates every git-sourced component to the
              database. The operation can take several minutes; progress will appear in this tab.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={runMigration}>
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
