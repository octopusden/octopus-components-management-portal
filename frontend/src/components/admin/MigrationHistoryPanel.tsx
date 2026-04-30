import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useAdminMode } from '@/lib/adminModeStore'
import {
  useForceResetHistory,
  useHistoryMigrationJob,
  useMigrationJob,
  useRunHistoryMigration,
} from '@/hooks/useMigration'
import { toast } from '@/hooks/use-toast'
import { ApiError } from '@/lib/api'
import { Button } from '@/components/ui/button'
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

const HISTORY_JOB_KEY = ['migration-history', 'job'] as const

function formatStartError(error: unknown): string {
  if (error instanceof ApiError) {
    if (/^\s*<(?:!doctype|html)/i.test(error.message)) {
      const h1 = error.message.match(/<h1[^>]*>([^<]+)<\/h1>/i)?.[1]?.trim()
      if (!h1) return `${error.status} ${error.name}`
      return new RegExp(`^${error.status}\\b`).test(h1) ? h1 : `${error.status} ${h1}`
    }
    return `${error.status} ${error.message}`
  }
  if (error instanceof Error) return error.message
  return String(error)
}

/**
 * History migration card. Sibling of MigrationPanel under the same Migration tab.
 *
 * Branches between three button modes based on the current job state:
 *  - idle (no job, no DB row) → "Run history migration" with reset=false
 *  - state=COMPLETED or normal FAILED → "Retry (reset state)" with reset=true
 *  - synthesized FAILED-from-stuck-IN_PROGRESS (errorMessage carries the
 *    `marked IN_PROGRESS` marker from the backend's A7.1 path) → "Force reset"
 *    plus disabled "Retry" until the operator clears the stale claim.
 */
export function MigrationHistoryPanel() {
  const job = useHistoryMigrationJob()
  const jobData = job.data ?? null
  const isRunning = jobData?.state === 'RUNNING'
  const startHistory = useRunHistoryMigration()
  const forceReset = useForceResetHistory()
  const adminMode = useAdminMode((s) => s.enabled)
  const queryClient = useQueryClient()
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
  const isFailed = jobData?.state === 'FAILED' && !isStuck
  const isCompleted = jobData?.state === 'COMPLETED'
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
      queryClient.invalidateQueries({ queryKey: HISTORY_JOB_KEY })
    }
  }, [jobData?.state, result, queryClient])

  async function runHistoryMigration() {
    // Re-derive `reset` from the LIVE state at confirm time (not snapshot at
    // button-click time). See useState comment above.
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
    !adminMode || isRunning || startHistory.isPending || componentsRunning || isStuck
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
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            {jobData.totalCommits === 0 ? (
              <div className="h-full bg-primary/60 animate-pulse" />
            ) : (
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${processedPct}%` }}
              />
            )}
          </div>
        </div>
      )}

      {isFailed && jobData?.errorMessage && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          History migration failed: {jobData.errorMessage}
        </div>
      )}

      {isStuck && jobData?.errorMessage && (
        <div
          data-testid="history-stuck-banner"
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {jobData.errorMessage}
        </div>
      )}

      {startHistory.isError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {formatStartError(startHistory.error)}
        </div>
      )}

      {forceReset.isError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          Force reset failed: {formatStartError(forceReset.error)}
        </div>
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
  if (job.currentSha) return `Processing commit ${job.currentSha}`
  return 'Processing commits…'
}
