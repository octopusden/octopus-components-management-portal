import type { ComponentFilter } from './types'

/**
 * List-page presets (spec §1.1). Each preset is *sugar* over the existing
 * `ComponentFilter` state: selecting one sets a known filter combo and clears
 * any conflicting prior state. The active preset is reflected in the URL via
 * useFilterUrlState so a shared link restores both the preset and its filter.
 *
 * `problems` is special: it has no CRS query param (problems are computed in
 * Portal, not server-filterable), so its filter footprint is just the
 * active-only default — the page swaps the displayed list source to the
 * validation report when this preset is active. It is admin-gated.
 *
 * `release-manager` / `security-champion` are PERSONAL presets (Phase 1b):
 * they scope the list to components where the current user is the release
 * manager / security champion, via the CRS `releaseManager=` / `securityChampion=`
 * list filters (now deployed). They are NOT admin-gated — they filter on the
 * current user's own roles — and fall back to the default footprint only when
 * there is no current user to scope to.
 */
export type PresetId =
  | 'all'
  | 'mine'
  | 'release-manager'
  | 'security-champion'
  | 'problems'
  | 'archived'

export interface PresetDef {
  id: PresetId
  label: string
  /** Hidden for non-admins; the page also gates the underlying facility. */
  adminOnly?: boolean
}

// Active-only default — mirrors ComponentListPage's initial filter and
// parseFilterParams' empty-query result, so "all" round-trips to a bare URL.
const DEFAULT_FILTER: ComponentFilter = { archived: false }

export const PRESETS: readonly PresetDef[] = [
  { id: 'all', label: 'All' },
  { id: 'mine', label: 'My Components' },
  { id: 'release-manager', label: 'I am Release Manager' },
  { id: 'security-champion', label: 'I am Security Champion' },
  { id: 'problems', label: 'With problems', adminOnly: true },
  { id: 'archived', label: 'Archived' },
] as const

export function presetById(id: PresetId): PresetDef | undefined {
  return PRESETS.find((p) => p.id === id)
}

/**
 * Build the filter a preset represents, replacing (not merging) the prior
 * filter so selecting a preset clears conflicting state.
 */
export function applyPreset(
  id: PresetId,
  _current: ComponentFilter,
  currentUsername: string | null,
): ComponentFilter {
  if (id === 'mine') {
    // Scope to the current user's components. Without a username we cannot build
    // the owner filter, so fall back to the default rather than emitting a
    // broken owner: [undefined].
    return currentUsername
      ? { archived: false, owner: [currentUsername] }
      : { ...DEFAULT_FILTER }
  }
  if (id === 'archived') {
    return { archived: true }
  }
  if (id === 'release-manager') {
    // Personal preset: components where the current user is the release manager.
    // Without a username we cannot scope, so fall back to the default rather
    // than emitting releaseManager: [undefined].
    return currentUsername
      ? { archived: false, releaseManager: [currentUsername] }
      : { ...DEFAULT_FILTER }
  }
  if (id === 'security-champion') {
    return currentUsername
      ? { archived: false, securityChampion: [currentUsername] }
      : { ...DEFAULT_FILTER }
  }
  // Everything else applies only the active-only default footprint:
  //  - `all` is the default;
  //  - `problems` carries no CRS query param (Portal-computed) — the page swaps
  //    the list source instead.
  return { ...DEFAULT_FILTER }
}

/**
 * Derive which preset (if any) a filter currently represents, so a URL with a
 * bare filter (no explicit `preset=`) still lights up the matching segment.
 * `problems` is intentionally NOT derivable — it shares "all"'s footprint and
 * is only ever active via an explicit URL preset — so a default filter is "all".
 */
export function matchPreset(
  filter: ComponentFilter,
  currentUsername: string | null,
): PresetId | null {
  // Any extra filter beyond the ones a preset sets means "custom" → no match.
  const onlyKeys = (allowed: (keyof ComponentFilter)[]): boolean =>
    (Object.keys(filter) as (keyof ComponentFilter)[]).every(
      (k) => allowed.includes(k) || filter[k] === undefined,
    )

  if (filter.archived === true && onlyKeys(['archived'])) return 'archived'

  if (filter.archived === false || filter.archived === undefined) {
    if (
      currentUsername &&
      filter.owner?.length === 1 &&
      filter.owner[0] === currentUsername &&
      onlyKeys(['archived', 'owner'])
    ) {
      return 'mine'
    }
    if (
      currentUsername &&
      filter.releaseManager?.length === 1 &&
      filter.releaseManager[0] === currentUsername &&
      onlyKeys(['archived', 'releaseManager'])
    ) {
      return 'release-manager'
    }
    if (
      currentUsername &&
      filter.securityChampion?.length === 1 &&
      filter.securityChampion[0] === currentUsername &&
      onlyKeys(['archived', 'securityChampion'])
    ) {
      return 'security-champion'
    }
    if (onlyKeys(['archived'])) return 'all'
  }

  return null
}
