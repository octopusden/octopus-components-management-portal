import type { PlacementDiffRowStatus } from './types'

export type PlacementStatusBucket = 'ready' | 'needsLook' | 'cantDerive' | 'nothingToDo'

/**
 * Everything the redesigned panel needs per raw status, in one place: the
 * badge tone, the human label (the raw code stays available as a tooltip —
 * it cross-references the CSV/HTML report), and which of the four summary
 * buckets it falls into.
 */
const STATUS_INFO: Record<
  PlacementDiffRowStatus,
  { tone: 'success' | 'secondary' | 'warning' | 'destructive'; label: string; bucket: PlacementStatusBucket }
> = {
  RESOLVED: { tone: 'success', label: 'Ready to sync', bucket: 'ready' },
  CONFLICT: { tone: 'destructive', label: 'TeamCity configurations disagree', bucket: 'needsLook' },
  INVALID: { tone: 'destructive', label: 'Derived value fails validation', bucket: 'needsLook' },
  TC_ERROR: { tone: 'destructive', label: 'TeamCity error', bucket: 'needsLook' },
  MANUAL_EDIT: { tone: 'warning', label: 'Edited manually — kept', bucket: 'needsLook' },
  UNEXPRESSIBLE: { tone: 'warning', label: "Checkout rule can't be represented", bucket: 'cantDerive' },
  NO_CHAIN: { tone: 'warning', label: 'No TeamCity chain found', bucket: 'cantDerive' },
  OUTSIDE_TEMPLATES: { tone: 'warning', label: 'Not on a supported template', bucket: 'cantDerive' },
  COMPILE_PAUSED: { tone: 'warning', label: 'Compile configurations paused', bucket: 'cantDerive' },
  ROOTS_MISMATCH: { tone: 'warning', label: 'VCS roots differ from the registry', bucket: 'cantDerive' },
  IN_SYNC: { tone: 'secondary', label: 'Already in sync', bucket: 'nothingToDo' },
}

/** Badge tone per Diff row status (`PlacementDiffRowStatus`, ADR-002's eleven outcomes). */
export function getPlacementStatusTone(status: PlacementDiffRowStatus) {
  return STATUS_INFO[status].tone
}

/** Human-readable label. The raw `status` code stays available as a tooltip/title. */
export function getPlacementStatusLabel(status: PlacementDiffRowStatus): string {
  return STATUS_INFO[status].label
}

/** Which of the four summary buckets (Ready / Needs a look / Can't derive / Nothing to do) a status falls into. */
export function getPlacementStatusBucket(status: PlacementDiffRowStatus): PlacementStatusBucket {
  return STATUS_INFO[status].bucket
}

/** The four summary-bar buckets, in display order, each with its plain-English label. */
export const PLACEMENT_STATUS_BUCKETS: { id: PlacementStatusBucket; label: string }[] = [
  { id: 'ready', label: 'Ready' },
  { id: 'needsLook', label: 'Needs a look' },
  { id: 'cantDerive', label: "Can't derive" },
  { id: 'nothingToDo', label: 'Nothing to do' },
]

/** Only RESOLVED + BASE rows are ever selectable for Sync (per-range `vcs.settings` rows are report-only). */
export function isPlacementRowSelectable(row: { status: PlacementDiffRowStatus; rowLabel: string }): boolean {
  return row.status === 'RESOLVED' && row.rowLabel === 'BASE'
}
