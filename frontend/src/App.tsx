import { useState } from 'react'
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ComponentListPage } from './pages/ComponentListPage'
import { ComponentDetailPage } from './pages/ComponentDetailPage'
import { AuditLogPage } from './pages/AuditLogPage'
import { AdminSettingsPage } from './pages/AdminSettingsPage'
import { RegistryHealthPage } from './pages/RegistryHealthPage'
import { RequirePermission } from './components/RequirePermission'
import { PERMISSIONS, restoreContinuePath } from './lib/auth'
import { Toaster } from './components/ui/toaster'
import { TooltipProvider } from './components/ui/tooltip'

// If the user was deep-linked into a protected route, hit a 401, and was bounced
// through the OIDC flow, the post-login redirect lands them at "/". Replace history
// with the stashed deep-link path BEFORE the router mounts so React Router reads
// the corrected URL and renders the right page on first paint. No-op when there
// is nothing stashed.
restoreContinuePath()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
})

// A data router (createBrowserRouter), not the declarative <BrowserRouter>:
// the component editor's unsaved-changes guard uses react-router's `useBlocker`,
// which requires a data-router context. Behaviour is otherwise identical — same
// routes, same basename handling.
function buildRouter() {
  return createBrowserRouter(
    [
      { path: '/', element: <Navigate to="/components" replace /> },
      { path: '/components', element: <ComponentListPage /> },
      { path: '/components/:id', element: <ComponentDetailPage /> },
      {
        path: '/audit',
        element: (
          <RequirePermission permission={PERMISSIONS.ACCESS_AUDIT}>
            <AuditLogPage />
          </RequirePermission>
        ),
      },
      {
        path: '/health',
        element: (
          <RequirePermission permission={PERMISSIONS.IMPORT_DATA}>
            <RegistryHealthPage />
          </RequirePermission>
        ),
      },
      {
        path: '/admin',
        element: (
          <RequirePermission permission={PERMISSIONS.IMPORT_DATA}>
            <AdminSettingsPage />
          </RequirePermission>
        ),
      },
    ],
    { basename: import.meta.env.BASE_URL.replace(/\/$/, '') || '/' },
  )
}

export function App() {
  // Build the router once per App mount (reads window.location + basename at
  // mount). useState lazy-init keeps it stable across re-renders without
  // freezing the basename at module-load time (tests stub BASE_URL per render).
  const [router] = useState(buildRouter)
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={200}>
        <RouterProvider router={router} />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  )
}
