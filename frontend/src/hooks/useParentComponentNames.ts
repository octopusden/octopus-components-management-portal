import { useMetaInUse, type UseMetaOptions } from './useMetaInUse'

/**
 * Distinct component keys actually referenced as a parent — the list-page
 * `parentComponentName` FILTER dropdown (SYS-046). This is the set of real parent
 * refs in use, NOT the can-be-parent candidate set the editor's parent picker uses
 * (that comes from `?canBeParent=true`). Do not conflate the two.
 */
export function useParentComponentNames(options?: UseMetaOptions) {
  return useMetaInUse('parent-component-names', '/components/meta/parent-component-names', options)
}
