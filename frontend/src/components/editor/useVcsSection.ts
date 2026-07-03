import type { ComponentDetail, VcsEntry } from '../../lib/types'
import { selectBaseRow } from '../../lib/api/baseRow'
import type { SectionSlice, DiffEntry } from '../../lib/editor/combineRequest'
import { scalarDiff } from '../../lib/editor/diffUtil'
import { useSectionSnapshot } from './useSectionSnapshot'
import { useFieldEditable } from '../../hooks/useFieldConfig'
import { omitNonEditable } from '../../lib/editor/payloadGating'

/**
 * External Registry (R10) is a Whiskey-only field: it is shown only when the
 * effective BASE build system is WHISKEY. Read from the persisted base row's
 * build aspect — an unsaved build-system edit on another tab does not toggle
 * this (cross-tab live coupling is out of scope for P-3).
 */
const WHISKEY = 'WHISKEY'

/**
 * The field-config keys for External Registry are SPLIT (see isFieldEditableFor
 * doc): the write-enforcement / editability axis lives on the CRS write-side key
 * `component.vcsExternalRegistry`, while label/description/options live on the
 * editor DISPLAY path `vcs.externalRegistry`. Editability + payload-gating use
 * the write-side key; the dropdown reads options from the display path.
 */
const EXTERNAL_REGISTRY_EDITABLE_KEY = 'component.vcsExternalRegistry'

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
  /** Whiskey-only visibility (R10): render the External Registry field only when
   *  the effective BASE build system is WHISKEY. */
  showExternalRegistry: boolean
  /** Effective editability of External Registry for the current user (adminOnly
   *  → EDIT_ANY_COMPONENT). Drives the disabled dropdown + "admin only" pill. */
  externalRegistryEditable: boolean
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

  // useFieldEditable fails CLOSED while field-config / current-user load (and on
  // a field-config error): the dropdown must never flash editable — nor leak the
  // field into the PATCH — before we can confirm the user may edit it.
  const externalRegistryEditable = useFieldEditable(EXTERNAL_REGISTRY_EDITABLE_KEY)
  const showExternalRegistry = selectBaseRow(component)?.build?.buildSystem === WHISKEY

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
    // vcsExternalRegistry clears via '' (CRS-A ""-clear); the prior null-clear was
    // a silent no-op (prep §1.6). Not flagged as a no-op — the clear now persists.
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

  const request = {
    // ""-clear (CRS-A): send '' to clear (null = no-op). Empty state == server
    // null (seeded from detail), so an untouched-empty send of '' is a no-op.
    // Only included when the field is visible (Whiskey) — a hidden field never
    // participates in the PATCH (mirrors BuildTab's hidden tool-version fields).
    ...(showExternalRegistry ? { vcsExternalRegistry: state.externalRegistry || '' } : {}),
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
  }

  // Payload-gating (P-1): drop vcsExternalRegistry from the PATCH when the
  // current user may not edit it (adminOnly without EDIT_ANY_COMPONENT). Keyed
  // by the write-side path; baseConfiguration has no mapped path so it is kept.
  const slice: SectionSlice = {
    isDirty,
    diff,
    request: omitNonEditable(
      request,
      { vcsExternalRegistry: EXTERNAL_REGISTRY_EDITABLE_KEY },
      // Same fail-closed answer as the rendered control — never omit vs. render
      // out of step. Only vcsExternalRegistry is mapped, so this is the only
      // path the predicate is asked about.
      (path) => (path === EXTERNAL_REGISTRY_EDITABLE_KEY ? externalRegistryEditable : true),
    ),
  }

  return {
    externalRegistry: state.externalRegistry,
    setExternalRegistry,
    showExternalRegistry,
    externalRegistryEditable,
    entries: state.entries,
    updateEntry,
    addEntry,
    removeEntry,
    slice,
    reset,
  }
}
