import { describe, it, expect } from 'vitest'
import {
  PRESETS,
  presetById,
  applyPreset,
  matchPreset,
  type PresetId,
} from './listPresets'
import type { ComponentFilter } from './types'

const DEFAULT: ComponentFilter = { archived: false }

describe('PRESETS catalogue', () => {
  it('exposes the six presets in display order', () => {
    expect(PRESETS.map((p) => p.id)).toEqual([
      'all',
      'mine',
      'release-manager',
      'security-champion',
      'problems',
      'archived',
    ])
  })

  it('does NOT admin-gate the personal RM / SC presets (only problems is admin-only)', () => {
    expect(presetById('release-manager')!.adminOnly).toBeUndefined()
    expect(presetById('security-champion')!.adminOnly).toBeUndefined()
  })

  it('marks problems as admin-only and the rest as not admin-only', () => {
    expect(presetById('problems')!.adminOnly).toBe(true)
    expect(presetById('all')!.adminOnly).toBeUndefined()
    expect(presetById('archived')!.adminOnly).toBeUndefined()
    expect(presetById('mine')!.adminOnly).toBeUndefined()
  })
})

describe('applyPreset — preset is sugar over filter state', () => {
  it('all → active-only default (archived=false), clearing other filters', () => {
    // Starting from a dirtied filter, selecting "all" resets to the default.
    const next = applyPreset('all', { archived: true, owner: ['bob'], search: 'x' }, 'alice')
    expect(next).toEqual<ComponentFilter>({ archived: false })
  })

  it('mine → owner == currentUser, archived=false', () => {
    expect(applyPreset('mine', DEFAULT, 'alice')).toEqual<ComponentFilter>({
      archived: false,
      owner: ['alice'],
    })
  })

  it('mine → no-op-ish default when there is no current user (cannot scope to owner)', () => {
    // Without a username we cannot set owner; fall back to the default rather
    // than emitting owner: [undefined].
    expect(applyPreset('mine', DEFAULT, null)).toEqual<ComponentFilter>({ archived: false })
  })

  it('problems → active-only default (the problems list is Portal-computed, not a CRS filter)', () => {
    // The problems preset does not encode a CRS query param; the page swaps the
    // list source. Its filter footprint is just the active-only default.
    expect(applyPreset('problems', { owner: ['x'], archived: true }, 'alice')).toEqual<ComponentFilter>(
      { archived: false },
    )
  })

  it('archived → archived-only (archived=true), clearing other filters', () => {
    expect(applyPreset('archived', { owner: ['x'], archived: false }, 'alice')).toEqual<ComponentFilter>(
      { archived: true },
    )
  })

  it('selecting a preset clears conflicting prior filter state', () => {
    // mine after a search+system filter drops the unrelated state.
    const next = applyPreset('mine', { archived: false, search: 'foo', system: ['S1'] }, 'alice')
    expect(next).toEqual<ComponentFilter>({ archived: false, owner: ['alice'] })
  })

  // Phase 1b: CRS now supports releaseManager= / securityChampion= list filters,
  // so these personal presets scope to the current user's own RM/SC role.
  it('release-manager → releaseManager == [currentUser], archived=false', () => {
    expect(applyPreset('release-manager', DEFAULT, 'alice')).toEqual<ComponentFilter>({
      archived: false,
      releaseManager: ['alice'],
    })
  })

  it('security-champion → securityChampion == [currentUser], archived=false', () => {
    expect(applyPreset('security-champion', DEFAULT, 'alice')).toEqual<ComponentFilter>({
      archived: false,
      securityChampion: ['alice'],
    })
  })

  it('release-manager / security-champion → default when there is no current user', () => {
    // Personal presets need a username to scope; without one fall back to the
    // default rather than emitting releaseManager: [undefined].
    expect(applyPreset('release-manager', DEFAULT, null)).toEqual<ComponentFilter>({ archived: false })
    expect(applyPreset('security-champion', DEFAULT, null)).toEqual<ComponentFilter>({ archived: false })
  })
})

describe('matchPreset — derive the active preset from filter state', () => {
  it('the active-only default matches "all"', () => {
    expect(matchPreset({ archived: false }, 'alice')).toBe('all')
  })

  it('owner==currentUser (single) matches "mine"', () => {
    expect(matchPreset({ archived: false, owner: ['alice'] }, 'alice')).toBe('mine')
  })

  it('owner==someone-else does NOT match "mine"', () => {
    expect(matchPreset({ archived: false, owner: ['bob'] }, 'alice')).toBeNull()
  })

  it('a multi-owner filter including the user does NOT match "mine"', () => {
    expect(matchPreset({ archived: false, owner: ['alice', 'bob'] }, 'alice')).toBeNull()
  })

  it('archived=true matches "archived"', () => {
    expect(matchPreset({ archived: true }, 'alice')).toBe('archived')
  })

  it('an ad-hoc filter combo matches no preset (null)', () => {
    expect(matchPreset({ archived: false, search: 'foo' }, 'alice')).toBeNull()
  })

  it('never auto-matches "problems" (it is not encoded in the filter)', () => {
    // problems shares the same filter footprint as "all", but it is driven by an
    // explicit URL preset, never derived from the filter — so a bare default is "all".
    expect(matchPreset({ archived: false }, 'alice')).toBe('all')
  })
})

describe('PresetId type round-trips through PRESETS ids', () => {
  it('every PRESETS id is a valid PresetId usable with presetById', () => {
    for (const p of PRESETS) {
      const id: PresetId = p.id
      expect(presetById(id)).toBe(p)
    }
  })
})
