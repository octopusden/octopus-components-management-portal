import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { AuditLogEntry, Page } from '../lib/types'

interface UseAuditLogParams {
  page?: number
  size?: number
}

/**
 * Filter shape for `GET /audit/recent` (B7.1.3 / SYS-036). Each field is
 * independently optional; combinations are ANDed server-side.
 */
export interface RecentAuditLogFilter {
  entityType?: string
  entityId?: string
  changedBy?: string
  source?: string
  action?: string
  /** ISO-8601 instant; lower bound is closed (`>= from`). */
  from?: string
  /** ISO-8601 instant; upper bound is open (`< to`). */
  to?: string
}

interface UseRecentAuditLogParams extends UseAuditLogParams {
  filter?: RecentAuditLogFilter
}

export function useRecentAuditLog({
  page = 0,
  size = 20,
  filter,
}: UseRecentAuditLogParams = {}) {
  const params = new URLSearchParams()
  params.set('page', String(page))
  params.set('size', String(size))
  params.set('sort', 'changedAt,desc')
  if (filter?.entityType) params.set('entityType', filter.entityType)
  if (filter?.entityId) params.set('entityId', filter.entityId)
  if (filter?.changedBy) params.set('changedBy', filter.changedBy)
  if (filter?.source) params.set('source', filter.source)
  if (filter?.action) params.set('action', filter.action)
  if (filter?.from) params.set('from', filter.from)
  if (filter?.to) params.set('to', filter.to)

  return useQuery({
    queryKey: ['audit', 'recent', { page, size, filter }],
    queryFn: () => api.get<Page<AuditLogEntry>>(`/audit/recent?${params.toString()}`),
  })
}

export function useEntityAuditLog(
  entityType: string,
  entityId: string,
  { page = 0, size = 20 }: UseAuditLogParams = {}
) {
  const params = new URLSearchParams()
  params.set('page', String(page))
  params.set('size', String(size))
  params.set('sort', 'changedAt,desc')

  return useQuery({
    queryKey: ['audit', entityType, entityId, { page, size }],
    queryFn: () =>
      api.get<Page<AuditLogEntry>>(`/audit/${entityType}/${entityId}?${params.toString()}`),
    enabled: !!entityType && !!entityId,
  })
}
