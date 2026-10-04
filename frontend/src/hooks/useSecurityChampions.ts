import { useMetaInUse, type UseMetaOptions } from './useMetaInUse'

/**
 * Distinct security-champion usernames currently assigned to at least one
 * component, for the list-page `?securityChampion=` multi-select. Same in-use
 * contract as {@link useReleaseManagers}, against the security-champion child
 * collection — a separate endpoint, because the two filters are separate
 * dimensions and a merged list would offer dead options in both pickers.
 */
export function useSecurityChampions(options?: UseMetaOptions) {
  return useMetaInUse('security-champions', '/components/meta/security-champions', options)
}
