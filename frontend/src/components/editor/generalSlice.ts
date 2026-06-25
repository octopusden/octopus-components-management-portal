import type { ComponentDetail, ComponentUpdateRequest } from '../../lib/types'
import type { SectionSlice, DiffEntry } from '../../lib/editor/combineRequest'
import { formatDiffValue } from '../../lib/editor/diffUtil'

/**
 * Turn the General/Misc `buildUpdateRequest` output into a SectionSlice for the
 * unified save bar. General/Misc keep the RHF **touched-not-dirty** gate
 * ([[project_editor_save_gate_touched_not_dirty]]) — that gate already decides
 * which fields land in `patch`, so the slice's dirty state and diff are derived
 * directly from the patch body: a field present in the body (other than the
 * always-present `version` / `clearGroup`) IS a change. `systemClearNeedsAttention`
 * forces dirty so the page can keep Save enabled to surface the inline
 * "System is required" error even though the patch omits the empty system.
 */

// Top-level scalar fields that are nullable on the component but NOT scalar
// aspects — clearing them DOES persist, so they are never flagged as no-ops.
const FIELD_LABELS: Record<string, string> = {
  name: 'Component Key',
  displayName: 'Display Name',
  componentOwner: 'Component Owner',
  system: 'System',
  clientCode: 'Client Code',
  copyright: 'Copyright',
  solution: 'Solution',
  archived: 'Archived',
  parentComponentName: 'Parent Component',
  canBeParent: 'Can be a parent',
  releaseManager: 'Release Managers',
  securityChampion: 'Security Champions',
  labels: 'Labels',
  docs: 'Doc Links',
  artifactIds: 'Artifact IDs',
}

// Patch keys that are control flags, not user-facing field changes.
const CONTROL_KEYS = new Set(['version', 'clearGroup', 'clearParent'])

function priorValueFor(component: ComponentDetail, key: string): unknown {
  switch (key) {
    case 'name': return component.name
    case 'displayName': return component.displayName
    case 'componentOwner': return component.componentOwner
    case 'system': return component.system
    case 'clientCode': return component.clientCode
    case 'copyright': return component.copyright ?? null
    case 'solution': return component.solution ?? false
    case 'archived': return component.archived
    case 'parentComponentName': return component.parentComponentName
    case 'canBeParent': return component.canBeParent ?? false
    case 'releaseManager': return component.releaseManager ?? []
    case 'securityChampion': return component.securityChampion ?? []
    case 'labels': return component.labels ?? []
    case 'docs': return (component.docs ?? []).map((d) => d.docComponentKey)
    case 'artifactIds': return (component.artifactIds ?? []).map((a) => `${a.groupPattern}:${a.artifactPattern}`)
    default: return undefined
  }
}

function nextValueFor(key: string, value: unknown): unknown {
  if (key === 'docs') return (value as { docComponentKey: string }[] | null)?.map((d) => d.docComponentKey) ?? []
  if (key === 'artifactIds') return (value as { groupPattern: string; artifactPattern: string }[] | null)?.map((a) => `${a.groupPattern}:${a.artifactPattern}`) ?? []
  return value
}

// Normalise a value for the "did it actually change?" compare: '' / null /
// undefined collapse to '' (a present-but-unchanged owner like 'alice' must
// not read as dirty), arrays compare element-wise via JSON.
function normForCompare(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (Array.isArray(v)) return JSON.stringify(v)
  return String(v)
}

export function generalDiff(component: ComponentDetail, patch: ComponentUpdateRequest): DiffEntry[] {
  const diff: DiffEntry[] = []
  for (const [key, value] of Object.entries(patch)) {
    if (CONTROL_KEYS.has(key) || value === undefined) continue
    const label = FIELD_LABELS[key]
    if (!label) continue // unknown / not user-facing
    const next = nextValueFor(key, value)
    const prior = priorValueFor(component, key)
    // Skip always-emitted-but-unchanged fields (buildUpdateRequest sends
    // componentOwner / clientCode / copyright whenever present, not dirty-gated).
    // Only a genuine value change is a "change" for the dirty bar + diff.
    if (normForCompare(next) === normForCompare(prior)) continue
    diff.push({
      label,
      oldValue: formatDiffValue(prior),
      newValue: formatDiffValue(next),
      // General/Misc fields are top-level component columns (nullable scalars,
      // lists). None are scalar ASPECT fields, so clears persist server-side —
      // never flagged as a CRS no-op.
      clearedScalarNoop: false,
    })
  }
  return diff
}

/**
 * Compose the General/Misc SectionSlice. `patch` is the `buildUpdateRequest`
 * output (full request — version/clearGroup stripped by `combineRequest`'s
 * destructure, but we drop them here too for the dirty check).
 * `systemClearNeedsAttention` forces dirty even though the patch omits the
 * cleared system (so the inline required-error surfaces).
 */
export function generalSlice(
  component: ComponentDetail,
  patch: ComponentUpdateRequest | null,
  systemClearNeedsAttention: boolean,
): SectionSlice {
  if (!patch) {
    return { isDirty: systemClearNeedsAttention, request: {}, diff: [] }
  }
  // Dirty = at least one field whose value genuinely differs from the server
  // (generalDiff filters always-emitted-but-unchanged fields like a present
  // componentOwner), OR the required-system-cleared case (kept dirty so the
  // page can surface the inline error). This is the General/Misc half of the
  // two-mechanism dirty model — the RHF touched-not-dirty gate already shaped
  // `patch`; here we additionally drop no-op value-equal emissions.
  const diff = generalDiff(component, patch)
  const isDirty = systemClearNeedsAttention || diff.length > 0
  // Strip control-only keys from the slice request; combineRequest re-adds
  // version + clearGroup once for the whole combined body. clearParent is a
  // real General control that must survive, so keep it.
  const { version: _v, clearGroup: _cg, ...rest } = patch
  void _v
  void _cg
  return { isDirty, request: rest, diff }
}
