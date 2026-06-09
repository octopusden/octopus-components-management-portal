import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { ComponentEditors } from '../lib/types'

/**
 * Fetches the read-only "who can edit" projection for a component
 * (`GET /components/{id}/editors` → componentOwner + releaseManagers + securityChampions).
 * Informational only — administrators may also edit but are not enumerated. `staleTime` keeps
 * it from refetching on every render of the General tab (the data rarely changes per session).
 */
export function useComponentEditors(id: string) {
  return useQuery<ComponentEditors>({
    queryKey: ['component-editors', id],
    queryFn: () => api.get<ComponentEditors>(`/components/${id}/editors`),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  })
}
