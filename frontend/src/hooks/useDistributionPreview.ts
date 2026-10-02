import { useQuery } from '@tanstack/react-query'
import { api, ApiError } from '../lib/api'
import type { components } from '../lib/api/schema'
import type { FieldOverrideUpsert } from '../lib/types'

export type DistributionPreviewResponse = components['schemas']['DistributionPreviewResponse']
export type DistributionPathPreview = components['schemas']['DistributionPathPreview']

/** CRS `DistributionPreviewRequest`, with `fieldOverrides` typed as the
 *  hand-mirrored upsert the combined Save sends (the generated one types
 *  `value` as `Record<string, never>` — see `FieldOverrideUpsert`). */
export interface DistributionPreviewRequest {
  version: string
  /** Full replacement of the saved override set; omitted = the saved set. */
  fieldOverrides?: FieldOverrideUpsert[]
  /** Candidate supported versions; omitted = the saved ones. */
  supportedVersions?: components['schemas']['DistributionPreviewCoverage']
}

/**
 * Which source each `distribution.*` marker path takes for `payload.version`,
 * resolved by the registry over the unsaved drafts
 * (`POST /components/{id}/distribution/preview`, CRS SYS-099). Read-only: never
 * touches the editor's dirty state.
 *
 * The version is trimmed so the gate, key and body agree; a blank version
 * issues nothing. The only 400 is an unparseable version → `isInvalid`.
 */
export function useDistributionPreview(componentId: string, payload: DistributionPreviewRequest, enabled: boolean) {
  const version = payload.version.trim()
  const body: DistributionPreviewRequest = { ...payload, version }
  const query = useQuery<DistributionPreviewResponse>({
    queryKey: ['distribution-preview', componentId, body],
    queryFn: () => api.post<DistributionPreviewResponse>(`/components/${componentId}/distribution/preview`, body),
    enabled: enabled && version.length > 0,
    retry: false,
    staleTime: 5 * 60_000,
  })
  const isInvalid = query.error instanceof ApiError && query.error.status === 400
  return { ...query, isInvalid }
}
