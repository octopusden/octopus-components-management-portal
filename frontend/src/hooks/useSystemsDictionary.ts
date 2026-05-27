import { useQuery } from '@tanstack/react-query'
import { ApiError, api } from '../lib/api'

/**
 * Full dictionary of `systems` reference values, sourced from the master table
 * (NOT the in-use M:N junction surfaced by `/components/meta/systems`). Used
 * by the editor multi-select so users can only attach values that exist in
 * the dictionary.
 *
 * Error policy mirrors `useLabels`: CRS may not have shipped the endpoint
 * yet (the companion CRS PR introduces it), so a 404 / 501 resolves to `[]`
 * — the consumer renders an empty popover instead of a hard error. Any
 * other failure (5xx, network) still propagates as `isError: true`.
 */
export function useSystemsDictionary() {
  return useQuery({
    queryKey: ['meta', 'systems-dictionary'],
    queryFn: async () => {
      try {
        return await api.get<string[]>('/components/meta/systems/dictionary')
      } catch (e) {
        if (e instanceof ApiError && (e.status === 404 || e.status === 501)) return [] as string[]
        throw e
      }
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
}
