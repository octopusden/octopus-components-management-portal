import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useRecentAuditLog, useEntityAuditLog } from './useAuditLog'
import { api } from '../lib/api'
import type { Page, AuditLogEntry } from '../lib/types'

vi.mock('../lib/api', () => ({ api: { get: vi.fn() } }))
const mockApi = vi.mocked(api)

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
}

const emptyPage: Page<AuditLogEntry> = {
  content: [], totalElements: 0, totalPages: 0, number: 0, size: 20, first: true, last: true,
}

beforeEach(() => vi.clearAllMocks())

describe('useRecentAuditLog', () => {
  it('fetches recent audit log with sort=changedAt,desc', async () => {
    mockApi.get.mockResolvedValue(emptyPage)
    const { result } = renderHook(() => useRecentAuditLog(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const url = (mockApi.get as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    expect(url).toContain('/audit/recent')
    expect(url).toContain('sort=changedAt%2Cdesc')
    expect(url).toContain('page=0')
  })

  it('passes custom page and size', async () => {
    mockApi.get.mockResolvedValue(emptyPage)
    const { result } = renderHook(
      () => useRecentAuditLog({ page: 2, size: 50 }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const url = (mockApi.get as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    expect(url).toContain('page=2')
    expect(url).toContain('size=50')
  })
})

describe('useEntityAuditLog', () => {
  it('fetches audit log for a specific entity', async () => {
    mockApi.get.mockResolvedValue(emptyPage)
    const { result } = renderHook(
      () => useEntityAuditLog('component', 'abc-123'),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const url = (mockApi.get as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    expect(url).toContain('/audit/component/abc-123')
  })

  it('is disabled when entityId is empty', async () => {
    mockApi.get.mockResolvedValue(emptyPage)
    const { result } = renderHook(
      () => useEntityAuditLog('component', ''),
      { wrapper: makeWrapper() },
    )
    // Should not fetch when disabled
    expect(result.current.isFetching).toBe(false)
    expect(mockApi.get).not.toHaveBeenCalled()
  })
})
