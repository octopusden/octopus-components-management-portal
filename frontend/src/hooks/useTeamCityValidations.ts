import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { TeamcityValidationRow, TeamcityValidationSummary } from '../lib/types'

/**
 * `GET rest/api/4/teamcity-validations/summary` — registry-wide counters
 * backing the Validations page's KPI cards and byType/byStatus breakdowns.
 * Recomputed server-side by the validation sweep, so a short staleTime is
 * fine (mirrors useHealthStatistics).
 */
export function useTeamCityValidationSummary() {
  return useQuery({
    queryKey: ['teamcity-validations', 'summary'],
    queryFn: () => api.get<TeamcityValidationSummary>('/teamcity-validations/summary'),
    staleTime: 5 * 60 * 1000,
  })
}

export interface TeamCityValidationFilters {
  type?: string
  status?: string
  componentId?: string
}

/**
 * `GET rest/api/4/teamcity-validations` — the flat, filterable finding list
 * backing the Validations page's table. Filters are query-driven (see
 * TeamCityValidationsPage): each distinct filter combination gets its own
 * cache entry via the queryKey.
 */
export function useTeamCityValidations(filters: TeamCityValidationFilters = {}) {
  const params = new URLSearchParams()
  if (filters.type) params.set('type', filters.type)
  if (filters.status) params.set('status', filters.status)
  if (filters.componentId) params.set('componentId', filters.componentId)
  const qs = params.toString()

  return useQuery({
    queryKey: ['teamcity-validations', 'list', filters],
    queryFn: () => api.get<TeamcityValidationRow[]>(`/teamcity-validations${qs ? `?${qs}` : ''}`),
    staleTime: 60 * 1000,
  })
}
