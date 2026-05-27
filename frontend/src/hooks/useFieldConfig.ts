import { useFieldConfig } from './useAdminConfig'

export type FieldVisibility = 'editable' | 'readonly' | 'hidden'

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
}

/** Legacy flat shape */
interface FieldConfigDataFlat {
  fields?: Record<string, FieldConfigEntry>
}

type FieldConfigData = FieldConfigDataSectioned & FieldConfigDataFlat

const SECTION_ORDER = ['component', 'build', 'jira', 'escrow'] as const

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
