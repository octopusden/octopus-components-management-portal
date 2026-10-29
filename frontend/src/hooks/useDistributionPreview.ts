import { useQuery } from '@tanstack/react-query'
import { api, ApiError } from '../lib/api'
import type { components } from '../lib/api/schema'
import type { FieldOverrideUpsert } from '../lib/types'

export type DistributionPreviewResponse = components['schemas']['DistributionPreviewResponse']

/** CRS `DistributionPreviewRequest`, with `fieldOverrides` widened to the
 *  hand-mirrored upsert the combined Save sends (the generated one types
 *  `value` as `Record<string, never>` — see `FieldOverrideUpsert`). Omitted
 *  `fieldOverrides` / `supportedVersions` = the saved state. */
export type DistributionPreviewRequest = Omit<components['schemas']['DistributionPreviewRequest'], 'fieldOverrides'> & {
  fieldOverrides?: FieldOverrideUpsert[]
}

/**
 * Which source each `distribution.*` marker path takes for `payload.version`,
 * resolved by the registry over the unsaved drafts
 * (`POST /components/{id}/distribution/preview`, CRS SYS-105). Read-only: never
 * touches the editor's dirty state.
 *
 * The caller passes a trimmed version; an empty one issues nothing. The only
 * 400 is an unparseable version → `isInvalid`.
 */
export function useDistributionPreview(componentId: string, payload: DistributionPreviewRequest, enabled: boolean) {
  const query = useQuery<DistributionPreviewResponse>({
    queryKey: ['distribution-preview', componentId, payload],
    queryFn: () => api.post<DistributionPreviewResponse>(`/components/${componentId}/distribution/preview`, payload),
    enabled: enabled && payload.version !== '',
    retry: false,
    staleTime: 5 * 60_000,
  })
  // Pick fields rather than spreading: a spread reads `query.promise`, whose
  // rejection then goes unhandled.
  const { data, error, isError, isFetching, isPending, isSuccess } = query
  const isInvalid = error instanceof ApiError && error.status === 400
  return { data, isError, isFetching, isPending, isSuccess, isInvalid }
}
