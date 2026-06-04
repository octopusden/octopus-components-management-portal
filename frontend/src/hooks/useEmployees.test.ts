import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { lookupEmployee, useEmployeeStatuses } from './useEmployees'
import { api } from '../lib/api'

vi.mock('../lib/api', () => ({ api: { get: vi.fn(), post: vi.fn() } }))
const mockApi = vi.mocked(api)

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
}

beforeEach(() => vi.clearAllMocks())

describe('employee lookup hooks', () => {
  it('exact lookup calls /components/meta/employees with an encoded username', async () => {
    mockApi.get.mockResolvedValue([{ username: 'alice smith', active: true }])

    await expect(lookupEmployee(' alice smith ')).resolves.toEqual([
      { username: 'alice smith', active: true },
    ])
    expect(mockApi.get).toHaveBeenCalledWith('/components/meta/employees?search=alice%20smith')
  })

  it('batch status lookup trims, dedupes, and posts usernames', async () => {
    mockApi.post.mockResolvedValue({ alice: true, bob: false })

    const { result } = renderHook(
      () => useEmployeeStatuses([' bob ', 'alice', 'bob', '']),
      { wrapper: makeWrapper() },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockApi.post).toHaveBeenCalledWith('/components/meta/employees/status', ['alice', 'bob'])
    expect(result.current.data).toEqual({ alice: true, bob: false })
  })

  it('does not call the status endpoint for an empty username list', () => {
    renderHook(() => useEmployeeStatuses(['', '  ']), { wrapper: makeWrapper() })
    expect(mockApi.post).not.toHaveBeenCalled()
  })
})
