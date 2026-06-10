import { useQuery } from '@tanstack/react-query'
import type { CrsInfo, PortalInfo, PortalLinks } from '../lib/types'
import { safeHttpUrl } from '../lib/utils'

// /portal/info and /rest/api/4/info are anonymous build-info endpoints used by
// the footer. They MUST go through plain `fetch` rather than the shared
// src/lib/api.ts wrapper — `api` redirects to OIDC on 401, which is correct
// for authenticated calls but would surface a noisy login redirect on a
// transient 5xx (or a misrouted 401) in the always-mounted footer.
//
// URL construction mirrors api.ts:4 — `${BASE_URL}<path>` so deployments under
// a sub-path (e.g. /components-management-portal/) reach the correct gateway.
// Anonymous endpoints on the portal SecurityConfig:
//   - /portal/info     → PortalInfoController (this app) — name + version only
//   - /rest/api/4/info → CRS, proxied through Spring Cloud Gateway TokenRelay
//
// Authenticated endpoint (falls through to default anyExchange().authenticated()):
//   - /portal/links    → PortalInfoController — four base URLs for icon links

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

// The four base URLs are templated into <a href> by every consumer
// (ComponentTable icon links, detail-page quick-links). Allowlisting http(s)
// here — the single point where the payload enters the SPA — guarantees a
// javascript:/data: value can never reach an href even if the backend or a
// proxy in front of it is compromised. Absence semantics are preserved:
// undefined (key omitted by Jackson) stays undefined, null stays null,
// non-http(s) becomes null.
function sanitizeLinks(raw: PortalLinks): PortalLinks {
  const clean = (url: string | null | undefined) => (url == null ? url : safeHttpUrl(url))
  return {
    jiraBaseUrl: clean(raw.jiraBaseUrl),
    gitBaseUrl: clean(raw.gitBaseUrl),
    tcBaseUrl: clean(raw.tcBaseUrl),
    dmsBaseUrl: clean(raw.dmsBaseUrl),
  }
}

export function usePortalLinks() {
  return useQuery<PortalLinks>({
    queryKey: ['links', 'portal'],
    queryFn: async () => sanitizeLinks(await fetchInfo<PortalLinks>(`${import.meta.env.BASE_URL}portal/links`)),
    ...QUERY_OPTIONS,
  })
}
