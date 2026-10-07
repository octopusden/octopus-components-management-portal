import { describe, it, expect } from 'vitest'
import { presetUrl } from './presetUrl'

describe('presetUrl', () => {
  it('serializes "mine" as the involves filter (current user, owner role) with no preset param', () => {
    const params = new URL(presetUrl('mine', 'alice'), 'http://x').searchParams
    expect(params.get('involves')).toBe('alice')
    expect(params.get('involvesRoles')).toBe('owner')
    expect(params.get('preset')).toBeNull()
    // active-only default → no archived param
    expect(params.get('archived')).toBeNull()
  })

  it('serializes "release-manager" as involves with the releaseManager role', () => {
    const params = new URL(presetUrl('release-manager', 'alice'), 'http://x').searchParams
    expect(params.get('involves')).toBe('alice')
    expect(params.get('involvesRoles')).toBe('releaseManager')
  })

  it('serializes "problems" with only the preset param (no filter footprint)', () => {
    const params = new URL(presetUrl('problems', 'alice'), 'http://x').searchParams
    expect(params.get('preset')).toBe('problems')
    expect(params.get('involves')).toBeNull()
    expect(params.get('archived')).toBeNull()
  })

  it('falls back to the bare list when "mine" has no username', () => {
    expect(presetUrl('mine', null)).toBe('/components')
  })
})
