import { useQuery } from '@tanstack/react-query'
import { ApiError, api } from '../lib/api'

interface UseMetaOptions {
  /**
   * Gate the network request behind a UI interaction — see [useClientCodes].
   * The picker mounts in the filter bar before the user expresses intent, so
   * the caller passes `false` and flips to `true` on first open to avoid a
   * page-mount 404 against a CRS that has not yet shipped the endpoint.
   */
  enabled?: boolean
}

/**
 * Distinct component keys actually referenced as a parent — the list-page
 * `parentComponentName` FILTER dropdown (SYS-046). This is the set of real
 * parent refs in use, NOT the can-be-parent candidate set the editor's parent
 * picker uses (that comes from `?canBeParent=true`). Do not conflate the two.
 */
export function useParentComponentNames({ enabled = true }: UseMetaOptions = {}) {
  return useQuery({
    queryKey: ['meta', 'parent-component-names'],
    enabled,
    queryFn: async () => {
      try {
        return await api.get<string[]>('/components/meta/parent-component-names')
      } catch (e) {
        if (e instanceof ApiError && (e.status === 404 || e.status === 501)) return [] as string[]
        throw e
      }
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
}
