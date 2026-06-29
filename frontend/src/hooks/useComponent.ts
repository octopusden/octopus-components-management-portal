import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type {
  ComponentCreateRequest,
  ComponentDetail,
  ComponentUpdateRequest,
  FieldOverride,
  MarkerChildrenPayload,
  SupportedVersionsRequest,
  SupportedVersionsResponse,
} from '../lib/types'

// Request body types now live alongside the response types in
// `frontend/src/lib/types.ts`. Re-exported here so callers that imported
// them from this module continue to compile.
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

// Override CUD mutations invalidate BOTH caches:
//   - ['field-overrides', id]  → FieldOverrides table
//   - ['component', id]        → ConfigurationsTab (reads configurations[]
//                                  off the parent component fetch); without
//                                  this invalidation, edits show in the
//                                  Overrides tab but the Configurations
//                                  view stays stale until a full refetch.
function invalidateOverrideAndComponent(
  queryClient: ReturnType<typeof useQueryClient>,
  componentId: string,
) {
  queryClient.invalidateQueries({ queryKey: ['field-overrides', componentId] })
  queryClient.invalidateQueries({ queryKey: ['component', componentId] })
}

export function useCreateFieldOverride(componentId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (request: FieldOverrideCreateBody) =>
      api.post<FieldOverride>(`/components/${componentId}/field-overrides`, request),
    onSuccess: () => invalidateOverrideAndComponent(queryClient, componentId),
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
    onSuccess: () => invalidateOverrideAndComponent(queryClient, componentId),
  })
}

export function useDeleteFieldOverride(componentId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (overrideId: string) =>
      api.delete(`/components/${componentId}/field-overrides/${overrideId}`),
    onSuccess: () => invalidateOverrideAndComponent(queryClient, componentId),
  })
}

// Supported versions (coverage) — ADR-018 layer 1. GET reports `{all, ranges, warnings}`; the PUT
// declaratively replaces the supported set and returns the resulting coverage plus any V1/V5
// warnings (an override left outside supported). Editing coverage can re-align per-attribute
// override breakpoints server-side (auto-split), so the PUT invalidates the supported-versions
// cache AND the parent component (Configurations / Overrides views).
export function useSupportedVersions(componentId: string) {
  return useQuery({
    queryKey: ['supported-versions', componentId],
    queryFn: () => api.get<SupportedVersionsResponse>(`/components/${componentId}/supported-versions`),
    enabled: !!componentId,
  })
}

export function useUpdateSupportedVersions(componentId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (request: SupportedVersionsRequest) =>
      api.put<SupportedVersionsResponse>(`/components/${componentId}/supported-versions`, request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supported-versions', componentId] })
      invalidateOverrideAndComponent(queryClient, componentId)
    },
  })
}
