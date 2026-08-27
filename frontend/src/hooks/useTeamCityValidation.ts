import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../lib/api'
import { parseSameKindAttach } from '../lib/migrationConflict'
import type { TeamCityValidationJobResponse } from '../lib/types'

export const TC_VALIDATION_JOB_KEY = ['tc-validation', 'job'] as const
const JOB_POLL_INTERVAL_MS = 1_000

/**
 * CRS automatically starts a TC validation job right after a successful TC
 * resync. `useTeamCityValidationJob` only polls while its OWN cached state is
 * already RUNNING, so if the SPA wasn't already polling (cache null/terminal
 * from a previous run), it can miss the auto-started job entirely and never
 * invalidate the components/detail caches once it completes. Call this right
 * after observing a resync's terminal COMPLETED state so the validation-job
 * query refetches and picks up the newly (auto-)started job.
 */
export function invalidateTeamCityValidationJob(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: TC_VALIDATION_JOB_KEY })
}

/**
 * Start (or attach to) the async TC validation job. Mirrors
 * `useRunTeamCityResync` — see that hook for the 202-vs-409 same-kind attach
 * rationale. `POST /admin/teamcity-validation` returns 202 on a freshly
 * started job and 409 if one is already RUNNING, both with the same body.
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
      // Fast-path: job can finish before the response is built (small registry).
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
 * run state. Mirrors `useTeamCityResyncJob` (404 → null, poll while RUNNING).
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
