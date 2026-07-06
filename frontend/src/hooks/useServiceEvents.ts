import { useQuery } from '@tanstack/react-query'
import { api, ApiError } from '../lib/api'
import type { Page, ServiceEvent } from '../lib/types'

/** SYS-060 filter for `GET /admin/service-events`; each field independently optional. */
export interface ServiceEventFilter {
  eventType?: string
  source?: string
  status?: string
  /** ISO-8601 instant; closed lower bound (`>= from`). */
  from?: string
  /** ISO-8601 instant; open upper bound (`< to`). */
  to?: string
}

interface UseServiceEventsParams {
  page?: number
  size?: number
  filter?: ServiceEventFilter
}

const EMPTY_PAGE: Page<ServiceEvent> = {
  content: [],
  totalElements: 0,
  totalPages: 0,
  number: 0,
  size: 0,
  first: true,
  last: true,
}

/**
 * Paginated service-event journal, newest first. Degrades to an empty page on 404 —
 * the read endpoint is absent in the CRS no-db profile, and an empty Events tab is the
 * right "nothing recorded" state, not an error block (mirrors useMigrationJob's 404→null).
 */
export function useServiceEvents({
  page = 0,
  size = 20,
  filter,
}: UseServiceEventsParams = {}) {
  const params = new URLSearchParams()
  params.set('page', String(page))
  params.set('size', String(size))
  params.set('sort', 'startedAt,desc')
  if (filter?.eventType) params.set('eventType', filter.eventType)
  if (filter?.source) params.set('source', filter.source)
  if (filter?.status) params.set('status', filter.status)
  if (filter?.from) params.set('from', filter.from)
  if (filter?.to) params.set('to', filter.to)

  return useQuery({
    queryKey: ['service-events', { page, size, filter }],
    queryFn: async () => {
      try {
        return await api.get<Page<ServiceEvent>>(`/admin/service-events?${params.toString()}`)
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return EMPTY_PAGE
        throw err
      }
    },
    // Poll while a run is in flight so its terminal transition shows up promptly; idle otherwise.
    refetchInterval: (query) =>
      query.state.data?.content?.some((e) => e.status === 'RUNNING') ? 5000 : false,
  })
}
