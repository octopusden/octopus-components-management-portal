import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useSupportedGroups } from './useSupportedGroups'
import { apiAbsolute, ApiError } from '../lib/api'

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api')
  return {
    ...actual,
    apiAbsolute: { get: vi.fn() },
  }
})
const mockApiAbsolute = vi.mocked(apiAbsolute)

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
}

beforeEach(() => vi.clearAllMocks())

describe('useSupportedGroups', () => {
  it('queries /rest/api/2/common/supported-groups via apiAbsolute under key [meta, supported-groups]', async () => {
    mockApiAbsolute.get.mockResolvedValue(['com.example', 'org.example'])
    const { result } = renderHook(() => useSupportedGroups(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(['com.example', 'org.example'])
    const url = (mockApiAbsolute.get as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    expect(url).toBe('/rest/api/2/common/supported-groups')
  })

  it('exposes 5xx as isError — does NOT silence to [] (endpoint already exists in CRS)', async () => {
    mockApiAbsolute.get.mockRejectedValue(new ApiError(500, 'Server Down'))
    const { result } = renderHook(() => useSupportedGroups(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.data).toBeUndefined()
  })

  it('exposes 404 as isError — already-existing endpoint, a 404 is a real failure', async () => {
    mockApiAbsolute.get.mockRejectedValue(new ApiError(404, 'Not Found'))
    const { result } = renderHook(() => useSupportedGroups(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.data).toBeUndefined()
  })

  it('exposes network failures as isError', async () => {
    mockApiAbsolute.get.mockRejectedValue(new TypeError('Failed to fetch'))
    const { result } = renderHook(() => useSupportedGroups(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.data).toBeUndefined()
  })
})
