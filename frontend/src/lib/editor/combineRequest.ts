import type { ComponentUpdateRequest, BaseConfigurationRequest } from '../types'

/**
 * One field-level change for the Review-changes dialog (spec §2.2). The page
 * collects these from every dirty section and renders them as
 * `label: old → new`. `clearedScalarNoop` flags a scalar-aspect clear that CRS
 * v4 PATCH silently ignores (null = "don't touch" for scalar aspects), so the
 * dialog can warn the user that the clear won't persist. (List/array clears
 * are real REPLACE-empty operations and are NOT flagged.)
 */
export interface DiffEntry {
  /** Human-readable field label (e.g. "Display Name", "Build · Build System"). */
  label: string
  /** Prior (server) value, stringified for display. '' renders as an em-dash. */
  oldValue: string
  /** New value, stringified for display. '' renders as an em-dash. */
  newValue: string
  /**
   * Optional itemized view for list-of-object fields (e.g. artifact ownership):
   * the human-readable lines REMOVED (`oldItems`) and ADDED (`newItems`). When
   * present the dialog renders these as stacked removed/added rows instead of the
   * `oldValue → newValue` inline; `oldValue`/`newValue` stay set as a readable
   * fallback (e.g. a count summary) for any consumer that ignores the items.
   */
  oldItems?: string[]
  newItems?: string[]
  /**
   * True when this row clears a SCALAR ASPECT field (build/escrow/jira scalar)
   * to empty — a no-op server-side under CRS v4 PATCH null semantics. The
   * dialog annotates these so the user isn't misled into thinking the clear
   * persisted. See [[project_crs_patch_null_noop]].
   */
  clearedScalarNoop?: boolean
}

/**
 * A single editor section's contribution to the combined save (spec §2.2 / the
 * Phase 3b "contribute a slice, report dirty up" contract). `request` is the
 * section's fragment of the ONE combined ComponentUpdateRequest — the page
 * merges every dirty section's fragment into a single body fired with a single
 * `version`. `baseConfiguration` fragments are DEEP-merged (Build + Escrow both
 * write disjoint keys of `baseConfiguration.build`). `diff` lists the section's
 * changed fields for the Review dialog.
 */
export interface SectionSlice {
  isDirty: boolean
  /**
   * The section's portion of the combined request. MUST omit `version` /
   * `clearGroup` (the page sets those once). May carry top-level scalars/lists
   * and/or a `baseConfiguration` fragment.
   */
  request: Partial<ComponentUpdateRequest>
  diff: DiffEntry[]
}

/**
 * Deep-merge two `baseConfiguration` fragments. The aspect objects (build /
 * escrow / jira) merge key-by-key so Build's `build.{buildSystem,…}` and
 * Escrow's `build.{buildTasks,…}` coexist in one `build` object; collection
 * keys (vcsEntries / mavenArtifacts / … / requiredTools) are whole-value
 * REPLACE and a later fragment wins (in practice each is written by exactly
 * one section, so there is no real contention). A `null` aspect from one side
 * does not erase a populated aspect from the other.
 */
export function mergeBaseConfiguration(
  a: BaseConfigurationRequest | null | undefined,
  b: BaseConfigurationRequest | null | undefined,
): BaseConfigurationRequest | undefined {
  if (!a) return b ?? undefined
  if (!b) return a ?? undefined
  const out: BaseConfigurationRequest = { ...a }
  for (const [key, value] of Object.entries(b) as [keyof BaseConfigurationRequest, unknown][]) {
    if (value === undefined) continue
    const prev = out[key]
    // Aspect objects deep-merge; everything else (arrays, scalars, null) replaces.
    if (
      (key === 'build' || key === 'escrow' || key === 'jira') &&
      prev &&
      typeof prev === 'object' &&
      !Array.isArray(prev) &&
      value &&
      typeof value === 'object' &&
      !Array.isArray(value)
    ) {
      out[key] = { ...(prev as object), ...(value as object) } as never
    } else {
      out[key] = value as never
    }
  }
  return out
}

/**
 * Merge every section slice into the ONE combined ComponentUpdateRequest. Only
 * dirty slices contribute (a clean section adds nothing — its fields stay
 * omitted so JSON-merge-patch leaves them untouched). `version` and the
 * required `clearGroup` flag are set ONCE here, from the page's single
 * `component.version` snapshot — so a multi-section save can never self-inflict
 * a stale-version 409 the way sequential per-tab saves did.
 */
export function combineRequest(
  version: number,
  slices: SectionSlice[],
): ComponentUpdateRequest {
  let baseConfiguration: BaseConfigurationRequest | undefined
  const combined: ComponentUpdateRequest = { version, clearGroup: false }
  for (const slice of slices) {
    if (!slice.isDirty) continue
    const { baseConfiguration: bc, ...rest } = slice.request
    Object.assign(combined, rest)
    if (bc) baseConfiguration = mergeBaseConfiguration(baseConfiguration, bc)
  }
  if (baseConfiguration) combined.baseConfiguration = baseConfiguration
  return combined
}

/** Concatenate the diff rows of every dirty slice, in section order. */
export function collectDiff(slices: SectionSlice[]): DiffEntry[] {
  return slices.filter((s) => s.isDirty).flatMap((s) => s.diff)
}

/** Any section dirty → the whole editor is dirty (drives the save bar + guard). */
export function anyDirty(slices: SectionSlice[]): boolean {
  return slices.some((s) => s.isDirty)
}
