/**
 * Build the toast text for an optimistic-locking 409 returned by
 * PATCH /components/{id}. Pure function — no React, no toast hook —
 * so the formatting is unit-testable in isolation and the same shape
 * is reachable from any future surface that hits the same conflict
 * (bulk edit, command palette, etc.).
 *
 * The server's ErrorResponse on 409 carries Hibernate's stock
 * `OptimisticLockException.localizedMessage` which is implementation
 * detail and not user-friendly ("Row was updated or deleted by another
 * transaction (or unsaved-value mapping was incorrect)..."). We discard
 * it and synthesize a message that:
 *   - tells the user *what* happened ("updated by another user");
 *   - tells them *when* if we have the latest server value;
 *   - tells them *what to do next* (reload then re-apply).
 *
 * Contract: `B7.1.6` — see `frontend/src/components/editor/GeneralTab.test.tsx`
 * for the surrounding rename/parent tests, and `ComponentDetailPage` for the
 * call site.
 */
export function describeOptimisticConflict(
  latest: { updatedAt: string | null } | undefined,
): { title: string; description: string } {
  const title = 'Save conflict'
  const when = latest?.updatedAt ?? null
  const description =
    when != null
      ? `This component was updated by another user at ${when}. Reload to see the latest values, then re-apply your changes.`
      : 'This component was updated by another user since you started editing. Reload to see the latest values, then re-apply your changes.'
  return { title, description }
}
