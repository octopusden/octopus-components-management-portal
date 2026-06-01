import { useEffect, useMemo, useRef, useState } from 'react'
import { Save, RotateCcw } from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select'
import { InlineError } from '../ui/inline-error'
import { SkeletonBlock } from '../ui/skeleton-block'
import { StatusBanner } from '../ui/status-banner'
import { useFieldConfig, useUpdateFieldConfig } from '../../hooks/useAdminConfig'
import { useFieldOptions } from '../../hooks/useFieldOptions'
import { useSystemsDictionary } from '../../hooks/useSystemsDictionary'
import { searchabilityFor } from '../../hooks/useFieldConfig'
import type {
  FieldConfigEntry,
  FieldVisibility,
  Searchable,
} from '../../hooks/useFieldConfig'
import { cn } from '../../lib/utils'

// ---------------------------------------------------------------------------
// Catalog — only fields with FC=Y or FC=partial (Appendix A + B)
// ---------------------------------------------------------------------------

interface CatalogRow {
  /** Section key for output JSON: component | build | jira | vcs */
  section: 'component' | 'build' | 'jira' | 'vcs'
  /** Field name within the section */
  fieldName: string
  /** Display label */
  label: string
  /** Locked rows (FC=partial) — visibility/required cells are disabled */
  locked?: boolean
  /**
   * Scalar enum field whose Default Value is constrained to a fixed vocabulary
   * (item E): the Default Value cell renders a dropdown of the FULL option list
   * (the dictionary / enum, not the in-use subset) instead of free text. The
   * editor cannot otherwise tell an enum (`system`/`buildSystem`/`productType`)
   * from free-text scalars like `javaVersion`. Multi-value fields (labels) are
   * NOT enum scalars and get no such dropdown.
   */
  enumField?: boolean
}

const CATALOG: CatalogRow[] = [
  // Component Fields — Appendix A
  { section: 'component', fieldName: 'name',           label: 'name',           locked: true },
  { section: 'component', fieldName: 'displayName',    label: 'displayName'                  },
  { section: 'component', fieldName: 'solution',       label: 'solution'                     },
  { section: 'component', fieldName: 'componentOwner', label: 'componentOwner'               },
  { section: 'component', fieldName: 'system',         label: 'system',      enumField: true },
  { section: 'component', fieldName: 'productType',    label: 'productType', enumField: true },
  { section: 'component', fieldName: 'clientCode',     label: 'clientCode'                   },
  // `groupId` is locked (admins cannot flip its visibility/required). NOTE (R1):
  // `group` is no longer mandatory and is migration-owned aggregator membership;
  // the Create dialog no longer auto-suggests or sends a groupId. This catalog row
  // is retained for now; the FieldConfigEditor admin UX rework (R3) will revisit it.
  { section: 'component', fieldName: 'groupId',        label: 'groupId',        locked: true },
  // Relationship + group fields. `parentComponentName` / `canBeParent` are the flat
  // parent-picker relationship; `groupKey` is the aggregator-group key (a
  // `components { }` owner's group, migration-owned) — read-only in the editor
  // (locked) but still a useful search target, so its Searchable cell stays configurable.
  { section: 'component', fieldName: 'parentComponentName', label: 'parentComponentName' },
  { section: 'component', fieldName: 'canBeParent',         label: 'canBeParent'         },
  { section: 'component', fieldName: 'groupKey',            label: 'groupKey', locked: true },
  // Build Fields — Appendix B
  { section: 'build', fieldName: 'buildSystem',   label: 'buildSystem', enumField: true },
  { section: 'build', fieldName: 'javaVersion',   label: 'javaVersion'   },
  { section: 'build', fieldName: 'gradleVersion', label: 'gradleVersion' },
  // Jira Fields — extended-search targets (item 5/10)
  { section: 'jira', fieldName: 'projectKey', label: 'projectKey' },
  { section: 'jira', fieldName: 'technical',  label: 'technical'  },
  // VCS Fields — extended-search targets (item 5/10)
  { section: 'vcs', fieldName: 'vcsPath', label: 'vcsPath' },
  { section: 'vcs', fieldName: 'branch',  label: 'branch'  },
]

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SectionedConfig = {
  component: Record<string, FieldConfigEntry>
  build: Record<string, FieldConfigEntry>
  jira: Record<string, FieldConfigEntry>
  vcs: Record<string, FieldConfigEntry>
}

