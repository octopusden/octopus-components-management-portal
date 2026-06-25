import type { ComponentFilter } from './types'
import { presetById, type PresetId } from './listPresets'

/**
 * A single removable filter chip (spec §1.2). `key` is the ComponentFilter
 * field (or the synthetic `'preset'`); `value` is the specific value for
 * multi-value arrays (so each selected owner/system/label is its own chip),
 * undefined for scalars and tri-states (the whole field clears). `label` is the
 * human-readable text.
 */
export interface FilterChip {
  key: keyof ComponentFilter | 'preset'
  value?: string
  label: string
}

// Human labels for the filter fields, matching the filter-bar control labels.
const FIELD_LABELS: Partial<Record<keyof ComponentFilter, string>> = {
  search: 'Search',
  system: 'System',
  buildSystem: 'Build system',
  labels: 'Label',
  owner: 'Owner',
  clientCode: 'Client code',
  jiraProjectKey: 'Jira key',
  parentComponentName: 'Parent',
  groupKey: 'Group key',
  releaseManager: 'Release manager',
  securityChampion: 'Security champion',
  vcsPath: 'VCS path',
  productionBranch: 'Production branch',
  canBeParent: 'Can be parent',
  solution: 'Solution',
  jiraTechnical: 'Jira technical',
  distributionExplicit: 'Distribution explicit',
  distributionExternal: 'Distribution external',
  archived: 'Status',
}

// Array-valued fields → one chip per selected value.
const ARRAY_KEYS = [
  'system',
  'buildSystem',
  'labels',
  'owner',
  'clientCode',
  'jiraProjectKey',
  'parentComponentName',
  'groupKey',
  'releaseManager',
  'securityChampion',
] as const satisfies readonly (keyof ComponentFilter)[]

// Scalar free-text fields → one chip carrying the value.
const STRING_KEYS = ['search', 'vcsPath', 'productionBranch'] as const satisfies readonly (keyof ComponentFilter)[]

// Tri-state booleans → one chip rendered as "Field: Yes/No".
const TRISTATE_KEYS = [
  'canBeParent',
  'solution',
  'jiraTechnical',
  'distributionExplicit',
  'distributionExternal',
] as const satisfies readonly (keyof ComponentFilter)[]

/**
 * Derive the live set of removable chips from the current filter + active
 * preset. Reflects live state only — no persistence. `archived` is a chip only
 * when archived=true (active-only `false` is the default, not an active filter);
 * the preset (when set, except the default `all`) gets its own leading chip.
 */
export function describeFilterChips(
  filter: ComponentFilter,
  preset: PresetId | null,
): FilterChip[] {
  const chips: FilterChip[] = []

  // `all` is the default state, not an active filter — it gets no chip.
  if (preset && preset !== 'all') {
    const def = presetById(preset)
    if (def) chips.push({ key: 'preset', label: `Preset: ${def.label}` })
  }

  if (filter.search) {
    chips.push({ key: 'search', label: `${FIELD_LABELS.search}: ${filter.search}` })
  }

  for (const key of ARRAY_KEYS) {
    const values = filter[key]
    if (Array.isArray(values)) {
      for (const value of values) {
        chips.push({ key, value, label: `${FIELD_LABELS[key]}: ${value}` })
      }
    }
  }

  for (const key of STRING_KEYS) {
    if (key === 'search') continue // already emitted above (leads the text chips)
    const value = filter[key]
    if (typeof value === 'string' && value.length > 0) {
      chips.push({ key, label: `${FIELD_LABELS[key]}: ${value}` })
    }
  }

  for (const key of TRISTATE_KEYS) {
    const value = filter[key]
    if (typeof value === 'boolean') {
      chips.push({ key, label: `${FIELD_LABELS[key]}: ${value ? 'Yes' : 'No'}` })
    }
  }

  // Only archived=true is a chip — active-only (false) is the implicit default.
  if (filter.archived === true) {
    chips.push({ key: 'archived', label: `${FIELD_LABELS.archived}: Archived` })
  }

  return chips
}
