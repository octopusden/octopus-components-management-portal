import { placementStatusInfo } from './placementStatus'
import type { PlacementRowDiff } from './types'

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
  // Whether a row was derived is decided by its status: on the wire every derived field is present,
  // and null is also a real derived value ("checkout root"). A report-only row proposes nothing.
  if (!placementStatusInfo(row.status).derived) return []
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

/** "a, b, c" for up to `max` keys, else "a, b, … and N more" — the Sync confirm dialog's component list. */
export function summarizeKeys(keys: string[], max = 10): string {
  if (keys.length <= max) return keys.join(', ')
  return `${keys.slice(0, max).join(', ')}, and ${keys.length - max} more`
}

/** Total changed fields across the selected components' rows — what a Sync of them would write. */
export function countChangedFields(rows: PlacementRowDiff[], selectedIds: Set<string>): number {
  return rows
    .filter((row) => selectedIds.has(row.componentId))
    .reduce((total, row) => total + buildProposedChangeLines(row).length, 0)
}
