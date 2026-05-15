import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type {
  ComponentCreateRequest,
  ComponentDetail,
  ComponentUpdateRequest,
  FieldOverride,
  MarkerChildrenPayload,
} from '../lib/types'

// schema-v2: request body types moved into `frontend/src/lib/types.ts`
// alongside the response types. Re-export here so existing callers that
// imported them from this module continue to compile during the Wave A
// migration.
export type { ComponentCreateRequest, ComponentUpdateRequest } from '../lib/types'

export function useComponent(id: string) {
  return useQuery({
    queryKey: ['component', id],
    queryFn: () => api.get<ComponentDetail>(`/components/${id}`),
    enabled: !!id,
  })
}

export function useCreateComponent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (request: ComponentCreateRequest) =>
      api.post<ComponentDetail>('/components', request),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['components'] }),
  })
}

export function useUpdateComponent(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (request: ComponentUpdateRequest) =>
      api.patch<ComponentDetail>(`/components/${id}`, request),
    onSuccess: (data) => {
      queryClient.setQueryData(['component', id], data)
      queryClient.invalidateQueries({ queryKey: ['components'] })
    },
  })
}

export function useDeleteComponent(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api.delete(`/components/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['components'] }),
  })
}

export function useFieldOverrides(componentId: string) {
  return useQuery({
    queryKey: ['field-overrides', componentId],
    queryFn: () => api.get<FieldOverride[]>(`/components/${componentId}/field-overrides`),
    enabled: !!componentId,
  })
}

// schema-v2: `fieldPath` → `overriddenAttribute`, plus optional
// `markerChildren` for the six marker overrides (vcs.settings,
// distribution.{maven,fileUrl,docker,packages}, build.requiredTools).
// Scalar overrides leave `markerChildren` null and pass `value`; marker
// overrides leave `value` null and pass the matching child collection.
export interface FieldOverrideCreateBody {
  overriddenAttribute: string
  versionRange: string
  value?: unknown
  markerChildren?: MarkerChildrenPayload | null
}

export interface FieldOverrideUpdateBody {
  versionRange?: string
  value?: unknown
  markerChildren?: MarkerChildrenPayload | null
}

export function useCreateFieldOverride(componentId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (request: FieldOverrideCreateBody) =>
      api.post<FieldOverride>(`/components/${componentId}/field-overrides`, request),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['field-overrides', componentId] }),
  })
}

export function useUpdateFieldOverride(componentId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ overrideId, ...request }: { overrideId: string } & FieldOverrideUpdateBody) =>
      api.patch<FieldOverride>(
        `/components/${componentId}/field-overrides/${overrideId}`,
        request,
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['field-overrides', componentId] }),
  })
}

export function useDeleteFieldOverride(componentId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (overrideId: string) =>
      api.delete(`/components/${componentId}/field-overrides/${overrideId}`),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['field-overrides', componentId] }),
  })
}
