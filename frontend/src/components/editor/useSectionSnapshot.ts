import { useEffect, useRef, useState } from 'react'
import type { ComponentDetail } from '../../lib/types'
import { deepEqual } from '../../lib/editor/diffUtil'

/**
 * Shared snapshot/dirty engine for the five non-RHF editor sections (Build /
 * VCS / Distribution / Jira / Escrow). Each section owns local draft state plus
 * a last-saved snapshot; dirty = draft ≠ snapshot (structural compare). The one
 * subtle piece is WHEN to re-seed the snapshot from a freshly-arrived
 * `component` object, which must satisfy three competing requirements:
 *
 *  - #1 sibling-save / refetch: a SAME-id component update where THIS section's
 *    server value is unchanged must NOT clobber an in-progress edit here.
 *  - #3 own save: after a successful save the server value now EQUALS the draft;
 *    the snapshot must catch up so the section reads clean (no phantom dirty),
 *    even though it was dirty against the stale snapshot.
 *  - #4 navigation: switching to a DIFFERENT component id must start a FRESH
 *    draft — no leak of the previous component's edits, even if it was dirty.
 *
 * So we re-seed when: the component id changed (always fresh), OR the section is
 * clean, OR the new server snapshot already equals the current draft (the save
 * landed). Otherwise (same id, dirty, server differs) we keep the draft.
 *
 * `snapshotFrom` maps a component to the section's flat draft shape; pass the
 * same mapper used for the initial state.
 *
 * `normalize` (optional, P1-4): for sections with list rows (VCS / Distribution)
 * the draft can hold UI-only junk — a blank/whitespace/incomplete row that the
 * request/diff projection drops. Dirty must be computed from that SAME cleaned
 * projection so the invariant holds: dirty ⇔ cleaned payload differs ⇔ diff
 * non-empty. Pass `normalize` to compare `normalize(state)` vs
 * `normalize(snapshot)` for BOTH the exported `isDirty` and every re-seed
 * decision — so a blank row never reads as dirty and never leaves the section
 * stuck-dirty after a save. Scalar sections (Build/Jira/Escrow) omit it and
 * compare raw, exactly as before.
 */
export function useSectionSnapshot<S>(
  component: ComponentDetail,
  snapshotFrom: (c: ComponentDetail) => S,
  normalize?: (s: S) => unknown,
): {
  state: S
  setState: React.Dispatch<React.SetStateAction<S>>
  snapshotRef: React.MutableRefObject<S>
  isDirty: boolean
  reseed: () => void
} {
  const [state, setState] = useState<S>(() => snapshotFrom(component))
  const snapshotRef = useRef<S>(state)
  const lastIdRef = useRef<string>(component.id)
  // Bumped whenever the snapshot ref is re-seeded without a state change, to
  // force a re-render so the derived `isDirty` recomputes against the new
  // snapshot (a ref mutation alone does not re-render). See #3 below.
  const [, bumpSnapshot] = useState(0)

  // Compare via the cleaned projection when one is supplied (P1-4), else raw.
  const sameDraft = (a: S, b: S) =>
    normalize ? deepEqual(normalize(a), normalize(b)) : deepEqual(a, b)

  const isDirty = !sameDraft(state, snapshotRef.current)

  useEffect(() => {
    const next = snapshotFrom(component)
    const idChanged = component.id !== lastIdRef.current
    lastIdRef.current = component.id
    // Re-seed on a new component (fresh draft, #4), while clean (#1 leaves a
    // dirty sibling alone), or when the arriving server value already matches
    // the draft (#3 — the save we just fired landed, so drop the stale-snapshot
    // phantom dirty; under `normalize`, a leftover blank row is invisible here
    // so it can't keep the section stuck-dirty). Otherwise keep the edit.
    if (idChanged || !isDirty || sameDraft(state, next)) {
      // The snapshot ref must always advance to the real server `next` (raw, not
      // normalized) so the persisted baseline is exact; dirty stays driven by
      // the normalized compare.
      const snapshotChanged = !deepEqual(snapshotRef.current, next)
      snapshotRef.current = next
      // Overwrite the visible draft with the server value ONLY for a genuinely
      // different committed value (id change → fresh draft #4, or a clean
      // refetch that brought new server data). When state and next are
      // `sameDraft` (normalized-equal — the own-save-landed case #3, OR the
      // draft holds only UI-only junk like a blank row being typed), DO NOT
      // overwrite: that would wipe the row the user is mid-edit. Just advance
      // the snapshot ref and force a render so `isDirty` recomputes to false.
      if (idChanged || (!sameDraft(state, next) && !deepEqual(state, next))) {
        setState(next)
      } else if (snapshotChanged) {
        bumpSnapshot((n) => n + 1)
      }
    }
    // isDirty / state are read fresh via closure at effect run time; the effect
    // is keyed on the component object identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [component])

  // Explicit Discard: re-seed unconditionally to the current server snapshot.
  function reseed() {
    const next = snapshotFrom(component)
    snapshotRef.current = next
    setState(next)
  }

  return { state, setState, snapshotRef, isDirty, reseed }
}
