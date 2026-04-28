import { useEffect } from 'react'
import { Navigate } from 'react-router'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { hasPermission, OIDC_AUTHORIZE_PATH, rememberContinuePath } from '@/lib/auth'
import { Layout } from './Layout'

interface RequirePermissionProps {
  permission: string
  /** Where to send the user when they are authenticated but lack permission. */
  fallback?: string
  children: React.ReactNode
}

/**
 * Gate a route by a permission check. Distinguishes four states so a transient backend
 * error doesn't get mistaken for "forbidden":
 *   - loading           → render nothing (initial /auth/me roundtrip)
 *   - error             → render an error banner with a retry, NOT a redirect. Kept inside
 *                         Layout so the user still has header nav to escape.
 *   - data === null     → user is unauthenticated; trigger the OIDC entry point directly
 *                         (single navigation) and stash the deep-link for post-login restore
 *   - data present      → grant or deny by permission
 */
export function RequirePermission({ permission, fallback = '/components', children }: RequirePermissionProps) {
  const { data: user, isLoading, isError, error, refetch } = useCurrentUser()

  // For the unauthenticated case we kick the OIDC flow from an effect rather than
  // during render: side effects in render are illegal in React, and the stashed
  // continue-path is a side effect. We render null in the meantime; the navigation
  // tears down the SPA before any flash of empty content matters.
  const unauthenticated = !isLoading && !isError && user == null
  useEffect(() => {
    if (!unauthenticated) return
    rememberContinuePath(window.location.pathname + window.location.search)
    window.location.assign(OIDC_AUTHORIZE_PATH)
  }, [unauthenticated])

  if (isLoading) return null

  if (isError) {
    return (
      <Layout>
        <div className="max-w-xl mx-auto mt-12 p-4 border border-destructive/40 rounded-md bg-destructive/5 text-sm">
          <div className="font-semibold mb-2">Auth check failed</div>
          <div className="text-muted-foreground mb-3">
            Could not verify your permissions: {error instanceof Error ? error.message : 'unknown error'}
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            className="px-3 py-1.5 rounded-md border text-sm hover:bg-accent"
          >
            Retry
          </button>
        </div>
      </Layout>
    )
  }

  if (user == null) {
    // Effect above handles the actual navigation. Render nothing while the browser
    // tears the SPA down to load the OIDC entry point.
    return null
  }
  if (!hasPermission(user, permission)) return <Navigate to={fallback} replace />
  return <>{children}</>
}
