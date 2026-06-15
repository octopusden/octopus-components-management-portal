import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useValidationProblems, useComponentsWithProblems } from './useValidationProblems'
import { apiAbsolute } from '../lib/api'
import type { ValidationReport } from '../lib/types'

// The hook must go through `apiAbsolute` (the no-/rest/api/4-prefix variant that
// carries api.ts's 401/OIDC handling), NOT the anonymous fetchInfo helper.
vi.mock('../lib/api', () => ({
  apiAbsolute: {
    get: vi.fn(),
  },
}))

const mockApi = vi.mocked(apiAbsolute)

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
}

const report: ValidationReport = {
  generatedAt: '2026-06-13T10:00:00Z',
  lastAttemptAt: '2026-06-13T11:00:00Z',
  refreshError: null,
  components: [
    {
      component: 'example-component',
      problems: [
        {
          type: 'UNREGISTERED_RELEASED_VERSIONS',
          severity: 'ERROR',
          message: '1 released version(s) not registered in components-registry',
          details: {
            versions: ['ExampleService.1.0.1'],
            missingCount: 1,
            releasedCount: 5,
          },
        },
      ],
      checkFailed: false,
      checkError: null,
    },
    {
      component: 'broken-check-component',
      problems: [],
      checkFailed: true,
      checkError: 'RM returned 500',
    },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useValidationProblems', () => {
  it('GETs the full report (problemsOnly=false) through apiAbsolute', async () => {
    mockApi.get.mockResolvedValue(report)
    const { result } = renderHook(() => useValidationProblems(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.byComponent.size).toBeGreaterThan(0))

    const calledUrl = (mockApi.get as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    expect(calledUrl).toBe('/portal/validation/components?problemsOnly=false')
  })

  it('exposes a Map keyed by component id', async () => {
    mockApi.get.mockResolvedValue(report)
    const { result } = renderHook(() => useValidationProblems(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.byComponent.size).toBe(2))

    const cv = result.current.byComponent.get('example-component')
    expect(cv?.problems[0]?.type).toBe('UNREGISTERED_RELEASED_VERSIONS')
    expect(result.current.byComponent.get('broken-check-component')?.checkFailed).toBe(true)
  })

  it('surfaces generatedAt / lastAttemptAt / refreshError', async () => {
    const stale: ValidationReport = {
      ...report,
      refreshError: 'CRS component-list fetch timed out',
    }
    mockApi.get.mockResolvedValue(stale)
    const { result } = renderHook(() => useValidationProblems(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.refreshError).not.toBeNull())

    expect(result.current.generatedAt).toBe('2026-06-13T10:00:00Z')
    expect(result.current.lastAttemptAt).toBe('2026-06-13T11:00:00Z')
    expect(result.current.refreshError).toBe('CRS component-list fetch timed out')
  })

  it('returns an empty map (not a crash) before data arrives / on null fields', async () => {
    mockApi.get.mockResolvedValue({
      generatedAt: null,
      lastAttemptAt: null,
      refreshError: null,
      components: [],
    } satisfies ValidationReport)
    const { result } = renderHook(() => useValidationProblems(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.byComponent.size).toBe(0)
    expect(result.current.generatedAt).toBeNull()
  })

  it('reports isError without throwing when the fetch fails', async () => {
    mockApi.get.mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => useValidationProblems(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.byComponent.size).toBe(0)
  })
})

describe('useComponentsWithProblems', () => {
  it('GETs problemsOnly=true when enabled', async () => {
    mockApi.get.mockResolvedValue(report)
    const { result } = renderHook(() => useComponentsWithProblems(true), {
      wrapper: makeWrapper(),
    })
    await waitFor(() => expect(result.current.byComponent.size).toBe(2))
    const calledUrl = (mockApi.get as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    expect(calledUrl).toBe('/portal/validation/components?problemsOnly=true')
  })

  it('does not fetch when disabled', async () => {
    // Fake timers so we don't depend on a real-clock delay (flaky on slow CI):
    // flush every pending timer/microtask deterministically, then assert that a
    // disabled query never invoked the fetcher.
    vi.useFakeTimers()
    try {
      mockApi.get.mockResolvedValue(report)
      renderHook(() => useComponentsWithProblems(false), { wrapper: makeWrapper() })
      await vi.runAllTimersAsync()
      expect(mockApi.get).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})
