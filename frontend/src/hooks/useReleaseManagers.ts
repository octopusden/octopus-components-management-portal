import { useMetaInUse, type UseMetaOptions } from './useMetaInUse'

/**
 * Distinct release-manager usernames currently assigned to at least one
 * component, for the list-page `?releaseManager=` multi-select. Sourced from the
 * ordered `component_release_managers` child collection, so every option
 * resolves to a non-empty page — an employee who is nobody's release manager is
 * deliberately not offered (that is what makes this an *in-use* list, not an
 * employee directory lookup).
 */
export function useReleaseManagers(options?: UseMetaOptions) {
  return useMetaInUse('release-managers', '/components/meta/release-managers', options)
}
