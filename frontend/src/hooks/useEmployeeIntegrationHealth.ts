import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

/**
 * Wire shape of `GET /components/meta/employees/health` (always HTTP 200 —
 * the status lives in the body so "integration is DOWN" is distinguishable
 * from "the request itself failed").
 *
 * Hand-written pending the next CRS OpenAPI spec publication (the committed
 * v4.json is gated against the published spec and must not drift ahead of it).
 */
export type EmployeeIntegrationStatus = 'UP' | 'DOWN' | 'DISABLED'

export interface EmployeeIntegrationHealth {
  status: EmployeeIntegrationStatus
}

export const EMPLOYEE_INTEGRATION_POLL_INTERVAL_MS = 60_000

/**
 * Poll the employee-service integration health for the admin alert banner.
 *
 * `enabled` must be the admin gate (admin mode on AND IMPORT_DATA): the rest
 * of the SPA stays polling-free, and a non-admin localStorage toggle must not
 * generate background traffic. Polling (rather than a one-shot fetch) is the
 * point — the banner has to notice the integration falling over, and
 * recovering, without a page reload.
 */
export function useEmployeeIntegrationHealth(enabled: boolean) {
  return useQuery<EmployeeIntegrationHealth>({
    queryKey: ['meta', 'employees', 'health'],
    queryFn: () => api.get<EmployeeIntegrationHealth>('/components/meta/employees/health'),
    enabled,
    refetchInterval: EMPLOYEE_INTEGRATION_POLL_INTERVAL_MS,
    // Retrying a failed poll is pointless (the next tick is 60s away) and
    // would quadruple the wasted traffic against a registry that does not
    // expose the endpoint yet (pre-release 404s).
    retry: false,
  })
}
