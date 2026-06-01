import { useQuery } from '@tanstack/react-query'
import { ApiError, api } from '../lib/api'

interface UseMetaOptions {
  /**
   * Gate the network request behind a UI interaction. The client-code picker
   * lives in the filter bar and mounts before the user expresses intent, so the
   * caller passes `false` and flips to `true` on first open. While a CRS without
   * `/components/meta/client-codes` (SYS-046) is deployed, a page-mount fetch
   * logs a native browser 404 BEFORE the React-Query catch runs — Playwright's
   * console-error listener trips on it.
   */
  enabled?: boolean
}

/** Distinct in-use `clientCode` values for the list-page multi-select (SYS-046). */
export function useClientCodes({ enabled = true }: UseMetaOptions = {}) {
  return useQuery({
    queryKey: ['meta', 'client-codes'],
    enabled,
    queryFn: async () => {
      try {
        return await api.get<string[]>('/components/meta/client-codes')
      } catch (e) {
        // CRS may not have shipped the endpoint yet — treat "missing endpoint"
        // as an empty vocabulary so the picker still opens. Other failures (5xx,
        // network) are real errors.
        if (e instanceof ApiError && (e.status === 404 || e.status === 501)) return [] as string[]
        throw e
      }
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
}
