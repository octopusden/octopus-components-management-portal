import { ApiError } from './api'

/**
 * Branch a 409 response body between the two shapes the CRS async-job
 * endpoints can return:
 *  - same-kind 409 (a second start while one is RUNNING) → the job-response
 *    body for the relevant kind (`MigrationJobResponse`,
 *    `HistoryMigrationJobResponse`, `TeamCityResyncJobResponse`) with
 *    `kind === 'job'`. Caller should resolve as success — the SPA "attaches"
 *    to the in-flight job.
 *  - cross-kind 409 (the OTHER kind owns the gate; or the
 *    likely-live-elsewhere check refusing force-reset) →
 *    `MigrationConflictResponse` with `kind === 'conflict'`. Caller should
 *    rethrow so the destructive block in the panel renders the message.
 *
 * Returns the parsed attach-job body on same-kind 409, or null when:
 *  - the body is malformed JSON,
 *  - the body has `kind === 'conflict'` (cross-kind, caller must rethrow),
 *  - the body has neither discriminator AND lacks a recognisable JobState
 *    (treat as cross-kind / unknown — safer to surface as error).
 *
 * Lives in `lib/` rather than inside `hooks/useMigration` because it's now
 * shared across the migration hooks AND the new TC-resync hook. Behaviour is
 * unchanged from the original useMigration-private helper.
 */
export function parseSameKindAttach<T>(err: ApiError): T | null {
  if (err.status !== 409) return null
  const parsed = (() => {
    try {
      return JSON.parse(err.rawBody) as unknown
    } catch {
      return null
    }
  })()
  // Guard against primitives, arrays, null, undefined: only plain objects
  // can carry the discriminator + JobResponse shape. typeof null === 'object',
  // hence the explicit null check; Array.isArray catches the array case
  // (arrays would also pass the typeof check otherwise).
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const obj = parsed as Record<string, unknown>
  // Explicit cross-kind → not an attach.
  if (obj['kind'] === 'conflict') return null
  const looksLikeKnownState =
    obj['state'] === 'RUNNING' || obj['state'] === 'COMPLETED' || obj['state'] === 'FAILED'
  // Explicit job (new CRS) OR known-state heuristic (old CRS without the
  // discriminator). Either way, validate the job-shape minimum: `id` +
  // `state` must both be present so the panel doesn't bind undefined into
  // its progress label / cache key. Without this, a buggy 409 with just
  // `{"state":"RUNNING"}` (no id) would render as "undefined / NaN%".
  const isJobShape = obj['kind'] === 'job' || looksLikeKnownState
  if (!isJobShape) return null
  if (typeof obj['id'] !== 'string' || !looksLikeKnownState) return null
  return obj as unknown as T
}

/**
 * True when a `POST /admin/teamcity-placement/sync` 409 means "the diffId no
 * longer matches the latest Diff" (`TeamcityPlacementControllerV4.startSync`'s
 * own guard). CRS's `ErrorResponse` body for it is
 * `{"errorMessage":"diff replaced, re-run Diff","errorCode":"placement-diff-stale"}`
 * — no `kind` field, so it is neither a same-kind attach
 * (`parseSameKindAttach` returns null: no `id`/`state`) nor a cross-kind
 * `MigrationConflictResponse` (`kind: 'conflict'`).
 *
 * Matches `errorCode` first; an older CRS without it falls back to the
 * `errorMessage` text (then Spring's `message`, as `api.ts` does), so a future
 * plain 409 on this endpoint is not swallowed under the "diff replaced" banner.
 */
export function isDiffReplacedConflict(err: unknown): boolean {
  if (!(err instanceof ApiError) || err.status !== 409) return false
  try {
    const parsed = JSON.parse(err.rawBody) as unknown
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return false
    const obj = parsed as Record<string, unknown>
    if ('kind' in obj) return false
    if (obj['errorCode'] === 'placement-diff-stale') return true
    const text = obj['errorMessage'] ?? obj['message']
    return typeof text === 'string' && text.toLowerCase().includes('diff replaced')
  } catch {
    return false
  }
}
