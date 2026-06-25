import { useEffect, useRef, useState } from 'react'
import type { ComponentDetail, VcsEntry } from '../../lib/types'
import { selectBaseRow } from '../../lib/api/baseRow'
import type { SectionSlice, DiffEntry } from '../../lib/editor/combineRequest'
import { deepEqual, scalarDiff, listDiff } from '../../lib/editor/diffUtil'

export interface VcsEntryState {
  id?: string | null
  name: string
  vcsPath: string
  repositoryType: string
  tag: string
  branch: string
  hotfixBranch: string
}

interface VcsState {
  externalRegistry: string
  entries: VcsEntryState[]
}

function toEntryState(e: VcsEntry): VcsEntryState {
  return {
    id: e.id,
    name: e.name ?? '',
    vcsPath: e.vcsPath ?? '',
    repositoryType: e.repositoryType ?? '',
    tag: e.tag ?? '',
    branch: e.branch ?? '',
    hotfixBranch: e.hotfixBranch ?? '',
  }
}

function snapshotFrom(component: ComponentDetail): VcsState {
  return {
    externalRegistry: component.vcsExternalRegistry ?? '',
    entries: selectBaseRow(component)?.vcsEntries?.map(toEntryState) ?? [],
  }
}

export interface VcsSection {
  externalRegistry: string
  setExternalRegistry: (v: string) => void
  entries: VcsEntryState[]
  updateEntry: (index: number, field: keyof VcsEntryState, value: string) => void
  addEntry: () => void
  removeEntry: (index: number) => void
  slice: SectionSlice
  reset: () => void
}

export function useVcsSection(component: ComponentDetail): VcsSection {
  const [state, setState] = useState<VcsState>(() => snapshotFrom(component))
  const snapshotRef = useRef<VcsState>(state)
  const isDirty = !deepEqual(state, snapshotRef.current)

  useEffect(() => {
    if (!isDirty) {
      const next = snapshotFrom(component)
      snapshotRef.current = next
      setState((prev) => (deepEqual(prev, next) ? prev : next))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [component])

  const setExternalRegistry = (v: string) => setState((p) => ({ ...p, externalRegistry: v }))
  const updateEntry = (index: number, field: keyof VcsEntryState, value: string) =>
    setState((p) => ({ ...p, entries: p.entries.map((e, i) => (i === index ? { ...e, [field]: value } : e)) }))
  const addEntry = () =>
    setState((p) => ({
      ...p,
      entries: [...p.entries, { name: '', vcsPath: '', repositoryType: '', tag: '', branch: '', hotfixBranch: '' }],
    }))
  const removeEntry = (index: number) =>
    setState((p) => ({ ...p, entries: p.entries.filter((_, i) => i !== index) }))

  function reset() {
    const next = snapshotFrom(component)
    snapshotRef.current = next
    setState(next)
  }

  // Drop rows whose required vcsPath is blank — same guard the legacy tab applied
  // before sending (an empty required string would 400).
  const cleanedEntries = state.entries
    .map((e) => ({
      name: (e.name || '').trim(),
      vcsPath: e.vcsPath.trim(),
      branch: (e.branch || '').trim(),
      tag: (e.tag || '').trim(),
      hotfixBranch: (e.hotfixBranch || '').trim(),
      repositoryType: (e.repositoryType || '').trim(),
    }))
    .filter((e) => e.vcsPath !== '')

  const prior = snapshotRef.current
  const diff: DiffEntry[] = []
  const push = (d: DiffEntry | null) => { if (d) diff.push(d) }
  if (isDirty) {
    // vcsExternalRegistry is a top-level component scalar (not an aspect), so a clear persists.
    push(scalarDiff('VCS · External Registry', prior.externalRegistry, state.externalRegistry))
    // Entry-list change → one summary row (path list); per-field row noise isn't useful here.
    push(
      listDiff(
        'VCS · Entries',
        prior.entries.map((e) => e.vcsPath).filter(Boolean),
        cleanedEntries.map((e) => e.vcsPath),
      ),
    )
  }

  const slice: SectionSlice = {
    isDirty,
    diff,
    request: {
      vcsExternalRegistry: state.externalRegistry || null,
      baseConfiguration: {
        vcsEntries: cleanedEntries.map((e) => ({
          name: e.name || null,
          vcsPath: e.vcsPath,
          branch: e.branch || null,
          tag: e.tag || null,
          hotfixBranch: e.hotfixBranch || null,
          repositoryType: e.repositoryType || null,
        })),
      },
    },
  }

  return { externalRegistry: state.externalRegistry, setExternalRegistry, entries: state.entries, updateEntry, addEntry, removeEntry, slice, reset }
}
