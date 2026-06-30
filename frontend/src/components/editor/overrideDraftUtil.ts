/**
 * Pure (non-React) helpers for the field-override draft (Portal item D). Kept
 * out of `overridesDraft.tsx` so that file exports only the provider + hook
 * (react-refresh fast-refresh hygiene), and so the combined-save serializer can
 * be unit-tested without rendering.
 */
import type { FieldOverride, MarkerChildrenPayload } from '../../lib/types'
import type { DiffEntry } from '../../lib/editor/combineRequest'
import { deepEqual, formatDiffValue } from '../../lib/editor/diffUtil'
import { formatVersionRange } from '../../lib/versionRange'

export const DRAFT_ID_PREFIX = 'draft-'

/** A row that exists only in the draft (a queued create) — its `id` is a
 *  client-minted temp id, never a real server id. The combined-save
 *  serializer strips these so a create is sent without an `id`. */
export function isDraftId(id: string): boolean {
  return id.startsWith(DRAFT_ID_PREFIX)
}

/**
 * One entry of the desired-full-set the combined PATCH sends in
 * `ComponentUpdateRequest.fieldOverrides`. Absent `id` = create; present `id` =
 * upsert by id; any server override NOT in the list = delete (server applies
 * the whole set in the same transaction as the rest of the component update).
 */
export interface FieldOverrideUpsert {
  id?: string
  overriddenAttribute: string
  versionRange: string
  value?: unknown
  markerChildren?: MarkerChildrenPayload | null
}

/** Serialise one effective override to an upsert. Draft (temp) ids are dropped
 *  so the server treats the row as a create; scalar rows carry `value`, marker
 *  rows carry `markerChildren`. */
export function toUpsert(o: FieldOverride): FieldOverrideUpsert {
  const upsert: FieldOverrideUpsert = {
    overriddenAttribute: o.overriddenAttribute,
    versionRange: o.versionRange,
  }
  if (!isDraftId(o.id)) upsert.id = o.id
  if (o.rowType === 'MARKER') {
    upsert.markerChildren = o.markerChildren ?? null
  } else {
    upsert.value = o.value
  }
  return upsert
}

const MARKER_CHILD_LABELS: [keyof MarkerChildrenPayload, string][] = [
  ['vcsEntries', 'VCS entries'],
  ['mavenArtifacts', 'Maven artifacts'],
  ['fileUrlArtifacts', 'file URLs'],
  ['dockerImages', 'Docker images'],
  ['packages', 'packages'],
  ['requiredTools', 'required tools'],
]

/** Human-readable, STABLE rendering of an override's value for the Review diff.
 *  Scalar/boolean reuse the shared diff formatter; marker overrides summarise
 *  their child collections by count (fixed order) so the dialog never shows
 *  `[object Object]` or unstable JSON. */
export function formatOverrideValue(o: FieldOverride): string {
  // Gate purely on rowType (matching toUpsert), not on markerChildren != null:
  // a SCALAR row carrying stray markerChildren must still render its value, not
  // a marker summary — otherwise the Review row and the wire payload disagree.
  if (o.rowType === 'MARKER') {
    const mc = o.markerChildren ?? {}
    const parts: string[] = []
    for (const [key, label] of MARKER_CHILD_LABELS) {
      const arr = mc[key]
      if (Array.isArray(arr) && arr.length > 0) parts.push(`${arr.length} ${label}`)
    }
    return parts.length > 0 ? parts.join(', ') : 'marker (no entries)'
  }
  return formatDiffValue(o.value)
}

function sameOverride(a: FieldOverride, b: FieldOverride): boolean {
  return (
    a.versionRange === b.versionRange &&
    deepEqual(a.value, b.value) &&
    deepEqual(a.markerChildren ?? null, b.markerChildren ?? null)
  )
}

/**
 * Derive the Review-dialog diff rows by comparing the server baseline against
 * the effective (draft-applied) set, BY ID — robust to the internal op shape:
 * an effective row with no server twin is a create, a differing twin is an
 * update, a server row with no effective twin is a delete. The displayed value
 * carries the range (`[1.0,2.0): 21`) so a range-only change still shows a delta.
 */
export function diffOverrides(
  server: FieldOverride[],
  effective: FieldOverride[],
  label: (o: FieldOverride) => string,
): DiffEntry[] {
  const serverById = new Map(server.map((o) => [o.id, o]))
  const effectiveIds = new Set(effective.map((o) => o.id))
  const describe = (o: FieldOverride) => `${formatVersionRange(o.versionRange)}: ${formatOverrideValue(o)}`
  const rows: DiffEntry[] = []
  for (const e of effective) {
    const s = serverById.get(e.id)
    if (!s) {
      rows.push({ label: label(e), oldValue: '—', newValue: describe(e) })
    } else if (!sameOverride(s, e)) {
      rows.push({ label: label(e), oldValue: describe(s), newValue: describe(e) })
    }
  }
  for (const s of server) {
    if (!effectiveIds.has(s.id)) {
      rows.push({ label: label(s), oldValue: describe(s), newValue: '(removed)' })
    }
  }
  return rows
}
