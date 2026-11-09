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
