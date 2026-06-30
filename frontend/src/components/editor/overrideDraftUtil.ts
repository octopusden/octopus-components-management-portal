/**
 * Pure (non-React) helpers for the field-override draft (Portal item D). Kept
 * out of `overridesDraft.tsx` so that file exports only the provider + hook
 * (react-refresh fast-refresh hygiene), and so the combined-save serializer can
 * be unit-tested without rendering.
 */

export const DRAFT_ID_PREFIX = 'draft-'

/** A row that exists only in the draft (a queued create) — its `id` is a
 *  client-minted temp id, never a real server id. The combined-save
 *  serializer strips these so a create is sent without an `id`. */
export function isDraftId(id: string): boolean {
  return id.startsWith(DRAFT_ID_PREFIX)
}
