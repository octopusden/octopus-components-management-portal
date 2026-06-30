import { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo } from 'react'
import type { ReactNode } from 'react'
import type { FieldOverride } from '../../lib/types'
import type { FieldOverrideCreateBody, FieldOverrideUpdateBody } from '../../hooks/useComponent'
import { deepEqual } from '../../lib/editor/diffUtil'
import { DRAFT_ID_PREFIX, isDraftId } from './overrideDraftUtil'

/**
 * Page-level draft store for per-version field overrides (Portal item D).
 *
 * Override edits used to fire immediate POST/PATCH/DELETE on every inline
 * confirm / modal save / delete. This provider instead *queues* them so they
 * ride the editor's ONE combined Save → Review → version-pinned PATCH like
 * every other tab. The provider holds only the pending intent (creates /
 * updates / deletes); `effectiveOverrides` is recomputed every render from the
 * LIVE `serverOverrides` prop, so a row another user added between renders is
 * preserved (it is never in `deletes`) and the desired-full-set the combined
 * save sends can't silently drop it.
 */

interface PendingCreate {
  tempId: string
  body: FieldOverrideCreateBody
}

interface DraftState {
  creates: PendingCreate[]
  /** Keyed by REAL server override id. */
  updates: Record<string, FieldOverrideUpdateBody>
  /** REAL server override ids queued for removal. */
  deletes: string[]
}

const EMPTY: DraftState = { creates: [], updates: {}, deletes: [] }

interface OverridesDraftValue {
  /** The unmodified server list (baseline) — consumers diff against this. */
  serverOverrides: FieldOverride[]
  /** Server list with pending creates/updates/deletes applied — what every
   *  override surface renders, and the desired-full-set the save sends. */
  effectiveOverrides: FieldOverride[]
  isDirty: boolean
  /** Queue a new override; returns the draft id so the caller can re-edit it. */
  queueCreate: (body: FieldOverrideCreateBody) => string
  /** Patch an override by id. A draft id mutates the pending create in place;
   *  a real id queues (or, when reverted to the server value, clears) an
   *  update. */
  queueUpdate: (id: string, patch: FieldOverrideUpdateBody) => void
  /** Remove an override by id. A draft id just drops the pending create. */
  queueDelete: (id: string) => void
  /** Drop all pending ops (Discard, or post-save re-baseline). */
  reset: () => void
}

const OverridesDraftContext = createContext<OverridesDraftValue | null>(null)

function createToOverride(tempId: string, body: FieldOverrideCreateBody): FieldOverride {
  return {
    id: tempId,
    overriddenAttribute: body.overriddenAttribute,
    versionRange: body.versionRange,
    // Marker overrides carry a child collection; scalar overrides carry `value`.
    rowType: body.markerChildren != null ? 'MARKER' : 'SCALAR_OVERRIDE',
    value: body.value,
    markerChildren: body.markerChildren ?? null,
    createdAt: null,
    updatedAt: null,
  }
}

function applyUpdate(o: FieldOverride, u: FieldOverrideUpdateBody): FieldOverride {
  return {
    ...o,
    versionRange: u.versionRange ?? o.versionRange,
    value: 'value' in u ? u.value : o.value,
    markerChildren: 'markerChildren' in u ? (u.markerChildren ?? null) : o.markerChildren,
  }
}

/** True when applying `u` leaves the server row unchanged — used to clear a
 *  pending update when the user edits a field then reverts it, so the bar
 *  doesn't stay falsely dirty (mirrors the section-snapshot value-equality). */
function updateIsNoop(server: FieldOverride, u: FieldOverrideUpdateBody): boolean {
  const merged = applyUpdate(server, u)
  return (
    merged.versionRange === server.versionRange &&
    deepEqual(merged.value, server.value) &&
    deepEqual(merged.markerChildren ?? null, server.markerChildren ?? null)
  )
}

