import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useAdminMode } from '@/lib/adminModeStore'
import { useTeamCityResync } from '@/hooks/useTeamCityResync'
import { toast } from '@/hooks/use-toast'
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
 * Admin button for `POST /admin/teamcity-project-ids/resync` (CRS PR-2).
 *
 * Mirrors the [MigrationPanel] pattern: confirm dialog → mutation → counter
 * tiles + first-error banner on success, destructive banner on error. Synchronous
 * (single-request) rather than async-job because the operation is short
 * relative to the UI's expected wait window. Admin mode toggle in the footer
 * arms the button.
 *
 * Result counter shape — see [TeamCityResyncResult].
 */
export function TeamCityResyncPanel() {
  const resync = useTeamCityResync()
  const adminMode = useAdminMode((s) => s.enabled)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const result = resync.data ?? null
  const errorCount = result?.errors.length ?? 0
  const buttonDisabled = !adminMode || resync.isPending

  async function runResync() {
    setConfirmOpen(false)
    try {
      const r = await resync.mutateAsync()
      toast({
        title: 'TC resync completed',
        description: `${r.scanned} scanned, ${r.updated} updated, ${r.unchanged} unchanged, ${r.skipped_no_match} no match, ${r.skipped_ambiguous} ambiguous, ${r.errors.length} errors`,
      })
    } catch {
      // Error rendered via the destructive StatusBanner below — leaving the
      // toast off here so the failure surface is consistent with the
      // migration panel (which also routes errors to a banner, not toast).
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={buttonDisabled}
          aria-busy={resync.isPending}
        >
          {resync.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
          {resync.isPending ? 'Resyncing…' : 'Resync TC project IDs'}
        </Button>
        {!adminMode && (
          <span className="text-xs text-muted-foreground">
            Enable Admin mode in the footer to run resync.
          </span>
        )}
      </div>

      {resync.isError && (
        <StatusBanner variant="destructive">
          {resync.error instanceof Error ? resync.error.message : String(resync.error)}
        </StatusBanner>
      )}

      {result && !resync.isPending && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            <StatCard label="Scanned" value={result.scanned} />
            <StatCard label="Updated" value={result.updated} />
            <StatCard label="Unchanged" value={result.unchanged} />
            <StatCard label="No match" value={result.skipped_no_match} />
            <StatCard label="Ambiguous" value={result.skipped_ambiguous} />
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
              replaced. The operation can take a minute on large registries.
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
