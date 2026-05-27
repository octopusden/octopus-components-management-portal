import type { ComponentDetail, ComponentUpdateRequest } from '../types'
import type { GeneralFormValues } from '../../components/editor/GeneralTab'
import type { FieldVisibility } from '../../hooks/useFieldConfig'

// Task #14 bridge: the form field `system` is a scalar string (single-select
// dropdown UX), but the CRS v4 wire still expects `systems: string[]`.
// buildUpdateRequest wraps the scalar as `[value]` on the way out until CRS
// task #7 collapses `Component.systems Set<String>` → `Component.system
// String?`. Once that ships and types regenerate, the wrap can be deleted
// and `systems` here renames to `system`.

// Field-config visibility for every field-config-gated GeneralTab field.
// Hidden fields are NEVER sent on the wire — CRS does not filter by FC
// server-side, so a hidden field reaching the request body would silently
// overwrite the server value.
export interface FieldVisibilities {
  displayName: FieldVisibility
  componentOwner: FieldVisibility
  systems: FieldVisibility
  clientCode: FieldVisibility
  groupId: FieldVisibility
  releaseManager: FieldVisibility
  securityChampion: FieldVisibility
  copyright: FieldVisibility
  releasesInDefaultBranch: FieldVisibility
  labels: FieldVisibility
  teamcityProjectId: FieldVisibility
  teamcityProjectUrl: FieldVisibility
}

// Subset of RHF `formState.dirtyFields` that drives clear/omit/REPLACE
// decisions for fields where the form default (false / '' / []) overlaps
// with a legitimate server value.
export interface DirtyFlags {
  releasesInDefaultBranch?: boolean
  solution?: boolean
  system?: boolean
  // ui-swift-sloth §4: labels is now a multi-select array, and like systems
  // it needs a dirty-gate to block the form-default `[]` from clobbering
  // server data pre-hydration.
  labels?: boolean
  groupId?: boolean
  teamcityProjects?: boolean
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

