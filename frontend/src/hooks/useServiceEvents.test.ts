import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useServiceEvents } from './useServiceEvents'
import { api, ApiError } from '../lib/api'
import type { Page, ServiceEvent } from '../lib/types'

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api')
  return { ...actual, api: { get: vi.fn() } }
})
const mockApi = vi.mocked(api)

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
}

const emptyPage: Page<ServiceEvent> = {
  content: [], totalElements: 0, totalPages: 0, number: 0, size: 20, first: true, last: true,
}

beforeEach(() => vi.clearAllMocks())

describe('useServiceEvents', () => {
  it('requests newest-first with page/size and passes filters', async () => {
    mockApi.get.mockResolvedValue(emptyPage)
    const { result } = renderHook(
      () => useServiceEvents({ filter: { eventType: 'STARTUP', status: 'FAILED' } }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const url = (mockApi.get as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    expect(url).toContain('/admin/service-events')
    expect(url).toContain('sort=startedAt%2Cdesc')
    expect(url).toContain('eventType=STARTUP')
    expect(url).toContain('status=FAILED')
  })

  it('passes the category filter (USER/SYSTEM split)', async () => {
    mockApi.get.mockResolvedValue(emptyPage)
    const { result } = renderHook(() => useServiceEvents({ filter: { category: 'USER' } }), {
      wrapper: makeWrapper(),
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const url = (mockApi.get as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    expect(url).toContain('category=USER')
  })

  it('degrades a 404 to an empty page (no-db profile), not an error', async () => {
    mockApi.get.mockRejectedValue(new ApiError(404, 'Not Found', ''))
    const { result } = renderHook(() => useServiceEvents(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.content).toEqual([])
  })
})
