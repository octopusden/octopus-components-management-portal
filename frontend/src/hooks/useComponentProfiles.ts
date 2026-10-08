import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { components } from '../lib/api/schema'

export type ComponentProfile = components['schemas']['ComponentProfileResponse']
export type ProfileFieldRule = components['schemas']['FieldRule']
type ComponentProfilesResponse = components['schemas']['ComponentProfilesResponse']

/**
 * The Create-component profiles the registry offers the current user, in the registry's order.
 *
 * Only `regular` profiles reach the caller; other kinds are not offered by the wizard yet. Never
 * served from cache across wizard opens, so a profile changed by a registry reload shows up the
 * next time the wizard mounts.
 */
export function useComponentProfiles() {
  return useQuery({
    queryKey: ['component-profiles'],
    queryFn: () => api.get<ComponentProfilesResponse>('/component-profiles'),
    select: (response) => response.profiles.filter((p) => p.kind === 'regular'),
    staleTime: 0,
    refetchOnMount: 'always',
    retry: false,
  })
}
