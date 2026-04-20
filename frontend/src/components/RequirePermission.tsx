import { Navigate } from 'react-router'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { hasPermission } from '@/lib/auth'

interface RequirePermissionProps {
  permission: string
  fallback?: string
  children: React.ReactNode
}

/**
 * Gate a route by a permission check. Distinguishes three states so a transient backend
 * error doesn't get mistaken for "forbidden":
 *   - loading           → render nothing (initial /auth/me roundtrip)
 *   - error             → render an error banner with a retry, NOT a redirect
 *   - data === null     → user is unauthenticated; redirect to the fallback (gateway will
 *                         bounce to Keycloak on the next navigation)
 *   - data present      → grant or deny by permission
 */
export function RequirePermission({ permission, fallback = '/components', children }: RequirePermissionProps) {
  const { data: user, isLoading, isError, error, refetch } = useCurrentUser()

  if (isLoading) return null

  if (isError) {
    return (
      <div className="max-w-xl mx-auto mt-12 p-4 border border-destructive/40 rounded-md bg-destructive/5 text-sm">
        <div className="font-semibold mb-2">Auth check failed</div>
        <div className="text-muted-foreground mb-3">
          Could not verify your permissions: {error instanceof Error ? error.message : 'unknown error'}
        </div>
        <button
          onClick={() => refetch()}
          className="px-3 py-1.5 rounded-md border text-sm hover:bg-accent"
        >
          Retry
        </button>
      </div>
    )
  }

  if (user == null) return <Navigate to={fallback} replace />
  if (!hasPermission(user, permission)) return <Navigate to={fallback} replace />
  return <>{children}</>
}
