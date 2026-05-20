import { useQuery } from '@tanstack/react-query'
import { ApiError, api } from '../lib/api'

interface UseLabelsOptions {
  /**
   * Gate the network request behind a UI interaction. Defaults to `true` for
   * backwards compatibility, but callers that mount before the user expresses
   * intent (e.g. the labels picker which lives in the filter bar) should pass
   * `false` and flip to `true` on first open. While CRS does not yet ship
   * `/components/meta/labels` the page-mount fetch logs a native browser 404
   * BEFORE our React-Query catch runs — Playwright's console-error listener
   * picks it up and fails the smoke spec.
   */
  enabled?: boolean
}

export function useLabels({ enabled = true }: UseLabelsOptions = {}) {
  return useQuery({
    queryKey: ['meta', 'labels'],
    enabled,
    queryFn: async () => {
      try {
        return await api.get<string[]>('/components/meta/labels')
      } catch (e) {
        // CRS may not have shipped /meta/labels yet — treat the "missing
        // endpoint" responses as an empty vocabulary so the picker still
        // opens. Any other failure (5xx, network) is a real error.
        if (e instanceof ApiError && (e.status === 404 || e.status === 501)) return [] as string[]
        throw e
      }
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
}
