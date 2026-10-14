import type { ComponentProfile } from '../../hooks/useComponentProfiles'
import type { ComponentDetail } from '../types'
import { profileRuleErrors } from './profileRules'

export const isRegular = (p: ComponentProfile) => p.kind === 'regular'
export const isTemplate = (p: ComponentProfile) => p.kind === 'template'

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

/**
 * The classification a create carries when the registry offers no profiles and the user sets it
 * directly. Only an explicit external component can be a solution, as the registry requires.
 */
export function manualFlags(external: boolean, explicit: boolean, solution: boolean): ProfileFlags {
  return {
    solution: solution && external && explicit,
    distributionExternal: external,
    distributionExplicit: explicit,
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
 * classification matches; else none. `matchesAny` tells "no profile has this classification" (the
 * clone sets it directly) from "only profiles the user may not use have it" (the clone must pick
 * one, and cannot). The explicit answer is seeded from the source either way.
 */
export function profileFromSource(
  source: ComponentDetail,
  profiles: readonly ComponentProfile[],
): { profileId: string | null; explicit: boolean; matchesAny: boolean } {
  const matching = profiles.filter((p) => isRegular(p) && matchesClassification(p, source))
  const candidates = matching.filter((p) => p.usable)
  const chosen = candidates.find((p) => keyPassesRules(p, source.name ?? '')) ?? candidates[0]
  return { profileId: chosen?.id ?? null, explicit: !!source.distributionExplicit, matchesAny: matching.length > 0 }
}

/**
 * The profile the wizard opens with: a clone's from [profileFromSource], a new component's the
 * first usable regular profile. A template is never pre-selected. `profile` is the object for
 * `profileId`, or `null` when none is selected.
 */
export function initialProfile(
  source: ComponentDetail | null,
  profiles: readonly ComponentProfile[],
): { profileId: string | null; profile: ComponentProfile | null; explicit: boolean; matchesAny: boolean } {
  const { profileId, explicit, matchesAny } = source
    ? profileFromSource(source, profiles)
    : {
        profileId: profiles.find((p) => isRegular(p) && p.usable)?.id ?? null,
        explicit: false,
        matchesAny: profiles.some(isRegular),
      }
  return { profileId, profile: profiles.find((p) => p.id === profileId) ?? null, explicit, matchesAny }
}
