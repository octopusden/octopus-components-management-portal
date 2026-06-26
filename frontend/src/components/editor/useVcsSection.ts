import type { ComponentDetail, VcsEntry } from '../../lib/types'
import { selectBaseRow } from '../../lib/api/baseRow'
import type { SectionSlice, DiffEntry } from '../../lib/editor/combineRequest'
import { scalarDiff } from '../../lib/editor/diffUtil'
import { useSectionSnapshot } from './useSectionSnapshot'

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

// The cleaned/persisted entry projection: trim every field and drop rows whose
// required vcsPath is blank (an empty required string would 400). The request,
// the diff, AND the dirty compare all run off THIS — so a blank/whitespace/
// path-less row contributes to none of them (P1-4 invariant). One source of truth.
interface CleanVcsEntry {
  name: string
  vcsPath: string
  branch: string
  tag: string
  hotfixBranch: string
  repositoryType: string
}
function cleanVcsEntries(entries: VcsEntryState[]): CleanVcsEntry[] {
  return entries
    .map((e) => ({
      name: (e.name || '').trim(),
      vcsPath: e.vcsPath.trim(),
      branch: (e.branch || '').trim(),
      tag: (e.tag || '').trim(),
      hotfixBranch: (e.hotfixBranch || '').trim(),
      repositoryType: (e.repositoryType || '').trim(),
    }))
    .filter((e) => e.vcsPath !== '')
}

// Normalized view for the dirty compare (P1-4): the cleaned entries plus the
// trimmed external-registry. dirty ⇔ this differs from the snapshot's view.
function normalizeVcs(s: VcsState): unknown {
  return { externalRegistry: (s.externalRegistry || '').trim(), entries: cleanVcsEntries(s.entries) }
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
  const { state, setState, snapshotRef, isDirty, reseed } = useSectionSnapshot(
    component,
    snapshotFrom,
    normalizeVcs,
  )

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

  const reset = reseed

  // The request + diff + dirty all run off this one cleaned projection.
  const cleanedEntries = cleanVcsEntries(state.entries)
  const prior = snapshotRef.current
  const cleanedPriorEntries = cleanVcsEntries(prior.entries)

  const diff: DiffEntry[] = []
  const push = (d: DiffEntry | null) => { if (d) diff.push(d) }
  if (isDirty) {
    // vcsExternalRegistry is a top-level component scalar (not an aspect), so a clear persists.
    push(scalarDiff('VCS · External Registry', prior.externalRegistry, state.externalRegistry))
    // Field-level entry diff (P1-2): the request persists name/branch/tag/
    // hotfixBranch/repositoryType, so editing ANY of them must surface a row —
    // not just a vcsPath change. Compare index-by-index over the normalized
    // entries; emit one row per changed field, plus added/removed rows. A vcs
    // entry is a collection child (REPLACE semantics) so no scalar-aspect no-op.
    // NOTE: positional compare can mislabel a mid-list insertion as "edit + add"
    // — cosmetic only; the request payload (whole-list REPLACE) is still correct.
    const ENTRY_FIELDS: { key: keyof (typeof cleanedEntries)[number]; label: string }[] = [
      { key: 'vcsPath', label: 'Path' },
      { key: 'name', label: 'Name' },
      { key: 'branch', label: 'Branch' },
      { key: 'tag', label: 'Tag' },
      { key: 'hotfixBranch', label: 'Hotfix Branch' },
      { key: 'repositoryType', label: 'Repository Type' },
    ]
    const maxLen = Math.max(cleanedPriorEntries.length, cleanedEntries.length)
    for (let i = 0; i < maxLen; i++) {
      const before = cleanedPriorEntries[i]
      const after = cleanedEntries[i]
      const rowLabel = (field: string) => `VCS · ${after?.vcsPath || before?.vcsPath || `entry ${i + 1}`} · ${field}`
      if (before && !after) {
        push({ label: `VCS · ${before.vcsPath}`, oldValue: 'present', newValue: '—' })
        continue
      }
      if (!before && after) {
        push({ label: `VCS · ${after.vcsPath}`, oldValue: '—', newValue: 'added' })
        continue
      }
      if (!before || !after) continue
      for (const { key, label } of ENTRY_FIELDS) {
        push(scalarDiff(rowLabel(label), before[key], after[key]))
      }
    }
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
