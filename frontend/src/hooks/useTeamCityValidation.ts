import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../lib/api'
import { parseSameKindAttach } from '../lib/migrationConflict'
import type { TeamCityValidationJobResponse } from '../lib/types'

const TC_VALIDATION_JOB_KEY = ['tc-validation', 'job'] as const
const JOB_POLL_INTERVAL_MS = 1_000

/**
 * Start (or attach to) the async TC validation job.
 *
 * Mirrors [useRunTeamCityResync] exactly — see that hook's doc comment for the
 * full rationale (202 vs 409 same-kind attach, cross-kind conflict shape,
 * why cache invalidation on success is limited to the COMPLETED-on-start
 * race). `POST /admin/teamcity-validation` returns 202 Accepted on a freshly
 * started job and 409 Conflict if a TC validation run is already RUNNING,
 * both carrying the identical `TeamCityValidationJobResponse` body.
 */
export function useRunTeamCityValidation() {
  const queryClient = useQueryClient()
  return useMutation<TeamCityValidationJobResponse, Error, void>({
    mutationFn: async () => {
      try {
        return await api.post<TeamCityValidationJobResponse>('/admin/teamcity-validation')
      } catch (err) {
        if (err instanceof ApiError) {
          const attach = parseSameKindAttach<TeamCityValidationJobResponse>(err)
          if (attach) return attach
        }
        throw err
      }
    },
    onSuccess: (job) => {
      queryClient.setQueryData(TC_VALIDATION_JOB_KEY, job)
      // Fast-path: executor finishes before the response is built (small
      // registry / synchronous test executor) — mirror useRunTeamCityResync's
      // COMPLETED-on-start fallback so caches get refreshed in that path too.
      if (job.state === 'COMPLETED' && job.result) {
        queryClient.invalidateQueries({ queryKey: ['components'] })
        queryClient.invalidateQueries({
          predicate: (query) => query.queryKey[0] === 'component',
        })
        queryClient.invalidateQueries({ queryKey: ['teamcity-validations'] })
      }
    },
  })
}

/**
 * Poll `/admin/teamcity-validation/job` for the current async TC validation
 * run state. Mirrors [useTeamCityResyncJob] exactly — see that hook for the
 * 404→null and refetchInterval rationale.
 */
export function useTeamCityValidationJob() {
  return useQuery<TeamCityValidationJobResponse | null>({
    queryKey: TC_VALIDATION_JOB_KEY,
    queryFn: async () => {
      try {
        return await api.get<TeamCityValidationJobResponse>('/admin/teamcity-validation/job')
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null
        throw err
      }
    },
    refetchInterval: (query) =>
      query.state.data?.state === 'RUNNING' ? JOB_POLL_INTERVAL_MS : false,
  })
}
