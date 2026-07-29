/**
 * Label lookup for TeamCity validation finding `type`s. `type` is an open
 * string on the wire (see TeamcityValidation in lib/types.ts), so lookups
 * fall back to the raw type instead of throwing on an unrecognized value.
 * Add new entries here as backend validation rules are added.
 */
export const TEAMCITY_VALIDATION_TYPES: Record<string, { label: string }> = {
  USES_OLD_JAVA_VERSION: { label: 'Deprecated Java version' },
  HAS_CUSTOM_BUILD_STEP: { label: 'Custom build step' },
  OVERRIDES_DEFAULT_BUILD_STEP: { label: 'Modified default build step' },
  MULTIPLE_MAVEN_VERSIONS: { label: 'Multiple Maven versions' },
  ATTACHED_TO_BUILD_TEMPLATE: { label: 'Invalid template attachment count' },
  MULTIPLE_JAVA_VERSIONS: { label: 'Multiple Java versions' },
  JAVA_HOME_NOT_FROM_ENV: { label: 'Java declaration not from ENV' },
}

/** Label for a validation `type`, falling back to the raw type for unknown values. */
export function getTeamCityValidationTypeInfo(type: string): { label: string } {
  return TEAMCITY_VALIDATION_TYPES[type] ?? { label: type }
}

/**
 * CRS emits exactly one `type` per finding row (rows are stored under a
 * `(project_id, type)` key), so a comma-separated combo is not part of the
 * actual contract. This split is purely defensive/compatibility parsing —
 * harmless if a value ever does arrive comma-joined (e.g. from an older
 * backend or a hand-edited fixture) — not something callers should rely on
 * CRS producing.
 */
export function splitTeamCityValidationTypes(type: string): string[] {
  return type
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
}

/**
 * Visual tone for a validation `status`. Matches case-insensitively since the
 * status vocabulary isn't fixed: FAILED/ERROR-like → destructive (red),
 * WARN-like → warning (amber), PASSED/OK-like → success, anything else →
 * neutral. Names match <Badge>'s variant prop so callers can pass this
 * straight through as `<Badge variant={tone}>`.
 */
export type TeamCityValidationTone = 'default' | 'destructive' | 'warning' | 'success'

export function getTeamCityValidationStatusTone(status: string): TeamCityValidationTone {
  const s = status.toUpperCase()
  if (s.includes('FAIL') || s.includes('ERROR')) return 'destructive'
  if (s.includes('WARN')) return 'warning'
  if (s.includes('PASS') || s.includes('OK') || s.includes('SUCCESS') || s.includes('CLEAN')) return 'success'
  return 'default'
}
