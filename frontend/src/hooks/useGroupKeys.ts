import { useMetaInUse, type UseMetaOptions } from './useMetaInUse'

/**
 * Distinct owning `groupKey` values for the list-page multi-select (SYS-046). The
 * CRS endpoint lists only groups that own at least one component visible in the v4
 * list (fake self-owned aggregator stubs are excluded), so every option resolves to
 * a non-empty `?groupKey=` page.
 */
export function useGroupKeys(options?: UseMetaOptions) {
  return useMetaInUse('group-keys', '/components/meta/group-keys', options)
}
