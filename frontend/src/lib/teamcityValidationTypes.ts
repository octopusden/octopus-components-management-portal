/**
 * Label/description lookup for TeamCity validation finding `type`s, and a
 * status → visual-tone helper for `status`. Both `type` and `status` are open
 * strings on the wire (see TeamcityValidation in lib/types.ts) — the backend
 * validation sweep can introduce new kinds at any time, so every lookup here
 * falls back gracefully instead of throwing/crashing on an unrecognized value.
 *
 * NOTE: this map is intentionally a plain object literal with a handful of
 * placeholder entries — it will be filled in with the real finding types and
 * copy once the backend validation rules are finalized. Add new entries here;
 * nothing else needs to change (getTeamCityValidationTypeInfo already falls
 * back to the raw type for anything not yet listed).
 */
export const TEAMCITY_VALIDATION_TYPES: Record<string, { label: string; description: string }> = {
  BUILD_CONFIG_DRIFT: {
    label: 'Build config drift',
    description: 'The TeamCity build configuration no longer matches the registered component settings.',
  },
  VERSION_MISMATCH: {
    label: 'Version mismatch',
    description: 'The version built by this TeamCity project does not match the expected component version.',
  },
  MISSING_PROJECT: {
    label: 'Missing project',
    description: 'No matching TeamCity project could be found for this component.',
  },
}

/** Label/description for a validation `type`, falling back to the raw type for unknown values. */
export function getTeamCityValidationTypeInfo(type: string): { label: string; description: string } {
  return TEAMCITY_VALIDATION_TYPES[type] ?? { label: type, description: '' }
}

/**
 * Visual tone for a validation `status`. Case-insensitive substring matching
 * because the exact status vocabulary isn't finalized yet — `FAILED`/`ERROR`-
 * like strings read as destructive (red), `WARN`-like strings read as warning
 * (amber/yellow), `PASSED`/`OK`-like read as success, anything else
 * (including unrecognized future statuses) is neutral.
 */
export function getTeamCityValidationStatusTone(
  status: string,
): 'default' | 'destructive' | 'warning' | 'success' {
  const s = status.toUpperCase()
  if (s.includes('FAIL') || s.includes('ERROR')) return 'destructive'
  if (s.includes('WARN')) return 'warning'
  if (s.includes('PASS') || s.includes('OK') || s.includes('SUCCESS') || s.includes('CLEAN')) return 'success'
  return 'default'
}
