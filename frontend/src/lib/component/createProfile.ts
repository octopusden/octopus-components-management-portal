import type { ComponentProfile } from '../../hooks/useComponentProfiles'

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
