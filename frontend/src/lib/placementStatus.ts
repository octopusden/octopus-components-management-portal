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
  {
    tone: 'success' | 'secondary' | 'warning' | 'destructive'
    label: string
    bucket: PlacementStatusBucket
    /** TeamCity derived values for the row (vs. a report-only row). */
    derived: boolean
  }
> = {
  RESOLVED: { tone: 'success', label: 'Ready to sync', bucket: 'ready', derived: true },
  CONFLICT: { tone: 'destructive', label: 'TeamCity configurations disagree', bucket: 'needsLook', derived: false },
  INVALID: { tone: 'destructive', label: 'Derived value fails validation', bucket: 'needsLook', derived: true },
  TC_ERROR: { tone: 'destructive', label: 'TeamCity error', bucket: 'needsLook', derived: false },
  MANUAL_EDIT: { tone: 'warning', label: 'Edited manually — kept', bucket: 'needsLook', derived: true },
  UNEXPRESSIBLE: { tone: 'warning', label: "Checkout rule can't be represented", bucket: 'cantDerive', derived: false },
  NO_CHAIN: { tone: 'warning', label: 'No TeamCity chain found', bucket: 'cantDerive', derived: false },
  OUTSIDE_TEMPLATES: { tone: 'warning', label: 'Not on a supported template', bucket: 'cantDerive', derived: false },
  COMPILE_PAUSED: { tone: 'warning', label: 'Compile configurations paused', bucket: 'cantDerive', derived: false },
  ROOTS_MISMATCH: { tone: 'warning', label: 'VCS roots differ from the registry', bucket: 'cantDerive', derived: false },
  IN_SYNC: { tone: 'secondary', label: 'Already in sync', bucket: 'nothingToDo', derived: true },
}

/** Narrows a wire status to one this build knows; null for anything newer. */
export function toKnownStatus(s: string): PlacementDiffRowStatus | null {
  return Object.hasOwn(STATUS_INFO, s) ? (s as PlacementDiffRowStatus) : null
}

/**
 * CRS deploys independently of the Portal, so a status this build doesn't know
 * can arrive: show its raw code, neutral, under "Needs a look"; never selectable.
 */
function statusInfo(status: string) {
  const known = toKnownStatus(status)
  if (known) return STATUS_INFO[known]
  return { tone: 'secondary' as const, label: status, bucket: 'needsLook' as const, derived: false }
}

/** Badge tone per Diff row status (`PlacementDiffRowStatus`, ADR-002's eleven outcomes). */
export function getPlacementStatusTone(status: string) {
  return statusInfo(status).tone
}

/** Human-readable label. The raw `status` code stays available as a tooltip/title. */
export function getPlacementStatusLabel(status: string): string {
  return statusInfo(status).label
}

/** Which of the four summary buckets (Ready / Needs a look / Can't derive / Nothing to do) a status falls into. */
export function getPlacementStatusBucket(status: string): PlacementStatusBucket {
  return statusInfo(status).bucket
}

/** Whether TeamCity derived values for a row with this status. */
export function isPlacementStatusDerived(status: string): boolean {
  return statusInfo(status).derived
}

/** The four summary-bar buckets, in display order, each with its plain-English label. */
export const PLACEMENT_STATUS_BUCKETS: { id: PlacementStatusBucket; label: string }[] = [
  { id: 'ready', label: 'Ready' },
  { id: 'needsLook', label: 'Needs a look' },
  { id: 'cantDerive', label: "Can't derive" },
  { id: 'nothingToDo', label: 'Nothing to do' },
]

/** Only RESOLVED + BASE rows are ever selectable for Sync (per-range `vcs.settings` rows are report-only). */
export function isPlacementRowSelectable(row: { status: string; rowLabel: string }): boolean {
  return row.status === 'RESOLVED' && row.rowLabel === 'BASE'
}
