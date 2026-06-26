import { useCallback } from 'react'
import { useSearchParams } from 'react-router'
import type { ComponentFilter } from '../lib/types'

/**
 * Combined URL-shareable state: the list-page filter plus the active preset
 * name. `preset` is null when no preset is selected (a custom/ad-hoc filter).
 */
export interface FilterUrlState {
  filter: ComponentFilter
  preset: string | null
}

// Array-valued filters — serialized as a single comma-separated query param
// (e.g. ?owner=alice,bob). buildSystem is string[] on ComponentFilter, so it
// belongs here too even though it post-dates the original CSV list.
const ARRAY_KEYS = [
  'owner',
  'system',
  'labels',
  'clientCode',
  'jiraProjectKey',
  'parentComponentName',
  'groupKey',
  'buildSystem',
  // Phase 1b: the personal RM/SC presets and the Health page's people
  // breakdowns deep-link via these CSV params (?releaseManager=…), so they
  // round-trip through the URL like the other multi-value filters.
  'releaseManager',
  'securityChampion',
] as const satisfies readonly (keyof ComponentFilter)[]

// Scalar free-text filters.
const STRING_KEYS = ['search', 'vcsPath', 'productionBranch'] as const satisfies readonly (keyof ComponentFilter)[]

// Tri-state booleans: absent (undefined) | true | false. `archived` is handled
// separately because it has a non-undefined default (false = active-only) and
// must round-trip to that default rather than to undefined.
const TRISTATE_KEYS = [
  'canBeParent',
  'solution',
  'jiraTechnical',
  'distributionExplicit',
  'distributionExternal',
] as const satisfies readonly (keyof ComponentFilter)[]

const PRESET_KEY = 'preset'
const ARCHIVED_KEY = 'archived'

/** searchParams -> {filter, preset}. Absent/empty params yield active-only defaults. */
export function parseFilterParams(params: URLSearchParams): FilterUrlState {
  // archived defaults to false (active-only) — mirrors ComponentListPage's
  // initial filter so a bare /components URL parses to the same state.
  const filter: ComponentFilter = { archived: params.get(ARCHIVED_KEY) === 'true' }

  for (const key of ARRAY_KEYS) {
    const raw = params.get(key)
    if (raw != null && raw.length > 0) {
      filter[key] = raw.split(',').filter(Boolean)
    }
  }
  for (const key of STRING_KEYS) {
    const raw = params.get(key)
    if (raw != null && raw.length > 0) filter[key] = raw
  }
  for (const key of TRISTATE_KEYS) {
    const raw = params.get(key)
    if (raw === 'true') filter[key] = true
    else if (raw === 'false') filter[key] = false
  }

  const preset = params.get(PRESET_KEY)
  return { filter, preset: preset && preset.length > 0 ? preset : null }
}

/** {filter, preset} -> URLSearchParams. Defaults (archived=false, empties) are omitted. */
export function serializeFilterState({ filter, preset }: FilterUrlState): URLSearchParams {
  const params = new URLSearchParams()

  for (const key of ARRAY_KEYS) {
    const value = filter[key]
    if (Array.isArray(value) && value.length > 0) params.set(key, value.join(','))
  }
  for (const key of STRING_KEYS) {
    const value = filter[key]
    if (typeof value === 'string' && value.length > 0) params.set(key, value)
  }
  for (const key of TRISTATE_KEYS) {
    const value = filter[key]
    if (typeof value === 'boolean') params.set(key, String(value))
  }
  // Only the non-default (archived) is written; false is the implicit default.
  if (filter.archived) params.set(ARCHIVED_KEY, 'true')
  if (preset) params.set(PRESET_KEY, preset)

  return params
}

/**
 * Round-trips the list-page filter + preset through the URL query string via
 * react-router's useSearchParams. The current URL is the single source of
 * truth: `filter`/`preset` are derived from it on every render, and `setState`
 * pushes a freshly-serialized query back.
 */
export function useFilterUrlState() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { filter, preset } = parseFilterParams(searchParams)

  const setState = useCallback(
    (next: FilterUrlState) => {
      // replace: filter changes shouldn't pile up history entries the way the
      // Back button would otherwise have to unwind one tweak at a time.
      setSearchParams(serializeFilterState(next), { replace: true })
    },
    [setSearchParams],
  )

  return { filter, preset, setState }
}
