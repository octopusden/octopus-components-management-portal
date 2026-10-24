import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { ArchiveReadinessResponse } from '../lib/types'

/**
 * `GET rest/api/4/components/{id}/archive-readiness` — CRS's advisory
 * readiness verdict for archiving a component (see
 * openspec/changes/component-archive-readiness-gate/design.md "The contract").
 * Lazily enabled: the answer requires live calls to three external systems on
 * CRS's side, so it is only requested once someone chooses Archive, never on
 * component load.
 *
 * `refetch` backs the readiness view's in-place retry control for a
 * SYSTEM_UNAVAILABLE entry — react-query's default replace-on-refetch means a
 * retry naturally overwrites the previous entries rather than appending.
 */
export function useArchiveReadiness(componentId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['component', componentId, 'archive-readiness'],
    queryFn: () => api.get<ArchiveReadinessResponse>(`/components/${componentId}/archive-readiness`),
    enabled: enabled && !!componentId,
    retry: false,
    // Every open of the dialog should re-ask CRS — the answer is time-sensitive
    // by nature (design.md decision 1) — so a cached answer must not be served silently.
    staleTime: 0,
  })
}
