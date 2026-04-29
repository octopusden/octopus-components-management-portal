import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../lib/api'
import type { MigrationJobResponse, MigrationStatus } from '../lib/types'

const JOB_KEY = ['migration', 'job'] as const
const JOB_POLL_INTERVAL_MS = 1_000

interface MigrationStatusOptions {
  /**
   * Pass a positive number (ms) to enable polling. Intended caller is
   * MigrationPanel during an in-flight job, so the top `{git,db,total}` tiles
   * climb live as ImportService commits each component instead of staying
   * frozen at the pre-migration snapshot. Default `false` keeps the rest of
   * the SPA polling-free.
   */
  refetchInterval?: number | false
}

export function useMigrationStatus(options: MigrationStatusOptions = {}) {
  return useQuery<MigrationStatus>({
    queryKey: ['migration', 'status'],
    queryFn: () => api.get<MigrationStatus>('/admin/migration-status'),
    refetchInterval: options.refetchInterval ?? false,
  })
}

/**
 * Start (or attach to) the async migration job.
 *
 * The CRS endpoint returns 202 Accepted on a freshly-started job and 409 Conflict
 * if a migration is already RUNNING — the body shape is identical
 * (`MigrationJobResponse`) in both cases, the only thing that differs is the HTTP
 * status. The api wrapper turns any non-2xx into ApiError(status, body), so we
 * intercept 409 here and resolve as success: the SPA should "attach" to the
 * in-flight job rather than render a destructive block under the button it just
 * clicked.
 *
 * On success (whether 202 or 409) we prime the `['migration', 'job']` cache
 * directly so [useMigrationJob] picks up the latest state on its next render
 * without waiting for the next poll tick.
 */
export function useRunMigration() {
  const queryClient = useQueryClient()
  return useMutation<MigrationJobResponse, Error, void>({
    mutationFn: async () => {
      try {
        return await api.post<MigrationJobResponse>('/admin/migrate')
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          return JSON.parse(err.message) as MigrationJobResponse
        }
        throw err
      }
    },
    onSuccess: (job) => {
      queryClient.setQueryData(JOB_KEY, job)
      // Fast-path: CRS can return COMPLETED directly if the executor finishes
      // before the response is built (the backend tests explicitly allow this
      // via the SyncTaskExecutor swap, and a real production thread can win
      // the race on small migrations). The panel's RUNNING → COMPLETED
      // transition listener never fires in that case — the only state it
      // ever sees is COMPLETED — so the downstream caches stay stale unless
      // we invalidate from here too.
      if (job.state === 'COMPLETED' && job.result) {
        queryClient.invalidateQueries({ queryKey: ['migration', 'status'] })
        queryClient.invalidateQueries({ queryKey: ['config', 'component-defaults'] })
      }
    },
  })
}

/**
 * Poll `/admin/migrate/job` for the current async migration state.
 *
 * Returns `null` (not error) when the endpoint answers 404 — that just means no
 * migration has been started since the pod came up; the SPA should render the
 * idle state, not a destructive error block.
 *
 * Polls every second while the job is RUNNING so the panel can render
 * `currentComponent` + per-component counters in real time. Stops polling once
 * the state transitions to COMPLETED or FAILED — there's nothing more to wait
 * for.
 */
export function useMigrationJob() {
  return useQuery<MigrationJobResponse | null>({
    queryKey: JOB_KEY,
    queryFn: async () => {
      try {
        return await api.get<MigrationJobResponse>('/admin/migrate/job')
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null
        throw err
      }
    },
    refetchInterval: (query) =>
      query.state.data?.state === 'RUNNING' ? JOB_POLL_INTERVAL_MS : false,
  })
}
