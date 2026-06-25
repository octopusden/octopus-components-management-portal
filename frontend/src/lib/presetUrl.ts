import { applyPreset, type PresetId } from './listPresets'
import { serializeFilterState } from '../hooks/useFilterUrlState'

/**
 * Build the `/components?…` URL that applies a preset, reusing the SAME
 * preset→filter mapping (applyPreset) and URL serialization
 * (serializeFilterState) the list page round-trips through. The command
 * palette's Filter actions navigate here so the list applies the preset
 * exactly as if its segmented control had been clicked — no duplicated filter
 * logic.
 *
 * `applyPreset` replaces (not merges) prior state, so we feed it a bare
 * active-only filter; `username` lets the `mine` preset build its owner filter.
 */
export function presetUrl(id: PresetId, username: string | null): string {
  const filter = applyPreset(id, { archived: false }, username)
  const params = serializeFilterState({ filter, preset: id })
  const qs = params.toString()
  return qs ? `/components?${qs}` : '/components'
}
