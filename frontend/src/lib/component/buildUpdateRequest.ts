import type { ArtifactIdRequest, ComponentDetail, ComponentUpdateRequest } from '../types'
import type { GeneralFormValues } from '../../components/editor/GeneralTab'
import type { FieldVisibility } from '../../hooks/useFieldConfig'
import { groupTokens, toArtifactIdRequest } from '../artifactOwnership'

// System is single-value per component. CRS PR #301 collapsed
// `Component.systems Set<String>` → `Component.system String?`; the
// Portal form holds a scalar `system: string` and buildUpdateRequest
// forwards it unchanged to the wire. (Task #14 introduced a `[value]`
// array-wrap bridge for the pre-#301 DTO — dropped now that the
// scalar contract has shipped.)

// Field-config visibility for every field-config-gated GeneralTab field.
// Hidden fields are NEVER sent on the wire — CRS does not filter by FC
// server-side, so a hidden field reaching the request body would silently
// overwrite the server value.
export interface FieldVisibilities {
  displayName: FieldVisibility
  componentOwner: FieldVisibility
  // CRS PR #301: field-config key + DTO field renamed to singular.
  system: FieldVisibility
  clientCode: FieldVisibility
  releaseManager: FieldVisibility
  securityChampion: FieldVisibility
  copyright: FieldVisibility
  canBeParent: FieldVisibility
  labels: FieldVisibility
}

// Subset of RHF `formState.dirtyFields` that drives clear/omit/REPLACE
// decisions for fields where the form default (false / '' / []) overlaps
// with a legitimate server value.
export interface DirtyFlags {
  solution?: boolean
  system?: boolean
  // displayName is nullable + unique server-side. The page passes this as "interacted"
  // (dirty OR touched); buildUpdateRequest value-compares against the persisted value so a
  // clear back to the form default '' is caught (RHF clear-to-default blind-spot) while a
  // pristine/pre-hydration form omits it.
  displayName?: boolean
  // ui-swift-sloth §4: labels is now a multi-select array, and like systems
  // it needs a dirty-gate to block the form-default `[]` from clobbering
  // server data pre-hydration.
  labels?: boolean
  // SYS-039 multi-value: releaseManager / securityChampion are ordered arrays
  // with the same form-default-`[]` clobber risk as labels — dirty-gated.
  releaseManager?: boolean
  securityChampion?: boolean
  docs?: boolean
  artifactIds?: boolean
}

export interface BuildUpdateRequestParams {
  component: ComponentDetail
  values: GeneralFormValues
  visibilities: FieldVisibilities
  dirtyFields: DirtyFlags
}

