import { useQuery } from '@tanstack/react-query'
import { ApiError, api } from '../lib/api'

export function useLabels() {
  return useQuery({
    queryKey: ['meta', 'labels'],
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
