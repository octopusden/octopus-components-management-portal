import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useAdminMode } from '@/lib/adminModeStore'
import { useMigrationStatus, useRunMigration } from '@/hooks/useMigration'
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

// Migrations against ~1k components routinely outlive the portal gateway's
// HTTP read timeout, so the synchronous POST returns 504 even though
// ImportService keeps working server-side. Treating that as a hard failure
// hides the truth — that the run is still in flight — and offers retry as
// the only escape, which would just kick a second migration on top of the
// first. We branch on the status code instead and surface a neutral
// "still running" banner whose authoritative counters come from the polling
// status endpoint.
const GATEWAY_TIMEOUT_STATUSES = new Set([502, 503, 504])

// While the mutation is pending, MigrationPanel polls /admin/migration-status
// every 3s so the operator sees DB counter increment as components are
// migrated. Three seconds is the slowest interval that still feels "live"
// for a multi-minute run; ImportService writes one row per component and
// large runs land 10–100 rows per 3s window in practice, so each tick
// surfaces meaningful change.
const STATUS_POLL_INTERVAL_MS = 3_000

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md border bg-card px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  )
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    // Gateway pages reach us as text/html; chopping out the marker text
    // keeps the destructive block readable and short. The status itself is
    // the load-bearing fact for the operator.
    if (/^\s*<(?:!doctype|html)/i.test(error.message)) {
      const h1 = error.message.match(/<h1[^>]*>([^<]+)<\/h1>/i)?.[1]?.trim()
      return h1 ? `${error.status} ${h1}` : `${error.status} ${error.name}`
    }
    return `${error.status} ${error.message}`
  }
  if (error instanceof Error) return error.message
  return String(error)
}

function isGatewayTimeoutError(error: unknown): error is ApiError {
  return error instanceof ApiError && GATEWAY_TIMEOUT_STATUSES.has(error.status)
}

export function MigrationPanel() {
  const mutation = useRunMigration()
  // Polling is armed only while the mutation is pending OR the last attempt
  // ended in a gateway-class error (the run is presumably still in flight on
  // CRS — keep refreshing counters so the operator can watch it finish).
  const stillRunningOnBackend = mutation.isPending || isGatewayTimeoutError(mutation.error)
  const status = useMigrationStatus({
    refetchInterval: stillRunningOnBackend ? STATUS_POLL_INTERVAL_MS : false,
  })
  const adminMode = useAdminMode((s) => s.enabled)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const result = mutation.data
  const failures = result?.components.results.filter((r) => !r.success) ?? []
  const gatewayTimedOut = isGatewayTimeoutError(mutation.error)

  async function runMigration() {
    setConfirmOpen(false)
    try {
      const res = await mutation.mutateAsync()
      const c = res.components
      toast({
        title: 'Migration completed',
        description: `${c.migrated}/${c.total} migrated, ${c.failed} failed`,
      })
    } catch {
      // Error state surfaces in the mutation hook → renders the destructive
      // block (or, for gateway-class errors, the neutral "still running"
      // banner) below. No toast — the inline notice is more visible and
      // sticks until the operator acts.
    }
  }

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
          onClick={() => setConfirmOpen(true)}
          disabled={!adminMode || mutation.isPending}
          aria-busy={mutation.isPending}
        >
          {mutation.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
          {mutation.isPending ? 'Running…' : 'Run migration'}
        </Button>
        {!adminMode && (
          <span className="text-xs text-muted-foreground">
            Enable Admin mode in the footer to run migration.
          </span>
        )}
      </div>

      {gatewayTimedOut && (
        <div
          data-testid="migration-still-running"
          className="rounded-md border border-amber-300/60 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-300/30 dark:bg-amber-950/40 dark:text-amber-100"
        >
          <div className="font-medium">Migration still running on the server</div>
          <div className="mt-1">
            The gateway timed out waiting for a response ({formatErrorMessage(mutation.error)}),
            but the migration job is still in flight on CRS. Counters above refresh every few
            seconds — they will keep advancing until the run finishes. Avoid clicking
            <span className="font-semibold"> Run migration</span> a second time, that would
            start a duplicate job.
          </div>
        </div>
      )}

      {mutation.isError && !gatewayTimedOut && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {formatErrorMessage(mutation.error)}
        </div>
      )}

      {result && (
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
              This rewrites component defaults and migrates every git-sourced component
              to the database. The operation can take several minutes.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={runMigration}>
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
