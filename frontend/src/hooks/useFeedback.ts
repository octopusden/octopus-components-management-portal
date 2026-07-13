import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../lib/api'
import type {
  FeedbackCreateRequest,
  FeedbackResponse,
  FeedbackStatus,
  Page,
} from '../lib/types'

/** SYS-062 filter for `GET /admin/feedback`; each field independently optional. */
export interface FeedbackAdminFilter {
  type?: string
  status?: string
}

interface UseFeedbackListParams {
  page?: number
  size?: number
  filter?: FeedbackAdminFilter
}

const EMPTY_PAGE: Page<FeedbackResponse> = {
  content: [],
  totalElements: 0,
  totalPages: 0,
  number: 0,
  size: 0,
  first: true,
  last: true,
}

/** Submit feedback (any authenticated user). Screenshots ride base64-in-JSON. */
export function useSubmitFeedback() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (request: FeedbackCreateRequest) => api.post<FeedbackResponse>('/feedback', request),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['feedback'] }),
  })
}

/**
 * Admin list of feedback, newest first. Degrades to an empty page on 404 — the admin
 * endpoint is absent in the CRS no-db profile (mirrors useServiceEvents).
 */
export function useFeedbackList({ page = 0, size = 20, filter }: UseFeedbackListParams = {}) {
  const params = new URLSearchParams()
  params.set('page', String(page))
  params.set('size', String(size))
  params.set('sort', 'createdAt,desc')
  if (filter?.type) params.set('type', filter.type)
  if (filter?.status) params.set('status', filter.status)

  return useQuery({
    queryKey: ['feedback', 'list', { page, size, filter }],
    queryFn: async () => {
      try {
        return await api.get<Page<FeedbackResponse>>(`/admin/feedback?${params.toString()}`)
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return EMPTY_PAGE
        throw err
      }
    },
  })
}

/** One feedback item with attachment metadata. */
export function useFeedbackItem(id: number | null) {
  return useQuery({
    queryKey: ['feedback', 'item', id],
    queryFn: () => api.get<FeedbackResponse>(`/admin/feedback/${id}`),
    enabled: id != null,
  })
}

/**
 * Count of open (not RESOLVED) feedback reports, for the admin header badge. Only fetched
 * when [enabled] (admin operator), and degrades to 0 on 404 (endpoint absent in no-db).
 */
export function useOpenFeedbackCount(enabled: boolean) {
  return useQuery({
    queryKey: ['feedback', 'open-count'],
    queryFn: async () => {
      try {
        return await api.get<{ open: number }>('/admin/feedback/open-count')
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return { open: 0 }
        throw err
      }
    },
    enabled,
    staleTime: 60_000,
  })
}

/** Change a feedback item's status (admin). */
export function useUpdateFeedbackStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: FeedbackStatus }) =>
      api.put<FeedbackResponse>(`/admin/feedback/${id}/status`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['feedback'] }),
  })
}

/**
 * Absolute URL for an attachment's bytes. A plain `<img src>` reaches it same-origin
 * (cookie → gateway TokenRelay → CRS IMPORT_DATA gate); it bypasses the `api` wrapper
 * (and its 401→OIDC redirect), which is acceptable for an inline image.
 */
export function feedbackAttachmentUrl(feedbackId: number, attachmentId: number): string {
  return `${import.meta.env.BASE_URL}rest/api/4/admin/feedback/${feedbackId}/attachments/${attachmentId}`
}
