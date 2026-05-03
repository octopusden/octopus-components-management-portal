import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useAdminMode } from '@/lib/adminModeStore'
import {
  useForceResetHistory,
  useHistoryMigrationJob,
  useMigrationJob,
  useRunHistoryMigration,
} from '@/hooks/useMigration'
import { toast } from '@/hooks/use-toast'
import { formatMigrationError } from '@/lib/migrationErrors'
import { Button } from '@/components/ui/button'
import { StatusBanner } from '@/components/ui/status-banner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { HistoryMigrationJobResponse, JobState } from '@/lib/types'
import { StatCard } from './StatCard'

/**
 * History migration card. Sibling of MigrationPanel under the same Migration tab.
 *
 * Branches between three button modes based on the current job state and the
 * backend's `recoveryAction` discriminator:
 *  - idle (no job, no DB row) → "Run history migration" with reset=false
 *  - recoveryAction === 'RETRY' (terminal-but-recoverable, COMPLETED or normal
 *    FAILED) → "Retry (reset state)" with reset=true
 *  - recoveryAction === 'FORCE_RESET' (synthesized FAILED-from-stuck-IN_PROGRESS,
 *    a previous pod crashed mid-import) → "Force reset" plus disabled "Retry"
 *  - recoveryAction === 'UNKNOWN' or any unrecognised value (defensive against
 *    contract drift) → message rendered, both action buttons disabled
 */
