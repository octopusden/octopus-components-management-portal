import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useHealthStatistics } from './useHealthStatistics'
import { api } from '../lib/api'
import type { HealthStatistics } from '../lib/types'

// The hook goes through the standard `api` client (so the URL resolves under
// /rest/api/4 and carries api.ts's 401/OIDC handling), mirroring useOwners et al.
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

const stats: HealthStatistics = {
  totalComponents: 42,
  activeComponents: 40,
  componentsByOwner: { alice: 10, bob: 5 },
  componentsByReleaseManager: { carol: 7 },
  componentsBySecurityChampion: { dan: 3 },
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useHealthStatistics', () => {
  it('GETs /health/statistics through the api client', async () => {
    mockApi.get.mockResolvedValue(stats)
    const { result } = renderHook(() => useHealthStatistics(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const calledUrl = (mockApi.get as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    expect(calledUrl).toBe('/health/statistics')
    expect(result.current.data).toEqual(stats)
  })

  it('surfaces the loading state before data arrives', () => {
    mockApi.get.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useHealthStatistics(), { wrapper: makeWrapper() })
    expect(result.current.isLoading).toBe(true)
    expect(result.current.data).toBeUndefined()
  })

  it('reports isError without throwing when the fetch fails', async () => {
    mockApi.get.mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => useHealthStatistics(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})
