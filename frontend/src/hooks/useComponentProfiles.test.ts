import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useComponentProfiles, type ComponentProfile } from './useComponentProfiles'
import { api } from '../lib/api'

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api')
  return { ...actual, api: { get: vi.fn() } }
})
const mockApi = vi.mocked(api)

function makeWrapper(client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children)
}

function profile(id: string, overrides: Partial<ComponentProfile> = {}): ComponentProfile {
  return {
    id,
    kind: 'regular',
    title: id,
    description: `${id} description`,
    classification: { external: true, explicit: 'ask', solution: false },
    rules: [],
    usable: true,
    ...overrides,
  }
}

beforeEach(() => vi.clearAllMocks())

describe('useComponentProfiles', () => {
  it('returns the regular profiles in the order the registry sends them', async () => {
    mockApi.get.mockResolvedValue({ profiles: [profile('solution'), profile('regular-external')] })
    const { result } = renderHook(() => useComponentProfiles(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.map((p) => p.id)).toEqual(['solution', 'regular-external'])
    expect(mockApi.get).toHaveBeenCalledWith('/component-profiles')
  })

  it('drops entries whose kind is not regular', async () => {
    mockApi.get.mockResolvedValue({
      profiles: [profile('regular-external'), profile('ww-modpack', { kind: 'template' })],
    })
    const { result } = renderHook(() => useComponentProfiles(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.map((p) => p.id)).toEqual(['regular-external'])
  })

  it('refetches when a new consumer mounts, so a reloaded registry is seen on the next open', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    mockApi.get.mockResolvedValueOnce({ profiles: [profile('old-title')] })
    const first = renderHook(() => useComponentProfiles(), { wrapper: makeWrapper(client) })
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true))
    first.unmount()

    mockApi.get.mockResolvedValueOnce({ profiles: [profile('new-title')] })
    const second = renderHook(() => useComponentProfiles(), { wrapper: makeWrapper(client) })
    await waitFor(() => expect(second.result.current.data?.[0]?.id).toBe('new-title'))
    expect(mockApi.get).toHaveBeenCalledTimes(2)
  })

  it('exposes the error when the request fails, and refetch recovers', async () => {
    mockApi.get.mockRejectedValueOnce(new Error('registry unreachable'))
    const { result } = renderHook(() => useComponentProfiles(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))

    mockApi.get.mockResolvedValueOnce({ profiles: [profile('regular-external')] })
    await result.current.refetch()
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.map((p) => p.id)).toEqual(['regular-external'])
  })
})
