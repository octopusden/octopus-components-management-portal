import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useSupportedGroups } from './useSupportedGroups'
import { ApiError, apiAbsolute } from '../lib/api'

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>()
  return { ...actual, apiAbsolute: { get: vi.fn() } }
})

const mockGet = vi.mocked(apiAbsolute.get)

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
}

beforeEach(() => vi.clearAllMocks())

describe('useSupportedGroups', () => {
  it('fetches the v2 supported-groups endpoint and returns the list', async () => {
    mockGet.mockResolvedValue(['com.acme', 'org.example'])
    const { result } = renderHook(() => useSupportedGroups(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.groups.length).toBeGreaterThan(0))
    expect(result.current.groups).toEqual(['com.acme', 'org.example'])
    expect(mockGet.mock.calls[0]![0]).toBe('/rest/api/2/common/supported-groups')
  })

  it('treats a 404 as an empty vocabulary (fail-open)', async () => {
    mockGet.mockRejectedValue(new ApiError(404, 'Not Found'))
    const { result } = renderHook(() => useSupportedGroups(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.groups).toEqual([])
  })

  it('falls back to [] on a non-404 error (fail-open, CRS stays authoritative)', async () => {
    mockGet.mockRejectedValue(new ApiError(500, 'boom'))
    const { result } = renderHook(() => useSupportedGroups(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.groups).toEqual([])
  })

  it('does not fetch when disabled', async () => {
    const { result } = renderHook(() => useSupportedGroups({ enabled: false }), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(mockGet).not.toHaveBeenCalled()
    expect(result.current.groups).toEqual([])
  })
})
