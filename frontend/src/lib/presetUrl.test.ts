import { describe, it, expect } from 'vitest'
import { presetUrl } from './presetUrl'

describe('presetUrl', () => {
  it('serializes "mine" with the owner filter and preset param', () => {
    const url = presetUrl('mine', 'alice')
    const params = new URL(url, 'http://x').searchParams
    expect(params.get('owner')).toBe('alice')
    expect(params.get('preset')).toBe('mine')
    // active-only default → no archived param
    expect(params.get('archived')).toBeNull()
  })

  it('serializes "problems" with only the preset param (no filter footprint)', () => {
    const url = presetUrl('problems', 'alice')
    const params = new URL(url, 'http://x').searchParams
    expect(params.get('preset')).toBe('problems')
    expect(params.get('owner')).toBeNull()
    expect(params.get('archived')).toBeNull()
  })

  it('falls back to a bare owner-less filter when "mine" has no username', () => {
    const url = presetUrl('mine', null)
    const params = new URL(url, 'http://x').searchParams
    expect(params.get('owner')).toBeNull()
    // still records the preset so the URL is self-describing
    expect(params.get('preset')).toBe('mine')
  })
})
