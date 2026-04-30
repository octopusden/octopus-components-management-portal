import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../lib/api'
import type { HistoryMigrationJobResponse, MigrationJobResponse, MigrationStatus } from '../lib/types'

const JOB_KEY = ['migration', 'job'] as const
const HISTORY_JOB_KEY = ['migration-history', 'job'] as const
const JOB_POLL_INTERVAL_MS = 1_000

/**
 * Branch a 409 response body between the two shapes the backend can return:
 *  - same-kind 409 (a second start while one is RUNNING) → MigrationJobResponse
 *    or HistoryMigrationJobResponse with `kind === 'job'`. Caller should resolve
 *    as success (the SPA "attaches" to the in-flight job).
 *  - cross-kind 409 (the OTHER migration kind owns the gate; or the
 *    likely-live-elsewhere check refusing force-reset) → MigrationConflictResponse
 *    with `kind === 'conflict'`. Caller should rethrow so the destructive
 *    block renders the message.
 *
 * Returns the parsed attach-job body on same-kind 409, or null when:
 *  - the body is malformed JSON,
 *  - the body has `kind === 'conflict'` (cross-kind, caller must rethrow),
 *  - the body has neither discriminator AND lacks a recognisable JobState
 *    (treat as cross-kind / unknown — safer to surface as error).
 *
 * Hoisted out of the individual hooks so both useRunMigration and
 * useRunHistoryMigration use the same branching logic. The previous
 * useRunMigration had no cross-kind handling at all and would crash on a
 * cross-kind 409 (per review P1).
 */
function parseSameKindAttach<T>(err: ApiError): T | null {
  if (err.status !== 409) return null
  const parsed = (() => {
    try {
      return JSON.parse(err.message) as Record<string, unknown>
    } catch {
      return null
    }
  })()
  if (!parsed) return null
  // Explicit cross-kind → not an attach.
  if (parsed['kind'] === 'conflict') return null
  // Explicit job → attach. The kind field is optional (older CRS omits it),
  // so fall through to the JobState heuristic for backward compat.
  if (parsed['kind'] === 'job') return parsed as unknown as T
  // Heuristic: presence of a JobState-like `state` value is the same-kind
  // signal for older CRS that doesn't yet send the `kind` discriminator.
  // Reject when state is unrecognised — better to surface the 409 as an
  // error than to attach to a bogus shape.
  const state = parsed['state']
  if (state === 'RUNNING' || state === 'COMPLETED' || state === 'FAILED') {
    return parsed as unknown as T
  }
  return null
}

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
        if (err instanceof ApiError) {
          // Same-kind 409 → attach to the existing job. Cross-kind 409 (history
          // is currently RUNNING) → rethrow so the panel destructive block
          // renders the message. Without this branch (the original impl),
          // a cross-kind 409 would JSON.parse a body without `id/state` and
          // hand it to the panel as a successful job — visibly broken.
          const attach = parseSameKindAttach<MigrationJobResponse>(err)
          if (attach) return attach
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

/**
 * Mirror of [useMigrationJob] for the history-migration card. 404 → null
 * (idle), polling every second while RUNNING.
 *
 * Note: unlike the components flow, the backend's `current()` falls back to a
 * state synthesized from the persisted `git_history_import_state` row when no
 * in-memory job exists (post-restart). So this hook may return COMPLETED or
 * FAILED state shortly after a fresh page load even though no job is "active"
 * in the strict sense — that's expected, and the panel uses `errorMessage`
 * markers to decide between Retry and Force-reset paths.
 */
export function useHistoryMigrationJob() {
  return useQuery<HistoryMigrationJobResponse | null>({
    queryKey: HISTORY_JOB_KEY,
    queryFn: async () => {
      try {
        return await api.get<HistoryMigrationJobResponse>('/admin/migrate-history/job')
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
 * Start (or attach to) the async history migration job.
 *
 * `reset=true` is required to re-run on top of a terminal
 * `git_history_import_state` row — the backend's `resetIfNotInProgress()`
 * gate refuses to stomp on IN_PROGRESS, but happily clears COMPLETED or
 * FAILED rows when reset is set. The MigrationHistoryPanel chooses the
 * value based on the current job state (idle → false, FAILED/COMPLETED →
 * true), and the user's confirm-dialog spells out the destructive scope.
 *
 * 409 handling matches [useRunMigration]: a same-kind 409 (history POST
 * while history is already RUNNING) carries the existing job in the body
 * and we resolve as success so the panel attaches. A cross-kind 409
 * (history POST while components is RUNNING) carries a `code` field
 * instead — that one is surfaced as a mutation error so the destructive
 * block in the panel renders the right message.
 */
export function useRunHistoryMigration() {
  const queryClient = useQueryClient()
  return useMutation<HistoryMigrationJobResponse, Error, { reset: boolean }>({
    mutationFn: async ({ reset }) => {
      try {
        return await api.post<HistoryMigrationJobResponse>(`/admin/migrate-history?reset=${reset}`)
      } catch (err) {
        if (err instanceof ApiError) {
          const attach = parseSameKindAttach<HistoryMigrationJobResponse>(err)
          if (attach) return attach
        }
        throw err
      }
    },
    onSuccess: (job) => {
      queryClient.setQueryData(HISTORY_JOB_KEY, job)
      // Same fast-path as useRunMigration: SyncTaskExecutor in tests can return
      // COMPLETED directly, the production thread can win the race on small
      // imports — invalidate downstream caches so they pick up the new state
      // without waiting on the next poll tick.
      if (job.state === 'COMPLETED' && job.result) {
        queryClient.invalidateQueries({ queryKey: HISTORY_JOB_KEY })
      }
    },
  })
}

/**
 * POST /admin/migrate-history/force-reset — destructive: wipes the import
 * claim row AND all audit_log rows with source='git-history'. The backend
 * refuses with 409 if a history job is RUNNING in the current pod
 * (defense-in-depth against curl-races); the panel hides the button in that
 * state too, but the API guard remains.
 *
 * On success (204) we explicitly invalidate the history-job query so the
 * UI re-fetches: GET /job will return 404 (no in-memory state, no DB row)
 * and the panel re-renders idle with the normal Run button.
 */
export function useForceResetHistory() {
  const queryClient = useQueryClient()
  return useMutation<void, Error, void>({
    mutationFn: async () => {
      await api.post<void>('/admin/migrate-history/force-reset')
    },
    onSuccess: () => {
      // P1 review fix: previously only invalidated the query, but invalidate
      // does NOT clear the existing data — it triggers a refetch and keeps
      // the stale data visible until it resolves. On slow networks the panel
      // would render the stuck-banner for a flicker between "force-reset
      // success" and "GET /job → 404 → null". Setting the cache to null
      // first removes the stale data immediately; the subsequent invalidate
      // covers the case where a synthesized DB-fallback state appears (it
      // shouldn't post-reset, but defense-in-depth).
      queryClient.setQueryData(HISTORY_JOB_KEY, null)
      queryClient.invalidateQueries({ queryKey: HISTORY_JOB_KEY })
    },
  })
}
