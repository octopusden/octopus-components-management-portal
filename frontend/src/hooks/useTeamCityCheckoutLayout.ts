import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../lib/api'
import { parseSameKindAttach } from '../lib/migrationConflict'
import type {
  CheckoutLayoutDiffResult,
  TeamcityCheckoutLayoutDiffJobResponse,
  TeamcityCheckoutLayoutSyncJobResponse,
  TeamcityCheckoutLayoutSyncRequest,
} from '../lib/types'

// TeamCity -> CRS VCS checkout-layout Diff (read-only) and Sync. Mirrors
// useTeamCityResync.ts / useTeamCityValidation.ts — same 202-vs-409 same-kind
// attach dance, same 404-means-idle polling. See those hooks' doc comments
// for the full rationale; this file only calls out what differs.

const DIFF_JOB_KEY = ['tc-checkout-layout-diff', 'job'] as const
const DIFF_REPORT_KEY = ['tc-checkout-layout-diff', 'report'] as const
const SYNC_JOB_KEY = ['tc-checkout-layout-sync', 'job'] as const
const JOB_POLL_INTERVAL_MS = 1_000

/** Start (or attach to) the async Diff job. `POST /admin/teamcity-checkout-layout/diff`. */
export function useRunCheckoutLayoutDiff() {
  const queryClient = useQueryClient()
  return useMutation<TeamcityCheckoutLayoutDiffJobResponse, Error, void>({
    mutationFn: async () => {
      try {
        return await api.post<TeamcityCheckoutLayoutDiffJobResponse>('/admin/teamcity-checkout-layout/diff')
      } catch (err) {
        if (err instanceof ApiError) {
          const attach = parseSameKindAttach<TeamcityCheckoutLayoutDiffJobResponse>(err)
          if (attach) return attach
        }
        throw err
      }
    },
    // Seeds the job query, so a start that is already COMPLETED reaches the
    // job hook's cache refresh like a polled one.
    onSuccess: (job) => queryClient.setQueryData(DIFF_JOB_KEY, job),
  })
}

/**
 * Poll `/admin/teamcity-checkout-layout/diff/job` for the current async Diff state,
 * and refresh the report once the job it reads is COMPLETED.
 */
export function useCheckoutLayoutDiffJob() {
  const queryClient = useQueryClient()
  const query = useQuery<TeamcityCheckoutLayoutDiffJobResponse | null>({
    queryKey: DIFF_JOB_KEY,
    queryFn: async () => {
      try {
        return await api.get<TeamcityCheckoutLayoutDiffJobResponse>('/admin/teamcity-checkout-layout/diff/job')
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null
        throw err
      }
    },
    refetchInterval: (q) => (q.state.data?.state === 'RUNNING' ? JOB_POLL_INTERVAL_MS : false),
  })
  const { state, id } = query.data ?? {}
  useEffect(() => {
    if (state === 'COMPLETED') void queryClient.invalidateQueries({ queryKey: DIFF_REPORT_KEY }).catch(() => {})
  }, [state, id, queryClient])
  return query
}

/**
 * The latest completed Diff's rows for the Portal table —
 * `GET /admin/teamcity-checkout-layout/diff/report.json`. Component read access,
 * not `IMPORT_DATA` (see the CRS controller); 404 until a Diff has completed
 * at least once since the pod came up.
 */
export function useCheckoutLayoutDiffReport() {
  return useQuery<CheckoutLayoutDiffResult | null>({
    queryKey: DIFF_REPORT_KEY,
    queryFn: async () => {
      try {
        return await api.get<CheckoutLayoutDiffResult>('/admin/teamcity-checkout-layout/diff/report.json')
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null
        throw err
      }
    },
  })
}

/**
 * Start (or attach to) the async Sync job. `POST /admin/teamcity-checkout-layout/sync`.
 *
 * Two distinct 409s share this endpoint:
 *  - same-kind attach (a Sync is already RUNNING) — same job-response body,
 *    `parseSameKindAttach` resolves it as success like every other job hook.
 *  - "diff replaced" (the `diffId` no longer names the latest Diff) — CRS
 *    `ErrorResponse` body (`errorMessage` + `errorCode: checkout-layout-diff-stale`)
 *    with no `id`/`state`/`kind`.
 *    `parseSameKindAttach` returns null for it (correctly — it is not an
 *    attach), so it rethrows; the panel tells this apart from a genuine
 *    cross-kind conflict with `isDiffReplacedConflict` (`lib/migrationConflict.ts`).
 */
export function useRunCheckoutLayoutSync() {
  const queryClient = useQueryClient()
  return useMutation<TeamcityCheckoutLayoutSyncJobResponse, Error, TeamcityCheckoutLayoutSyncRequest>({
    mutationFn: async (request) => {
      try {
        return await api.post<TeamcityCheckoutLayoutSyncJobResponse>('/admin/teamcity-checkout-layout/sync', request)
      } catch (err) {
        if (err instanceof ApiError) {
          const attach = parseSameKindAttach<TeamcityCheckoutLayoutSyncJobResponse>(err)
          if (attach) return attach
        }
        throw err
      }
    },
    onSuccess: (job) => queryClient.setQueryData(SYNC_JOB_KEY, job),
  })
}

/**
 * Poll `/admin/teamcity-checkout-layout/sync/job` for the current async Sync state,
 * and refresh the component caches once the Sync it reads has written.
 */
export function useCheckoutLayoutSyncJob() {
  const queryClient = useQueryClient()
  const query = useQuery<TeamcityCheckoutLayoutSyncJobResponse | null>({
    queryKey: SYNC_JOB_KEY,
    queryFn: async () => {
      try {
        return await api.get<TeamcityCheckoutLayoutSyncJobResponse>('/admin/teamcity-checkout-layout/sync/job')
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null
        throw err
      }
    },
    refetchInterval: (q) => (q.state.data?.state === 'RUNNING' ? JOB_POLL_INTERVAL_MS : false),
  })
  const { state, id, result } = query.data ?? {}
  useEffect(() => {
    if (state !== 'COMPLETED' || !result) return
    void queryClient.invalidateQueries({ queryKey: ['components'] }).catch(() => {})
    void queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'component' }).catch(() => {})
  }, [state, id, result, queryClient])
  return query
}
