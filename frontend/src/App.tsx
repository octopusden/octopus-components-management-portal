import { BrowserRouter, Routes, Route, Navigate } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ComponentListPage } from './pages/ComponentListPage'
import { ComponentDetailPage } from './pages/ComponentDetailPage'
import { AuditLogPage } from './pages/AuditLogPage'
import { AdminSettingsPage } from './pages/AdminSettingsPage'
import { RequirePermission } from './components/RequirePermission'
import { PERMISSIONS } from './lib/auth'
import { Toaster } from './components/ui/toaster'

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
      <BrowserRouter>
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
