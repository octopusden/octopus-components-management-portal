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
 * Distinct owning `groupKey` values for the list-page multi-select (SYS-046).
 * The CRS endpoint lists only groups that own at least one component visible in
 * the v4 list (fake self-owned aggregator stubs are excluded), so every option
 * resolves to a non-empty `?groupKey=` page.
 */
export function useGroupKeys({ enabled = true }: UseMetaOptions = {}) {
  return useQuery({
    queryKey: ['meta', 'group-keys'],
    enabled,
    queryFn: async () => {
      try {
        return await api.get<string[]>('/components/meta/group-keys')
      } catch (e) {
        if (e instanceof ApiError && (e.status === 404 || e.status === 501)) return [] as string[]
        throw e
      }
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
}
