import { useState } from 'react'
import { createBrowserRouter, RouterProvider, Navigate, Outlet, type RouteObject } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ComponentListPage } from './pages/ComponentListPage'
import { ComponentDetailPage } from './pages/ComponentDetailPage'
import { CreateComponentPage } from './pages/CreateComponentPage'
import { AuditLogPage } from './pages/AuditLogPage'
import { AdminSettingsPage } from './pages/AdminSettingsPage'
import { RegistryHealthPage } from './pages/RegistryHealthPage'
import { RequirePermission } from './components/RequirePermission'
import { PERMISSIONS, restoreContinuePath } from './lib/auth'
import { Toaster } from './components/ui/toaster'
import { TooltipProvider } from './components/ui/tooltip'
import { CommandPalette } from './components/CommandPalette'
import { KeyboardShortcutsDialog } from './components/KeyboardShortcutsDialog'
import { OnboardingVideoDialog } from './components/OnboardingVideoDialog'
import { OnboardingVideoBanner } from './components/OnboardingVideoBanner'
import { RouteError } from './components/RouteError'
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
      <OnboardingVideoDialog />
      <OnboardingVideoBanner />
      {/* Inside the router tree (not a sibling of RouterProvider) so a toast
          action containing a <Link>/navigate still has router context. */}
      <Toaster />
    </>
  )
}

// A data router (createBrowserRouter), not the declarative <BrowserRouter>:
// the component editor's unsaved-changes guard uses react-router's `useBlocker`,
// which requires a data-router context. Behaviour is otherwise identical — same
// routes, same basename handling. All page routes are children of the AppShell
// layout route so the palette stays mounted across navigations.
// Exported so a test can pin that the AppShell layout route keeps its RouteError
// errorElement wired (the white-screen guard) — removing it must fail a test, not
// silently regress. (Non-component export in a component file is fine here; this module
// is the app entry, not a fast-refreshed leaf.)
// eslint-disable-next-line react-refresh/only-export-components
export const appRoutes: RouteObject[] = [
  {
    element: <AppShell />,
    // Catch any uncaught render/loader error from a page route and show a
    // recoverable surface instead of white-screening the whole SPA.
    errorElement: <RouteError />,
    children: [
      { path: '/', element: <Navigate to="/components" replace /> },
      { path: '/components', element: <ComponentListPage /> },
      // Static `/components/new` MUST be registered before the dynamic
      // `/components/:id` — React Router ranks static > dynamic, but we make the
      // order explicit (and pin it with a regression test) so the wizard route
      // is never shadowed by the detail route with id="new".
      { path: '/components/new', element: <CreateComponentPage /> },
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
]

function buildRouter() {
  return createBrowserRouter(appRoutes, {
    basename: import.meta.env.BASE_URL.replace(/\/$/, '') || '/',
  })
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
      </TooltipProvider>
    </QueryClientProvider>
  )
}
