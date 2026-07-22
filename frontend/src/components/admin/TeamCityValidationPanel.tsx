import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useAdminMode } from '@/lib/adminModeStore'
import {
  useHistoryMigrationJob,
  useMigrationJob,
} from '@/hooks/useMigration'
import { useTeamCityResyncJob } from '@/hooks/useTeamCityResync'
import {
  useRunTeamCityValidation,
  useTeamCityValidationJob,
} from '@/hooks/useTeamCityValidation'
import { toast } from '@/hooks/use-toast'
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
import { StatCard } from './StatCard'

/**
 * Admin panel for `POST /admin/teamcity-validation`.
 *
 * Mirrors [TeamCityResyncPanel] exactly — confirm dialog → start mutation →
 * poll the job state → render progress (RUNNING) / counter tiles (COMPLETED)
 * / destructive banner (FAILED). Cross-disabled against the components
 * migration, history migration, AND the TC resync card (all four async jobs
 * share the same single-flight lifecycle gate on the backend).
 */
export function TeamCityValidationPanel() {
  const job = useTeamCityValidationJob()
  const jobData = job.data ?? null
  const isRunning = jobData?.state === 'RUNNING'
  const isFailed = jobData?.state === 'FAILED'
  const isCompleted = jobData?.state === 'COMPLETED'
  const result = jobData?.result ?? null
  const errorCount = result?.errors.length ?? 0

  const startValidation = useRunTeamCityValidation()
  const adminMode = useAdminMode((s) => s.enabled)
  const queryClient = useQueryClient()
  const [confirmOpen, setConfirmOpen] = useState(false)

  // Cross-disable against the other three async kinds. React Query dedupes
  // these GETs against the resync/migration panels' own subscriptions, so
  // calling these hooks here does not cost extra requests.
  const componentsJob = useMigrationJob()
  const componentsRunning = componentsJob.data?.state === 'RUNNING'
  const historyJob = useHistoryMigrationJob()
  const historyRunning = historyJob.data?.state === 'RUNNING'
  const resyncJob = useTeamCityResyncJob()
  const resyncRunning = resyncJob.data?.state === 'RUNNING'

  // Toast + cache invalidation on terminal COMPLETED state — see
  // TeamCityResyncPanel's identical effect for the full id-dedupe rationale.
  const invalidatedJobs = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (jobData?.state !== 'COMPLETED' || !result) return
    if (invalidatedJobs.current.has(jobData.id)) return
    invalidatedJobs.current.add(jobData.id)
    toast({
      title: 'TC validation completed',
      description:
        `${result.scanned} scanned, ${result.findings} findings, ` +
        `${result.componentsWithIssues} components with issues, ${result.errors.length} errors`,
    })
    queryClient.invalidateQueries({ queryKey: ['components'] })
    queryClient.invalidateQueries({
      predicate: (query) => query.queryKey[0] === 'component',
    })
    queryClient.invalidateQueries({ queryKey: ['teamcity-validations'] })
  }, [jobData?.state, jobData?.id, result, queryClient])

  async function runValidation() {
    setConfirmOpen(false)
    await startValidation.mutateAsync().catch(() => undefined)
  }

  const buttonDisabled =
    !adminMode ||
    isRunning ||
    startValidation.isPending ||
    componentsRunning ||
    historyRunning ||
    resyncRunning

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant={adminMode ? 'destructive' : 'default'}
          onClick={() => setConfirmOpen(true)}
          disabled={buttonDisabled}
          aria-busy={isRunning || startValidation.isPending}
        >
          {(isRunning || startValidation.isPending) && <Loader2 className="animate-spin" aria-hidden="true" />}
          {isRunning
            ? 'Validating…'
            : startValidation.isPending
              ? 'Starting…'
              : 'Run TC validation'}
        </Button>
        {!adminMode && (
          <span className="text-xs text-muted-foreground">
            Arm Admin mode above to run validation.
          </span>
        )}
        {adminMode && (componentsRunning || historyRunning || resyncRunning) && !isRunning && (
          <span className="text-xs text-muted-foreground">
            {componentsRunning
              ? 'Components migration'
              : historyRunning
                ? 'History migration'
                : 'TC resync'}{' '}
            is running — wait for it to finish.
          </span>
        )}
        {jobData?.finishedAt && !isRunning && (
          <span className="ml-auto text-xs text-muted-foreground">
            Last run <RelativeTime ts={jobData.finishedAt} />
          </span>
        )}
      </div>

      {isRunning && (
        <div
          data-testid="tc-validation-progress"
          className="rounded-md border bg-card p-3 space-y-2 text-sm"
          aria-busy="true"
          aria-live="polite"
        >
          <div className="font-medium">Checking TeamCity projects against registered components…</div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            {/* Indeterminate: no per-component progress events yet. */}
            <div className="h-full bg-primary/60 animate-pulse" />
          </div>
        </div>
      )}

      {isFailed && jobData?.errorMessage && (
        <StatusBanner variant="destructive">
          TC validation failed: {jobData.errorMessage}
        </StatusBanner>
      )}

      {startValidation.isError && (
        <StatusBanner variant="destructive">
          {formatMigrationError(startValidation.error)}
        </StatusBanner>
      )}

      {isCompleted && result && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Scanned" value={result.scanned} />
            <StatCard label="Findings" value={result.findings} />
            <StatCard label="Components with issues" value={result.componentsWithIssues} />
            <StatCard label="Errors" value={errorCount} />
          </div>
          {errorCount > 0 && (
            <details className="rounded-md border p-3 text-sm">
              <summary className="cursor-pointer font-medium">
                Errors ({errorCount})
              </summary>
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                {result.errors.map((msg, i) => (
                  <li key={i} className="font-mono break-all">
                    {msg}
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
            <DialogTitle>Run TC validation?</DialogTitle>
            <DialogDescription>
              Scans every component's TeamCity project(s) and records validation
              findings (e.g. build config drift, version mismatches) against
              them. The operation runs in the background and progress will
              appear in this tab; on large registries it can take several
              minutes.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={runValidation}>
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
