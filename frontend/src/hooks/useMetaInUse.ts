import { useQuery } from '@tanstack/react-query'
import { ApiError, api } from '../lib/api'

export interface UseMetaOptions {
  /**
   * Gate the network request behind a UI interaction. The in-use meta pickers
   * live in the filter bar and mount before the user expresses intent, so callers
   * pass `false` and flip to `true` on first open — avoids a page-mount fetch
   * logging a native browser 404 (Playwright's console-error listener trips on it)
   * while a CRS without the SYS-046 endpoint is deployed.
   */
  enabled?: boolean
}

/**
 * Shared implementation for the in-use meta option-list hooks (SYS-046) that back
 * the extended-search multi-select dropdowns. One lazy `enabled` gate and one
 * missing-endpoint contract for all four: 404/501 → empty vocabulary so the picker
 * still opens against a CRS that has not shipped the endpoint yet; any other failure
 * (5xx, network) propagates as a real error. The thin per-field wrappers
 * (`useClientCodes`, `useJiraProjectKeys`, `useParentComponentNames`, `useGroupKeys`)
 * differ only by query key and endpoint path.
 */
export function useMetaInUse(key: string, path: string, { enabled = true }: UseMetaOptions = {}) {
  return useQuery({
    queryKey: ['meta', key],
    enabled,
    queryFn: async () => {
      try {
        return await api.get<string[]>(path)
      } catch (e) {
        if (e instanceof ApiError && (e.status === 404 || e.status === 501)) return [] as string[]
        throw e
      }
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
}
