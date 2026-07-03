import { useQuery } from '@tanstack/react-query'
import { apiAbsolute } from '../lib/api'
import type { DetailedComponentVersion } from '../lib/types'

/**
 * Server-rendered version ladder for `component` at `version`, via the CRS
 * legacy endpoint `GET /rest/api/2/components/{component}/versions/{version}/detailed-version`.
 *
 * The values are produced by the real `org.octopusden.releng.versions` formatter,
 * so this is the only correct preview for build systems whose scheme the client
 * can't reproduce (Whiskey: zero-padding, library computation, custom variables).
 * It renders the component's SAVED configuration — not unsaved format edits.
 *
 * `retry: false` so a 404 (version the scheme can't parse) surfaces immediately
 * as a fall-back-to-notice instead of hanging the panel.
 */
export function useDetailedVersion(component: string, version: string, enabled: boolean) {
  // Normalise once so the gate, the query key and the request URL all agree — a
  // padded version (`"03.62.30.19-4 "`) must not fetch/cache a different string
  // than the one `enabled` accepted (Copilot #156).
  const c = component.trim()
  const v = version.trim()
  return useQuery<DetailedComponentVersion>({
    queryKey: ['detailed-version', c, v],
    queryFn: () =>
      apiAbsolute.get<DetailedComponentVersion>(
        `rest/api/2/components/${encodeURIComponent(c)}/versions/${encodeURIComponent(v)}/detailed-version`,
      ),
    enabled: enabled && c.length > 0 && v.length > 0,
    retry: false,
    staleTime: 5 * 60_000,
  })
}
