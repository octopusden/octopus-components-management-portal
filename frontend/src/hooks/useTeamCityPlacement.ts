import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../lib/api'
import { parseSameKindAttach } from '../lib/migrationConflict'
import type {
  PlacementDiffResult,
  TeamcityPlacementDiffJobResponse,
  TeamcityPlacementSyncJobResponse,
  TeamcityPlacementSyncRequest,
} from '../lib/types'

// ONB-002: TeamCity -> CRS VCS-placement Diff (read-only) and Sync. Mirrors
// useTeamCityResync.ts / useTeamCityValidation.ts — same 202-vs-409 same-kind
// attach dance, same 404-means-idle polling. See those hooks' doc comments
// for the full rationale; this file only calls out what differs.

const DIFF_JOB_KEY = ['tc-placement-diff', 'job'] as const
const DIFF_REPORT_KEY = ['tc-placement-diff', 'report'] as const
const SYNC_JOB_KEY = ['tc-placement-sync', 'job'] as const
const JOB_POLL_INTERVAL_MS = 1_000

/** Start (or attach to) the async Diff job. `POST /admin/teamcity-placement/diff`. */
export function useRunPlacementDiff() {
  const queryClient = useQueryClient()
  return useMutation<TeamcityPlacementDiffJobResponse, Error, void>({
    mutationFn: async () => {
      try {
        return await api.post<TeamcityPlacementDiffJobResponse>('/admin/teamcity-placement/diff')
      } catch (err) {
        if (err instanceof ApiError) {
          const attach = parseSameKindAttach<TeamcityPlacementDiffJobResponse>(err)
          if (attach) return attach
        }
        throw err
      }
    },
    onSuccess: (job) => {
      queryClient.setQueryData(DIFF_JOB_KEY, job)
      // Fast-path: small registries can finish before the response is built
      // (SyncTaskExecutor in tests always wins this race) — the RUNNING →
      // COMPLETED transition the panel listens for never fires in that case,
      // so refresh the report cache here too.
      if (job.state === 'COMPLETED') {
        queryClient.invalidateQueries({ queryKey: DIFF_REPORT_KEY })
      }
    },
  })
}

/** Poll `/admin/teamcity-placement/diff/job` for the current async Diff state. */
export function usePlacementDiffJob() {
  return useQuery<TeamcityPlacementDiffJobResponse | null>({
    queryKey: DIFF_JOB_KEY,
    queryFn: async () => {
      try {
        return await api.get<TeamcityPlacementDiffJobResponse>('/admin/teamcity-placement/diff/job')
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null
        throw err
      }
    },
    refetchInterval: (query) =>
      query.state.data?.state === 'RUNNING' ? JOB_POLL_INTERVAL_MS : false,
  })
}

/**
 * The latest completed Diff's rows for the Portal table —
 * `GET /admin/teamcity-placement/diff/report.json`. Component read access,
 * not `IMPORT_DATA` (see the CRS controller); 404 until a Diff has completed
 * at least once since the pod came up.
 */
export function usePlacementDiffReport() {
  return useQuery<PlacementDiffResult | null>({
    queryKey: DIFF_REPORT_KEY,
    queryFn: async () => {
      try {
        return await api.get<PlacementDiffResult>('/admin/teamcity-placement/diff/report.json')
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null
        throw err
      }
    },
  })
}

/**
 * Start (or attach to) the async Sync job. `POST /admin/teamcity-placement/sync`.
 *
 * Two distinct 409s share this endpoint:
 *  - same-kind attach (a Sync is already RUNNING) — same job-response body,
 *    `parseSameKindAttach` resolves it as success like every other job hook.
 *  - "diff replaced" (the `diffId` no longer names the latest Diff) — a plain
 *    `ResponseStatusException` body with no `id`/`state`/`kind`.
 *    `parseSameKindAttach` returns null for it (correctly — it is not an
 *    attach), so it rethrows; the panel tells this apart from a genuine
 *    cross-kind conflict with `isDiffReplacedConflict` (`lib/migrationConflict.ts`).
 */
export function useRunPlacementSync() {
  const queryClient = useQueryClient()
  return useMutation<TeamcityPlacementSyncJobResponse, Error, TeamcityPlacementSyncRequest>({
    mutationFn: async (request) => {
      try {
        return await api.post<TeamcityPlacementSyncJobResponse>('/admin/teamcity-placement/sync', request)
      } catch (err) {
        if (err instanceof ApiError) {
          const attach = parseSameKindAttach<TeamcityPlacementSyncJobResponse>(err)
          if (attach) return attach
        }
        throw err
      }
    },
    onSuccess: (job) => {
      queryClient.setQueryData(SYNC_JOB_KEY, job)
      if (job.state === 'COMPLETED' && job.result) {
        queryClient.invalidateQueries({ queryKey: ['components'] })
        queryClient.invalidateQueries({
          predicate: (query) => query.queryKey[0] === 'component',
        })
      }
    },
  })
}

/** Poll `/admin/teamcity-placement/sync/job` for the current async Sync state. */
export function usePlacementSyncJob() {
  return useQuery<TeamcityPlacementSyncJobResponse | null>({
    queryKey: SYNC_JOB_KEY,
    queryFn: async () => {
      try {
        return await api.get<TeamcityPlacementSyncJobResponse>('/admin/teamcity-placement/sync/job')
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null
        throw err
      }
    },
    refetchInterval: (query) =>
      query.state.data?.state === 'RUNNING' ? JOB_POLL_INTERVAL_MS : false,
  })
}
