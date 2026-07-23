import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { TeamcityValidationRow, TeamcityValidationSummary } from '../lib/types'

/**
 * `GET rest/api/4/admin/teamcity-validations/summary` — registry-wide counters
 * backing the Validations page's KPI cards and byType/byStatus breakdowns.
 * Recomputed server-side by the validation sweep, so a short staleTime is
 * fine (mirrors useHealthStatistics). Admin-only endpoint, matching the
 * page's route/nav gating.
 */
export function useTeamCityValidationSummary() {
  return useQuery({
    queryKey: ['teamcity-validations', 'summary'],
    queryFn: () => api.get<TeamcityValidationSummary>('/admin/teamcity-validations/summary'),
    staleTime: 5 * 60 * 1000,
  })
}

// NOTE: no `category` here — category is a purely front-end concept (see
// teamcityValidationTypes.ts) with no backing query param on this endpoint.
// The Validations page filters by category client-side, over the rows this
// hook returns.
export interface TeamCityValidationFilters {
  type?: string[]
  status?: string[]
}

/**
 * `GET rest/api/4/admin/teamcity-validations` — the flat, filterable finding
 * list backing the Validations page's table (and, unfiltered, the components
 * list's per-row TeamCity warning badge — see ComponentListPage.tsx). Filters
 * are query-driven: each distinct filter combination gets its own cache entry
 * via the queryKey. Admin-only endpoint, matching the Validations page's
 * route/nav gating. Each filter is multi-select (comma-joined query param),
 * mirroring the components list's system/buildSystem/labels filters
 * (see useComponents.ts).
 *
 * `enabled` (default `true`) is a plain react-query passthrough — pass
 * `isAdmin` from a caller that isn't already route-gated (e.g.
 * ComponentListPage.tsx) so a non-admin's browser never makes this request,
 * mirroring `useValidationProblems`'s gating contract.
 */
export function useTeamCityValidations(filters: TeamCityValidationFilters = {}, enabled = true) {
  const params = new URLSearchParams()
  if (filters.type?.length) params.set('type', filters.type.join(','))
  if (filters.status?.length) params.set('status', filters.status.join(','))
  const qs = params.toString()

  return useQuery({
    queryKey: ['teamcity-validations', 'list', filters],
    queryFn: () => api.get<TeamcityValidationRow[]>(`/admin/teamcity-validations${qs ? `?${qs}` : ''}`),
    staleTime: 60 * 1000,
    enabled,
  })
}