export function OverridesDraftProvider({
  componentId,
  serverOverrides,
  children,
}: {
  componentId: string
  serverOverrides: FieldOverride[]
  children: ReactNode
}) {
  const [draft, setDraft] = useState<DraftState>(EMPTY)
  const tempCounter = useRef(0)

  // serverOverrides changes across renders (background refetch / post-save
  // invalidation); read the latest inside mutators via a ref so the
  // revert-to-clean check always compares against fresh server data.
  const serverRef = useRef(serverOverrides)
  serverRef.current = serverOverrides

  // Navigating to a different component starts a fresh draft — never carry a
  // queued op across components (mirrors the section-snapshot id-change rule).
  useEffect(() => {
    setDraft(EMPTY)
  }, [componentId])

  const queueCreate = useCallback((body: FieldOverrideCreateBody) => {
    tempCounter.current += 1
    const tempId = `${DRAFT_ID_PREFIX}${tempCounter.current}`
    setDraft((d) => ({ ...d, creates: [...d.creates, { tempId, body }] }))
    return tempId
  }, [])

  const queueUpdate = useCallback((id: string, patch: FieldOverrideUpdateBody) => {
    if (isDraftId(id)) {
      setDraft((d) => ({
        ...d,
        creates: d.creates.map((c) =>
          c.tempId === id ? { ...c, body: { ...c.body, ...patch } } : c,
        ),
      }))
      return
    }
    // Snapshot the server list at call time — reading serverRef inside the
    // functional updater would let a refetch that resolves before the update
    // commits decide the revert-to-clean check against the wrong baseline.
    const serverSnapshot = serverRef.current
    setDraft((d) => {
      // A row already queued for delete is gone from the UI; ignore a stray
      // update so the op set never holds the same id in both updates+deletes.
      if (d.deletes.includes(id)) return d
      const merged = { ...(d.updates[id] ?? {}), ...patch }
      const server = serverSnapshot.find((o) => o.id === id)
      const next = { ...d.updates }
      if (server && updateIsNoop(server, merged)) {
        delete next[id]
      } else {
        next[id] = merged
      }
      return { ...d, updates: next }
    })
  }, [])

  const queueDelete = useCallback((id: string) => {
    if (isDraftId(id)) {
      setDraft((d) => ({ ...d, creates: d.creates.filter((c) => c.tempId !== id) }))
      return
    }
    setDraft((d) => {
      const updates = { ...d.updates }
      delete updates[id]
      return {
        ...d,
        updates,
        deletes: d.deletes.includes(id) ? d.deletes : [...d.deletes, id],
      }
    })
  }, [])

  const reset = useCallback(() => setDraft(EMPTY), [])

  const effectiveOverrides = useMemo(() => {
    const deleted = new Set(draft.deletes)
    const base = serverOverrides
      .filter((o) => !deleted.has(o.id))
      .map((o) => {
        const u = draft.updates[o.id]
        return u ? applyUpdate(o, u) : o
      })
    const created = draft.creates.map((c) => createToOverride(c.tempId, c.body))
    return [...base, ...created]
  }, [serverOverrides, draft])

  const isDirty =
    draft.creates.length > 0 || Object.keys(draft.updates).length > 0 || draft.deletes.length > 0

  const value = useMemo<OverridesDraftValue>(
    () => ({
      serverOverrides,
      effectiveOverrides,
      isDirty,
      queueCreate,
      queueUpdate,
      queueDelete,
      reset,
    }),
    [serverOverrides, effectiveOverrides, isDirty, queueCreate, queueUpdate, queueDelete, reset],
  )

  return <OverridesDraftContext.Provider value={value}>{children}</OverridesDraftContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components -- context hook co-located with its provider (standard React context module)
export function useOverridesDraft(): OverridesDraftValue {
  const ctx = useContext(OverridesDraftContext)
  if (!ctx) throw new Error('useOverridesDraft must be used within an OverridesDraftProvider')
  return ctx
}