// Pure mapping from form state + server snapshot to a CRS v4
// ComponentUpdateRequest body. Extracted from ComponentDetailPage.handleSave
// so the cross-tab patch logic (TC / Group / Docs / ArtifactIds) is unit
// tested without rendering the page.
//
// Two invariants the type system cannot enforce:
//   - JSON Merge Patch semantics: omitted scalar = "don't touch", explicit
//     `null` = "clear", explicit value = "set". Collections are REPLACE
//     when present.
//   - Form-default clobber guard: the form mounts with `false`/`''`/`[]`
//     before useEffect mirrors server state. Without the dirtyFields gate
//     a fast Save would wipe stored data with form defaults.
export function buildUpdateRequest(params: BuildUpdateRequestParams): ComponentUpdateRequest {
  const { component, values, visibilities, dirtyFields } = params

  // CRS PR #301 wire shape: `system: string | null`. Trim defensively
  // (paste-restore round-trip could produce whitespace-only).
  const systemTrimmed = (values.system ?? '').trim()
  const labelsArray = Array.from(
    new Set(
      (values.labels ?? [])
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  )
  // SYS-039 ordered people lists. Keep-first dedupe + trim + drop blanks,
  // ORDER PRESERVED (Set keeps insertion order) — mirrors the server-side
  // canonicalization (`replace…Usernames`). `[]` is a meaningful explicit
  // clear, gated by dirtyFields below.
  const releaseManagerArray = Array.from(
    new Set(
      (values.releaseManager ?? [])
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  )
  const securityChampionArray = Array.from(
    new Set(
      (values.securityChampion ?? [])
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  )

  const solutionChanged = dirtyFields.solution === true
  // `archived` is value-compared rather than dirtyFields-gated: the field
  // is a boolean with no `null` server-side ambiguity, so a value compare
  // is unambiguous and avoids depending on RHF's dirty tracking for a
  // permission-gated field.
  const archivedChanged = values.archived !== component.archived

  // name: only send when it actually changed. Server enforces RENAME_COMPONENTS
  // via @PreAuthorize; UI also disables the input for users without it.
  const trimmedName = values.name.trim()
  const nameChanged = trimmedName !== '' && trimmedName !== component.name
  const renameField = nameChanged ? trimmedName : undefined

  // parentComponentName: blank = clear (null), unchanged = omit, else set.
  const trimmedParent = values.parentComponentName.trim()
  const currentParent = component.parentComponentName ?? ''
  const parentComponentName: string | null | undefined =
    trimmedParent === currentParent
      ? undefined
      : trimmedParent === ''
        ? null
        : trimmedParent

  // canBeParent: value-compared (boolean, no null ambiguity) like `archived`.
  const canBeParentChanged = (values.canBeParent ?? false) !== (component.canBeParent ?? false)
  // Clearing a parent needs the explicit clearParent flag — `parentComponentName:
  // null` reads as "don't touch" server-side. Fires only on non-empty → empty.
  const clearParent = currentParent !== '' && trimmedParent === ''
  const docsPatch = buildDocsPatch(component, values, dirtyFields)
  const artifactIdsPatch = buildArtifactIdsPatch(component, values, dirtyFields)

  return {
    version: component.version,
    // Required on the wire; group is now server-derived, never set/cleared here.
    clearGroup: false,
    name: renameField,
    // displayName is nullable server-side. The page passes `dirtyFields.displayName` as
    // "interacted" (dirty OR touched) so a clear back to the form default '' is still caught
    // (RHF's known clear-to-default blind-spot, same as labels/system). We then value-compare
    // against the persisted value: a real change is sent (a clear as "" — the server stores null,
    // or 400s for an explicit+external component, routed inline), an unchanged value is omitted.
    // Not "interacted" (e.g. pre-hydration) → omitted, so no form-default clobber.
    displayName: ((): string | undefined => {
      if (visibilities.displayName === 'hidden' || dirtyFields.displayName !== true) return undefined
      const next = values.displayName.trim()
      const prior = component.displayName ?? ''
      return next === prior ? undefined : next
    })(),
    componentOwner:
      visibilities.componentOwner === 'hidden' ? undefined : (values.componentOwner || undefined),
    // productType is owned by EscrowTab — never sent from the General save.
    // Two guards on `system`:
    //   - Pre-hydration: form mounts with `system: ''` BEFORE GeneralTab's
    //     useEffect hydrates from `component.system`. The dirty-gate
    //     blocks the unwanted clear.
    //   - Empty-after-dirty: System is REQUIRED server-side. If the user
    //     picks then clears the single-select, sending `system: ''` /
    //     `null` would 400. Omit instead — the page-level guard surfaces
    //     an inline "System is required" error so the omit-then-re-edit
    //     cycle is visible rather than silent.
    system:
      visibilities.system === 'hidden' || dirtyFields.system !== true || systemTrimmed === ''
        ? undefined
        : systemTrimmed,
    clientCode:
      visibilities.clientCode === 'hidden' ? undefined : (values.clientCode || undefined),
    solution: solutionChanged ? values.solution : undefined,
    archived: archivedChanged ? values.archived : undefined,
    parentComponentName,
    clearParent: clearParent ? true : undefined,
    canBeParent:
      visibilities.canBeParent === 'hidden' || !canBeParentChanged ? undefined : values.canBeParent,
    // releaseManager / securityChampion mirror `labels` exactly: dirty-gated
    // REPLACE with explicit-empty-clear. !dirty → omit (blocks the pre-
    // hydration form-default `[]` from wiping server data); dirty + [] → emit
    // [] (clear); dirty + non-empty → emit the ordered, canonicalized list.
    // The old `|| undefined` string-falsy collapse is gone (arrays are never
    // falsy, and [] is now a meaningful clear).
    releaseManager:
      visibilities.releaseManager === 'hidden' || dirtyFields.releaseManager !== true
        ? undefined
        : releaseManagerArray,
    securityChampion:
      visibilities.securityChampion === 'hidden' || dirtyFields.securityChampion !== true
        ? undefined
        : securityChampionArray,
    copyright: visibilities.copyright === 'hidden' ? undefined : (values.copyright || undefined),
    // labels semantics diverge from system (PR #44 P2 fix):
    //   - Pre-hydration guard mirrors system: !dirty → omit, so the
    //     form-default `[]` doesn't wipe server data before GeneralTab's
    //     useEffect hydrates from `component.labels`.
    //   - Explicit clear IS supported: labels is OPTIONAL server-side, so
    //     `dirty + empty` now emits `labels: []` (REPLACE-empty) rather than
    //     omitting. Previously the empty branch silently dropped — user
    //     unchecked every label, got "saved" toast, server unchanged.
    // system can't follow the same path because `system: ''`/`null` is
    // rejected server-side; the UI blocks the empty-save case via a
    // form-level guard in ComponentDetailPage.handleSave instead.
    labels:
      visibilities.labels === 'hidden' || dirtyFields.labels !== true
        ? undefined
        : labelsArray,
    ...docsPatch,
    ...artifactIdsPatch,
  }
}

function buildDocsPatch(
  component: ComponentDetail,
  values: GeneralFormValues,
  dirtyFields: DirtyFlags,
): { docs?: { docComponentKey: string; majorVersion: string | null }[] } {
  const cleaned = (values.docs ?? [])
    .map((d) => ({
      docComponentKey: (d.docComponentKey ?? '').trim(),
      majorVersion: (d.majorVersion ?? '').trim(),
    }))
    .filter((d) => d.docComponentKey !== '')
    .map((d) => ({
      docComponentKey: d.docComponentKey,
      majorVersion: d.majorVersion === '' ? null : d.majorVersion,
    }))
  // `?? []` is defensive: the type says docs is always an array, but older CRS
  // images omit it from ComponentDetailResponse — guard so a save never crashes.
  const hadPrior = (component.docs ?? []).length > 0
  const dirty = !!dirtyFields.docs
  if (cleaned.length > 0) return { docs: cleaned }
  if (dirty && hadPrior) return { docs: [] }
  return {}
}

function buildArtifactIdsPatch(
  component: ComponentDetail,
  values: GeneralFormValues,
  dirtyFields: DirtyFlags,
): { artifactIds?: ArtifactIdRequest[] } {
  // PATCH `artifactIds` is a FULL replacement of the component's ownership set, so it must be sent
  // ONLY when the user actually edited ownership. Dirty-gate it exactly like labels/RM/SC: without
  // this gate an unrelated General save (e.g. Display Name) re-sends a full ownership replacement that
  // Review Changes shows as "unchanged" — a silent clobber risk. The editor's onChange sets
  // shouldDirty, so a real edit flips the flag; pre-hydration / untouched stays !dirty → omit.
  const dirty = !!dirtyFields.artifactIds
  if (!dirty) return {}
  // Drop mappings with no group token (incomplete rows); the server applies the remaining invariants.
  const cleaned = (values.artifactIds ?? [])
    .filter((m) => groupTokens(m.groups).length > 0)
    .map(toArtifactIdRequest)
  // `?? []` is defensive — see buildDocsPatch (older CRS omits artifactIds).
  const hadPrior = (component.artifactIds ?? []).length > 0
  if (cleaned.length > 0) return { artifactIds: cleaned }
  if (hadPrior) return { artifactIds: [] }
  return {}
}
