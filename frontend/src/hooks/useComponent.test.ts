import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { refreshComponentIntoCache } from './useComponent'
import type { ComponentDetail } from '../lib/types'

const apiMock = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>()
  return { ...actual, api: { ...actual.api, get: apiMock.get } }
})

const base: ComponentDetail = {
  id: 'c-1',
  name: 'svc',
  displayName: 'svc',
  componentOwner: null,
  productType: null,
  systems: [],
  clientCode: null,
  archived: false,
  solution: null,
  parentComponentName: null,
  version: 7,
  createdAt: null,
  updatedAt: '2026-05-17T12:00:00Z',
  labels: [],
  docs: [],
  artifactIds: [],
  securityGroups: [],
  teamcityProjects: [],
  configurations: [],
}

beforeEach(() => {
  vi.clearAllMocks()
  apiMock.get.mockReset()
})

describe('refreshComponentIntoCache', () => {
  const makeClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } })

  it('writes the fresh snapshot and mirrors it into the route-key entry', async () => {
    const queryClient = makeClient()
    apiMock.get.mockResolvedValue({ ...base, version: 13 })
    const out = await refreshComponentIntoCache(queryClient, 'c-1', 'my-key')
    expect(out?.version).toBe(13)
    expect(queryClient.getQueryData<ComponentDetail>(['component', 'c-1'])?.version).toBe(13)
    expect(queryClient.getQueryData<ComponentDetail>(['component', 'my-key'])?.version).toBe(13)
    expect(apiMock.get).toHaveBeenCalledWith('/components/c-1')
  })

  it('never lets a slower older response overwrite a newer cached save', async () => {
    const queryClient = makeClient()
    queryClient.setQueryData(['component', 'c-1'], { ...base, version: 12 })
    apiMock.get.mockResolvedValue({ ...base, version: 11 })
    const out = await refreshComponentIntoCache(queryClient, 'c-1', 'my-key')
    expect(out?.version).toBe(11)
    expect(queryClient.getQueryData<ComponentDetail>(['component', 'c-1'])?.version).toBe(12)
    expect(queryClient.getQueryData(['component', 'my-key'])).toBeUndefined()
  })

  // PR-272: the guard must consider BOTH cache entries. The visible route-key
  // entry can be NEWER than the UUID one (its own refetch landed a later save,
  // or the UUID entry was never seeded) — a delayed UUID response must not roll
  // the visible snapshot back.
  it('never rolls a newer route-key snapshot back via a delayed UUID response', async () => {
    const queryClient = makeClient()
    queryClient.setQueryData(['component', 'my-key'], { ...base, version: 12 })
    apiMock.get.mockResolvedValue({ ...base, version: 11 })
    const out = await refreshComponentIntoCache(queryClient, 'c-1', 'my-key')
    expect(out?.version).toBe(11)
    expect(queryClient.getQueryData(['component', 'c-1'])).toBeUndefined()
    expect(queryClient.getQueryData<ComponentDetail>(['component', 'my-key'])?.version).toBe(12)
  })

  // PR-272: while a route-key refetch is in flight, that refetch owns the
  // route-key entry — mirroring under it now would only be overwritten (and
  // could flash stale-then-new); the mirror must be skipped.
  it('skips the route-key mirror while a route-key refetch is in flight', async () => {
    const queryClient = makeClient()
    queryClient.setQueryData(['component', 'c-1'], { ...base, version: 10 })
    queryClient.setQueryData(['component', 'my-key'], { ...base, version: 10 })
    let resolveRk: (v: ComponentDetail) => void = () => {}
    const rkFetch = queryClient.fetchQuery({
      queryKey: ['component', 'my-key'],
      queryFn: () => new Promise<ComponentDetail>((res) => { resolveRk = res }),
    })
    apiMock.get.mockResolvedValue({ ...base, version: 12 })
    await refreshComponentIntoCache(queryClient, 'c-1', 'my-key')
    expect(queryClient.getQueryData<ComponentDetail>(['component', 'c-1'])?.version).toBe(12)
    expect(queryClient.getQueryData<ComponentDetail>(['component', 'my-key'])?.version).toBe(10)
    resolveRk({ ...base, version: 12 })
    await rkFetch
  })

  it('falls back to the cached snapshot when the fetch fails', async () => {
    const queryClient = makeClient()
    // Realistic: both cache entries hold the pre-refresh snapshot.
    queryClient.setQueryData(['component', 'c-1'], { ...base, version: 12 })
    queryClient.setQueryData(['component', 'my-key'], { ...base, version: 12 })
    apiMock.get.mockRejectedValue(new Error('network'))
    const out = await refreshComponentIntoCache(queryClient, 'c-1', 'my-key')
    expect(out?.version).toBe(12)
  })
})
