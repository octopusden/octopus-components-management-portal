import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { api, ApiError } from '../lib/api'
import { keyMatchesTestPatterns, useTestComponentNamePatterns } from './useTestComponentNamePatterns'

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api')
  return { ...actual, api: { get: vi.fn() } }
})

describe('keyMatchesTestPatterns', () => {
  const P = ['^test-', '^cvelab-']
  it('matches any pattern with find semantics', () => {
    expect(keyMatchesTestPatterns('cvelab-app', P)).toBe(true)
    expect(keyMatchesTestPatterns('test-x', P)).toBe(true)
    expect(keyMatchesTestPatterns('my-test-x', P)).toBe(false)
    expect(keyMatchesTestPatterns('x-test', ['test'])).toBe(true)
  })
  it('an empty pattern list allows no key (CRS: nothing may be flagged)', () => {
    expect(keyMatchesTestPatterns('test-x', [])).toBe(false)
  })
  it('fails open when ANY pattern does not compile in JS (Java-only syntax) — CRS decides', () => {
    expect(keyMatchesTestPatterns('payments', ['('])).toBe(true)
    expect(keyMatchesTestPatterns('payments', ['(', '^test-'])).toBe(true)
  })
})

describe('useTestComponentNamePatterns', () => {
  function wrapper({ children }: { children: React.ReactNode }) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return React.createElement(QueryClientProvider, { client }, children)
  }
  beforeEach(() => vi.clearAllMocks())

  it('returns the configured patterns, including a real []', async () => {
    vi.mocked(api.get).mockResolvedValue([])
    const { result } = renderHook(() => useTestComponentNamePatterns(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(api.get).toHaveBeenCalledWith('/components/meta/test-component-name-patterns')
    expect(result.current.data).toEqual([])
  })

  it.each([404, 501])('maps %i (endpoint missing) to null = no restriction known', async (status) => {
    vi.mocked(api.get).mockRejectedValue(new ApiError(status, 'nope'))
    const { result } = renderHook(() => useTestComponentNamePatterns(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBeNull()
  })

  it('propagates other failures as errors', async () => {
    vi.mocked(api.get).mockRejectedValue(new ApiError(500, 'boom'))
    const { result } = renderHook(() => useTestComponentNamePatterns(), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})
