export interface Role {
  name: string
  permissions: string[]
}

export interface User {
  username: string
  roles: Role[]
  groups: string[]
}

export const PERMISSIONS = {
  ACCESS_COMPONENTS: 'ACCESS_COMPONENTS',
  EDIT_COMPONENTS: 'EDIT_COMPONENTS',
  ARCHIVE_COMPONENTS: 'ARCHIVE_COMPONENTS',
  RENAME_COMPONENTS: 'RENAME_COMPONENTS',
  DELETE_COMPONENTS: 'DELETE_COMPONENTS',
  IMPORT_DATA: 'IMPORT_DATA',
  ACCESS_AUDIT: 'ACCESS_AUDIT',
} as const

// Must match Spring Security's registration id on the portal gateway:
// spring.security.oauth2.client.registration.<ID> in application.yaml, also
// referenced by SecurityConfig.OIDC_REGISTRATION_ID on the server.
export const OIDC_REGISTRATION_ID = 'keycloak'
export const OIDC_AUTHORIZE_PATH = `/oauth2/authorization/${OIDC_REGISTRATION_ID}`

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
  return res.json()
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
  const token = readXsrfCookie()
  if (token) {
    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = '_csrf'
    input.value = token
    form.appendChild(input)
  }

  document.body.appendChild(form)
  form.submit()
}

function readXsrfCookie(): string | null {
  const needle = 'XSRF-TOKEN='
  const pairs = document.cookie ? document.cookie.split('; ') : []
  for (const pair of pairs) {
    if (pair.startsWith(needle)) return decodeURIComponent(pair.substring(needle.length))
  }
  return null
}
