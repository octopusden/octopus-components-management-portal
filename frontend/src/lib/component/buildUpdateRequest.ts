import type { ArtifactIdRequest, ComponentDetail, ComponentUpdateRequest } from '../types'
import type { GeneralFormValues } from '../../components/editor/GeneralTab'
import type { FieldVisibility } from '../../hooks/useFieldConfig'
import { groupTokens, toArtifactIdRequests } from '../artifactOwnership'

// System membership is MULTI-value (component_systems junction). The Portal
// form holds `systems: string[]` and buildUpdateRequest forwards it with the
// same dirty-gated REPLACE + explicit-empty-clear semantics as `labels`.

// Field-config visibility for every field-config-gated GeneralTab field.
// Hidden fields are NEVER sent on the wire — CRS does not filter by FC
// server-side, so a hidden field reaching the request body would silently
// overwrite the server value.
export interface FieldVisibilities {
  displayName: FieldVisibility
  componentOwner: FieldVisibility
  // Field-config key stays `component.system`; the DTO field is `systems`.
  systems: FieldVisibility
  clientCode: FieldVisibility
  releaseManager: FieldVisibility
  securityChampion: FieldVisibility
  copyright: FieldVisibility
  canBeParent: FieldVisibility
  labels: FieldVisibility
  // `solution` is field-config-gated too (SolutionTab). A hidden/readonly
  // solution must never reach the wire — CRS does not filter by FC, so a
  // stray value would silently overwrite the server flag (defense-in-depth
  // behind the UI's disabled switch). Required so every buildUpdateRequest
  // caller must pass the field-config visibility explicitly.
  solution: FieldVisibility
}

// Subset of RHF `formState.dirtyFields` that drives clear/omit/REPLACE
// decisions for fields where the form default (false / '' / []) overlaps
// with a legitimate server value.
//
// NOTE: every flag here is a PRE-NORMALIZED plain boolean. The caller
// (ComponentDetailPage.buildPatchRequest) collapses RHF's raw dirtyFields —
// which are a per-element array for array fields once anything subscribes
// formState.isDirty (see lib/editor/dirtyField.ts: isFieldDirty) — into these
// booleans. That is why the `!== true` gates below are correct and must NOT be
// changed to isFieldDirty: the array shape never reaches this layer.
export interface DirtyFlags {
  solution?: boolean
  systems?: boolean
  // displayName is nullable + unique server-side. The page passes this as "interacted"
  // (dirty OR touched); buildUpdateRequest value-compares against the persisted value so a
  // clear back to the form default '' is caught (RHF clear-to-default blind-spot) while a
  // pristine/pre-hydration form omits it.
  displayName?: boolean
  // componentOwner / clientCode / copyright are nullable top-level scalars with the SAME
  // clear-to-default blind-spot as displayName: the old `values.X || undefined` collapsed a
  // user's clear to `undefined` → omitted → JSON-merge-patch "don't touch" → the clear silently
  // never persisted (and the SaveBar never went dirty). The page now passes these as "interacted"
  // (dirty OR touched) so buildUpdateRequest value-compares against the persisted value and emits
  // '' to clear (server stores null), exactly like displayName.
  componentOwner?: boolean
  clientCode?: boolean
  copyright?: boolean
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

  // Multi-value system membership: trim, drop blanks, keep-first dedupe
  // (mirrors labels + the server-side canonicalization).
  const systemsArray = Array.from(
    new Set(
      (values.systems ?? [])
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  )
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

  // Omit when hidden OR readonly — a readonly switch can't legitimately be
  // dirtied through the UI, but gate here too so a stray dirty flag never
  // overwrites the server flag.
  const solutionChanged =
    dirtyFields.solution === true &&
    visibilities.solution !== 'hidden' &&
    visibilities.solution !== 'readonly'
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
    // componentOwner / clientCode / copyright: nullable top-level scalars. Mirror displayName —
    // interacted-gated (dirty OR touched, passed by the page) value-compare against the persisted
    // value: a real change is sent (a clear as "" — the server stores null), an unchanged value or
    // a pre-hydration form is omitted. The old `values.X || undefined` silently dropped clears
    // (`'' || undefined` → undefined → JSON-merge-patch "don't touch").
    componentOwner: ((): string | undefined => {
      if (visibilities.componentOwner === 'hidden' || dirtyFields.componentOwner !== true) return undefined
      const next = (values.componentOwner ?? '').trim()
      const prior = component.componentOwner ?? ''
      return next === prior ? undefined : next
    })(),
    // productType is owned by EscrowTab — never sent from the General save.
    // `systems` mirrors `labels` exactly: dirty-gated REPLACE with explicit-
    // empty-clear. !dirty → omit (blocks the pre-hydration form-default `[]`
    // from wiping server data before GeneralTab hydrates); dirty + [] → emit
    // [] (clear all — systems is OPTIONAL server-side); dirty + non-empty →
    // emit the canonicalized list.
    systems:
      visibilities.systems === 'hidden' || dirtyFields.systems !== true
        ? undefined
        : systemsArray,
    clientCode: ((): string | undefined => {
      if (visibilities.clientCode === 'hidden' || dirtyFields.clientCode !== true) return undefined
      const next = (values.clientCode ?? '').trim()
      const prior = component.clientCode ?? ''
      return next === prior ? undefined : next
    })(),
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
    copyright: ((): string | undefined => {
      if (visibilities.copyright === 'hidden' || dirtyFields.copyright !== true) return undefined
      const next = (values.copyright ?? '').trim()
      const prior = component.copyright ?? ''
      return next === prior ? undefined : next
    })(),
    // labels + systems share the same contract (both OPTIONAL server-side):
    //   - Pre-hydration guard: !dirty → omit, so the form-default `[]` doesn't
    //     wipe server data before GeneralTab hydrates.
    //   - Explicit clear IS supported: `dirty + empty` emits `[]` (REPLACE-
    //     empty) rather than omitting, so unchecking every value persists.
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
    .flatMap(toArtifactIdRequests)
  // `?? []` is defensive — see buildDocsPatch (older CRS omits artifactIds).
  const hadPrior = (component.artifactIds ?? []).length > 0
  if (cleaned.length > 0) return { artifactIds: cleaned }
  if (hadPrior) return { artifactIds: [] }
  return {}
}
