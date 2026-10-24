import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { components } from '../lib/api/schema'

export type ComponentProfile = components['schemas']['ComponentProfileResponse']
export type ProfileFieldRule = components['schemas']['FieldRule']
type ComponentProfilesResponse = components['schemas']['ComponentProfilesResponse']

const OFFERED_KINDS: ReadonlySet<string> = new Set(['regular', 'template'])

/**
 * The Create-component profiles and templates the registry offers the current user, in the
 * registry's order.
 *
 * An entry of a kind the wizard does not know is dropped. Never served from cache across wizard
 * opens, so an entry changed by a registry reload shows up the next time the wizard mounts.
 */
export function useComponentProfiles() {
  return useQuery({
    queryKey: ['component-profiles'],
    queryFn: () => api.get<ComponentProfilesResponse>('/component-profiles'),
    select: (response) => response.profiles.filter((p) => OFFERED_KINDS.has(p.kind)),
    staleTime: 0,
    refetchOnMount: 'always',
    retry: false,
  })
}
