import { useFieldConfig } from './useAdminConfig'

export type FieldVisibility = 'editable' | 'readonly' | 'hidden'

/** Where a field appears in the list-page search (item 10). */
export type Searchable = 'Main' | 'Extended' | 'None'

export interface FieldConfigEntry {
  label?: string
  options?: string[]
  /** Form-level behavior on the component detail/create/edit page. */
  visibility?: FieldVisibility
  /**
   * Whether the field is exposed in the /components list-page filter bar.
   * `undefined` defaults to `true`; only `false` opts a field out.
   * Distinct from `visibility` — admins may want a filter for an
   * editor-hidden field, or hide a filter while keeping the field editable.
   */
  filterable?: boolean
  /**
   * Where this field appears in the list-page search: Main (always-visible
   * filter), Extended (only in extended-search mode), or None (not searchable).
   * Supersedes the legacy `filterable` flag — see `searchabilityFor`.
   */
  searchable?: Searchable
  required?: boolean
  defaultValue?: string
  description?: string
  overridable?: boolean
  locked?: boolean
}

/** Sectioned shape — ADR-011 write convention */
interface FieldConfigDataSectioned {
  component?: Record<string, FieldConfigEntry>
  build?: Record<string, FieldConfigEntry>
  jira?: Record<string, FieldConfigEntry>
  escrow?: Record<string, FieldConfigEntry>
  vcs?: Record<string, FieldConfigEntry>
}

/** Legacy flat shape */
interface FieldConfigDataFlat {
  fields?: Record<string, FieldConfigEntry>
}

type FieldConfigData = FieldConfigDataSectioned & FieldConfigDataFlat

const SECTION_ORDER = ['component', 'build', 'jira', 'escrow', 'vcs'] as const

/**
 * Resolves a field config entry supporting both flat and sectioned shapes
 * and both path conventions:
 *   - Section-prefixed:  "component.displayName", "build.javaVersion"
 *   - Bare:              "productType", "buildSystem"  (backward-compat)
 *
 * Graceful fallbacks: visibility → 'editable', required → false, defaultValue → undefined
 */
export function useFieldConfigEntry(fieldPath: string): {
  entry: FieldConfigEntry
  isLoading: boolean
  isError: boolean
} {
  const { data, isLoading, isError } = useFieldConfig()

  if (isLoading || !data) {
    return {
      entry: { visibility: 'editable', required: false },
      isLoading,
      isError: isError ?? false,
    }
  }

  const config = data as FieldConfigData

  const dotIndex = fieldPath.indexOf('.')
  const isSectionPrefixed = dotIndex !== -1

  let found: FieldConfigEntry | undefined

  if (isSectionPrefixed) {
    const section = fieldPath.slice(0, dotIndex) as keyof FieldConfigDataSectioned
    const fieldName = fieldPath.slice(dotIndex + 1)

    // Try sectioned shape first
    found = config[section]?.[fieldName]

    // Fallback: flat shape with full dotted path as key
    if (!found) {
      found = config.fields?.[fieldPath]
    }
  } else {
    // Bare path — try flat shape first
    found = config.fields?.[fieldPath]

    // Then try each section in order
    if (!found) {
      for (const section of SECTION_ORDER) {
        found = config[section]?.[fieldPath]
        if (found) break
      }
    }
  }

  const entry: FieldConfigEntry = {
    visibility: 'editable',
    required: false,
    ...found,
  }

  return { entry, isLoading: false, isError: isError ?? false }
}

/**
 * Thin backward-compat wrapper — returns only options array.
 * All new call-sites should use useFieldConfigEntry directly.
 */
export function useFieldConfigOptions(fieldPath: string): {
  options: string[]
  isLoading: boolean
} {
  const { entry, isLoading } = useFieldConfigEntry(fieldPath)
  return { options: entry.options ?? [], isLoading }
}

/**
 * Per-field default search placement, used when a field-config entry carries no
 * explicit `searchable` (the common case before an admin saves the catalog).
 * Main = today's always-visible filters; the new component/jira/vcs fields
 * default to Extended; versionable / noisy fields would be None.
 */
export const DEFAULT_SEARCHABILITY: Record<string, Searchable> = {
  'component.system': 'Main',
  buildSystem: 'Main',
  'build.buildSystem': 'Main',
  'component.labels': 'Main',
  'component.componentOwner': 'Main',
  'component.clientCode': 'Extended',
  'component.solution': 'Extended',
  'component.parentComponentName': 'Extended',
  'component.canBeParent': 'Extended',
  'component.groupKey': 'Extended',
  'component.distributionExplicit': 'Extended',
  'component.distributionExternal': 'Extended',
  'jira.projectKey': 'Extended',
  'jira.technical': 'Extended',
  'vcs.vcsPath': 'Extended',
  'vcs.branch': 'Extended',
}

/**
 * Effective search placement for a field: explicit `searchable`, else a legacy
 * `filterable === false` → 'None', else the DEFAULT_SEARCHABILITY map, else
 * 'Extended'. ComponentFilters reads THIS (not `entry.searchable`/`filterable`
 * directly) so a missing catalog entry still places the filter correctly.
 */
export function searchabilityFor(fieldPath: string, entry: FieldConfigEntry): Searchable {
  // Explicit placement wins (including 'None'); `!== undefined` rather than a
  // truthy check so the intent stays correct if Searchable ever gains a value
  // that JS treats as falsy.
  if (entry.searchable !== undefined) return entry.searchable
  if (entry.filterable === false) return 'None'
  return DEFAULT_SEARCHABILITY[fieldPath] ?? 'Extended'
}
