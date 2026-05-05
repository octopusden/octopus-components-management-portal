import { OIDC_AUTHORIZE_PATH, rememberContinuePath } from './auth'
import { readCookie } from './cookies'

const API_BASE = `${import.meta.env.BASE_URL}rest/api/4`

export class ApiError extends Error {
  /** Raw response body text — always the full string from the server.
   *  Use this when you need to JSON.parse the structured error envelope
   *  (e.g. 409 MigrationJobResponse). Use `message` for display. */
  readonly rawBody: string

  constructor(public status: number, message: string, rawBody?: string) {
    super(message)
    this.name = 'ApiError'
    this.rawBody = rawBody ?? message
  }
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'TRACE'])

/**
 * True when the current document URL is part of the OIDC redirect dance and we
 * should NOT bounce again on a 401 (would loop). We match exact paths plus a
 * trailing-slash prefix so unrelated SPA routes like /login-help, /logout-confirm
 * or /oauth2-settings do not get treated as in-flow.
 */
function isInsideOidcFlow(pathname: string): boolean {
  return (
    pathname === '/login' ||
    pathname.startsWith('/login/') ||
    pathname === '/oauth2' ||
    pathname.startsWith('/oauth2/')
  )
}

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const method = (options?.method ?? 'GET').toUpperCase()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    // Signals the portal gateway to route this through the API auth entry point
    // (HTTP 401) instead of the browser OIDC redirect (302). The path-matcher in
    // SecurityConfig already covers /rest/**, so this header is belt-and-braces.
    'X-Requested-With': 'XMLHttpRequest',
    ...(options?.headers as Record<string, string> | undefined),
  }

  // Double-submit the CSRF token on state-changing requests. The portal's
  // WebFlux SecurityConfig uses CookieServerCsrfTokenRepository.withHttpOnlyFalse()
  // so the SPA can read the cookie and echo it here.
  if (!SAFE_METHODS.has(method)) {
    const token = readCookie('XSRF-TOKEN')
    if (token) headers['X-XSRF-TOKEN'] = token
  }

  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    ...options,
    headers,
  })
  if (response.status === 401) {
    // Session may be valid but the registry rejected the bearer (e.g. TokenRelay
    // couldn't refresh an expired access_token). Reloading / would hit the SPA
    // which issues /rest/... again → loop. Instead, explicitly trigger the
    // OAuth2 authorization entry point so the gateway starts a fresh login.
    // We stash the deep link in sessionStorage first so the post-login bootstrap
    // can put the user back where they were (the OIDC redirect chain strips any
    // custom query params we might attach here, so a query-param scheme would
    // not survive the round-trip).
    const pathname = window.location.pathname
    if (!isInsideOidcFlow(pathname)) {
      rememberContinuePath(pathname + window.location.search)
      window.location.assign(OIDC_AUTHORIZE_PATH)
    }
    throw new ApiError(401, 'Unauthenticated')
  }
  if (!response.ok) {
    const errorBody = await response.text()
    let message = errorBody || response.statusText
    try {
      const parsed: unknown = JSON.parse(errorBody)
      if (parsed !== null && typeof parsed === 'object') {
        const obj = parsed as Record<string, unknown>
        // CRS uses `errorMessage`; Spring Boot default uses `message`.
        const extracted = obj['errorMessage'] ?? obj['message']
        if (typeof extracted === 'string') message = extracted
      }
    } catch {
      // not JSON — use raw body as-is
    }
    throw new ApiError(response.status, message, errorBody)
  }
  if (response.status === 204) return undefined as T
  return response.json()
}

export const api = {
  get: <T>(path: string) => fetchApi<T>(path),
  post: <T>(path: string, body?: unknown) =>
    fetchApi<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body: unknown) =>
    fetchApi<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    fetchApi<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string) => fetchApi<T>(path, { method: 'DELETE' }),
}
