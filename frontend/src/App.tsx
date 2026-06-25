import { useState } from 'react'
import { createBrowserRouter, RouterProvider, Navigate, Outlet } from 'react-router'
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
import { CommandPalette } from './components/CommandPalette'
import { KeyboardShortcutsDialog } from './components/KeyboardShortcutsDialog'
import { useGlobalHotkeys } from './hooks/useGlobalHotkeys'

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

// Root layout route. Rendered inside the data router so the global command
// palette / shortcuts dialog and their hotkey listener have router context
// (the palette navigates on select), and the page routes render through the
// <Outlet/>. Lives in the router tree (not as a sibling of RouterProvider) so
// useGlobalHotkeys + CommandPalette can call useNavigate.
function AppShell() {
  useGlobalHotkeys()
  return (
    <>
      <Outlet />
      <CommandPalette />
      <KeyboardShortcutsDialog />
    </>
  )
}

// A data router (createBrowserRouter), not the declarative <BrowserRouter>:
// the component editor's unsaved-changes guard uses react-router's `useBlocker`,
// which requires a data-router context. Behaviour is otherwise identical — same
// routes, same basename handling. All page routes are children of the AppShell
// layout route so the palette stays mounted across navigations.
function buildRouter() {
  return createBrowserRouter(
    [
      {
        element: <AppShell />,
        children: [
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
