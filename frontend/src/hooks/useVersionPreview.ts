import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { components } from '../lib/api/schema'
import type { DetailedComponentVersion, FieldOverride } from '../lib/types'

export type VersionPreviewRequest = components['schemas']['VersionPreviewRequest']
export type VersionPreviewOverride = components['schemas']['VersionPreviewOverride']

// jira.* scalar format attributes the preview endpoint understands (everything
// on VersionPreviewOverride except versionRange). Other overridden attributes
// (build.*, distribution markers, …) don't affect version rendering.
const JIRA_FORMAT_FIELDS = [
  'minorVersionFormat',
  'releaseVersionFormat',
  'buildVersionFormat',
  'lineVersionFormat',
  'hotfixVersionFormat',
  'versionPrefix',
  'versionFormat',
] as const

/**
 * Fold the editor's effective field-overrides (one attribute per row) into the
 * preview endpoint's per-range override objects. Only jira.* scalar format
 * attributes are relevant; rows for other attributes (or non-string values) are
 * ignored. Overrides sharing a versionRange are merged into one entry.
 */
export function jiraOverridesToPreview(overrides: FieldOverride[]): VersionPreviewOverride[] {
  const byRange = new Map<string, VersionPreviewOverride>()
  for (const o of overrides) {
    if (!o.overriddenAttribute?.startsWith('jira.')) continue
    const field = o.overriddenAttribute.slice('jira.'.length)
    if (!(JIRA_FORMAT_FIELDS as readonly string[]).includes(field)) continue
    if (typeof o.value !== 'string') continue
    const entry = byRange.get(o.versionRange) ?? { versionRange: o.versionRange }
    ;(entry as Record<string, string>)[field] = o.value
    byRange.set(o.versionRange, entry)
  }
  return [...byRange.values()]
}

/**
 * Live version preview: renders the six version coordinates for `payload.version`
 * from the unsaved editor formats (base + per-range overrides) via the CRS
 * endpoint `POST /rest/api/4/versions/preview`. Returns a `DetailedComponentVersion`
 * (same shape the saved-config `detailed-version` call returned, so the preview
 * mapping is unchanged).
 *
 * The version is trimmed so the enabled gate, the query key and the request body
 * all agree (mirrors the useDetailedVersion trim contract). A blank version, a
 * version matching no format (404) or any 4xx makes `data` undefined — the panel
 * falls back to its notice.
 */
export function useVersionPreview(payload: VersionPreviewRequest, enabled: boolean) {
  const version = payload.version.trim()
  const body: VersionPreviewRequest = { ...payload, version }
  return useQuery<DetailedComponentVersion>({
    queryKey: ['version-preview', body],
    queryFn: () => api.post<DetailedComponentVersion>('/versions/preview', body),
    enabled: enabled && version.length > 0,
    retry: false,
    staleTime: 5 * 60_000,
  })
}
