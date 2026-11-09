import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
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

/** The component-detail GET — shared by useComponent and every by-UUID refetch path. */
export function fetchComponentDetail(id: string): Promise<ComponentDetail> {
  return api.get<ComponentDetail>(`/components/${id}`)
}

/** Refetch the component by its stable UUID and mirror the fresh snapshot into
 * the route-key cache entry (a route-key refetch 404s once a rename lands).
 * Best-effort: falls back to the cached snapshot, never rejects. */
export async function refreshComponentIntoCache(
  queryClient: QueryClient,
  componentId: string,
  componentCacheKey?: string,
): Promise<ComponentDetail | undefined> {
  try {
    const fresh = await queryClient.fetchQuery({
      queryKey: ['component', componentId],
      queryFn: () => fetchComponentDetail(componentId),
      staleTime: 0,
    })
    if (fresh && componentCacheKey && componentCacheKey !== componentId) {
      queryClient.setQueryData(['component', componentCacheKey], fresh)
    }
    return fresh
  } catch {
    return queryClient.getQueryData<ComponentDetail>(['component', componentCacheKey ?? componentId])
  }
}

export function useComponent(id: string) {
  return useQuery({
    queryKey: ['component', id],
    queryFn: () => fetchComponentDetail(id),
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

// `id` is the component UUID; `componentCacheKey` is the route segment the page
// is subscribed under — seed both cache entries when the page was opened by key.
export function useUpdateComponent(id: string, componentCacheKey?: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (request: ComponentUpdateRequest) =>
      api.patch<ComponentDetail>(`/components/${id}`, request),
    onSuccess: (data) => {
      queryClient.setQueryData(['component', id], data)
      if (componentCacheKey && componentCacheKey !== id) {
        queryClient.setQueryData(['component', componentCacheKey], data)
      }
      queryClient.invalidateQueries({ queryKey: ['components'] })
      // The combined PATCH also carries the desired field-override set (item D);
      // refetch the override baseline so OverridesDraftProvider re-seeds from the
      // authoritative server state after save (full-set-replace baseline freshness).
      queryClient.invalidateQueries({ queryKey: ['field-overrides', id] })
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

// Item D: field overrides are no longer written one-at-a-time. The editor
// queues create/update/delete into the page-level OverridesDraft and persists
// them as a desired-FULL-SET on the component PATCH (`ComponentUpdateRequest.
// fieldOverrides`). The create/update/delete REST hooks were removed; the
// FieldOverrideCreate/UpdateBody types above still describe the per-row payload
// the draft accumulates, and useUpdateComponent invalidates ['field-overrides',
// id] so the draft re-seeds from the authoritative baseline after a save.

// Invalidate the override + parent-component caches together. Still used by the
// supported-versions PUT: coverage changes which override range-views resolve,
// and the parent fetch carries configurations[].
function invalidateOverrideAndComponent(
  queryClient: ReturnType<typeof useQueryClient>,
  componentId: string,
) {
  queryClient.invalidateQueries({ queryKey: ['field-overrides', componentId] })
  queryClient.invalidateQueries({ queryKey: ['component', componentId] })
}

// Supported versions (coverage) — ADR-018 layer 1. GET reports `{all, ranges, warnings}`; the PUT
// declaratively replaces the supported set and returns the resulting MERGED coverage (overlapping /
// contiguous ranges collapse; a set that tiles all-versions becomes `all`) plus any V1/V5 warnings
// (an override left outside supported). Coverage is decoupled from overrides — it never reshapes
// them — but it does change which enumerated range VIEWS resolve (the read-time partition), so the
// PUT invalidates the supported-versions cache AND the parent component (Configurations / Overrides).
export function useSupportedVersions(componentId: string) {
  return useQuery({
    queryKey: ['supported-versions', componentId],
    queryFn: () => api.get<SupportedVersionsResponse>(`/components/${componentId}/supported-versions`),
    enabled: !!componentId,
  })
}

export function useUpdateSupportedVersions(componentId: string, componentCacheKey?: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (request: SupportedVersionsRequest) =>
      api.put<SupportedVersionsResponse>(`/components/${componentId}/supported-versions`, request),
    onSuccess: (data) => {
      // Seed the cache with the PUT response (the merged coverage) BEFORE invalidating, so a
      // back-to-back edit builds its next declarative replacement from fresh ranges rather than the
      // pre-PUT cached set (which would drop the just-saved change while the refetch is in flight).
      queryClient.setQueryData(['supported-versions', componentId], data)
      queryClient.invalidateQueries({ queryKey: ['supported-versions', componentId] })
      invalidateOverrideAndComponent(queryClient, componentId)
      // The PUT response is the coverage, not the component — refresh by UUID
      // and mirror into the route-key entry. The invalidate above already
      // refreshes UUID-routed pages; the mirror only matters for key routes.
      if (componentCacheKey && componentCacheKey !== componentId) {
        void refreshComponentIntoCache(queryClient, componentId, componentCacheKey)
      }
    },
  })
}
