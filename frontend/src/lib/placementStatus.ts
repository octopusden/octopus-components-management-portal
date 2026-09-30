import type { PlacementDiffRowStatus } from './types'

/**
 * Badge tone per Diff row status (`PlacementDiffRowStatus`, ADR-002's ten
 * outcomes). RESOLVED is the only status ever offered to Sync; the rest are
 * report-only, colour-coded by how alarming they are.
 */
export function getPlacementStatusTone(
  status: PlacementDiffRowStatus,
): 'success' | 'secondary' | 'warning' | 'destructive' {
  switch (status) {
    case 'RESOLVED':
      return 'success'
    // OUTSIDE_SCOPE: archived components and per-range (vcs.settings) marker
    // rows — always report-only, never a Sync candidate, but not alarming.
    case 'IN_SYNC':
    case 'OUTSIDE_SCOPE':
      return 'secondary'
    case 'INVALID':
    case 'CONFLICT':
    case 'TC_ERROR':
      return 'destructive'
    case 'UNEXPRESSIBLE':
    case 'NO_CHAIN':
    case 'OUTSIDE_TEMPLATES':
    case 'COMPILE_PAUSED':
    case 'MANUAL_EDIT':
      return 'warning'
  }
}

/** Only RESOLVED + BASE rows are ever selectable for Sync (per-range `vcs.settings` rows are report-only). */
export function isPlacementRowSelectable(row: { status: PlacementDiffRowStatus; rowLabel: string }): boolean {
  return row.status === 'RESOLVED' && row.rowLabel === 'BASE'
}
