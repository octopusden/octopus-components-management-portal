import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useComponents } from './useComponents'
import { api } from '../lib/api'
import type { Page, ComponentSummary } from '../lib/types'

vi.mock('../lib/api', () => ({
  api: {
    get: vi.fn(),
  },
}))

const mockApi = vi.mocked(api)

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
}

const emptyPage: Page<ComponentSummary> = {
  content: [],
  totalElements: 0,
  totalPages: 0,
  number: 0,
  size: 20,
  first: true,
  last: true,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useComponents — URL params', () => {
  it('requests page 0 with default size and sort', async () => {
    mockApi.get.mockResolvedValue(emptyPage)

    const { result } = renderHook(() => useComponents(), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const calledUrl = (mockApi.get as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    expect(calledUrl).toContain('page=0')
    expect(calledUrl).toContain('size=20')
    expect(calledUrl).toContain('sort=name%2Casc')
  })

  it('passes system filter when set', async () => {
    mockApi.get.mockResolvedValue(emptyPage)

    const { result } = renderHook(
      () => useComponents({ filter: { system: 'ALFA' } }),
      { wrapper: makeWrapper() },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const calledUrl = (mockApi.get as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    expect(calledUrl).toContain('system=ALFA')
  })

  it('passes archived filter when set', async () => {
    mockApi.get.mockResolvedValue(emptyPage)

    const { result } = renderHook(
      () => useComponents({ filter: { archived: true } }),
      { wrapper: makeWrapper() },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const calledUrl = (mockApi.get as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    expect(calledUrl).toContain('archived=true')
  })

  it('does not include system param when filter is undefined', async () => {
    mockApi.get.mockResolvedValue(emptyPage)

    const { result } = renderHook(() => useComponents(), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const calledUrl = (mockApi.get as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    expect(calledUrl).not.toContain('system=')
  })

  it('uses custom page and size', async () => {
    mockApi.get.mockResolvedValue(emptyPage)

    const { result } = renderHook(
      () => useComponents({ page: 3, size: 50 }),
      { wrapper: makeWrapper() },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const calledUrl = (mockApi.get as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    expect(calledUrl).toContain('page=3')
    expect(calledUrl).toContain('size=50')
  })

  it('passes productType filter when set', async () => {
    mockApi.get.mockResolvedValue(emptyPage)
    const { result } = renderHook(
      () => useComponents({ filter: { productType: 'LIBRARY' } }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const calledUrl = (mockApi.get as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    expect(calledUrl).toContain('productType=LIBRARY')
  })

  it('passes search filter when set', async () => {
    mockApi.get.mockResolvedValue(emptyPage)
    const { result } = renderHook(
      () => useComponents({ filter: { search: 'my-lib' } }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const calledUrl = (mockApi.get as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    expect(calledUrl).toContain('search=my-lib')
  })

  it('passes owner filter when set', async () => {
    mockApi.get.mockResolvedValue(emptyPage)
    const { result } = renderHook(
      () => useComponents({ filter: { owner: 'alice@example.com' } }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const calledUrl = (mockApi.get as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    expect(calledUrl).toContain('owner=alice%40example.com')
  })
})
