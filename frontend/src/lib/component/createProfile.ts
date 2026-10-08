import type { ComponentProfile } from '../../hooks/useComponentProfiles'
import type { ComponentDetail } from '../types'
import { profileRuleErrors } from './profileRules'

export interface ProfileFlags {
  solution: boolean
  distributionExternal: boolean
  distributionExplicit: boolean
}

/**
 * The distribution classification a create with [profile] carries. Solution and external come
 * from the profile as given; explicit comes from the profile unless it is `ask`, in which case the
 * user's answer to "Has explicit distribution?" decides.
 */
export function flagsForProfile(profile: ComponentProfile, explicitAnswer: boolean): ProfileFlags {
  const { solution, external, explicit } = profile.classification
  return {
    solution,
    distributionExternal: external,
    distributionExplicit: explicit === 'ask' ? explicitAnswer : explicit === 'true',
  }
}

export function asksExplicit(profile: ComponentProfile): boolean {
  return profile.classification.explicit === 'ask'
}

function matchesClassification(profile: ComponentProfile, source: ComponentDetail): boolean {
  const { solution, external, explicit } = profile.classification
  return (
    solution === !!source.solution &&
    external === !!source.distributionExternal &&
    (explicit === 'ask' || (explicit === 'true') === !!source.distributionExplicit)
  )
}

function keyPassesRules(profile: ComponentProfile, key: string): boolean {
  const keyRules = profile.rules.filter((r) => r.path === 'name')
  return profileRuleErrors(keyRules, { name: key }).size === 0
}

/**
 * The profile a clone of [source] starts with: the first usable profile whose classification
 * matches the source and whose key rules the source's key passes; else the first usable one whose
 * classification matches; else none, and the user picks on the Profile step. The explicit answer
 * is seeded from the source either way.
 */
export function profileFromSource(
  source: ComponentDetail,
  profiles: readonly ComponentProfile[],
): { profileId: string | null; explicit: boolean } {
  const candidates = profiles.filter((p) => p.usable && matchesClassification(p, source))
  const chosen = candidates.find((p) => keyPassesRules(p, source.name ?? '')) ?? candidates[0]
  return { profileId: chosen?.id ?? null, explicit: !!source.distributionExplicit }
}
