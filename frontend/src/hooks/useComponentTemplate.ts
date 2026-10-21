import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { components } from '../lib/api/schema'

export type ComponentTemplate = components['schemas']['ComponentTemplateResponse']

/**
 * A live template's description: its parameters, classification and overridable paths. Read
 * afresh each time a consumer mounts, so a template a reload changed is never served from cache.
 */
export function useComponentTemplate(id: string | null) {
  return useQuery({
    queryKey: ['component-template', id],
    queryFn: () => api.get<ComponentTemplate>(`/component-templates/${encodeURIComponent(id ?? '')}`),
    enabled: id !== null,
    staleTime: 0,
    refetchOnMount: 'always',
    retry: false,
  })
}
