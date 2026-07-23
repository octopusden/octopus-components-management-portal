import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { TeamcityValidationRow, TeamcityValidationSummary } from '../lib/types'

/**
 * `GET rest/api/4/admin/teamcity-validations/summary` — registry-wide counters
 * backing the Validations page's KPI tiles and byType/byStatus breakdowns.
 * Admin-only endpoint, matching the page's route/nav gating.
 */
export function useTeamCityValidationSummary() {
  return useQuery({
    queryKey: ['teamcity-validations', 'summary'],
    queryFn: () => api.get<TeamcityValidationSummary>('/admin/teamcity-validations/summary'),
    staleTime: 5 * 60 * 1000,
  })
}

export interface TeamCityValidationFilters {
  type?: string[]
  status?: string[]
}

/**
 * `GET rest/api/4/admin/teamcity-validations` — the flat, filterable finding
 * list backing the Validations page's table and the components list's
 * per-row TeamCity warning badge. Filters are multi-select (comma-joined
 * query params). Admin-only endpoint — pass `enabled: isAdmin` from callers
 * that aren't already route-gated (e.g. ComponentListPage.tsx) so a
 * non-admin's browser never issues the request.
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
