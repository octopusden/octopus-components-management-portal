import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useArchiveReadiness } from './useArchiveReadiness'
import { api } from '../lib/api'
import type { ArchiveReadinessResponse } from '../lib/types'

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

const readyAnswer: ArchiveReadinessResponse = {
  ready: true,
  entries: [
    {
      targetKind: 'REPOSITORY',
      targetId: 'https://bitbucket.example.com/scm/proj/repo.git',
      targetUrl: null,
      outcome: 'PASSED',
      reason: null,
      reasonKind: null,
      sharedWith: [],
      openIssues: [],
    },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useArchiveReadiness', () => {
  it('does not fetch until enabled', async () => {
    vi.useFakeTimers()
    try {
      mockApi.get.mockResolvedValue(readyAnswer)
      renderHook(() => useArchiveReadiness('comp-1', false), { wrapper: makeWrapper() })
      await vi.runAllTimersAsync()
      expect(mockApi.get).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('fetches once when enabled and exposes the verdict and entries', async () => {
    mockApi.get.mockResolvedValue(readyAnswer)
    const { result } = renderHook(() => useArchiveReadiness('comp-1', true), {
      wrapper: makeWrapper(),
    })
    await waitFor(() => expect(result.current.data).toBeDefined())

    expect(mockApi.get).toHaveBeenCalledTimes(1)
    expect(mockApi.get).toHaveBeenCalledWith('/components/comp-1/archive-readiness')
    expect(result.current.data?.ready).toBe(true)
    expect(result.current.data?.entries).toHaveLength(1)
  })

  it('surfaces a failed request as an error state, not an empty entry list', async () => {
    mockApi.get.mockRejectedValue(new Error('network down'))
    const { result } = renderHook(() => useArchiveReadiness('comp-1', true), {
      wrapper: makeWrapper(),
    })
    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(result.current.data).toBeUndefined()
  })

  it('replaces the previous entries on refetch rather than appending', async () => {
    const firstAnswer: ArchiveReadinessResponse = { ready: true, entries: [] }
    mockApi.get.mockResolvedValueOnce(firstAnswer).mockResolvedValueOnce(readyAnswer)

    const { result } = renderHook(() => useArchiveReadiness('comp-1', true), {
      wrapper: makeWrapper(),
    })
    await waitFor(() => expect(result.current.data?.entries).toEqual([]))

    await result.current.refetch()
    await waitFor(() => expect(result.current.data?.entries).toHaveLength(1))

    expect(result.current.data?.entries).toEqual(readyAnswer.entries)
  })
})
