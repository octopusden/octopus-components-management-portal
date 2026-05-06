import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../lib/api'
import { parseSameKindAttach } from '../lib/migrationConflict'
import type { TeamCityResyncJobResponse } from '../lib/types'

// Re-exported for back-compat with callers that imported the result-payload
// type from this hook's previous home (the synchronous `useTeamCityResync`
// shipped here before the async switch).
export type { TeamCityResyncResult } from '../lib/types'

const TC_JOB_KEY = ['tc-resync', 'job'] as const
const JOB_POLL_INTERVAL_MS = 1_000

/**
 * Start (or attach to) the async TC resync job.
 *
 * The CRS endpoint returns 202 Accepted on a freshly-started job and 409
 * Conflict if a TC resync is already RUNNING — the body shape is identical
 * (`TeamCityResyncJobResponse`) in both cases, only the HTTP status differs.
 * The api wrapper turns any non-2xx into ApiError(status, displayMessage,
 * rawBody), so we intercept 409 here and resolve as success: the SPA
 * "attaches" to the in-flight job rather than render a destructive block
 * under the button it just clicked.
 *
 * Cross-kind 409 (a components or history migration is currently RUNNING)
 * carries a `MigrationConflictResponse` (kind === 'conflict') instead.
 * `parseSameKindAttach` returns null for that shape and the error
 * propagates to the panel, which renders the structured message in a
 * destructive banner.
 *
 * On success (whether 202 or 409) we prime the `['tc-resync', 'job']` cache
 * directly so [useTeamCityResyncJob] picks up the latest state on its next
 * render without waiting for the next poll tick. We do NOT invalidate
 * `['components']` / `['component', id]` here — the POST returning success
 * only means "job started", not "DB updated". The components / detail
 * caches are invalidated on the RUNNING → COMPLETED transition observed
 * by the panel (see TeamCityResyncPanel).
 */
export function useRunTeamCityResync() {
  const queryClient = useQueryClient()
  return useMutation<TeamCityResyncJobResponse, Error, void>({
    mutationFn: async () => {
      try {
        return await api.post<TeamCityResyncJobResponse>('/admin/teamcity-project-ids/sync')
      } catch (err) {
        if (err instanceof ApiError) {
          const attach = parseSameKindAttach<TeamCityResyncJobResponse>(err)
          if (attach) return attach
        }
        throw err
      }
    },
    onSuccess: (job) => {
      queryClient.setQueryData(TC_JOB_KEY, job)
      // Fast-path: if the executor finishes before the response is built
      // (small registry; tests use SyncTaskExecutor that wins this race
      // every time), we never see RUNNING and the panel's transition
      // listener never fires. Mirror the useRunMigration COMPLETED-on-start
      // fallback so list/detail caches get refreshed in that path too.
      if (job.state === 'COMPLETED' && job.result) {
        queryClient.invalidateQueries({ queryKey: ['components'] })
        queryClient.invalidateQueries({
          predicate: (query) => query.queryKey[0] === 'component',
        })
      }
    },
  })
}

/**
 * Poll `/admin/teamcity-project-ids/sync/job` for the current async TC
 * resync state.
 *
 * Returns `null` (not error) when the endpoint answers 404 — that just means
 * no resync has been started since the pod came up; the panel renders the
 * idle state, not a destructive error block.
 *
 * Polls every second while the job is RUNNING. Stops polling once the state
 * transitions to COMPLETED or FAILED — there's nothing more to wait for, and
 * the panel detects the terminal transition via a useEffect to fire toast
 * + downstream cache invalidations.
 */
export function useTeamCityResyncJob() {
  return useQuery<TeamCityResyncJobResponse | null>({
    queryKey: TC_JOB_KEY,
    queryFn: async () => {
      try {
        return await api.get<TeamCityResyncJobResponse>('/admin/teamcity-project-ids/sync/job')
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null
        throw err
      }
    },
    refetchInterval: (query) =>
      query.state.data?.state === 'RUNNING' ? JOB_POLL_INTERVAL_MS : false,
  })
}
