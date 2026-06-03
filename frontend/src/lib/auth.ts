import { z } from 'zod'
import { readCookie } from './cookies'

// Runtime schema for /auth/me. Kept loose intentionally — extra fields the backend
// might add are ignored, but anything missing or wrong-typed surfaces as a query error
// rather than rendering with garbage. Keep this in sync with whatever the registry's
// /auth/me endpoint returns; if it evolves, update here so the SPA fails loudly.
const RoleSchema = z.object({
  name: z.string(),
  permissions: z.array(z.string()),
})

const UserSchema = z.object({
  username: z.string(),
  roles: z.array(RoleSchema),
  groups: z.array(z.string()),
})

export type Role = z.infer<typeof RoleSchema>
export type User = z.infer<typeof UserSchema>

export const PERMISSIONS = {
  ACCESS_COMPONENTS: 'ACCESS_COMPONENTS',
  EDIT_COMPONENTS: 'EDIT_COMPONENTS',
  ARCHIVE_COMPONENTS: 'ARCHIVE_COMPONENTS',
  RENAME_COMPONENTS: 'RENAME_COMPONENTS',
  DELETE_COMPONENTS: 'DELETE_COMPONENTS',
  IMPORT_DATA: 'IMPORT_DATA',
  ACCESS_AUDIT: 'ACCESS_AUDIT',
  // Admin-tier data administration — gates the raw Field-Overrides edit surface
  // (CRS maps it to ROLE_ADMIN in octopus-security.roles). Renamed from the legacy
  // ADMIN_DATA to match CRS PR #322; the old token no longer maps to any role, so
  // the raw-overrides gate was silently false for everyone until this fix.
  EDIT_METADATA: 'EDIT_METADATA',
} as const

// Must match Spring Security's registration id on the portal gateway:
// spring.security.oauth2.client.registration.<ID> in application.yaml, also
// referenced by SecurityConfig.OIDC_REGISTRATION_ID on the server.
export const OIDC_REGISTRATION_ID = 'keycloak'
export const OIDC_AUTHORIZE_PATH = `/oauth2/authorization/${OIDC_REGISTRATION_ID}`

// Key under which the SPA stashes the original deep-link path before bouncing to the
// OIDC entry point. After Spring's authorization-code flow lands the browser back at
// "/", the SPA's bootstrap (see restoreContinuePath) reads and clears it, replacing
// history with the original target. Using sessionStorage instead of a query param
// because Spring's OIDC redirect would strip our custom param somewhere along the
// /oauth2/authorization → IdP → /login/oauth2/code → / chain.
export const CONTINUE_PATH_STORAGE_KEY = 'octopus.portal.continuePath'

/**
 * Stash the current deep-link path so it can be restored after the OIDC bounce.
 * Only same-origin same-host relative paths are stored; absolute URLs are dropped
 * defensively to avoid open-redirect-style abuse if a future caller passes user
 * input through here.
 */
export function rememberContinuePath(path: string): void {
  if (!path.startsWith('/') || path.startsWith('//')) return
  try {
    sessionStorage.setItem(CONTINUE_PATH_STORAGE_KEY, path)
  } catch {
    // Quota exceeded / storage disabled (private mode in some browsers). Best-effort:
    // user just lands at "/" instead of the deep link, which is a harmless fallback.
  }
}

/**
 * On app boot, if a continue path was stashed before the OIDC bounce and we are at
 * the redirect landing page ("/"), replace history with the stashed path.
 * Returns the path we redirected to, or null if nothing to do.
 */
export function restoreContinuePath(): string | null {
  let stashed: string | null
  try {
    stashed = sessionStorage.getItem(CONTINUE_PATH_STORAGE_KEY)
  } catch {
    return null
  }
  if (!stashed) return null
  try {
    sessionStorage.removeItem(CONTINUE_PATH_STORAGE_KEY)
  } catch {
    // ignore — failing to clear is non-fatal, worst case the next bounce overwrites it
  }
  // Only restore if we actually landed on the post-login default page. If the user
  // is somewhere else (e.g. they typed a fresh URL), leave them alone.
  const here = window.location.pathname + window.location.search
  if (here !== '/' && here !== '') return null
  if (!stashed.startsWith('/') || stashed.startsWith('//')) return null
  window.history.replaceState(null, '', stashed)
  return stashed
}

export async function fetchCurrentUser(): Promise<User | null> {
  const res = await fetch('/auth/me', {
    credentials: 'include',
    // Match the API auth entry point: the portal's SecurityConfig returns a JSON 401
    // for XHR/API callers. Without this, unauthenticated GETs would 302-redirect to
    // Keycloak and `res.ok` would lie (the browser would follow silently).
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
  })
  if (res.status === 401) return null
  if (!res.ok) throw new Error(`auth/me ${res.status}`)
  const body: unknown = await res.json()
  const parsed = UserSchema.safeParse(body)
  if (!parsed.success) {
    // Surface as a query error rather than rendering with garbage. The shape mismatch
    // is a backend/frontend contract drift and should be visible, not silently swallowed.
    throw new Error(`auth/me: invalid response shape (${parsed.error.issues.length} issues)`)
  }
  return parsed.data
}

export function hasPermission(user: User | null | undefined, permission: string): boolean {
  return !!user && user.roles.some((r) => r.permissions.includes(permission))
}

export function logout(): void {
  const form = document.createElement('form')
  form.method = 'POST'
  form.action = '/logout'

  // Echo the CSRF token on the /logout POST. The cookie is written by Spring
  // Security's CookieServerCsrfTokenRepository (HttpOnly=false), and the
  // server-side handler accepts either the `_csrf` form field or the
  // X-XSRF-TOKEN header. Forms cannot set custom headers, so we use the field.
  const token = readCookie('XSRF-TOKEN')
  if (token) {
    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = '_csrf'
    input.value = token
    form.appendChild(input)
  }

  document.body.appendChild(form)
  form.submit()
  // form.submit() initiates navigation but does not detach the node. Schedule a
  // microtask cleanup so the DOM doesn't accumulate orphan <form> elements if the
  // navigation is cancelled (e.g. an interceptor / browser extension). Safe to remove
  // synchronously after submit() — the request has already been queued.
  queueMicrotask(() => form.remove())
}
