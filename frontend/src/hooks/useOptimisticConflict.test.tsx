import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useOptimisticConflict } from './useOptimisticConflict'
import { ApiError } from '../lib/api'
import type { ComponentDetail } from '../lib/types'

const apiMock = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>()
  return { ...actual, api: { ...actual.api, get: apiMock.get } }
})

beforeEach(() => {
  vi.clearAllMocks()
  apiMock.get.mockReset()
})

function makeHarness(seedComponent?: ComponentDetail) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  if (seedComponent) {
    queryClient.setQueryData(['component', seedComponent.id], seedComponent)
  }
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
  return { queryClient, wrapper }
}

const seedComponent: ComponentDetail = {
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

describe('useOptimisticConflict', () => {
  it('returns null for non-ApiError exceptions (so caller falls through)', async () => {
    const { wrapper } = makeHarness()
    const { result } = renderHook(() => useOptimisticConflict('c-1'), { wrapper })
    const out = await result.current(new Error('network'))
    expect(out).toBeNull()
    expect(apiMock.get).not.toHaveBeenCalled()
  })

  it('returns null for ApiError that is not 409', async () => {
    const { wrapper } = makeHarness()
    const { result } = renderHook(() => useOptimisticConflict('c-1'), { wrapper })
    const out = await result.current(new ApiError(400, 'Bad', '{}'))
    expect(out).toBeNull()
    expect(apiMock.get).not.toHaveBeenCalled()
  })

  it('on 409, refetches the component by UUID and returns describeOptimisticConflict output', async () => {
    const { wrapper } = makeHarness(seedComponent)
    apiMock.get.mockResolvedValue(seedComponent)
    const { result } = renderHook(() => useOptimisticConflict('c-1'), { wrapper })
    const out = await result.current(new ApiError(409, 'Conflict', '{}'))
    await waitFor(() => expect(apiMock.get).toHaveBeenCalledOnce())
    expect(apiMock.get).toHaveBeenCalledWith('/components/c-1')
    expect(out).not.toBeNull()
    expect(out!.title).toBe('Save conflict')
    // describeOptimisticConflict includes the server's updatedAt in the body
    expect(out!.description).toContain('2026-05-17T12:00:00Z')
  })

  it('on 409 without a cached component, returns the generic conflict description', async () => {
    const { wrapper } = makeHarness()
    // The refetch fails → falls back to the (empty) cache → generic message.
    apiMock.get.mockRejectedValue(new Error('network'))
    const { result } = renderHook(() => useOptimisticConflict('c-missing'), { wrapper })
    const out = await result.current(new ApiError(409, 'Conflict', '{}'))
    await waitFor(() => expect(apiMock.get).toHaveBeenCalledOnce())
    expect(out).not.toBeNull()
    expect(out!.title).toBe('Save conflict')
    expect(out!.description).toContain('another user')
  })

  // ── errorCode-aware dispatch (CRS #358 contract) ──────────────────────────
  // A 409 is NOT always an optimistic-lock conflict: uniqueness validation
  // (duplicate distribution GAV / jira pair / docker image / component name)
  // also returns 409. Misreporting those as "updated by another user" sends
  // the user into a futile reload loop — the QA incident this fixes.

  it('UNIQUENESS_VIOLATION → "Uniqueness violation" toast with the SERVER message, no refetch', async () => {
    const { wrapper } = makeHarness()
    const { result } = renderHook(() => useOptimisticConflict('c-1'), { wrapper })
    const serverMsg =
      "uniqueness violation: distribution GAV 'g:a:zip' of component 'a' duplicates component 'b' in intersecting version ranges '(,0),[0,)' ∩ '(,0),[0,)'"
    const out = await result.current(
      new ApiError(
        409,
        serverMsg,
        JSON.stringify({ errorMessage: serverMsg, errorCode: 'UNIQUENESS_VIOLATION' }),
      ),
    )
    expect(out).not.toBeNull()
    expect(out!.kind).toBe('value')
    expect(out!.title).toBe('Uniqueness violation')
    expect(out!.description).toBe(serverMsg)
    expect(out!.description).not.toMatch(/another user/i)
    // Reload would not help — the conflict is in the submitted values, not staleness.
    expect(apiMock.get).not.toHaveBeenCalled()
  })

  it('OPTIMISTIC_LOCK → the reload-and-reapply flow (refetch by UUID + "Save conflict")', async () => {
    const { wrapper } = makeHarness(seedComponent)
    apiMock.get.mockResolvedValue(seedComponent)
    const { result } = renderHook(() => useOptimisticConflict('c-1'), { wrapper })
    const out = await result.current(
      new ApiError(
        409,
        'Optimistic locking conflict: expected version 3 but found 5',
        JSON.stringify({
          errorMessage: 'Optimistic locking conflict: expected version 3 but found 5',
          errorCode: 'OPTIMISTIC_LOCK',
        }),
      ),
    )
    await waitFor(() => expect(apiMock.get).toHaveBeenCalledOnce())
    expect(out!.kind).toBe('optimistic')
    expect(out!.title).toBe('Save conflict')
    expect(out!.description).toMatch(/another user/i)
  })

  it('other machine-coded 409 (e.g. DATA_INTEGRITY) → "Save failed" with the server message', async () => {
    const { wrapper } = makeHarness()
    const { result } = renderHook(() => useOptimisticConflict('c-1'), { wrapper })
    const out = await result.current(
      new ApiError(
        409,
        'Data integrity violation: duplicate or invalid data',
        JSON.stringify({
          errorMessage: 'Data integrity violation: duplicate or invalid data',
          errorCode: 'DATA_INTEGRITY',
        }),
      ),
    )
    expect(out).not.toBeNull()
    expect(out!.kind).toBe('value')
    expect(out!.title).toBe('Save failed')
    expect(out!.description).toBe('Data integrity violation: duplicate or invalid data')
    expect(apiMock.get).not.toHaveBeenCalled()
  })

  it("RMS_REGISTERED_VALUE_CONFLICT → 'rms' kind, server message + 'no changes were saved', no refetch", async () => {
    const { wrapper } = makeHarness()
    const { result } = renderHook(() => useOptimisticConflict('c-1'), { wrapper })
    const serverMsg = "javaVersion '21' disagrees with the registered value '17' for range [2.0,3.0)"
    const out = await result.current(
      new ApiError(
        409,
        serverMsg,
        JSON.stringify({ errorMessage: serverMsg, errorCode: 'RMS_REGISTERED_VALUE_CONFLICT' }),
      ),
    )
    expect(out).not.toBeNull()
    expect(out!.kind).toBe('rms')
    expect(out!.title).not.toBe('Save failed')
    expect(out!.description).toBe(`${serverMsg}. No changes were saved.`)
    expect(apiMock.get).not.toHaveBeenCalled()
  })

  it('409 with no errorCode (older server) keeps the legacy optimistic-lock flow (refetch by UUID)', async () => {
    const { wrapper } = makeHarness(seedComponent)
    apiMock.get.mockResolvedValue(seedComponent)
    const { result } = renderHook(() => useOptimisticConflict('c-1'), { wrapper })
    const out = await result.current(
      new ApiError(409, 'some conflict', JSON.stringify({ errorMessage: 'some conflict' })),
    )
    await waitFor(() => expect(apiMock.get).toHaveBeenCalledOnce())
    expect(out!.title).toBe('Save conflict')
  })

  // ── Cache-alias mirroring and network-failure resilience ──────────────────

  it('with componentCacheKey ≠ UUID, the fresh snapshot is mirrored into the route-key cache entry', async () => {
    const { queryClient, wrapper } = makeHarness(seedComponent)
    const freshComponent = { ...seedComponent, version: 8, updatedAt: '2026-05-18T12:00:00Z' }
    apiMock.get.mockResolvedValue(freshComponent)
    const cacheKey = 'my-component-key'
    const { result } = renderHook(() => useOptimisticConflict('c-1', cacheKey), { wrapper })
    const out = await result.current(
      new ApiError(
        409,
        'conflict',
        JSON.stringify({ errorCode: 'OPTIMISTIC_LOCK', errorMessage: 'stale' }),
      ),
    )
    await waitFor(() => expect(apiMock.get).toHaveBeenCalledOnce())
    const cacheEntry = queryClient.getQueryData<ComponentDetail>(['component', cacheKey])
    expect(cacheEntry).toBeDefined()
    expect(cacheEntry!.version).toBe(8)
    expect(cacheEntry!.updatedAt).toBe('2026-05-18T12:00:00Z')
    expect(out!.description).toContain('2026-05-18T12:00:00Z')
  })

  it('network failure in the refetch does not throw and falls back to cached snapshot', async () => {
    const { wrapper } = makeHarness(seedComponent)
    apiMock.get.mockRejectedValue(new Error('network down'))
    const { result } = renderHook(() => useOptimisticConflict('c-1'), { wrapper })
    const out = await result.current(
      new ApiError(
        409,
        'conflict',
        JSON.stringify({ errorCode: 'OPTIMISTIC_LOCK', errorMessage: 'stale' }),
      ),
    )
    await waitFor(() => expect(apiMock.get).toHaveBeenCalledOnce())
    // No throw; description built from the cached seed.
    expect(out).not.toBeNull()
    expect(out!.title).toBe('Save conflict')
    expect(out!.description).toContain('2026-05-17T12:00:00Z')
  })

  it('an optimistic-lock 409 also invalidates the override baseline', async () => {
    // The refetch advances the version; without a baseline refresh a retry would
    // pair that fresh version with a stale desired-set and silently delete a
    // concurrently-added override row (PR review, high finding).
    const { queryClient, wrapper } = makeHarness(seedComponent)
    apiMock.get.mockResolvedValue(seedComponent)
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useOptimisticConflict('c-1'), { wrapper })
    const out = await result.current(
      new ApiError(
        409,
        'conflict',
        JSON.stringify({ errorCode: 'OPTIMISTIC_LOCK', errorMessage: 'stale' }),
      ),
    )
    expect(out!.kind).toBe('optimistic')
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['field-overrides', 'c-1'] })
  })
})
