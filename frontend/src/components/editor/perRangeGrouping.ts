import type { FieldOverride } from '../../lib/types'
import { compareVersionRanges, mergeAdjacentRanges } from '../../lib/versionRange'
import { deepEqual } from '../../lib/editor/diffUtil'

/**
 * A run of per-attribute overrides shown as one coalesced row. Contiguous
 * overrides that carry the same value collapse into a single group spanning the
 * union range (parity with the merged supported-versions view); everything else
 * stays a one-member group.
 */
export interface PerRangeGroup {
  /** Underlying overrides in this run, sorted low→high by range (always ≥ 1). */
  members: FieldOverride[]
  /** The lowest-range member — its value/attribute represents the whole group
   *  (all members share the same value) and seeds the edit dialog. */
  representative: FieldOverride
  /** Union range spanning every member; equals the sole member's range when the
   *  group has one member. */
  displayRange: string
}

/** Two overrides carry the same effective value (scalar `value` or the marker
 *  child collection) AND override the same attribute — the equality that lets
 *  contiguous ranges coalesce. Callers pass a single-attribute list today, but
 *  the attribute guard keeps a future mixed-attribute caller from merging two
 *  different attributes that happen to share a structurally-equal empty value. */
function sameValue(a: FieldOverride, b: FieldOverride): boolean {
  return (
    a.overriddenAttribute === b.overriddenAttribute &&
    deepEqual(a.markerChildren ?? null, b.markerChildren ?? null) &&
    deepEqual(a.value ?? null, b.value ?? null)
  )
}

/**
 * Coalesce per-attribute overrides into display groups. A group grows while the
 * next override is BOTH exactly contiguous with the group's running range (see
 * {@link mergeAdjacentRanges}) AND deeply value-equal to it; otherwise a new
 * group starts. Input need not be pre-sorted — this sorts defensively by range
 * so contiguity is evaluated low→high. All members of a returned group carry the
 * same value, so `summarize(representative)` describes the whole row.
 */
export function coalescePerRangeOverrides(overrides: FieldOverride[]): PerRangeGroup[] {
  const sorted = [...overrides].sort((a, b) => compareVersionRanges(a.versionRange, b.versionRange))
  const groups: PerRangeGroup[] = []
  for (const o of sorted) {
    const last = groups[groups.length - 1]
    if (last) {
      const extended = mergeAdjacentRanges(last.displayRange, o.versionRange)
      if (extended && sameValue(last.representative, o)) {
        last.members.push(o)
        last.displayRange = extended
        continue
      }
    }
    groups.push({ members: [o], representative: o, displayRange: o.versionRange })
  }
  return groups
}
