import { useQuery } from '@tanstack/react-query'
import { apiAbsolute } from '../lib/api'
import type { SystemMetrics } from '../lib/types'

// Live-ish refresh so uptime ticks and heap/CPU stay current while the page is
// open. Short enough to feel live, long enough not to hammer the BFF.
export const SYSTEM_METRICS_POLL_INTERVAL_MS = 10_000

/**
 * Poll `GET /portal/metrics` for the admin Runtime card. `/portal/metrics` lives
 * under BASE_URL (not /rest/api/4), so it goes through `apiAbsolute`.
 *
 * `enabled` MUST be the admin gate (admin mode on AND IMPORT_DATA): the Runtime
 * section is the only consumer and it self-gates, so a non-admin (or admin-mode
 * off) must generate no background traffic. `staleTime: 0` + a fresh poll keep
 * the snapshot current; `retry: false` because the next tick is seconds away.
 */
export function useSystemMetrics(enabled: boolean) {
  return useQuery<SystemMetrics>({
    queryKey: ['system', 'metrics'],
    queryFn: () => apiAbsolute.get<SystemMetrics>('/portal/metrics'),
    enabled,
    refetchInterval: SYSTEM_METRICS_POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    staleTime: 0,
    retry: false,
  })
}
