import { useMemo } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table'
import { InlineError } from '../ui/inline-error'
import { SkeletonBlock } from '../ui/skeleton-block'
import { useFieldConfig } from '../../hooks/useAdminConfig'
import { searchabilityFor } from '../../hooks/useFieldConfig'
import type {
  FieldConfigEntry,
  FieldVisibility,
  Searchable,
} from '../../hooks/useFieldConfig'
import { cn } from '../../lib/utils'

// Field configuration is code-as-config (managed in service-config), so this
// view is READ-ONLY. It renders the effective stored config (the registry_config
// cache synced from service-config); changes are made in service-config and
// applied via the "Reload" button on the Admin Settings page.

// ---------------------------------------------------------------------------
// Catalog — only fields with FC=Y or FC=partial (Appendix A + B)
// ---------------------------------------------------------------------------

interface CatalogRow {
  section: 'component' | 'build' | 'jira' | 'vcs'
  fieldName: string
  label: string
  /** Locked rows are mandatory server-side: visibility=editable, required=true. */
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
  { section: 'component', fieldName: 'groupId',        label: 'groupId',        locked: true },
  { section: 'component', fieldName: 'parentComponentName', label: 'parentComponentName' },
  { section: 'component', fieldName: 'canBeParent',         label: 'canBeParent'         },
  { section: 'component', fieldName: 'groupKey',            label: 'groupKey', locked: true },
  { section: 'component', fieldName: 'distributionExplicit', label: 'distributionExplicit' },
  { section: 'component', fieldName: 'distributionExternal', label: 'distributionExternal' },
  // Build Fields — Appendix B
  { section: 'build', fieldName: 'buildSystem',   label: 'buildSystem' },
  { section: 'build', fieldName: 'javaVersion',   label: 'javaVersion'   },
  { section: 'build', fieldName: 'gradleVersion', label: 'gradleVersion' },
  // Jira Fields
  { section: 'jira', fieldName: 'projectKey', label: 'projectKey' },
  { section: 'jira', fieldName: 'technical',  label: 'technical'  },
  // VCS Fields
  { section: 'vcs', fieldName: 'vcsPath', label: 'vcsPath' },
  { section: 'vcs', fieldName: 'branch',  label: 'branch'  },
]

// ---------------------------------------------------------------------------
// Types + read helpers
// ---------------------------------------------------------------------------

type SectionedConfig = {
  component: Record<string, FieldConfigEntry>
  build: Record<string, FieldConfigEntry>
  jira: Record<string, FieldConfigEntry>
  vcs: Record<string, FieldConfigEntry>
}

interface RowView {
  visibility: FieldVisibility
  required: boolean
  defaultValue: string
  description: string
  searchable: Searchable
}

function rowKey(row: CatalogRow): string {
  return `${row.section}.${row.fieldName}`
}

function readEntry(data: Record<string, unknown>, row: CatalogRow): RowView {
  const sectioned = data as Partial<SectionedConfig>
  const sectionData = sectioned[row.section] as Record<string, FieldConfigEntry> | undefined
  let entry: FieldConfigEntry | undefined = sectionData?.[row.fieldName]

  // Fallback to flat shape
  if (!entry) {
    const flat = data as { fields?: Record<string, FieldConfigEntry> }
    entry = flat.fields?.[`${row.section}.${row.fieldName}`] ?? flat.fields?.[row.fieldName]
  }

  // Shared resolver with the list page, so the editor shows exactly what the
  // ComponentFilters honour.
  const searchable = searchabilityFor(rowKey(row), entry ?? {})

  // Locked rows pin the mandatory-server-side contract values regardless of stored data.
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

// Visibility text-colour comes from semantic tokens defined in index.css `@theme`.
const VISIBILITY_CLASSES: Record<FieldVisibility, string> = {
  editable: 'text-[color:var(--color-visibility-editable-fg)]',
  readonly: 'text-[color:var(--color-visibility-readonly-fg)]',
  hidden:   'text-[color:var(--color-visibility-hidden-fg)]',
}

// ---------------------------------------------------------------------------
// Read-only section table
// ---------------------------------------------------------------------------

function SectionTable({
  title,
  rows,
  data,
}: {
  title: string
  rows: CatalogRow[]
  data: Record<string, unknown>
}) {
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
            const v = readEntry(data, row)
            return (
              <TableRow key={key}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs">{row.label}</span>
                    {row.locked && (
                      <span className="text-xs text-muted-foreground">(locked)</span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <span
                    className={cn('text-xs', VISIBILITY_CLASSES[v.visibility])}
                    data-visibility={v.visibility}
                    data-testid={`${key}-visibility`}
                  >
                    {v.visibility}
                  </span>
                </TableCell>
                <TableCell>
                  <input
                    type="checkbox"
                    role="checkbox"
                    aria-label={`${row.label} required`}
                    checked={v.required}
                    readOnly
                    disabled
                    className="h-4 w-4 rounded border-input accent-primary disabled:cursor-not-allowed disabled:opacity-70"
                  />
                </TableCell>
                <TableCell>
                  <span className="text-xs" data-searchable={v.searchable} data-testid={`${key}-searchable`}>
                    {v.searchable}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="font-mono text-xs" data-testid={`${key}-default`}>{v.defaultValue || '—'}</span>
                </TableCell>
                <TableCell>
                  <span className="font-mono text-xs text-muted-foreground">
                    {v.description || '—'}
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

  const rawData = useMemo(() => (data ?? {}) as Record<string, unknown>, [data])

  if (isLoading) {
    return (
      <div className="space-y-3">
        <SkeletonBlock height="h-4" width="w-1/4" />
        <SkeletonBlock height="h-64" width="w-full" />
      </div>
    )
  }

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
      <p className="text-sm text-muted-foreground">
        Effective visibility, required flag, searchability, and default values for each
        field, as configured in service-config (read-only). Use “Reload” above to re-fetch
        after a service-config change.
      </p>

      <SectionTable title="Component Fields" rows={COMPONENT_ROWS} data={rawData} />
      <SectionTable title="Build Fields" rows={BUILD_ROWS} data={rawData} />
      <SectionTable title="Jira Fields" rows={JIRA_ROWS} data={rawData} />
      <SectionTable title="VCS Fields" rows={VCS_ROWS} data={rawData} />
    </div>
  )
}
