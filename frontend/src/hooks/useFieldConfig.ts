import { useFieldConfig } from './useAdminConfig'
import { useCurrentUser } from './useCurrentUser'
import { hasPermission, PERMISSIONS, type User } from '../lib/auth'

export type FieldVisibility = 'editable' | 'readonly' | 'hidden'

/**
 * Effective-editability axis (CRS field-config, separate from `visibility`):
 *   - `all` (or absent): editable by any component editor;
 *   - `adminOnly`: editable only by holders of EDIT_ANY_COMPONENT;
 *   - `none`: never editable (a synonym of `visibility: readonly`).
 */
export type FieldEditability = 'all' | 'adminOnly' | 'none'

/** Where a field appears in the list-page search (item 10). */
export type Searchable = 'Main' | 'Extended' | 'None'

export interface FieldConfigEntry {
  label?: string
  options?: string[]
  /** Form-level behavior on the component detail/create/edit page. */
  visibility?: FieldVisibility
  /**
   * Effective-editability axis, orthogonal to `visibility`. `adminOnly` gates
   * write access on EDIT_ANY_COMPONENT; `none` ≈ readonly. Absent → `all`.
   * The read endpoint / cache blob is user-agnostic — the portal computes the
   * per-user answer from this entry + the current user (see isFieldEditableFor).
   */
  editable?: FieldEditability
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
  /**
   * Distribution paths nest deeper than one dot (distribution.maven.groupPattern);
   * the resolver splits on the FIRST dot, so the field key within this section
   * keeps the remainder ("maven.groupPattern").
   */
  distribution?: Record<string, FieldConfigEntry>
}

/** Legacy flat shape */
interface FieldConfigDataFlat {
  fields?: Record<string, FieldConfigEntry>
}

type FieldConfigData = FieldConfigDataSectioned & FieldConfigDataFlat

const SECTION_ORDER = ['component', 'build', 'jira', 'escrow', 'vcs', 'distribution'] as const

/**
 * Resolves a field config entry supporting both flat and sectioned shapes
 * and both path conventions:
 *   - Section-prefixed:  "component.displayName", "build.javaVersion"
 *   - Bare:              "productType", "buildSystem"  (backward-compat)
 *
 * Graceful fallbacks: visibility → 'editable', required → false, defaultValue → undefined
 */
/**
 * Pure resolver (no hook) shared by `useFieldConfigEntry` and non-hook callers
 * (e.g. the create dialog builds its schema/visibility from a single
 * `useFieldConfig()` read rather than one hook per field). Supports both flat
 * and sectioned shapes and section-prefixed / bare paths. Falls back to
 * `{ visibility: 'editable', required: false }` when data is absent or the
 * field is unconfigured.
 */
export function resolveFieldEntry(data: unknown, fieldPath: string): FieldConfigEntry {
  const base: FieldConfigEntry = { visibility: 'editable', required: false }
  if (!data) return base

  const config = data as FieldConfigData
  const dotIndex = fieldPath.indexOf('.')
  const isSectionPrefixed = dotIndex !== -1

  let found: FieldConfigEntry | undefined

  if (isSectionPrefixed) {
    const section = fieldPath.slice(0, dotIndex) as keyof FieldConfigDataSectioned
    const fieldName = fieldPath.slice(dotIndex + 1)
    found = config[section]?.[fieldName]
    if (!found) found = config.fields?.[fieldPath]
  } else {
    found = config.fields?.[fieldPath]
    if (!found) {
      for (const section of SECTION_ORDER) {
        found = config[section]?.[fieldPath]
        if (found) break
      }
    }
  }

  return { ...base, ...found }
}

/** Visibility for a field path, defaulting to 'editable'. Pure (no hook). */
export function visibilityFor(data: unknown, fieldPath: string): FieldVisibility {
  return resolveFieldEntry(data, fieldPath).visibility ?? 'editable'
}

/**
 * Display label for a field path: the field-config `label` override when set
 * (trimmed), else the hardcoded fallback. Pure (no hook) so catalogue-style
 * consumers (OverrideRowEditor, editor tabs) can resolve many labels from a
 * single `useFieldConfig()` read.
 */
export function labelFor(data: unknown, fieldPath: string, fallback: string): string {
  return resolveFieldEntry(data, fieldPath).label?.trim() || fallback
}

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

  return { entry: resolveFieldEntry(data, fieldPath), isLoading: false, isError: isError ?? false }
}

/**
 * Effective editability of an already-resolved entry for a given user. Pure.
 * Non-editable axes (`none`, readonly, hidden) win regardless of the user;
 * `adminOnly` requires EDIT_ANY_COMPONENT (fails closed when the user is
 * null/undefined — `hasPermission` returns false); absent/`all` is
 * user-independent and always editable.
 */
function isEntryEditableFor(entry: FieldConfigEntry, user: User | null | undefined): boolean {
  if (entry.editable === 'none') return false
  if (entry.visibility === 'readonly' || entry.visibility === 'hidden') return false
  if (entry.editable === 'adminOnly') return hasPermission(user, PERMISSIONS.EDIT_ANY_COMPONENT)
  return true
}

/**
 * Pure effective-editability resolver: f(field-config blob, path, user). The
 * resolver resolves whatever `fieldPath` the caller passes — note the External
 * Registry key quirk: its write-enforcement key is `component.vcsExternalRegistry`
 * while its editor display path is `vcs.externalRegistry`; callers pass the path
 * they render against and the field-config must carry the `editable` axis on that
 * same path. Composable in non-hook contexts (create dialog schema/payload).
 */
export function isFieldEditableFor(
  data: unknown,
  fieldPath: string,
  user: User | null | undefined,
): boolean {
  return isEntryEditableFor(resolveFieldEntry(data, fieldPath), user)
}

/**
 * Hook form of isFieldEditableFor for a single field: composes the field-config
 * entry with the current user. Fails closed (returns false) while either the
 * field-config or the current-user query is still loading — an editor control
 * should never flash editable before we can confirm the user may edit it.
 */
export function useFieldEditable(fieldPath: string): boolean {
  const { entry, isLoading: fcLoading } = useFieldConfigEntry(fieldPath)
  const { data: user, isLoading: userLoading } = useCurrentUser()
  if (fcLoading || userLoading) return false
  return isEntryEditableFor(entry, user)
}

/** Convenience hook for a single field's display label (see labelFor). */
export function useFieldLabel(fieldPath: string, fallback: string): string {
  const { data } = useFieldConfig()
  return labelFor(data, fieldPath, fallback)
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
