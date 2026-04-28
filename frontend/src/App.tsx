import { BrowserRouter, Routes, Route, Navigate } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ComponentListPage } from './pages/ComponentListPage'
import { ComponentDetailPage } from './pages/ComponentDetailPage'
import { AuditLogPage } from './pages/AuditLogPage'
import { AdminSettingsPage } from './pages/AdminSettingsPage'
import { RequirePermission } from './components/RequirePermission'
import { PERMISSIONS, restoreContinuePath } from './lib/auth'
import { Toaster } from './components/ui/toaster'

// If the user was deep-linked into a protected route, hit a 401, and was bounced
// through the OIDC flow, the post-login redirect lands them at "/". Replace history
// with the stashed deep-link path BEFORE the BrowserRouter mounts so React Router
// reads the corrected URL and renders the right page on first paint. No-op when
// there is nothing stashed.
restoreContinuePath()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
})


export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || '/'}>
        <Routes>
          <Route path="/" element={<Navigate to="/components" replace />} />
          <Route path="/components" element={<ComponentListPage />} />
          <Route path="/components/:id" element={<ComponentDetailPage />} />
          <Route
            path="/audit"
            element={
              <RequirePermission permission={PERMISSIONS.ACCESS_AUDIT}>
                <AuditLogPage />
              </RequirePermission>
            }
          />
          <Route
            path="/admin"
            element={
              <RequirePermission permission={PERMISSIONS.IMPORT_DATA}>
                <AdminSettingsPage />
              </RequirePermission>
            }
          />
        </Routes>
        <Toaster />
      </BrowserRouter>
    </QueryClientProvider>
  )
}
