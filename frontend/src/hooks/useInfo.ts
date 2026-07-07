import { useQuery } from '@tanstack/react-query'
import type { CrsInfo, PortalConfig, PortalInfo, PortalLinks } from '../lib/types'
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
    // Include the URL so a failure names the endpoint (this helper is shared by
    // /portal/info, /portal/links and /portal/config).
    throw new Error(`fetch failed for ${url}: ${response.status}`)
  }
  return response.json() as Promise<T>
}

const QUERY_OPTIONS = {
  // These portal/runtime metadata endpoints are stable for the lifetime of the
  // loaded SPA; cache them as fresh so multiple consumers do not pile up
  // duplicate reads.
  staleTime: Infinity,
  // No retry: these endpoints are auxiliary, and a 5xx should fail closed
  // instead of blocking the surface that requested the metadata.
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

// /portal/config carries the solution-key patterns. It goes through the same
// plain `fetch` as /portal/links (NOT the `api` wrapper): /portal/config is not
// on the API 401-matcher in SecurityConfig, so an expired session yields a
// browser 302 rather than a clean 401 — the `api` wrapper's OIDC-redirect
// contract would not hold. On any failure the query just errors and the SPA
// treats patterns as absent (no Solution toggle); the page's authenticated
// /components fetch drives the real session-expiry redirect. Cached long —
// patterns change only via a service-config reload.
export function usePortalConfig() {
  return useQuery<PortalConfig>({
    queryKey: ['config', 'portal'],
    queryFn: () => fetchInfo<PortalConfig>(`${import.meta.env.BASE_URL}portal/config`),
    ...QUERY_OPTIONS,
  })
}

// Onboarding-video availability, on its OWN query key with its OWN cache policy —
// deliberately NOT the shared usePortalConfig (staleTime: Infinity), which would
// cache a first-load `loading`/`disabled` forever and never see the video go `ready`.
//
// The backend clones the media repo asynchronously at startup, so on first paint the
// status can be `loading`. We poll ONLY while `loading` and stop on any terminal state
// (`ready`/`disabled`/`failed`) — so a genuinely-off portal never polls, and a broken
// media repo (backend → `failed`) doesn't turn every browser into a backend retry loop.
// Backend-side recovery from `failed` is a slow scheduled re-clone; a tab picks that up
// on the next natural refetch (mount/focus), which is an accepted trade-off.
// Poll ONLY while the backend is still cloning (`loading`); stop on every terminal
// state. Exported so the polling decision is unit-testable without a live query.
export const ONBOARDING_VIDEO_POLL_MS = 4000
export function onboardingVideoRefetchInterval(status: PortalConfig['onboardingVideoStatus']): number | false {
  return status === 'loading' ? ONBOARDING_VIDEO_POLL_MS : false
}

export function useOnboardingVideoStatus() {
  return useQuery<PortalConfig>({
    queryKey: ['onboarding-video-status'],
    queryFn: () => fetchInfo<PortalConfig>(`${import.meta.env.BASE_URL}portal/config`),
    staleTime: 0,
    retry: false,
    refetchInterval: (query) => onboardingVideoRefetchInterval(query.state.data?.onboardingVideoStatus),
  })
}
