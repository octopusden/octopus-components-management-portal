import { useQuery } from '@tanstack/react-query'
import type { CrsInfo, PortalInfo } from '../lib/types'

// /portal/info and /rest/api/4/info are anonymous build-info endpoints used by
// the footer. They MUST go through plain `fetch` rather than the shared
// src/lib/api.ts wrapper — `api` redirects to OIDC on 401, which is correct
// for authenticated calls but would surface a noisy login redirect on a
// transient 5xx (or a misrouted 401) in the always-mounted footer.
//
// URL construction mirrors api.ts:4 — `${BASE_URL}<path>` so deployments under
// a sub-path (e.g. /components-management-portal/) reach the correct gateway.
// Both endpoints are permitAll on the portal SecurityConfig:
//   - /portal/info     → PortalInfoController (this app)
//   - /rest/api/4/info → CRS, proxied through Spring Cloud Gateway TokenRelay

async function fetchInfo<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: 'include' })
  if (!response.ok) {
    throw new Error(`info fetch failed: ${response.status}`)
  }
  return response.json() as Promise<T>
}

const QUERY_OPTIONS = {
  // Build info doesn't change for the lifetime of the page — caching forever
  // saves a round-trip when AppFooter and any debug surface both consume it.
  staleTime: Infinity,
  // No retry on the public footer query — a 5xx here should fail closed and
  // let AppFooter render its degraded "no version" string rather than blocking.
  retry: false,
}

export function useCrsInfo() {
  return useQuery<CrsInfo>({
    queryKey: ['info', 'crs'],
    queryFn: () => fetchInfo<CrsInfo>(`${import.meta.env.BASE_URL}rest/api/4/info`),
    ...QUERY_OPTIONS,
  })
}

export function usePortalInfo() {
  return useQuery<PortalInfo>({
    queryKey: ['info', 'portal'],
    queryFn: () => fetchInfo<PortalInfo>(`${import.meta.env.BASE_URL}portal/info`),
    ...QUERY_OPTIONS,
  })
}
