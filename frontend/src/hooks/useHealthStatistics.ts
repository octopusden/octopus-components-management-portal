import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { HealthStatistics } from '../lib/types'

/**
 * Aggregated registry counts for the admin Registry Health page — CRS
 * `GET /health/statistics` (resolves to `/rest/api/4/health/statistics` via the
 * default `api` client, which carries the app's 401/OIDC handling). Mirrors the
 * meta-dictionary hooks (useOwners et al.): a 5-minute staleTime, since the
 * aggregation is recomputed server-side and need not be refetched on every
 * navigation.
 */
export function useHealthStatistics() {
  return useQuery({
    queryKey: ['health', 'statistics'],
    queryFn: () => api.get<HealthStatistics>('/health/statistics'),
    staleTime: 5 * 60 * 1000,
  })
}
