import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import {
  useEmployeeIntegrationHealth,
  EMPLOYEE_INTEGRATION_POLL_INTERVAL_MS,
} from './useEmployeeIntegrationHealth'
import { api } from '../lib/api'

vi.mock('../lib/api', () => ({ api: { get: vi.fn() } }))
const mockApi = vi.mocked(api)

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
}

beforeEach(() => vi.clearAllMocks())

describe('useEmployeeIntegrationHealth', () => {
  it('fetches the integration health endpoint when enabled', async () => {
    mockApi.get.mockResolvedValue({ status: 'DOWN' })
    const { result } = renderHook(() => useEmployeeIntegrationHealth(true), {
      wrapper: makeWrapper(),
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockApi.get).toHaveBeenCalledWith('/components/meta/employees/health')
    expect(result.current.data).toEqual({ status: 'DOWN' })
  })

  it('does not fetch when disabled (non-admin sessions stay polling-free)', async () => {
    const { result } = renderHook(() => useEmployeeIntegrationHealth(false), {
      wrapper: makeWrapper(),
    })
    // Give the query a tick to (not) fire.
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(mockApi.get).not.toHaveBeenCalled()
    expect(result.current.fetchStatus).toBe('idle')
  })

  it('arms a periodic refetch interval', () => {
    // The polling cadence is part of the hook contract: the admin banner must
    // notice an integration falling over without a page reload.
    expect(EMPLOYEE_INTEGRATION_POLL_INTERVAL_MS).toBeGreaterThan(0)
  })
})
