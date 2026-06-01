import { useState, useEffect } from 'react'
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
}

const CATALOG: CatalogRow[] = [
  // Component Fields — Appendix A
  { section: 'component', fieldName: 'name',           label: 'name',           locked: true },
  { section: 'component', fieldName: 'displayName',    label: 'displayName'                  },
  { section: 'component', fieldName: 'solution',       label: 'solution'                     },
  { section: 'component', fieldName: 'componentOwner', label: 'componentOwner'               },
  { section: 'component', fieldName: 'system',         label: 'system'                       },
  { section: 'component', fieldName: 'productType',    label: 'productType'                  },
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
  // Distribution flags — extended-search targets (SYS-045)
  { section: 'component', fieldName: 'distributionExplicit', label: 'distributionExplicit' },
  { section: 'component', fieldName: 'distributionExternal', label: 'distributionExternal' },
  // Build Fields — Appendix B
  { section: 'build', fieldName: 'buildSystem',   label: 'buildSystem'   },
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
// Section table
// ---------------------------------------------------------------------------

interface SectionTableProps {
  title: string
  rows: CatalogRow[]
  draft: DraftState
  onDraftChange: (key: string, patch: Partial<RowDraft>) => void
}

function SectionTable({ title, rows, draft, onDraftChange }: SectionTableProps) {
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
                  <Input
                    value={d.defaultValue}
                    onChange={(e) => onDraftChange(key, { defaultValue: e.target.value })}
                    className="h-8 text-xs"
                    placeholder="—"
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

  const [draft, setDraft] = useState<DraftState>({})
  const [savedFeedback, setSavedFeedback] = useState(false)

  // Initialise / reset draft from server data
  useEffect(() => {
    if (data === undefined) return
    const rawData = data as Record<string, unknown>
    const initial: DraftState = {}
    for (const row of CATALOG) {
      initial[rowKey(row)] = readEntry(rawData, row)
    }
    setDraft(initial)
  }, [data])

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
      reset[rowKey(row)] = readEntry(rawData, row)
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

  // ----- Loading state -----
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
      />

      {/* Build Fields table */}
      <SectionTable
        title="Build Fields"
        rows={BUILD_ROWS}
        draft={draft}
        onDraftChange={handleDraftChange}
      />

      {/* Jira Fields table */}
      <SectionTable
        title="Jira Fields"
        rows={JIRA_ROWS}
        draft={draft}
        onDraftChange={handleDraftChange}
      />

      {/* VCS Fields table */}
      <SectionTable
        title="VCS Fields"
        rows={VCS_ROWS}
        draft={draft}
        onDraftChange={handleDraftChange}
      />
    </div>
  )
}
