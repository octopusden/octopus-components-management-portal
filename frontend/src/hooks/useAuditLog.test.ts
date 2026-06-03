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
    expect(result.current.isFetching).toBe(false)
    expect(mockApi.get).not.toHaveBeenCalled()
  })

  it('is disabled when entityType is empty', async () => {
    mockApi.get.mockResolvedValue(emptyPage)
    const { result } = renderHook(
      () => useEntityAuditLog('', 'abc-123'),
      { wrapper: makeWrapper() },
    )
    expect(result.current.isFetching).toBe(false)
    expect(mockApi.get).not.toHaveBeenCalled()
  })

  it('sends includeMigrated=true only when requested', async () => {
    mockApi.get.mockResolvedValue(emptyPage)
    const { result } = renderHook(
      () => useEntityAuditLog('Component', 'abc-123', { includeMigrated: true }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const url = (mockApi.get as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    expect(url).toContain('includeMigrated=true')
  })

  it('omits includeMigrated by default', async () => {
    mockApi.get.mockResolvedValue(emptyPage)
    const { result } = renderHook(
      () => useEntityAuditLog('Component', 'abc-123'),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const url = (mockApi.get as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    expect(url).not.toContain('includeMigrated')
  })
})

describe('useRecentAuditLog — filter params', () => {
  it('appends all filter fields to the query string', async () => {
    mockApi.get.mockResolvedValue(emptyPage)
    const { result } = renderHook(
      () =>
        useRecentAuditLog({
          filter: {
            entityType: 'component',
            entityId: 'cmp-1',
            changedBy: 'alice',
            source: 'api',
            action: 'UPDATE',
            from: '2026-04-01T00:00:00Z',
            to: '2026-04-30T23:59:59Z',
          },
        }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const url = (mockApi.get as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    expect(url).toContain('entityType=component')
    expect(url).toContain('entityId=cmp-1')
    expect(url).toContain('changedBy=alice')
    expect(url).toContain('source=api')
    expect(url).toContain('action=UPDATE')
    expect(url).toContain('from=')
    expect(url).toContain('to=')
  })

  it('omits includeMigrated by default and sends it only when true', async () => {
    mockApi.get.mockResolvedValue(emptyPage)
    const { result, rerender } = renderHook(
      ({ inc }: { inc: boolean }) => useRecentAuditLog({ filter: { includeMigrated: inc } }),
      { wrapper: makeWrapper(), initialProps: { inc: false } },
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const defaultUrl = (mockApi.get as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    expect(defaultUrl).not.toContain('includeMigrated')

    rerender({ inc: true })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const lastUrl = (mockApi.get as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0] as string
    expect(lastUrl).toContain('includeMigrated=true')
  })
})
