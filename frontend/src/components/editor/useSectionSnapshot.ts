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
 */
export function useSectionSnapshot<S>(
  component: ComponentDetail,
  snapshotFrom: (c: ComponentDetail) => S,
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

  const isDirty = !deepEqual(state, snapshotRef.current)

  useEffect(() => {
    const next = snapshotFrom(component)
    const idChanged = component.id !== lastIdRef.current
    lastIdRef.current = component.id
    // Re-seed on a new component (fresh draft, #4), while clean (#1 leaves a
    // dirty sibling alone), or when the arriving server value already matches
    // the draft (#3 — the save we just fired landed, so drop the stale-snapshot
    // phantom dirty). Otherwise keep the in-progress edit untouched.
    if (idChanged || !isDirty || deepEqual(state, next)) {
      const snapshotChanged = !deepEqual(snapshotRef.current, next)
      const stateChanged = !deepEqual(state, next)
      snapshotRef.current = next
      if (stateChanged) {
        setState(next)
      } else if (snapshotChanged) {
        // State unchanged but the snapshot moved (our own save landed and the
        // server value now equals the draft) — `isDirty` flips false, but
        // setState with an equal value won't re-render, so force one.
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