  // Task #14: `system` is now a single string (EnumSelect single-select).
  // Wrap as [value] on the wire to keep the v4 contract (CRS task #7 will
  // collapse the wire shape to scalar — drop the wrap then).
  const systemTrimmed = (values.system ?? '').trim()
  const systemArray = systemTrimmed === '' ? [] : [systemTrimmed]
  const labelsArray = Array.from(
    new Set(
      (values.labels ?? [])
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  )

  const releasesInDefaultBranchChanged = dirtyFields.releasesInDefaultBranch === true
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

  const tcPatch = buildTcPatch(component, values, visibilities, dirtyFields)
  const groupPatch = buildGroupPatch(component, values, visibilities)
  const docsPatch = buildDocsPatch(component, values, dirtyFields)
  const artifactIdsPatch = buildArtifactIdsPatch(component, values, dirtyFields)

  return {
    version: component.version,
    // Required on the wire. Default to false; groupPatch may override.
    clearGroup: false,
    name: renameField,
    displayName:
      visibilities.displayName === 'hidden' ? undefined : (values.displayName || undefined),
    componentOwner:
      visibilities.componentOwner === 'hidden' ? undefined : (values.componentOwner || undefined),
    // productType is owned by EscrowTab — never sent from the General save.
    // Two guards on `systems` (task #14 single-select bridge):
    //   - Pre-hydration: form mounts with `system: ''` → `systemArray = []`
    //     BEFORE GeneralTab's useEffect mirrors the server's first value
    //     into the EnumSelect. The dirty-gate blocks the unwanted clear.
    //   - Empty-after-dirty: `systems` is REQUIRED server-side. If the
    //     user picks then clears the single-select, sending `systems: []`
    //     would 400. Omit instead — the page-level guard surfaces an
    //     inline "System is required" error to the user so the omit-then-
    //     re-edit cycle is visible rather than silent.
    // The output is still array-shaped (`[value]`) until CRS task #7
    // collapses the wire contract.
    systems:
      visibilities.systems === 'hidden' || dirtyFields.system !== true || systemArray.length === 0
        ? undefined
        : systemArray,
    clientCode:
      visibilities.clientCode === 'hidden' ? undefined : (values.clientCode || undefined),
    solution: solutionChanged ? values.solution : undefined,
    archived: archivedChanged ? values.archived : undefined,
    parentComponentName,
    releaseManager:
      visibilities.releaseManager === 'hidden' ? undefined : (values.releaseManager || undefined),
    securityChampion:
      visibilities.securityChampion === 'hidden'
        ? undefined
        : (values.securityChampion || undefined),
    copyright: visibilities.copyright === 'hidden' ? undefined : (values.copyright || undefined),
    releasesInDefaultBranch:
      visibilities.releasesInDefaultBranch === 'hidden' || !releasesInDefaultBranchChanged
        ? undefined
        : values.releasesInDefaultBranch,
    // labels semantics diverge from systems (PR #44 P2 fix):
    //   - Pre-hydration guard mirrors systems: !dirty → omit, so the
    //     form-default `[]` doesn't wipe server data before GeneralTab's
    //     useEffect hydrates from `component.labels`.
    //   - Explicit clear IS supported: labels is OPTIONAL server-side, so
    //     `dirty + empty` now emits `labels: []` (REPLACE-empty) rather than
    //     omitting. Previously the empty branch silently dropped — user
    //     unchecked every label, got "saved" toast, server unchanged.
    // systems can't follow the same path because `systems: []` is rejected
    // server-side; the UI blocks the empty-save case via a form-level
    // guard in ComponentDetailPage.handleSave instead.
    labels:
      visibilities.labels === 'hidden' || dirtyFields.labels !== true
        ? undefined
        : labelsArray,
    ...groupPatch,
    ...tcPatch,
    ...docsPatch,
    ...artifactIdsPatch,
  }
}

function buildTcPatch(
  component: ComponentDetail,
  values: GeneralFormValues,
  visibilities: FieldVisibilities,
  dirtyFields: DirtyFlags,
): { teamcityProjects?: { projectId: string }[] } {
  const visible =
    visibilities.teamcityProjectId !== 'hidden' && visibilities.teamcityProjectUrl !== 'hidden'
  if (!visible) return {}
  const cleaned = (values.teamcityProjects ?? [])
    .map((p) => ({ projectId: (p.projectId ?? '').trim() }))
    .filter((p) => p.projectId !== '')
  const hadPrior = component.teamcityProjects.length > 0
  const dirty = !!dirtyFields.teamcityProjects
  if (cleaned.length > 0) return { teamcityProjects: cleaned }
  if (dirty && hadPrior) return { teamcityProjects: [] }
  return {}
}

function buildGroupPatch(
  component: ComponentDetail,
  values: GeneralFormValues,
  visibilities: FieldVisibilities,
): { group?: { groupKey: string; isFake: boolean } } {
  // ui-swift-sloth §3.5: group is now mandatory server-side. The UI must
  //   - never emit `clearGroup: true` (CRS now rejects it with 400),
  //   - never emit `group` when the input is blank (the render-side guard
  //     blocks saving while empty; this is the belt-and-braces).
  if (visibilities.groupId === 'hidden') return {}
  const trimmedGroupId = (values.groupId || '').trim()
  if (trimmedGroupId === '') return {}
  // Value-match short-circuit: per plan §3.5, "non-empty + clean → omit".
  // Compare against stored value rather than dirtyFields — a user who types
  // their groupId back to the stored value is functionally clean even though
  // RHF marks the field dirty.
  const currentKey = component.group?.groupKey ?? ''
  const currentIsFake = component.group?.isFake ?? false
  if (trimmedGroupId === currentKey && (values.groupIsFake ?? false) === currentIsFake) {
    return {}
  }
  return { group: { groupKey: trimmedGroupId, isFake: values.groupIsFake ?? false } }
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
  const hadPrior = component.docs.length > 0
  const dirty = !!dirtyFields.docs
  if (cleaned.length > 0) return { docs: cleaned }
  if (dirty && hadPrior) return { docs: [] }
  return {}
}

function buildArtifactIdsPatch(
  component: ComponentDetail,
  values: GeneralFormValues,
  dirtyFields: DirtyFlags,
): { artifactIds?: { groupPattern: string; artifactPattern: string }[] } {
  const cleaned = (values.artifactIds ?? [])
    .map((a) => ({
      groupPattern: (a.groupPattern ?? '').trim(),
      artifactPattern: (a.artifactPattern ?? '').trim(),
    }))
    .filter((a) => a.groupPattern !== '' && a.artifactPattern !== '')
  const hadPrior = component.artifactIds.length > 0
  const dirty = !!dirtyFields.artifactIds
  if (cleaned.length > 0) return { artifactIds: cleaned }
  if (dirty && hadPrior) return { artifactIds: [] }
  return {}
}
