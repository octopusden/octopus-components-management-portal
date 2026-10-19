import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useProfilesForWizard } from './useProfilesForWizard'
import type { ComponentProfile } from './useComponentProfiles'
import { api } from '../lib/api'

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api')
  return { ...actual, api: { get: vi.fn() } }
})
const mockApi = vi.mocked(api)

const profile = (id: string): ComponentProfile => ({
  id,
  kind: 'regular',
  title: id,
  description: id,
  classification: { external: true, explicit: 'ask', solution: false },
  rules: [],
  usable: true,
})

function wrapperFor(client: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => React.createElement(QueryClientProvider, { client }, children)
}

beforeEach(() => vi.clearAllMocks())

describe('useProfilesForWizard', () => {
  it('never opens on a cached listing: it waits for the one fetched after mount', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(['component-profiles'], { profiles: [profile('cached')] })
    let resolve: (value: unknown) => void = () => {}
    mockApi.get.mockReturnValue(new Promise((r) => (resolve = r)))

    const { result } = renderHook(() => useProfilesForWizard(), { wrapper: wrapperFor(client) })
    expect(result.current.openedWith).toBeNull()

    resolve({ profiles: [profile('fresh')] })
    await waitFor(() => expect(result.current.openedWith?.map((p) => p.id)).toEqual(['fresh']))
  })

  it('reports the listing unavailable only while none has arrived', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    mockApi.get.mockRejectedValueOnce(new Error('down'))
    const { result } = renderHook(() => useProfilesForWizard(), { wrapper: wrapperFor(client) })
    await waitFor(() => expect(result.current.unavailable).toBe(true))

    mockApi.get.mockResolvedValueOnce({ profiles: [profile('back')] })
    result.current.retry()
    await waitFor(() => expect(result.current.openedWith?.map((p) => p.id)).toEqual(['back']))
    expect(result.current.unavailable).toBe(false)
  })
})
