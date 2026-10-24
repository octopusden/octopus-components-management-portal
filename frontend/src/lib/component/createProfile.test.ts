import { describe, it, expect } from 'vitest'
import {
  asksExplicit,
  flagsForProfile,
  initialProfile,
  manualFlags,
  profileForClassification,
  profileFromSource,
} from './createProfile'
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
    expect(profileFromSource(src, profiles)).toMatchObject({ profileId: 'dmp-bundle', explicit: true })
  })

  it('picks Solution for a solution with a -solution key', () => {
    const src = source({ name: 'payments-solution', solution: true, distributionExternal: true, distributionExplicit: true })
    expect(profileFromSource(src, profiles).profileId).toBe('solution')
  })

  it('picks Regular internal for an internal component, seeding explicit from the source', () => {
    const src = source({ name: 'tools', distributionExternal: false, distributionExplicit: true })
    expect(profileFromSource(src, profiles)).toMatchObject({ profileId: 'regular-internal', explicit: true })
  })

  it('falls back to the first classification match when no key rule passes', () => {
    const src = source({ name: 'legacy-bundle', solution: true, distributionExternal: true, distributionExplicit: true })
    expect(profileFromSource(src, profiles).profileId).toBe('solution')
  })

  it('selects none when no profile has the source classification', () => {
    const src = source({ name: 'odd', solution: true, distributionExternal: false, distributionExplicit: false })
    expect(profileFromSource(src, profiles).profileId).toBeNull()
  })

  it('selects none but reports a match when every matching profile is unusable', () => {
    const src = source({ name: 'pay-solution', solution: true, distributionExternal: true, distributionExplicit: true })
    const blocked = profiles.map((p) => (p.classification.solution ? { ...p, usable: false } : p))
    expect(profileFromSource(src, blocked)).toEqual({ profileId: null, explicit: true, matchesAny: true })
  })

  it('reports no match when no profile has the source classification, usable or not', () => {
    const src = source({ name: 'odd', solution: true, distributionExternal: false, distributionExplicit: false })
    expect(profileFromSource(src, profiles).matchesAny).toBe(false)
  })

  it('never pre-selects an unusable profile', () => {
    const src = source({ name: 'payments-dmp-bundle', solution: true, distributionExternal: true, distributionExplicit: true })
    const withBundleUnusable = profiles.map((p) => (p.id === 'dmp-bundle' ? { ...p, usable: false } : p))
    expect(profileFromSource(src, withBundleUnusable).profileId).toBe('solution')
  })
})

describe('profileForClassification', () => {
  const all = shipped.profiles as ComponentProfile[]
  const solutionFlags = { solution: true, distributionExternal: true, distributionExplicit: true }

  it('picks the usable profile whose key rule the key passes', () => {
    expect(profileForClassification(solutionFlags, 'pay-dmp-bundle', all)).toEqual({
      profile: byId('dmp-bundle'),
      matchesAny: true,
    })
  })

  it('falls back to the first usable matching profile when the key passes none', () => {
    expect(profileForClassification(solutionFlags, '', all).profile).toEqual(byId('solution'))
  })

  it('matches a profile that asks for explicit distribution whichever the answer', () => {
    const flags = { solution: false, distributionExternal: true, distributionExplicit: false }
    expect(profileForClassification(flags, 'payments', all).profile).toEqual(byId('regular-external'))
  })

  it('returns no profile when none has the classification', () => {
    const flags = { solution: false, distributionExternal: true, distributionExplicit: true }
    const solutionsOnly = all.filter((p) => p.classification.solution)
    expect(profileForClassification(flags, 'payments', solutionsOnly)).toEqual({ profile: null, matchesAny: false })
  })

  it('returns no profile, but a match, when only profiles the user may not use have it', () => {
    const unusable = all.map((p) => ({ ...p, usable: false }))
    expect(profileForClassification(solutionFlags, '', unusable)).toEqual({ profile: null, matchesAny: true })
  })
})

describe('initialProfile', () => {
  const profiles = shipped.profiles as ComponentProfile[]

  it('a new component opens with the first usable profile', () => {
    const withFirstUnusable = profiles.map((p, i) => (i === 0 ? { ...p, usable: false } : p))
    expect(initialProfile(null, withFirstUnusable)).toMatchObject({
      profileId: 'regular-internal',
      profile: byId('regular-internal'),
      explicit: false,
    })
  })

  it('a clone opens with the profile derived from its source', () => {
    const src = { name: 'pay-solution', solution: true, distributionExternal: true, distributionExplicit: true } as ComponentDetail
    expect(initialProfile(src, profiles)).toMatchObject({ profileId: 'solution', explicit: true })
  })

  const template = (overrides: Partial<ComponentProfile> = {}): ComponentProfile => ({
    id: 'client-plugin',
    kind: 'template',
    version: 3,
    title: 'Client plugin',
    description: 'A client plugin',
    classification: { external: true, explicit: 'false', solution: false },
    rules: [],
    usable: true,
    ...overrides,
  })

  it('never pre-selects a template, even one listed first', () => {
    expect(initialProfile(null, [template(), ...profiles])).toMatchObject({ profileId: 'regular-external' })
  })

  it('selects nothing when only a template is usable', () => {
    const regularUnusable = profiles.map((p) => ({ ...p, usable: false }))
    expect(initialProfile(null, [...regularUnusable, template()])).toMatchObject({ profileId: null, profile: null })
  })

  it('never matches a clone to a template with the same classification', () => {
    const src = { name: 'abc-plugin', distributionExternal: true, distributionExplicit: false } as ComponentDetail
    const internalOnly = profiles.filter((p) => p.id === 'regular-internal')
    expect(initialProfile(src, [template(), ...internalOnly])).toMatchObject({ profileId: null, matchesAny: false })
  })

  it('opens with nothing selected when no profile is usable', () => {
    expect(initialProfile(null, profiles.map((p) => ({ ...p, usable: false })))).toMatchObject({
      profileId: null,
      profile: null,
      explicit: false,
    })
  })
})

describe('manualFlags', () => {
  it('keeps solution only for an explicit external component', () => {
    expect(manualFlags(true, true, true)).toEqual({ solution: true, distributionExternal: true, distributionExplicit: true })
    expect(manualFlags(true, false, true).solution).toBe(false)
    expect(manualFlags(false, true, true).solution).toBe(false)
  })

  it('carries external and explicit as chosen', () => {
    expect(manualFlags(false, true, false)).toEqual({ solution: false, distributionExternal: false, distributionExplicit: true })
  })
})
