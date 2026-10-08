import { describe, it, expect } from 'vitest'
import { asksExplicit, flagsForProfile, initialProfile, profileFromSource } from './createProfile'
import type { ComponentDetail } from '../types'
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

describe('profileFromSource', () => {
  const profiles = shipped.profiles as ComponentProfile[]
  const source = (overrides: Partial<ComponentDetail>) =>
    ({ name: 'svc', solution: null, distributionExternal: false, distributionExplicit: false, ...overrides }) as ComponentDetail

  it('picks DMP Bundle for a solution whose key the Solution rule rejects', () => {
    const src = source({ name: 'payments-dmp-bundle', solution: true, distributionExternal: true, distributionExplicit: true })
    expect(profileFromSource(src, profiles)).toEqual({ profileId: 'dmp-bundle', explicit: true })
  })

  it('picks Solution for a solution with a -solution key', () => {
    const src = source({ name: 'payments-solution', solution: true, distributionExternal: true, distributionExplicit: true })
    expect(profileFromSource(src, profiles).profileId).toBe('solution')
  })

  it('picks Regular internal for an internal component, seeding explicit from the source', () => {
    const src = source({ name: 'tools', distributionExternal: false, distributionExplicit: true })
    expect(profileFromSource(src, profiles)).toEqual({ profileId: 'regular-internal', explicit: true })
  })

  it('falls back to the first classification match when no key rule passes', () => {
    const src = source({ name: 'legacy-bundle', solution: true, distributionExternal: true, distributionExplicit: true })
    expect(profileFromSource(src, profiles).profileId).toBe('solution')
  })

  it('selects none when no profile has the source classification', () => {
    const src = source({ name: 'odd', solution: true, distributionExternal: false, distributionExplicit: false })
    expect(profileFromSource(src, profiles).profileId).toBeNull()
  })

  it('never pre-selects an unusable profile', () => {
    const src = source({ name: 'payments-dmp-bundle', solution: true, distributionExternal: true, distributionExplicit: true })
    const withBundleUnusable = profiles.map((p) => (p.id === 'dmp-bundle' ? { ...p, usable: false } : p))
    expect(profileFromSource(src, withBundleUnusable).profileId).toBe('solution')
  })
})

describe('initialProfile', () => {
  const profiles = shipped.profiles as ComponentProfile[]

  it('a new component opens with the first usable profile', () => {
    const withFirstUnusable = profiles.map((p, i) => (i === 0 ? { ...p, usable: false } : p))
    expect(initialProfile(null, withFirstUnusable)).toEqual({
      profileId: 'regular-internal',
      profile: byId('regular-internal'),
      explicit: false,
    })
  })

  it('a clone opens with the profile derived from its source', () => {
    const src = { name: 'pay-solution', solution: true, distributionExternal: true, distributionExplicit: true } as ComponentDetail
    expect(initialProfile(src, profiles)).toMatchObject({ profileId: 'solution', explicit: true })
  })

  it('opens with nothing selected when no profile is usable', () => {
    expect(initialProfile(null, profiles.map((p) => ({ ...p, usable: false })))).toEqual({
      profileId: null,
      profile: null,
      explicit: false,
    })
  })
})
