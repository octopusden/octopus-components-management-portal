import { useState } from 'react'
import { useAdminMode } from '@/lib/adminModeStore'
import { useMigrationStatus, useRunMigration } from '@/hooks/useMigration'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md border bg-card px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  )
}

export function MigrationPanel() {
  const status = useMigrationStatus()
  const mutation = useRunMigration()
  const adminMode = useAdminMode((s) => s.enabled)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const result = mutation.data
  const failures = result?.components.results.filter((r) => !r.success) ?? []

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
      // block below. No toast here — the inline error is more visible and
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
        >
          {mutation.isPending ? 'Running…' : 'Run migration'}
        </Button>
        {!adminMode && (
          <span className="text-xs text-muted-foreground">
            Enable Admin mode in the footer to run migration.
          </span>
        )}
      </div>

      {mutation.isError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {mutation.error instanceof Error ? mutation.error.message : String(mutation.error)}
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
