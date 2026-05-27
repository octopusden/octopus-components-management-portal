import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useLabelsDictionary } from './useLabelsDictionary'
import { api, ApiError } from '../lib/api'

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api')
  return {
    ...actual,
    api: { get: vi.fn() },
  }
})
const mockApi = vi.mocked(api)

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
}

beforeEach(() => vi.clearAllMocks())

describe('useLabelsDictionary', () => {
  it('queries /components/meta/labels/dictionary under key [meta, labels-dictionary]', async () => {
    mockApi.get.mockResolvedValue(['alpha', 'beta'])
    const { result } = renderHook(() => useLabelsDictionary(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(['alpha', 'beta'])
    const url = (mockApi.get as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    expect(url).toBe('/components/meta/labels/dictionary')
  })

  it('treats 404 as an empty dictionary (endpoint not yet shipped)', async () => {
    mockApi.get.mockRejectedValue(new ApiError(404, 'Not Found'))
    const { result } = renderHook(() => useLabelsDictionary(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.isError).toBe(false)
    expect(result.current.data).toEqual([])
  })

  it('treats 501 as an empty dictionary (endpoint not yet shipped)', async () => {
    mockApi.get.mockRejectedValue(new ApiError(501, 'Not Implemented'))
    const { result } = renderHook(() => useLabelsDictionary(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.isError).toBe(false)
    expect(result.current.data).toEqual([])
  })

  it('propagates other failures as React Query errors', async () => {
    mockApi.get.mockRejectedValue(new ApiError(500, 'Server Down'))
    const { result } = renderHook(() => useLabelsDictionary(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.data).toBeUndefined()
  })
})
