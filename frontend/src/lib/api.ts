import { OIDC_AUTHORIZE_PATH } from './auth'

const API_BASE = '/rest/api/4'

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'TRACE'])

function readCookie(name: string): string | null {
  const needle = `${name}=`
  const pairs = document.cookie ? document.cookie.split('; ') : []
  for (const pair of pairs) {
    if (pair.startsWith(needle)) return decodeURIComponent(pair.substring(needle.length))
  }
  return null
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
    // Anti-loop guard: skip if we're already in the OIDC flow.
    const pathname = window.location.pathname
    if (!pathname.startsWith('/login') && !pathname.startsWith('/oauth2')) {
      window.location.assign(OIDC_AUTHORIZE_PATH)
    }
    throw new ApiError(401, 'Unauthenticated')
  }
  if (!response.ok) {
    const errorBody = await response.text()
    throw new ApiError(response.status, errorBody || response.statusText)
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
