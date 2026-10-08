import { describe, it, expect } from 'vitest'
import { asksExplicit, flagsForProfile } from './createProfile'
import type { ComponentProfile } from '../../hooks/useComponentProfiles'
import shipped from '../../test-fixtures/component-profiles.contract.json'

const byId = (id: string) => (shipped.profiles as ComponentProfile[]).find((p) => p.id === id)!

describe('flagsForProfile', () => {
  it('a solution profile sets all three flags and ignores the explicit answer', () => {
    expect(flagsForProfile(byId('solution'), false)).toEqual({
      solution: true,
      distributionExternal: true,
      distributionExplicit: true,
    })
  })

  it('an external profile that asks takes explicit from the answer (No)', () => {
    expect(flagsForProfile(byId('regular-external'), false)).toEqual({
      solution: false,
      distributionExternal: true,
      distributionExplicit: false,
    })
  })

  it('an internal profile that asks takes explicit from the answer (Yes)', () => {
    expect(flagsForProfile(byId('regular-internal'), true)).toEqual({
      solution: false,
      distributionExternal: false,
      distributionExplicit: true,
    })
  })

  it('explicit "false" stays false whatever the answer', () => {
    const notExplicit: ComponentProfile = {
      ...byId('regular-external'),
      classification: { external: true, explicit: 'false', solution: false },
    }
    expect(flagsForProfile(notExplicit, true).distributionExplicit).toBe(false)
  })
})

describe('asksExplicit', () => {
  it('is true only for explicit "ask"', () => {
    expect(asksExplicit(byId('regular-external'))).toBe(true)
    expect(asksExplicit(byId('regular-internal'))).toBe(true)
    expect(asksExplicit(byId('solution'))).toBe(false)
    expect(
      asksExplicit({ ...byId('regular-external'), classification: { external: true, explicit: 'false', solution: false } }),
    ).toBe(false)
  })
})