export function MigrationHistoryPanel() {
  const job = useHistoryMigrationJob()
  const jobData = job.data ?? null
  const isRunning = jobData?.state === 'RUNNING'
  const startHistory = useRunHistoryMigration()
  const forceReset = useForceResetHistory()
  const adminMode = useAdminMode((s) => s.enabled)
  // P2 review fix: was `useState<{ reset: boolean } | null>` — snapshotted
  // the reset value at button-click time. If a poll tick changed jobData.state
  // between opening the dialog and confirming, the snapshot was stale (e.g.
  // dialog opened on idle with reset=false, then a stuck-job arrived from a
  // poll, user clicks Confirm, mutation fires with the wrong reset). Now the
  // dialog stores only "is open?" and re-derives reset at confirm time from
  // the live jobData.
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [forceResetOpen, setForceResetOpen] = useState(false)

  // Cross-disable: don't let the user start a history job while components
  // is RUNNING. Backend's MigrationLifecycleGate would 409 anyway, but the
  // SPA hides the path so the destructive block never has to render.
  const componentsJob = useMigrationJob()
  const componentsRunning = componentsJob.data?.state === 'RUNNING'

  // P1 review fix: was matching on errorMessage.includes('marked IN_PROGRESS')
  // — a brittle string contract spread across two repos. Now branches on the
  // backend's positive `recoveryAction` discriminator. FORCE_RESET → stuck
  // claim from a previous pod; RETRY → terminal-but-recoverable.
  const isStuck = jobData?.recoveryAction === 'FORCE_RESET'
  // P3 review fix: defensive against future / typo'd recoveryAction values.
  // A non-RUNNING job with anything other than 'RETRY' / 'FORCE_RESET' / null
  // means the SPA is older than the backend (contract drift). Don't
  // confidently route the user to either action button — show the message
  // and disable both. Excludes recoveryAction=null which is the legitimate
  // "no recovery needed" sentinel for COMPLETED-just-finished or RUNNING.
  const isUnrecognisedRecovery =
    jobData?.recoveryAction != null &&
    jobData.recoveryAction !== 'RETRY' &&
    jobData.recoveryAction !== 'FORCE_RESET'
  const isFailed = jobData?.state === 'FAILED' && !isStuck && !isUnrecognisedRecovery
  const isCompleted = jobData?.state === 'COMPLETED' && !isUnrecognisedRecovery
  const result = jobData?.result ?? null

  const previousState = useRef<JobState | null>(null)
  useEffect(() => {
    const prev = previousState.current
    const curr = jobData?.state ?? null
    previousState.current = curr
    if (prev === 'RUNNING' && curr === 'COMPLETED' && result) {
      toast({
        title: 'History migration completed',
        description: `${result.processedCommits} commits processed, ${result.auditRecords} audit rows`,
      })
    }
  }, [jobData?.state, result])

  // P1 review fix: close the Run/Retry confirm dialog if a poll tick reveals
  // a stuck-IN_PROGRESS row (recoveryAction=FORCE_RESET). Without this the
  // user could click Confirm on a now-stale "Run history migration?" dialog
  // and fire mutation with reset=false — which the backend would 409 on the
  // stuck row. The backend gate keeps data safe but the SPA had promised to
  // hide the destructive path.
  //
  // Note this only handles confirmOpen; the actual run button is also
  // disabled by `runButtonDisabled` once isStuck flips, so the only
  // window left to close is an already-open dialog.
  useEffect(() => {
    if (isStuck && confirmOpen) setConfirmOpen(false)
  }, [isStuck, confirmOpen])

  async function runHistoryMigration() {
    // Re-derive `reset` from the LIVE state at confirm time (not snapshot at
    // button-click time). See useState comment above.
    //
    // Belt-and-braces with the auto-close effect: if a stuck-IN_PROGRESS row
    // arrived between dialog open and confirm AND the auto-close effect
    // hadn't run yet, refuse to fire the mutation against a stuck row. The
    // backend would 409 anyway but the user shouldn't see that path.
    if (isStuck) {
      setConfirmOpen(false)
      return
    }
    const reset = isCompleted || isFailed
    setConfirmOpen(false)
    await startHistory.mutateAsync({ reset }).catch(() => undefined)
  }

  async function runForceReset() {
    setForceResetOpen(false)
    await forceReset.mutateAsync().catch(() => undefined)
  }

  // The Run/Retry button drives both "Run history migration" (idle, reset=false)
  // and "Retry (reset state)" (terminal, reset=true). Disabled while RUNNING /
  // pending / cross-disabled / when the stuck-IN_PROGRESS row blocks retry.
  const runButtonReset = isCompleted || isFailed
  const runButtonLabel = isStuck
    ? 'Retry'
    : runButtonReset
      ? 'Retry (reset state)'
      : 'Run history migration'
  const runButtonDisabled =
    !adminMode ||
    isRunning ||
    startHistory.isPending ||
    componentsRunning ||
    isStuck ||
    isUnrecognisedRecovery
  const showForceReset = isStuck && adminMode

  const processedPct =
    jobData && jobData.totalCommits > 0
      ? Math.min(100, Math.round((jobData.processedCommits * 100) / jobData.totalCommits))
      : 0

  return (
    <div className="space-y-4">
      {jobData && (
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Processed" value={jobData.processedCommits} />
          <StatCard label="Total commits" value={jobData.totalCommits || '—'} />
          <StatCard label="Audit rows" value={jobData.auditRecords} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={runButtonDisabled}
          aria-busy={isRunning || startHistory.isPending}
        >
          {(isRunning || startHistory.isPending) && (
            <Loader2 className="animate-spin" aria-hidden="true" />
          )}
          {isRunning ? 'Running…' : startHistory.isPending ? 'Starting…' : runButtonLabel}
        </Button>

        {showForceReset && (
          <Button
            type="button"
            variant="destructive"
            onClick={() => setForceResetOpen(true)}
            disabled={forceReset.isPending}
            aria-busy={forceReset.isPending}
          >
            {forceReset.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
            Force reset
          </Button>
        )}

        {!adminMode && (
          <span className="text-xs text-muted-foreground">
            Enable Admin mode in the footer to run history migration.
          </span>
        )}
        {adminMode && componentsRunning && !isRunning && (
          <span className="text-xs text-muted-foreground">
            Components migration is running — wait for it to finish.
          </span>
        )}
      </div>

      {isRunning && jobData && (
        <div
          data-testid="history-migration-progress"
          className="rounded-md border bg-card p-3 space-y-2 text-sm"
          aria-busy={jobData.totalCommits === 0 ? 'true' : 'false'}
          aria-live="polite"
        >
          <div className="flex items-center justify-between font-medium">
            <span>{historyPhaseLabel(jobData)}</span>
            <span className="tabular-nums">
              {jobData.processedCommits} / {jobData.totalCommits || '—'}
            </span>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-label="History migration progress"
            aria-valuenow={jobData.totalCommits > 0 ? processedPct : undefined}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            {jobData.totalCommits === 0 ? (
              <div className="h-full bg-primary/60 animate-pulse" />
            ) : (
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${processedPct}%` }}
              />
            )}
          </div>
          {jobData.currentSha && (
            <div className="text-xs text-muted-foreground font-mono">
              last: {jobData.currentSha}
            </div>
          )}
        </div>
      )}

      {job.isError && (
        <StatusBanner variant="destructive">
          Failed to fetch history migration status. {formatMigrationError(job.error)}
        </StatusBanner>
      )}

      {isFailed && jobData?.errorMessage && (
        <StatusBanner variant="destructive">
          History migration failed: {jobData.errorMessage}
        </StatusBanner>
      )}

      {isStuck && jobData?.errorMessage && (
        <StatusBanner
          variant="destructive"
          data-testid="history-stuck-banner"
          role="alert"
        >
          {jobData.errorMessage}
        </StatusBanner>
      )}

      {isUnrecognisedRecovery && (
        <StatusBanner
          variant="destructive"
          data-testid="history-unknown-recovery-banner"
          role="alert"
        >
          Unknown recovery action ({String(jobData?.recoveryAction)}). The
          backend reported a state this SPA build cannot classify. Both action
          buttons have been disabled. Contact operations and check whether
          this portal version is current.
          {jobData?.errorMessage && (
            <div className="mt-2 text-xs">Backend message: {jobData.errorMessage}</div>
          )}
        </StatusBanner>
      )}

      {startHistory.isError && (
        <StatusBanner variant="destructive">
          {formatMigrationError(startHistory.error)}
        </StatusBanner>
      )}

      {forceReset.isError && (
        <StatusBanner variant="destructive">
          Force reset failed: {formatMigrationError(forceReset.error)}
        </StatusBanner>
      )}

      {isCompleted && result && (
        <div className="grid grid-cols-4 gap-3">
          <StatCard label="Commits" value={result.processedCommits} />
          <StatCard label="Audit rows" value={result.auditRecords} />
          <StatCard
            label="Skipped"
            value={result.skippedNoGroovy + result.skippedParseError + result.skippedUnknownNames}
          />
          <StatCard label="Duration (s)" value={Math.round(result.durationMs / 1000)} />
        </div>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {runButtonReset ? 'Retry history migration with reset?' : 'Run history migration?'}
            </DialogTitle>
            <DialogDescription>
              {runButtonReset
                ? 'This will delete previously-imported git history rows from audit log and re-import from the resolved tag. The operation can take several minutes.'
                : 'Backfills git history into audit_log starting from the resolved tag. The operation can take several minutes.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => runHistoryMigration()}>
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={forceResetOpen} onOpenChange={setForceResetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Force reset history-migration claim?</DialogTitle>
            <DialogDescription>
              This will delete the import claim AND all previously-imported git history rows from
              audit log. This action cannot be undone. WARNING: if another CRS pod is currently
              running this import, force-reset will corrupt its data. Continue?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setForceResetOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={runForceReset}>
              Force reset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function historyPhaseLabel(job: HistoryMigrationJobResponse): string {
  if (job.totalCommits === 0) return 'Walking history…'
  return 'Processing commits…'
}
