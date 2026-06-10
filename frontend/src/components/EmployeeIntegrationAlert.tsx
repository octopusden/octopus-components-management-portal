import { useAdminMode } from '@/lib/adminModeStore'
import { hasPermission, PERMISSIONS } from '@/lib/auth'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useEmployeeIntegrationHealth } from '@/hooks/useEmployeeIntegrationHealth'
import { StatusBanner } from './ui/status-banner'

/**
 * Red top-of-page alert for operators: the registry's employee-service
 * integration is DOWN, so person validation, owner statuses and the people
 * pickers are degraded (statuses show "Not verified", new people cannot be
 * committed).
 *
 * Double-gated like the ADMIN badge in Layout: admin-mode toggle AND the real
 * IMPORT_DATA permission — and the gate is passed INTO the polling hook, so a
 * non-admin session never generates health traffic. Only the DOWN state
 * renders; UP needs no banner and DISABLED is intentional configuration
 * (dev stands without employee-service), not an incident.
 */
export function EmployeeIntegrationAlert() {
  const { data: user } = useCurrentUser()
  const adminMode = useAdminMode((s) => s.enabled)
  const isAdmin = adminMode && hasPermission(user, PERMISSIONS.IMPORT_DATA)
  const { data } = useEmployeeIntegrationHealth(isAdmin)

  if (!isAdmin || data?.status !== 'DOWN') return null

  return (
    <StatusBanner
      variant="destructive"
      role="alert"
      data-testid="employee-integration-alert"
      className="rounded-none border-x-0 text-center"
    >
      Employee-service integration is down — person validation and owner statuses are degraded.
      Check the registry&apos;s employee-service credentials and connectivity.
    </StatusBanner>
  )
}
