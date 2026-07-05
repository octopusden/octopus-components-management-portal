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
import type { SupportedVersionsSection } from './useSupportedVersionsSection'
import { isValidVersionRange, isAllowedOverrideRange, formatVersionRange, compareVersionRanges } from '../../lib/versionRange'

interface SupportedVersionsTabProps {
  section: SupportedVersionsSection
  // Read-only when the user can't edit the component — the list still renders.
  canEdit: boolean
}

/**
 * Supported-versions (coverage) editor — ADR-018 layer 1. Coverage is independent of per-attribute
 * overrides: a version outside `supported` resolves to 404. `all = true` means every version is
 * covered (no bounded rows); otherwise coverage is the union of the listed ranges.
 *
 * Presentational only: the draft, dirty flag, diff and PUT live in
 * `useSupportedVersionsSection` (owned by ComponentDetailPage). Every edit is a
 * DRAFT change that flows through the page's single sticky Save bar → Review
 * diff → PUT on Confirm; Discard reverts. There is no immediate per-edit PUT.
 * Coverage is stored MERGED server-side (overlapping / contiguous ranges
 * collapse; a set tiling all-versions becomes `all`), so the response the save
 * re-seeds from may be a canonicalised form of what was typed.
 */
export function SupportedVersionsTab({ section, canEdit }: SupportedVersionsTabProps) {
  const { state, warnings, isLoading, isError, addRange, removeRange, setAllVersions } = section

  const [newRange, setNewRange] = useState('')
  // Confirmation gate for the silent widen-to-ALL: removing the last remaining
  // range would empty coverage, which is all-versions — so route that through an
  // explicit confirmation that flips the draft to all=true (a deliberate intent),
  // never a delete side-effect.
  const [confirmWidenOpen, setConfirmWidenOpen] = useState(false)

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading supported versions…</p>
  }

  // A failed GET must NOT fall through to an empty draft — that would let the user
  // stage coverage changes against an unknown baseline (and a save could widen or
  // narrow from the wrong starting point). Surface the error and render nothing editable.
  if (isError) {
    return (
      <p className="text-sm text-destructive" role="alert">
        Could not load supported versions. Reload the page before editing coverage.
      </p>
    )
  }

  const ranges = [...state.ranges].sort(compareVersionRanges)

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

  function handleAdd() {
    if (trimmedNew === '' || addRangeError !== null) return
    addRange(trimmedNew)
    setNewRange('')
  }

  function handleRemove(range: string) {
    // Removing this range would leave an empty set, which is all-versions
    // coverage. Gate that behind an explicit confirmation; a delete that still
    // leaves ≥1 range is unambiguous, so apply it to the draft immediately.
    if (ranges.filter((r) => r !== range).length === 0) {
      setConfirmWidenOpen(true)
      return
    }
    removeRange(range)
  }

  function confirmWiden() {
    setAllVersions()
    setConfirmWidenOpen(false)
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

      {state.all ? (
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
              onChange={(e) => setNewRange(e.target.value)}
            />
            <Button
              size="sm"
              disabled={trimmedNew === '' || addRangeError !== null}
              onClick={handleAdd}
            >
              <Plus className="mr-1 h-3 w-3" /> Add range
            </Button>
            {!state.all && (
              <Button size="sm" variant="outline" onClick={setAllVersions}>
                Set to all versions
              </Button>
            )}
          </div>
          {addRangeError && <p className="text-xs text-destructive">{addRangeError}</p>}
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

      <Dialog open={confirmWidenOpen} onOpenChange={setConfirmWidenOpen}>
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
              as deleting one of several ranges. The change is staged; review and Save to apply it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmWidenOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmWiden}>
              Widen to all versions
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
