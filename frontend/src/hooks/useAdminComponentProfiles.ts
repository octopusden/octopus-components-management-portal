import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { components } from '../lib/api/schema'

export type AdminComponentProfiles = components['schemas']['AdminComponentProfilesResponse']
export type AdminProfileEntry = components['schemas']['AdminComponentProfileEntry']

/**
 * Every profile and template the registry has configured, live or failed, with the last load's
 * result. Read afresh each time the Templates tab opens, so it shows what a reload left behind.
 */
export function useAdminComponentProfiles() {
  return useQuery({
    queryKey: ['admin', 'component-profiles'],
    queryFn: () => api.get<AdminComponentProfiles>('/admin/component-profiles'),
    staleTime: 0,
    refetchOnMount: 'always',
    retry: false,
  })
}
