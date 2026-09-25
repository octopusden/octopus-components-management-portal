import { useEffect, useState } from 'react'
import type { ComponentDetail, VcsEntry } from '../../lib/types'
import { selectBaseRow } from '../../lib/api/baseRow'
import type { SectionSlice, DiffEntry } from '../../lib/editor/combineRequest'
import { scalarDiff } from '../../lib/editor/diffUtil'
import { useSectionSnapshot } from './useSectionSnapshot'
import { useFieldEditable } from '../../hooks/useFieldConfig'
import { omitNonEditable } from '../../lib/editor/payloadGating'
import { parseVcsEntryErrorPath } from '../../lib/serverErrors'

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
  sourcePath: string
  checkoutDirectory: string
}

interface VcsState {
  externalRegistry: string
  entries: VcsEntryState[]
  buildWorkingDirectory: string
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
    sourcePath: e.sourcePath ?? '',
    checkoutDirectory: e.checkoutDirectory ?? '',
  }
}

function snapshotFrom(component: ComponentDetail): VcsState {
  return {
    externalRegistry: component.vcsExternalRegistry ?? '',
    entries: selectBaseRow(component)?.vcsEntries?.map(toEntryState) ?? [],
    buildWorkingDirectory: selectBaseRow(component)?.buildWorkingDirectory ?? '',
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
  sourcePath: string
  checkoutDirectory: string
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
      sourcePath: (e.sourcePath || '').trim(),
      checkoutDirectory: (e.checkoutDirectory || '').trim(),
    }))
    .filter((e) => e.vcsPath !== '')
}

// Normalized view for the dirty compare (P1-4): the cleaned entries plus the
// trimmed external-registry. dirty ⇔ this differs from the snapshot's view.
function normalizeVcs(s: VcsState): unknown {
  return {
    externalRegistry: (s.externalRegistry || '').trim(),
    entries: cleanVcsEntries(s.entries),
    buildWorkingDirectory: s.buildWorkingDirectory.trim(),
  }
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
  buildWorkingDirectory: string
  setBuildWorkingDirectory: (v: string) => void
  updateEntry: (index: number, field: keyof VcsEntryState, value: string) => void
  addEntry: () => void
  removeEntry: (index: number) => void
  slice: SectionSlice
  reset: () => void
  /** Registry placement errors on base entries, keyed `<entry index>.<field>`
   *  (`buildWorkingDirectory` for the row's own field). */
  entryErrors: Record<string, string>
  /** The same for per-range rows, by override id. */
  overrideEntryErrors: Record<string, Record<string, string>>
  /** Route the `vcsEntries[…]` / `fieldOverrides[<j>].vcsEntries[…]` errors of a
   *  400 (`rowIds` = the override ids in the order sent); true when one landed on a
   *  base entry (shown inline, so the page needs no toast for it). */
  applyServerErrors: (fieldErrors: Map<string, string>, rowIds: string[]) => boolean
  clearServerErrors: () => void
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
  const setBuildWorkingDirectory = (v: string) => setState((p) => ({ ...p, buildWorkingDirectory: v }))
  const updateEntry = (index: number, field: keyof VcsEntryState, value: string) =>
    setState((p) => ({ ...p, entries: p.entries.map((e, i) => (i === index ? { ...e, [field]: value } : e)) }))
  const addEntry = () =>
    setState((p) => ({
      ...p,
      entries: [...p.entries, { name: '', vcsPath: '', repositoryType: '', tag: '', branch: '', hotfixBranch: '', sourcePath: '', checkoutDirectory: '' }],
    }))
  const [entryErrors, setEntryErrors] = useState<Record<string, string>>({})
  const [overrideEntryErrors, setOverrideEntryErrors] = useState<Record<string, Record<string, string>>>({})
  const clearServerErrors = () => {
    setEntryErrors({})
    setOverrideEntryErrors({})
  }
  // Another component: its entries are not the ones the errors point at.
  useEffect(() => clearServerErrors(), [component.id])

  const removeEntry = (index: number) => {
    // Indices shift: a routed error would land on the wrong entry.
    setEntryErrors({})
    setState((p) => ({ ...p, entries: p.entries.filter((_, i) => i !== index) }))
  }

  const reset = () => {
    clearServerErrors()
    reseed()
  }

  const applyServerErrors = (fieldErrors: Map<string, string>, rowIds: string[]) => {
    // The request drops path-less rows, so a sent index maps to the i-th kept row.
    const stateIndexOfSent = state.entries.flatMap((e, i) => (e.vcsPath.trim() !== '' ? [i] : []))
    const base: Record<string, string> = {}
    const overrides: Record<string, Record<string, string>> = {}
    for (const [path, message] of fieldErrors) {
      const p = parseVcsEntryErrorPath(path)
      if (!p) continue
      // Keys: `<entry index>.<field>`, or the bare field for the row's Build Working Directory.
      if (p.overrideIndex === undefined) {
        if (p.entry === undefined) {
          base[p.field] = message
        } else {
          const index = stateIndexOfSent[p.entry]
          if (index !== undefined) base[`${index}.${p.field}`] = message
        }
      } else {
        const id = rowIds[p.overrideIndex]
        const key = p.entry === undefined ? p.field : `${p.entry}.${p.field}`
        if (id !== undefined) overrides[id] = { ...overrides[id], [key]: message }
      }
    }
    setEntryErrors(base)
    setOverrideEntryErrors(overrides)
    return Object.keys(base).length > 0
  }

  // The request + diff + dirty all run off this one cleaned projection.
  const cleanedEntries = cleanVcsEntries(state.entries)
  const prior = snapshotRef.current
  const cleanedPriorEntries = cleanVcsEntries(prior.entries)
  // With no entries there is nothing to build in, so it clears too (diff and request agree).
  const buildWorkingDirectory = cleanedEntries.length === 0 ? '' : state.buildWorkingDirectory.trim()

  const diff: DiffEntry[] = []
  const push = (d: DiffEntry | null) => { if (d) diff.push(d) }
  if (isDirty) {
    // vcsExternalRegistry clears via '' (CRS-A ""-clear); the prior null-clear was
    // a silent no-op (prep §1.6). Not flagged as a no-op — the clear now persists.
    push(scalarDiff('VCS · External Registry', prior.externalRegistry, state.externalRegistry))
    push(scalarDiff('VCS · Build Working Directory', prior.buildWorkingDirectory.trim(), buildWorkingDirectory))
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
      { key: 'sourcePath', label: 'Source Path' },
      { key: 'checkoutDirectory', label: 'Checkout Directory' },
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
        sourcePath: e.sourcePath || null,
        checkoutDirectory: e.checkoutDirectory || null,
      })),
      // ""-clear: a base-row null would leave the stored value.
      buildWorkingDirectory,
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
    buildWorkingDirectory: state.buildWorkingDirectory,
    setBuildWorkingDirectory,
    updateEntry,
    addEntry,
    removeEntry,
    slice,
    reset,
    entryErrors,
    overrideEntryErrors,
    applyServerErrors,
    clearServerErrors,
  }
}