type RowDraft = {
  visibility: FieldVisibility
  required: boolean
  defaultValue: string
  description: string
  /** Where the field appears in the list-page search (item 10). */
  searchable: Searchable
}

type DraftState = Record<string, RowDraft> // key = "section.fieldName"

const EMPTY_DRAFT: RowDraft = {
  visibility: 'editable',
  required: false,
  defaultValue: '',
  description: '',
  searchable: 'Extended',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rowKey(row: CatalogRow): string {
  return `${row.section}.${row.fieldName}`
}

function readEntry(
  data: Record<string, unknown>,
  row: CatalogRow,
): RowDraft {
  // Try sectioned shape first
  const sectioned = data as Partial<SectionedConfig>
  const sectionData = sectioned[row.section] as Record<string, FieldConfigEntry> | undefined
  let entry: FieldConfigEntry | undefined = sectionData?.[row.fieldName]

  // Fallback to flat shape
  if (!entry) {
    const flat = data as { fields?: Record<string, FieldConfigEntry> }
    entry = flat.fields?.[`${row.section}.${row.fieldName}`] ?? flat.fields?.[row.fieldName]
  }

  // Effective search placement shares ONE resolver with the list page
  // (`searchabilityFor`), so the editor displays exactly what ComponentFilters
  // will honour: explicit `searchable` wins, then legacy `filterable === false`,
  // then the DEFAULT_SEARCHABILITY map, then 'Extended'.
  const searchable = searchabilityFor(rowKey(row), entry ?? {})

  // PR #44 P3: locked rows pin visibility + required to the contract values.
  // `locked: true` means the field is mandatory server-side; the disabled UI
  // cells must reflect that truth regardless of stored data (fresh DB → no
  // entry; stale config with `hidden` / `required: false` → ignore the stale
  // values). defaultValue + description stay editable, so they round-trip
  // through the stored entry. `searchable` is independent of `locked`.
  if (row.locked) {
    return {
      visibility: 'editable',
      required: true,
      defaultValue: entry?.defaultValue ?? '',
      description: entry?.description ?? '',
      searchable,
    }
  }

  return {
    visibility: entry?.visibility ?? 'editable',
    required: entry?.required ?? false,
    defaultValue: entry?.defaultValue ?? '',
    description: entry?.description ?? '',
    searchable,
  }
}

/** True when the server config carries an explicit entry for this row (sectioned or flat). */
function storedEntryExists(data: Record<string, unknown>, row: CatalogRow): boolean {
  const sectioned = data as Partial<SectionedConfig>
  if (sectioned[row.section]?.[row.fieldName]) return true
  const flat = data as { fields?: Record<string, FieldConfigEntry> }
  return Boolean(flat.fields?.[`${row.section}.${row.fieldName}`] ?? flat.fields?.[row.fieldName])
}

/**
 * Initial draft for a row, applying the single-option auto-config (item D): for an
 * UNCONFIGURED enum field (no stored entry) whose option list has exactly one value,
 * derive `searchable=None`, `visibility=readonly`, `defaultValue=`that value — a
 * one-time default. It NEVER overwrites saved admin config (a stored entry
 * short-circuits to `readEntry`) and does not re-trigger after a Save persists the
 * entry. For all other rows it is exactly `readEntry`.
 */
function computeInitialDraft(
  data: Record<string, unknown>,
  row: CatalogRow,
  optionsByKey: Record<string, string[]>,
): RowDraft {
  const base = readEntry(data, row)
  if (!row.enumField || storedEntryExists(data, row)) return base
  const opts = optionsByKey[rowKey(row)] ?? []
  const only = opts[0]
  if (opts.length === 1 && only !== undefined) {
    return { ...base, searchable: 'None', visibility: 'readonly', defaultValue: only }
  }
  return base
}

/** Field-wise equality of two drafts (used to detect an untouched row). */
function draftsEqual(a: RowDraft, b: RowDraft): boolean {
  return (
    a.visibility === b.visibility &&
    a.required === b.required &&
    a.defaultValue === b.defaultValue &&
    a.description === b.description &&
    a.searchable === b.searchable
  )
}

function buildOutput(draft: DraftState): Record<string, unknown> {
  const component: Record<string, FieldConfigEntry> = {}
  const build: Record<string, FieldConfigEntry> = {}
  const jira: Record<string, FieldConfigEntry> = {}
  const vcs: Record<string, FieldConfigEntry> = {}

  for (const row of CATALOG) {
    const key = rowKey(row)
    const d = draft[key]
    if (!d) continue

    // PR #44 P3: belt-and-braces — locked rows serialise the contract
    // values regardless of the draft. readEntry already forces these on
    // load, but a manually-built/poisoned draft (or a future hook that
    // mutates the draft outside the disabled cells) must still produce a
    // contract-correct payload on Save.
    const visibility: FieldVisibility = row.locked ? 'editable' : d.visibility
    const required: boolean = row.locked ? true : d.required

    const entry: FieldConfigEntry = {
      visibility,
      required,
      searchable: d.searchable,
    }
    if (d.defaultValue) entry.defaultValue = d.defaultValue
    if (d.description) entry.description = d.description

    if (row.section === 'component') {
      component[row.fieldName] = entry
    } else if (row.section === 'build') {
      build[row.fieldName] = entry
    } else if (row.section === 'jira') {
      jira[row.fieldName] = entry
    } else {
      vcs[row.fieldName] = entry
    }
  }

  return { component, build, jira, vcs }
}

// ---------------------------------------------------------------------------
// Visibility Select cell
// ---------------------------------------------------------------------------

// Visibility text-colour comes from semantic tokens defined in index.css
// `@theme` (PR-1). One source of truth for light + dormant dark palettes.
const VISIBILITY_CLASSES: Record<FieldVisibility, string> = {
  editable: 'text-[color:var(--color-visibility-editable-fg)]',
  readonly: 'text-[color:var(--color-visibility-readonly-fg)]',
  hidden:   'text-[color:var(--color-visibility-hidden-fg)]',
}

interface VisibilitySelectProps {
  value: FieldVisibility
  onChange: (v: FieldVisibility) => void
  disabled?: boolean
  /** Field label, used to compose an accessible name for the trigger
   *  (e.g. "displayName visibility") so visual specs can target the row
   *  unambiguously: `getByRole('combobox', { name: /displayName visibility/ })`. */
  fieldLabel: string
}

function VisibilitySelect({ value, onChange, disabled, fieldLabel }: VisibilitySelectProps) {
  return (
    <Select
      value={value}
      onValueChange={(v) => onChange(v as FieldVisibility)}
      disabled={disabled}
    >
      <SelectTrigger
        className="h-8 w-32 text-xs"
        aria-label={`${fieldLabel} visibility`}
        data-visibility={value}
      >
        <SelectValue>
          <span className={cn('text-xs', VISIBILITY_CLASSES[value])}>{value}</span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="editable">
          <span className={cn('text-xs', VISIBILITY_CLASSES.editable)}>editable</span>
        </SelectItem>
        <SelectItem value="readonly">
          <span className={cn('text-xs', VISIBILITY_CLASSES.readonly)}>readonly</span>
        </SelectItem>
        <SelectItem value="hidden">
          <span className={cn('text-xs', VISIBILITY_CLASSES.hidden)}>hidden</span>
        </SelectItem>
      </SelectContent>
    </Select>
  )
}

// ---------------------------------------------------------------------------
// Searchable Select cell (item 10) — Main / Extended / None
// ---------------------------------------------------------------------------

const SEARCHABLE_VALUES: Searchable[] = ['Main', 'Extended', 'None']

interface SearchableSelectProps {
  value: Searchable
  onChange: (v: Searchable) => void
  /** Accessible name for the trigger, e.g. "solution searchable". */
  fieldLabel: string
}

function SearchableSelect({ value, onChange, fieldLabel }: SearchableSelectProps) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as Searchable)}>
      <SelectTrigger
        className="h-8 w-32 text-xs"
        aria-label={`${fieldLabel} searchable`}
        data-searchable={value}
      >
        <SelectValue>
          <span className="text-xs">{value}</span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {SEARCHABLE_VALUES.map((v) => (
          <SelectItem key={v} value={v}>
            <span className="text-xs">{v}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

// ---------------------------------------------------------------------------
// Default Value cell — enum fields (item E) get a dropdown of the full option
// vocabulary (dictionary / enum); everything else stays free-text.
// ---------------------------------------------------------------------------

interface DefaultValueCellProps {
  row: CatalogRow
  value: string
  options: string[]
  onChange: (value: string) => void
}

function DefaultValueCell({ row, value, options, onChange }: DefaultValueCellProps) {
  if (!row.enumField) {
    return (
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 text-xs"
        placeholder="—"
      />
    )
  }
  // Native <select> (like the Required checkbox cell): it handles the empty
  // "no default" option cleanly, which a Radix SelectItem cannot. A stored value
  // missing from the current vocabulary is still shown (labelled) so a Save never
  // silently drops it.
  const valueMissingFromOptions = value !== '' && !options.includes(value)
  return (
    <select
      aria-label={`${row.label} default value`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
    >
      <option value="">— (no default)</option>
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
      {valueMissingFromOptions && (
        <option value={value}>{value} (not in vocabulary)</option>
      )}
    </select>
  )
}

// ---------------------------------------------------------------------------
// Section table
// ---------------------------------------------------------------------------

interface SectionTableProps {
  title: string
  rows: CatalogRow[]
  draft: DraftState
  onDraftChange: (key: string, patch: Partial<RowDraft>) => void
  /** Full option vocabulary per rowKey, for enum-field Default Value dropdowns (item E). */
  enumOptionsByKey: Record<string, string[]>
}

function SectionTable({ title, rows, draft, onDraftChange, enumOptionsByKey }: SectionTableProps) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-40">Field</TableHead>
            <TableHead className="w-36">Visibility</TableHead>
            <TableHead className="w-24">Required</TableHead>
            <TableHead className="w-36">Searchable</TableHead>
            <TableHead className="w-40">Default Value</TableHead>
            <TableHead>Description</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const key = rowKey(row)
            const d = draft[key] ?? EMPTY_DRAFT
            return (
              <TableRow key={key}>
                {/* Field name */}
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs">{row.label}</span>
                    {row.locked && (
                      <span className="text-xs text-muted-foreground">(locked)</span>
                    )}
                  </div>
                </TableCell>

                {/* Visibility */}
                <TableCell>
                  <VisibilitySelect
                    value={d.visibility}
                    onChange={(v) => onDraftChange(key, { visibility: v })}
                    disabled={row.locked}
                    fieldLabel={row.label}
                  />
                </TableCell>

                {/* Required */}
                <TableCell>
                  <input
                    type="checkbox"
                    role="checkbox"
                    aria-label={`${row.label} required`}
                    checked={d.required}
                    onChange={(e) => onDraftChange(key, { required: e.target.checked })}
                    disabled={row.locked}
                    className="h-4 w-4 rounded border-input accent-primary disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </TableCell>

                {/* Searchable */}
                <TableCell>
                  <SearchableSelect
                    value={d.searchable}
                    onChange={(v) => onDraftChange(key, { searchable: v })}
                    fieldLabel={row.label}
                  />
                </TableCell>

                {/* Default Value */}
                <TableCell>
                  <DefaultValueCell
                    row={row}
                    value={d.defaultValue}
                    options={enumOptionsByKey[key] ?? []}
                    onChange={(v) => onDraftChange(key, { defaultValue: v })}
                  />
                </TableCell>

                {/* Description */}
                <TableCell>
                  <span className="font-mono text-xs text-muted-foreground">
                    {d.description || '—'}
                  </span>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const COMPONENT_ROWS = CATALOG.filter((r) => r.section === 'component')
const BUILD_ROWS     = CATALOG.filter((r) => r.section === 'build')
const JIRA_ROWS      = CATALOG.filter((r) => r.section === 'jira')
const VCS_ROWS       = CATALOG.filter((r) => r.section === 'vcs')

export function FieldConfigEditor() {
  const { data, isLoading, error } = useFieldConfig()
  const updateMutation = useUpdateFieldConfig()

  // Full option vocabularies for the enum-field Default Value dropdowns (item E)
  // and the single-option auto-config (item D). `system` uses the master
  // dictionary (/meta/systems/dictionary) — NOT the in-use /meta/systems subset;
  // buildSystem / productType use their fixed enum / field-config options.
  const systemsDict = useSystemsDictionary()
  const buildSystemOptions = useFieldOptions('buildSystem')
  const productTypeOptions = useFieldOptions('productType')
  // Array.isArray guard: `systemsDict.data` is the raw query payload, so a
  // malformed/non-array API response (or an empty `{}`) must not reach the
  // dropdown's `.map` — degrade to no options rather than white-screen the page.
  const enumOptionsByKey = useMemo<Record<string, string[]>>(
    () => ({
      'component.system': Array.isArray(systemsDict.data) ? systemsDict.data : [],
      'build.buildSystem': Array.isArray(buildSystemOptions.options) ? buildSystemOptions.options : [],
      'component.productType': Array.isArray(productTypeOptions.options) ? productTypeOptions.options : [],
    }),
    [systemsDict.data, buildSystemOptions.options, productTypeOptions.options],
  )
  const enumOptionsLoading =
    systemsDict.isLoading || buildSystemOptions.isLoading || productTypeOptions.isLoading

  const [draft, setDraft] = useState<DraftState>({})
  const [savedFeedback, setSavedFeedback] = useState(false)

  // Phase 1 — initialise the draft from server data (via readEntry) as soon as the
  // config loads, WITHOUT waiting on the enum option vocabularies, so a slow/hanging
  // /meta dictionary endpoint can't wedge the whole editor. `initRef` pins it to once
  // per server-data reference (an `enumOptionsByKey` re-render won't re-run it and
  // discard edits).
  const initRef = useRef<unknown>(null)
  useEffect(() => {
    if (data === undefined) return
    if (initRef.current === data) return
    initRef.current = data
    const rawData = data as Record<string, unknown>
    const initial: DraftState = {}
    for (const row of CATALOG) {
      initial[rowKey(row)] = readEntry(rawData, row)
    }
    setDraft(initial)
  }, [data])

  // Phase 2 — item D: once the option vocabularies load, apply the single-option
  // auto-config for UNCONFIGURED enum fields. Runs once per (server-data, vocabulary)
  // state (`autoConfigRef`) and only overwrites a row still at its readEntry baseline,
  // so it never clobbers an edit made before the vocabularies arrived, and never
  // re-applies after a Save (a stored entry makes computeInitialDraft a no-op).
  const autoConfigRef = useRef<{ data: unknown; options: unknown }>({ data: null, options: null })
  useEffect(() => {
    if (data === undefined || enumOptionsLoading) return
    // Re-key the run-once guard on BOTH `data` and the loaded vocabularies: a
    // dictionary that first settled empty (transient error / undefined payload, with
    // enumOptionsLoading already false) and later recovered on refetch changes
    // `enumOptionsByKey` but NOT `data`, so a `data`-only guard would lock
    // single-option auto-config out forever (Copilot PR #60).
    if (autoConfigRef.current.data === data && autoConfigRef.current.options === enumOptionsByKey) return
    autoConfigRef.current = { data, options: enumOptionsByKey }
    const rawData = data as Record<string, unknown>
    setDraft((prev) => {
      let changed = false
      const next = { ...prev }
      for (const row of CATALOG) {
        if (!row.enumField || storedEntryExists(rawData, row)) continue
        const baseline = readEntry(rawData, row)
        const auto = computeInitialDraft(rawData, row, enumOptionsByKey)
        const key = rowKey(row)
        const current = prev[key]
        // `auto !== baseline` only when the single-option rule fired; apply it iff
        // the row is still untouched (current equals the readEntry baseline).
        if (current && !draftsEqual(auto, baseline) && draftsEqual(current, baseline)) {
          next[key] = auto
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [data, enumOptionsLoading, enumOptionsByKey])

  const handleDraftChange = (key: string, patch: Partial<RowDraft>) => {
    setDraft((prev) => {
      const existing = prev[key] ?? EMPTY_DRAFT
      return { ...prev, [key]: { ...existing, ...patch } }
    })
  }

  const handleReset = () => {
    if (data === undefined) return
    const rawData = data as Record<string, unknown>
    const reset: DraftState = {}
    for (const row of CATALOG) {
      reset[rowKey(row)] = computeInitialDraft(rawData, row, enumOptionsByKey)
    }
    setDraft(reset)
  }

  const handleSave = () => {
    const output = buildOutput(draft)
    updateMutation.mutate(output, {
      onSuccess: () => {
        setSavedFeedback(true)
        setTimeout(() => setSavedFeedback(false), 2000)
      },
    })
  }

  // ----- Loading state ----- (gated ONLY on the field-config load; the enum option
  // vocabularies load independently — Phase 2 applies item D when they arrive, and
  // the Default Value dropdowns fill in as they resolve — so a slow /meta dictionary
  // endpoint never blocks the editor).
  if (isLoading) {
    return (
      <div className="space-y-3">
        <SkeletonBlock height="h-4" width="w-1/4" />
        <SkeletonBlock height="h-64" width="w-full" />
      </div>
    )
  }

  // ----- Error state -----
  if (error) {
    return (
      <InlineError
        message={
          <>
            Failed to load field configuration:{' '}
            {error instanceof Error ? error.message : String(error)}
          </>
        }
      />
    )
  }

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Configure visibility, required flag, searchability, and default values
          for each field. Changes are written in sectioned format per ADR-011.
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            disabled={updateMutation.isPending}
          >
            <RotateCcw className="h-4 w-4 mr-1" />
            Reset
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={updateMutation.isPending}
          >
            <Save className="h-4 w-4 mr-1" />
            {updateMutation.isPending ? 'Saving…' : savedFeedback ? 'Saved!' : 'Save'}
          </Button>
        </div>
      </div>

      {/* Save error */}
      {updateMutation.error && (
        <StatusBanner variant="destructive">
          Save failed:{' '}
          {updateMutation.error instanceof Error
            ? updateMutation.error.message
            : String(updateMutation.error)}
        </StatusBanner>
      )}

      {/* Component Fields table */}
      <SectionTable
        title="Component Fields"
        rows={COMPONENT_ROWS}
        draft={draft}
        onDraftChange={handleDraftChange}
        enumOptionsByKey={enumOptionsByKey}
      />

      {/* Build Fields table */}
      <SectionTable
        title="Build Fields"
        rows={BUILD_ROWS}
        draft={draft}
        onDraftChange={handleDraftChange}
        enumOptionsByKey={enumOptionsByKey}
      />

      {/* Jira Fields table */}
      <SectionTable
        title="Jira Fields"
        rows={JIRA_ROWS}
        draft={draft}
        onDraftChange={handleDraftChange}
        enumOptionsByKey={enumOptionsByKey}
      />

      {/* VCS Fields table */}
      <SectionTable
        title="VCS Fields"
        rows={VCS_ROWS}
        draft={draft}
        onDraftChange={handleDraftChange}
        enumOptionsByKey={enumOptionsByKey}
      />
    </div>
  )
}
