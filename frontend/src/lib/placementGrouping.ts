import { isPlacementRowSelectable } from './placementStatus'
import type { PlacementDiffRowStatus, PlacementRowDiff } from './types'

/**
 * "current → derived", null-aware: `null` (the wire value for "no
 * directory override") and `undefined` (the field wasn't diffed at all) both
 * mean "no value", and equal values mean no change either way — neither
 * renders anything. A `null` directory side renders as "(root)".
 */
export function fieldChange(current: string | null | undefined, derived: string | null | undefined): string | null {
  const before = current ?? null
  const after = derived ?? null
  if (before === after) return null
  return `${before ?? '(root)'} → ${after ?? '(root)'}`
}

/** One "Field name: before → after" line per changed field, in the "Proposed change" column. */
export function buildProposedChangeLines(row: PlacementRowDiff): string[] {
  const prefixRoot = row.entries.length > 1
  const lines: string[] = []
  for (const entry of row.entries) {
    const prefix = prefixRoot ? `${entry.name}: ` : ''
    const cd = fieldChange(entry.currentCheckoutDirectory, entry.derivedCheckoutDirectory)
    if (cd) lines.push(`${prefix}Checkout Directory: ${cd}`)
    const sp = fieldChange(entry.currentSourcePath, entry.derivedSourcePath)
    if (sp) lines.push(`${prefix}Source Path: ${sp}`)
  }
  const bwd = fieldChange(row.currentBuildWorkingDirectory, row.derivedBuildWorkingDirectory)
  if (bwd) lines.push(`Build Working Directory: ${bwd}`)
  return lines
}

/** Whether TeamCity derived anything at all for this row (vs. a report-only row where nothing was derived). */
export function wasRowDerived(row: PlacementRowDiff): boolean {
  if (row.derivedBuildWorkingDirectory !== undefined) return true
  return row.entries.some((e) => e.derivedCheckoutDirectory !== undefined || e.derivedSourcePath !== undefined)
}

/** "Base", or "Override for versions <range>" — the raw "vcs.settings" marker name is never shown. */
export function appliesToLabel(row: PlacementRowDiff): string {
  return row.rowLabel === 'BASE' ? 'Base' : `Override for versions ${row.versionRange}`
}

export interface PlacementComponentGroup {
  componentId: string
  componentKey: string
  /** Base row first, then overrides sorted by version range. */
  rows: PlacementRowDiff[]
  /** Distinct statuses present in the group, in row order — drives the header chips. */
  statuses: PlacementDiffRowStatus[]
  /** Whether the group's header checkbox can be checked — a RESOLVED Base row exists. */
  selectable: boolean
}

/** Groups Diff rows by component: Base first then overrides sorted by range, sorted by component key. */
export function groupPlacementRows(rows: PlacementRowDiff[]): PlacementComponentGroup[] {
  // Keyed by componentId; componentId/componentKey are captured at the row
  // that creates the bucket, so building the group never needs an
  // after-the-fact `rows[0]` (which noUncheckedIndexedAccess can't prove
  // non-empty even though a bucket is never created without its first row).
  const byComponent = new Map<string, PlacementComponentGroup>()
  for (const row of rows) {
    const group = byComponent.get(row.componentId)
    if (group) group.rows.push(row)
    else byComponent.set(row.componentId, { componentId: row.componentId, componentKey: row.componentKey, rows: [row], statuses: [], selectable: false })
  }

  const groups = [...byComponent.values()].map((group): PlacementComponentGroup => {
    const base = group.rows.filter((r) => r.rowLabel === 'BASE')
    const overrides = group.rows
      .filter((r) => r.rowLabel !== 'BASE')
      .sort((a, b) => a.versionRange.localeCompare(b.versionRange))
    const orderedRows = [...base, ...overrides]
    return {
      ...group,
      rows: orderedRows,
      statuses: [...new Set(orderedRows.map((r) => r.status))],
      selectable: base.some(isPlacementRowSelectable),
    }
  })

  return groups.sort((a, b) => a.componentKey.localeCompare(b.componentKey))
}

/** "a, b, c" for up to `max` keys, else "a, b, … and N more" — the Sync confirm dialog's component list. */
export function summarizeKeys(keys: string[], max = 10): string {
  if (keys.length <= max) return keys.join(', ')
  return `${keys.slice(0, max).join(', ')}, and ${keys.length - max} more`
}

/** Total changed fields across the selected components' Base rows — only Base rows are ever written. */
export function countChangedFields(groups: PlacementComponentGroup[], selectedIds: Set<string>): number {
  return groups
    .filter((g) => selectedIds.has(g.componentId))
    .reduce((total, g) => {
      const base = g.rows.find((r) => r.rowLabel === 'BASE')
      return total + (base ? buildProposedChangeLines(base).length : 0)
    }, 0)
}
