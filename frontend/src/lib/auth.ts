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
  DELETE_COMPONENTS: 'DELETE_COMPONENTS',
  IMPORT_DATA: 'IMPORT_DATA',
  ACCESS_AUDIT: 'ACCESS_AUDIT',
} as const

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
  document.body.appendChild(form)
  form.submit()
}
