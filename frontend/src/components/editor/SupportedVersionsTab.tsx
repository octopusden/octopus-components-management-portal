import { useState } from 'react'
import { Plus, X, AlertTriangle, Infinity as InfinityIcon, Clock } from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog'
import { useSupportedVersions, useUpdateSupportedVersions } from '../../hooks/useComponent'
import { isValidVersionRange, isAllowedOverrideRange, formatVersionRange, compareVersionRanges } from '../../lib/versionRange'

interface SupportedVersionsTabProps {
  componentId: string
  // Read-only when the user can't edit the component — the list still renders.
  canEdit: boolean
}

/**
 * Supported-versions (coverage) editor — ADR-018 layer 1. Coverage is independent of per-attribute
 * overrides: a version outside `supported` resolves to 404. `all = true` means every version is
 * covered (no bounded rows); otherwise coverage is the union of the listed ranges.
 *
 * The API is declarative — every edit PUTs the full desired set, which the server stores MERGED
 * (overlapping / contiguous ranges collapse; a set tiling all-versions becomes `all`). Coverage is
 * decoupled from overrides — it never reshapes them; the v2/v3 range VIEWS are derived at read time.
 * The response surfaces V1/V5 warnings (an override left entirely outside supported).
 */
export function SupportedVersionsTab({ componentId, canEdit }: SupportedVersionsTabProps) {
  const { data, isLoading } = useSupportedVersions(componentId)
  const updateMutation = useUpdateSupportedVersions(componentId)

  const [newRange, setNewRange] = useState('')
  const [error, setError] = useState<string | null>(null)
  // Confirmation gate for the silent widen-to-ALL: deleting the ONLY remaining
  // range collapses coverage to all versions server-side, so the last-range
  // trash click opens this dialog instead of firing the PUT.
  const [confirmWidenOpen, setConfirmWidenOpen] = useState(false)

  if (isLoading || !data) {
    return <p className="text-sm text-muted-foreground">Loading supported versions…</p>
  }

  const ranges = [...data.ranges].sort(compareVersionRanges)
  const warnings = data.warnings ?? []

  // Live validation of the add input so the button can pre-disable (consistent with the field-override
  // editors) and the error shows as you type, not only after a click.
  const trimmedNew = newRange.trim()
  const addRangeError =
    trimmedNew === ''
      ? null
      : !isValidVersionRange(trimmedNew)
        ? 'Invalid version range syntax'
        : !isAllowedOverrideRange(trimmedNew)
          ? 'That is the all-versions default — use “Set to all versions”, or enter a bounded / open-upper range'
          : null

  function put(next: { all?: boolean; ranges?: string[] }, onSuccess?: () => void) {
    setError(null)
    updateMutation.mutate(next, {
      onSuccess: () => onSuccess?.(),
      onError: (e: unknown) => setError(e instanceof Error ? e.message : 'Failed to update supported versions'),
    })
  }

  function handleAdd() {
    if (trimmedNew === '' || addRangeError !== null) return
    // Clear the input only after the PUT succeeds, so a server rejection leaves the value to fix.
    put({ ranges: [...ranges, trimmedNew] }, () => setNewRange(''))
  }

  function handleRemove(range: string) {
    // Removing this range would leave an empty set, which CRS canonically stores
    // as all=true — a silent widen to ALL versions. Gate that behind an explicit
    // confirmation (a deliberate widen), never a delete side-effect. Key off the
    // POST-filter result (not ranges.length) so a defensive empty-after-remove is
    // caught even in the unexpected event of a duplicate range string.
    const remaining = ranges.filter((r) => r !== range)
    if (remaining.length === 0) {
      setConfirmWidenOpen(true)
      return
    }
    put({ ranges: remaining })
  }

  function confirmWiden() {
    // Transition to all=true only via this explicit confirmation — send {all:true}
    // rather than an empty ranges list, so the intent is unmistakable on the wire.
    put({ all: true }, () => setConfirmWidenOpen(false))
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        The versions this component is defined for. A version outside the supported set resolves to “no
        configuration” (404). Per-attribute overrides are edited separately under <strong>Overrides</strong>.
      </p>

      {warnings.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800" role="alert">
          <div className="flex items-center gap-1 font-medium">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" /> Warnings
          </div>
          <ul className="ml-5 list-disc">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {data.all ? (
        <div className="flex items-center gap-2 text-sm">
          <InfinityIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <span>
            Supported: <strong>All versions</strong>
          </span>
        </div>
      ) : (
        <ul className="space-y-1" aria-label="Supported version ranges">
          {ranges.map((range) => (
            <li key={range} className="flex items-center gap-2">
              <code className="rounded bg-muted px-1.5 py-0.5 text-sm">{formatVersionRange(range)}</code>
              {canEdit && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  aria-label={`Remove supported range ${range}`}
                  disabled={updateMutation.isPending}
                  onClick={() => handleRemove(range)}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Input
              aria-label="New supported version range"
              placeholder="[1.0,2.0) or [2.0,)"
              className="font-mono max-w-xs"
              value={newRange}
              onChange={(e) => {
                setNewRange(e.target.value)
                setError(null)
              }}
            />
            <Button
              size="sm"
              disabled={trimmedNew === '' || addRangeError !== null || updateMutation.isPending}
              onClick={handleAdd}
            >
              <Plus className="mr-1 h-3 w-3" /> Add range
            </Button>
            {!data.all && (
              <Button
                size="sm"
                variant="outline"
                disabled={updateMutation.isPending}
                onClick={() => put({ all: true })}
              >
                Set to all versions
              </Button>
            )}
          </div>
          {(addRangeError ?? error) && <p className="text-xs text-destructive">{addRangeError ?? error}</p>}
        </div>
      )}

      {/*
        Version lifecycle — FUTURE TEASER only (ADR-018 deferred item). The structure/placement is
        laid in here so the lifecycle layer (Active development / On maintenance / Archived) has a home
        in the Supported Versions tab; it is intentionally non-populated and non-interactive until a
        future release wires it to real per-range lifecycle state. Shown to everyone, read-only.
      */}
      <div
        className="rounded-md border border-dashed border-muted-foreground/30 p-3 opacity-70"
        aria-label="Version lifecycle (coming soon)"
      >
        <div className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Clock className="h-4 w-4" aria-hidden="true" />
          Version lifecycle
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-normal uppercase tracking-wide">
            Coming soon
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {['Active development', 'On maintenance', 'Archived'].map((state) => (
            <span
              key={state}
              className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground"
            >
              {state}
            </span>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          A future release will let you mark version ranges as active, on maintenance, or archived.
          Preview only — not yet editable.
        </p>
      </div>

      <Dialog
        open={confirmWidenOpen}
        // Hold the dialog open while the confirm PUT is in flight so Escape /
        // overlay-click can't "cancel" a request that will still land.
        onOpenChange={(open) => {
          if (updateMutation.isPending) return
          setConfirmWidenOpen(open)
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" aria-hidden="true" />
              Remove the only supported range?
            </DialogTitle>
            <DialogDescription>
              This is the last range, so removing it sets coverage to{' '}
              <strong>all versions</strong> — every historical version becomes supported, and
              per-attribute overrides resolve for versions you had excluded. This is not the same
              as deleting one of several ranges.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmWidenOpen(false)}
              disabled={updateMutation.isPending}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmWiden} disabled={updateMutation.isPending}>
              Widen to all versions
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
