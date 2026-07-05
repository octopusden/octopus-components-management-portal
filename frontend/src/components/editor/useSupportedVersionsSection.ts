import { useEffect, useRef, useState } from 'react'
import { useSupportedVersions, useUpdateSupportedVersions } from '../../hooks/useComponent'
import { compareVersionRanges, formatVersionRange } from '../../lib/versionRange'
import { deepEqual } from '../../lib/editor/diffUtil'
import type { DiffEntry } from '../../lib/editor/combineRequest'
import type { SupportedVersionsResponse } from '../../lib/types'

/**
 * Draft state for the Supported Versions (coverage) tab, wired into the
 * page-level combined-save contract like the other section hooks. It differs
 * from `useSectionSnapshot` in ONE way: coverage is NOT part of `ComponentDetail`
 * — it lives behind the dedicated `/supported-versions` endpoint — so the seed
 * comes from `useSupportedVersions` and the persist is a SEPARATE PUT (not the
 * combined PATCH). The page therefore folds `isDirty`/`diff` into its unified
 * dirty flag + Review diff and sequences `save()` inside `runCombinedSave` after
 * the PATCH. The immediate-per-edit PUT the tab used to fire is gone.
 *
 * Re-seed rule mirrors `useSectionSnapshot` (idChanged || !isDirty ||
 * deepEqual): a fresh component id starts a clean draft; a clean refetch adopts
 * the new server value; a same-value sibling refetch never clobbers an
 * in-progress edit. `save()` re-seeds to the MERGED PUT response so the tab
 * shows the canonical (collapsed) set and reads clean afterwards.
 */
export interface SupportedVersionsState {
  all: boolean
  ranges: string[]
}

const EMPTY: SupportedVersionsState = { all: false, ranges: [] }

function snapshotFrom(data: SupportedVersionsResponse | undefined): SupportedVersionsState {
  if (!data) return EMPTY
  // Tolerate a missing/partial payload (?? []) so a slow or shape-off response
  // never throws on the spread — coverage just reads as an empty (bounded) set.
  return { all: data.all ?? false, ranges: [...(data.ranges ?? [])].sort(compareVersionRanges) }
}

function coverageText(s: SupportedVersionsState): string {
  if (s.all || s.ranges.length === 0) return 'All versions'
  return s.ranges.map(formatVersionRange).join(', ')
}

export interface SupportedVersionsSection {
  state: SupportedVersionsState
  warnings: string[]
  isLoading: boolean
  isError: boolean
  isDirty: boolean
  diff: DiffEntry[]
  addRange: (range: string) => void
  removeRange: (range: string) => void
  setAllVersions: () => void
  reset: () => void
  save: (meta?: { jiraTaskKey?: string; changeComment?: string }) => Promise<void>
}

export function useSupportedVersionsSection(componentId: string): SupportedVersionsSection {
  const { data, isLoading, isError } = useSupportedVersions(componentId)
  const updateMutation = useUpdateSupportedVersions(componentId)

  const [state, setState] = useState<SupportedVersionsState>(() => snapshotFrom(data))
  const snapshotRef = useRef<SupportedVersionsState>(state)
  const lastIdRef = useRef<string>(componentId)
  // Force a re-render when the snapshot ref advances without a state change, so
  // the derived `isDirty` recomputes (a ref mutation alone does not re-render).
  const [, bumpSnapshot] = useState(0)

  const isDirty = !deepEqual(state, snapshotRef.current)

  useEffect(() => {
    const next = snapshotFrom(data)
    const idChanged = componentId !== lastIdRef.current
    lastIdRef.current = componentId
    // Re-seed on a new component (fresh draft), while clean (leaves a dirty
    // sibling edit alone), or when the arriving server value already equals the
    // draft (our own save landed). Otherwise keep the in-progress edit.
    if (idChanged || !isDirty || deepEqual(state, next)) {
      const snapshotChanged = !deepEqual(snapshotRef.current, next)
      snapshotRef.current = next
      if (idChanged || !deepEqual(state, next)) {
        setState(next)
      } else if (snapshotChanged) {
        bumpSnapshot((n) => n + 1)
      }
    }
    // Keyed on the data object + id; state/isDirty read fresh via closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, componentId])

  const prior = snapshotRef.current
  const diff: DiffEntry[] = []
  if (isDirty) {
    diff.push({
      label: 'Supported Versions',
      oldValue: coverageText(prior),
      newValue: coverageText(state),
    })
  }

  function reseedTo(next: SupportedVersionsState) {
    snapshotRef.current = next
    setState(next)
  }

  return {
    state,
    warnings: data?.warnings ?? [],
    isLoading,
    // Only a load error with NO baseline yet — a background refetch failure that
    // still has prior `data` (React Query keeps it) must NOT blank the tab and
    // discard an in-progress edit; only an initial load with nothing to fall back
    // on should block editing.
    isError: isError && data === undefined,
    isDirty,
    diff,
    addRange: (range) =>
      setState((p) => ({ all: false, ranges: [...p.ranges, range].sort(compareVersionRanges) })),
    // Filter only — the tab guards the last-range case (confirm → setAllVersions),
    // so this never silently empties coverage into an implicit all=true.
    removeRange: (range) =>
      setState((p) => ({ ...p, ranges: p.ranges.filter((r) => r !== range) })),
    setAllVersions: () => setState({ all: true, ranges: [] }),
    reset: () => reseedTo(snapshotFrom(data)),
    save: async (meta) => {
      // Backstop against a silent widen: a bounded (all=false) set with no ranges
      // would PUT `{ranges: []}`, which the server collapses to all=true. The tab's
      // last-range delete routes through setAllVersions() with explicit confirmation,
      // so reaching save() with an empty bounded set is a bug — fail loudly.
      if (!state.all && state.ranges.length === 0) {
        throw new Error('Cannot save an empty supported-versions set; use "All versions" to widen coverage.')
      }
      // Change metadata (Jira task key + comment) is recorded on the audit row by
      // CRS. Include each only when non-blank so the body stays clean (a blank Jira
      // key would pass the server's `^\s*$` pattern but adds nothing). Send the
      // Jira key TRIMMED — a padded " ABC-123 " passes this presence check but is
      // rejected by the server's `^[A-Z][A-Z0-9]+-\d+$` pattern (400).
      const jiraTaskKey = meta?.jiraTaskKey?.trim()
      const meta_ = {
        ...(jiraTaskKey ? { jiraTaskKey } : {}),
        ...(meta?.changeComment?.trim() ? { changeComment: meta.changeComment } : {}),
      }
      const request = state.all ? { all: true, ...meta_ } : { ranges: state.ranges, ...meta_ }
      const res = await updateMutation.mutateAsync(request)
      // Adopt the server's MERGED coverage as the new baseline AND draft, so the
      // tab shows the canonical set and reads clean even when the server
      // collapsed overlapping/contiguous input differently from what was typed.
      reseedTo(snapshotFrom(res))
    },
  }
}
