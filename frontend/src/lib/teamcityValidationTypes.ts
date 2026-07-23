/**
 * Label lookup for TeamCity validation finding `type`s, and a status →
 * visual-tone helper for `status`. Both `type` and `status` are open strings
 * on the wire (see TeamcityValidation in lib/types.ts) — the backend
 * validation sweep can introduce new kinds at any time, so every lookup here
 * falls back gracefully instead of throwing/crashing on an unrecognized value.
 *
 * NOTE: this map is intentionally a plain object literal with a handful of
 * placeholder entries — it will be filled in with the real finding types and
 * copy once the backend validation rules are finalized. Add new entries here;
 * nothing else needs to change (getTeamCityValidationTypeInfo already falls
 * back to the raw type for anything not yet listed).
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
 * A finding's `type` is a comma-separated list of one or more type values
 * (a single finding can flag more than one rule) — split it into individual
 * types for display (one badge per type) or option-list building. Trims
 * whitespace and drops empty segments so a stray ", " doesn't produce a
 * blank badge.
 */
export function splitTeamCityValidationTypes(type: string): string[] {
  return type
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
}

/**
 * Known validation "categories" (i.e. sources) — a purely front-end concept,
 * NOT part of the `GET /admin/teamcity-validations` wire response (that
 * endpoint is TeamCity-only and has no `category` field). Every row shown
 * today is stamped with `TEAMCITY_VALIDATION_CATEGORIES[0]` client-side (see
 * `getTeamCityValidationCategory`) — this list exists so the Category
 * filter/column has something to render now, ahead of a real multi-source
 * backend. Add new sources here (and give getTeamCityValidationCategory real
 * per-row logic) once a second source actually ships.
 */
export const TEAMCITY_VALIDATION_CATEGORIES: string[] = ['TeamCity']

/**
 * Client-computed category for a finding row. Every row is TeamCity-sourced
 * today, so this always returns the one known category — a placeholder for
 * when a second validation source exists and this needs real per-row logic.
 */
export function getTeamCityValidationCategory(): string {
  return TEAMCITY_VALIDATION_CATEGORIES[0]!
}

/**
 * Visual tone for a validation `status`. Case-insensitive substring matching
 * because the exact status vocabulary isn't finalized yet — `FAILED`/`ERROR`-
 * like strings read as destructive (red), `WARN`-like strings read as warning
 * (amber/yellow), `PASSED`/`OK`-like read as success, anything else
 * (including unrecognized future statuses) is neutral.
 */
export type TeamCityValidationTone = 'default' | 'destructive' | 'warning' | 'success'

// Deliberately the same four names as <Badge>'s variant prop (ui/badge.tsx)
// — every caller can pass the tone straight through as `<Badge variant={tone}>`
// without a lookup table of its own.
export function getTeamCityValidationStatusTone(status: string): TeamCityValidationTone {
  const s = status.toUpperCase()
  if (s.includes('FAIL') || s.includes('ERROR')) return 'destructive'
  if (s.includes('WARN')) return 'warning'
  if (s.includes('PASS') || s.includes('OK') || s.includes('SUCCESS') || s.includes('CLEAN')) return 'success'
  return 'default'
}
