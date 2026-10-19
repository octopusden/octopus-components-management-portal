import type { PlacementDiffRowStatus } from './types'

export type PlacementStatusBucket = 'ready' | 'needsLook' | 'cantDerive' | 'nothingToDo'

/**
 * Everything the panel needs per raw status: the badge tone, the human label
 * (the raw code stays available as a tooltip — it cross-references the CSV/HTML
 * report), which of the four summary buckets it falls into, and whether
 * TeamCity derived values for the row.
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

export type PlacementStatusInfo = (typeof STATUS_INFO)[PlacementDiffRowStatus]

/**
 * CRS deploys independently of the Portal, so a status this build doesn't know
 * can arrive: show its raw code, neutral, under "Needs a look", not derived.
 */
export function placementStatusInfo(status: string): PlacementStatusInfo {
  if (Object.hasOwn(STATUS_INFO, status)) return STATUS_INFO[status as PlacementDiffRowStatus]
  return { tone: 'secondary', label: status, bucket: 'needsLook', derived: false }
}

/** The four summary-bar buckets, in display order, each with its plain-English label. */
export const PLACEMENT_STATUS_BUCKETS: { id: PlacementStatusBucket; label: string }[] = [
  { id: 'ready', label: 'Ready' },
  { id: 'needsLook', label: 'Needs a look' },
  { id: 'cantDerive', label: "Can't derive" },
  { id: 'nothingToDo', label: 'Nothing to do' },
]
