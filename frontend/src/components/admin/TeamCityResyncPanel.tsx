import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useAdminMode } from '@/lib/adminModeStore'
import {
  useHistoryMigrationJob,
  useMigrationJob,
} from '@/hooks/useMigration'
import {
  useRunTeamCityResync,
  useTeamCityResyncJob,
} from '@/hooks/useTeamCityResync'
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
import { StatCard } from './StatCard'

/**
 * Admin panel for `POST /admin/teamcity-project-ids/sync`.
 *
 * Mirrors the [MigrationPanel] async-job pattern: confirm dialog → start
 * mutation → poll the job state → render progress (RUNNING) / counter tiles
 * (COMPLETED) / destructive banner (FAILED).
 *
 * Cross-disabled against the components-migration card and the
 * history-migration card: the backend's `MigrationLifecycleGate` would 409
 * a cross-kind start anyway, but the SPA disables the button so the user
 * never sees that error path.
 *
 * No per-component progress in v1 — the backend has nothing to report there
 * (TC sync is not currently instrumented with a progress listener). The
 * RUNNING state shows an indeterminate spinner instead. If/when the backend
 * adds progress events, this panel can switch to the determinate bar
 * pattern from MigrationPanel without changing the wire shape.
 */
export function TeamCityResyncPanel() {
  const job = useTeamCityResyncJob()
  const jobData = job.data ?? null
  const isRunning = jobData?.state === 'RUNNING'
  const isFailed = jobData?.state === 'FAILED'
  const isCompleted = jobData?.state === 'COMPLETED'
  const result = jobData?.result ?? null
  const errorCount = result?.errors.length ?? 0

  const startResync = useRunTeamCityResync()
  const adminMode = useAdminMode((s) => s.enabled)
  const queryClient = useQueryClient()
  const [confirmOpen, setConfirmOpen] = useState(false)

  // Cross-disable against the other two async kinds. React Query dedupes
  // these GETs, so calling these hooks here does not cost extra requests —
  // they share the cache entry the migration panels read.
  const componentsJob = useMigrationJob()
  const componentsRunning = componentsJob.data?.state === 'RUNNING'
  const historyJob = useHistoryMigrationJob()
  const historyRunning = historyJob.data?.state === 'RUNNING'

  // Toast + cache invalidation on terminal COMPLETED state. The async POST
  // returning success only means "job started", so cache invalidation cannot
  // live in the mutation's onSuccess (the legacy synchronous variant did
  // exactly that, but in the async flow the DB is not yet updated when the
  // mutation resolves). The mutation hook handles the rare COMPLETED-on-start
  // race; this effect handles every other path.
  //
  // Keyed off the job id (rather than a RUNNING → COMPLETED transition) so
  // the post-pod-restart case still triggers: if the pod restarts after the
  // job finishes, the panel mounts directly into a COMPLETED state with no
  // RUNNING phase observed, but the user still hasn't seen the toast or got
  // a fresh component list. Tracking which ids we already invalidated for
  // (in a ref so it survives re-renders without causing an extra render)
  // dedupes within the same panel mount; a fresh mount post-restart starts
  // with an empty set and fires once for the recovered job.
  const invalidatedJobs = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (jobData?.state !== 'COMPLETED' || !result) return
    if (invalidatedJobs.current.has(jobData.id)) return
    invalidatedJobs.current.add(jobData.id)
    toast({
      title: 'TC resync completed',
      description:
        `${result.scanned} scanned, ${result.updated} updated, ${result.unchanged} unchanged, ` +
        `${result.skipped_no_match} no match, ${result.skipped_ambiguous} ambiguous, ` +
        `${result.ambiguous_auto_resolved ?? 0} auto-resolved, ${result.errors.length} errors`,
    })
    queryClient.invalidateQueries({ queryKey: ['components'] })
    queryClient.invalidateQueries({
      predicate: (query) => query.queryKey[0] === 'component',
    })
    // `result` is in the dep array because the backend can serialize a
    // COMPLETED state in a single tick where `state` and `result` arrive
    // together; both must be readable when the effect fires. The id-based
    // dedupe guards against the (theoretical) split-tick path where state
    // flips first and result lands on the next poll — only the second tick
    // has both, but the first already advanced our ref.
  }, [jobData?.state, jobData?.id, result, queryClient])

  async function runResync() {
    setConfirmOpen(false)
    // Errors surface through mutation.error → destructive block below.
    await startResync.mutateAsync().catch(() => undefined)
  }

  const buttonDisabled =
    !adminMode || isRunning || startResync.isPending || componentsRunning || historyRunning

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={buttonDisabled}
          aria-busy={isRunning || startResync.isPending}
        >
          {(isRunning || startResync.isPending) && <Loader2 className="animate-spin" aria-hidden="true" />}
          {isRunning
            ? 'Resyncing…'
            : startResync.isPending
              ? 'Starting…'
              : 'Resync TC project IDs'}
        </Button>
        {!adminMode && (
          <span className="text-xs text-muted-foreground">
            Enable Admin mode in the footer to run resync.
          </span>
        )}
        {adminMode && (componentsRunning || historyRunning) && !isRunning && (
          <span className="text-xs text-muted-foreground">
            {componentsRunning ? 'Components migration' : 'History migration'} is running — wait for it to finish.
          </span>
        )}
      </div>

      {isRunning && (
        <div
          data-testid="tc-resync-progress"
          className="rounded-md border bg-card p-3 space-y-2 text-sm"
          aria-busy="true"
          aria-live="polite"
        >
          <div className="font-medium">Querying TeamCity for matching projects…</div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            {/* Indeterminate: TC sync has no per-component progress events yet. */}
            <div className="h-full bg-primary/60 animate-pulse" />
          </div>
        </div>
      )}

      {isFailed && jobData?.errorMessage && (
        <StatusBanner variant="destructive">
          TC resync failed: {jobData.errorMessage}
        </StatusBanner>
      )}

      {startResync.isError && (
        <StatusBanner variant="destructive">
          {formatMigrationError(startResync.error)}
        </StatusBanner>
      )}

      {isCompleted && result && (
        <div className="space-y-3">
          {/*
           * 7 tiles: 3-up on phones, 4-up on tablets (so 7 wraps as 4+3),
           * 7-up on desktop. "Auto-resolved" sits next to "Ambiguous"
           * because it's a sub-counter explaining how the CDRelease
           * tie-break is performing on multi-candidate matches.
           */}
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            <StatCard label="Scanned" value={result.scanned} />
            <StatCard label="Updated" value={result.updated} />
            <StatCard label="Unchanged" value={result.unchanged} />
            <StatCard label="No match" value={result.skipped_no_match} />
            <StatCard label="Ambiguous" value={result.skipped_ambiguous} />
            <StatCard label="Auto-resolved" value={result.ambiguous_auto_resolved ?? 0} />
            <StatCard label="Errors" value={errorCount} />
          </div>
          {errorCount > 0 && (
            <details className="rounded-md border p-3 text-sm">
              <summary className="cursor-pointer font-medium">
                Errors ({errorCount})
              </summary>
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                {result.errors.map((msg, i) => (
                  // Keys: errors are free-form strings without an id, so the
                  // index is the only stable handle. Acceptable here because
                  // the list is fully replaced on every resync run — React
                  // never reconciles between two runs.
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
            <DialogTitle>Resync TC project IDs?</DialogTitle>
            <DialogDescription>
              Scans every component, queries TeamCity for projects whose
              COMPONENT_NAME parameter matches the component id, and rewrites
              the persisted teamcityProjectId + teamcityProjectUrl when the
              match changes. Manual overrides for affected components will be
              replaced. The operation runs in the background and progress
              will appear in this tab; on large registries it can take
              several minutes.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={runResync}>
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
