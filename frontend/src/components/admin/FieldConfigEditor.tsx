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
import type { FieldConfigEntry, FieldVisibility } from '../../hooks/useFieldConfig'
import { cn } from '../../lib/utils'

// ---------------------------------------------------------------------------
// Catalog — only fields with FC=Y or FC=partial (Appendix A + B)
// ---------------------------------------------------------------------------

interface CatalogRow {
  /** Section key for output JSON: component | build */
  section: 'component' | 'build'
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
  // ui-swift-sloth §3.5: groupId is locked because the backend now makes
  // `group` mandatory. Admins keep defaultValue + description editing (used
  // by the Create dialog auto-suggest) but cannot flip visibility/required
  // away from the contract.
  { section: 'component', fieldName: 'groupId',        label: 'groupId',        locked: true },
  // TC link restoration — manual override pair (admin-gated).
  { section: 'component', fieldName: 'teamcityProjectId',  label: 'teamcityProjectId'  },
  { section: 'component', fieldName: 'teamcityProjectUrl', label: 'teamcityProjectUrl' },
  // Build Fields — Appendix B
  { section: 'build', fieldName: 'buildSystem',   label: 'buildSystem'   },
  { section: 'build', fieldName: 'javaVersion',   label: 'javaVersion'   },
  { section: 'build', fieldName: 'gradleVersion', label: 'gradleVersion' },
]

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SectionedConfig = {
  component: Record<string, FieldConfigEntry>
  build: Record<string, FieldConfigEntry>
}

type RowDraft = {
  visibility: FieldVisibility
  required: boolean
  defaultValue: string
  description: string
}

type DraftState = Record<string, RowDraft> // key = "section.fieldName"

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

  // PR #44 P3: locked rows pin visibility + required to the contract values.
  // `locked: true` means the field is mandatory server-side; the disabled UI
  // cells must reflect that truth regardless of stored data (fresh DB → no
  // entry; stale config with `hidden` / `required: false` → ignore the stale
  // values). defaultValue + description stay editable, so they round-trip
  // through the stored entry.
  if (row.locked) {
    return {
      visibility: 'editable',
      required: true,
      defaultValue: entry?.defaultValue ?? '',
      description: entry?.description ?? '',
    }
  }

  return {
    visibility: entry?.visibility ?? 'editable',
    required: entry?.required ?? false,
    defaultValue: entry?.defaultValue ?? '',
    description: entry?.description ?? '',
  }
}

function buildOutput(draft: DraftState): Record<string, unknown> {
  const component: Record<string, FieldConfigEntry> = {}
  const build: Record<string, FieldConfigEntry> = {}

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
    }
    if (d.defaultValue) entry.defaultValue = d.defaultValue
    if (d.description) entry.description = d.description

    if (row.section === 'component') {
      component[row.fieldName] = entry
    } else {
      build[row.fieldName] = entry
    }
  }

  return { component, build }
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
            <TableHead className="w-40">Default Value</TableHead>
            <TableHead>Description</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const key = rowKey(row)
            const d = draft[key] ?? { visibility: 'editable', required: false, defaultValue: '', description: '' }
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
      const existing = prev[key] ?? { visibility: 'editable' as FieldVisibility, required: false, defaultValue: '', description: '' }
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
          Configure visibility, required flag, and default values for each field.
          Changes are written in sectioned format per ADR-011.
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
    </div>
  )
}
