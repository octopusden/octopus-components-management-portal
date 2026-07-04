import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useOptimisticConflict } from './useOptimisticConflict'
import { ApiError } from '../lib/api'
import type { ComponentDetail } from '../lib/types'

beforeEach(() => vi.clearAllMocks())

function makeHarness(seedComponent?: ComponentDetail) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  if (seedComponent) {
    queryClient.setQueryData(['component', seedComponent.id], seedComponent)
  }
  const refetchSpy = vi.spyOn(queryClient, 'refetchQueries')
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
  return { queryClient, refetchSpy, wrapper }
}

describe('useOptimisticConflict', () => {
  it('returns null for non-ApiError exceptions (so caller falls through)', async () => {
    const { wrapper } = makeHarness()
    const { result } = renderHook(() => useOptimisticConflict('c-1'), { wrapper })
    const out = await result.current(new Error('network'))
    expect(out).toBeNull()
  })

  it('returns null for ApiError that is not 409', async () => {
    const { wrapper } = makeHarness()
    const { result } = renderHook(() => useOptimisticConflict('c-1'), { wrapper })
    const out = await result.current(new ApiError(400, 'Bad', '{}'))
    expect(out).toBeNull()
  })

  it('on 409, refetches the component and returns describeOptimisticConflict output', async () => {
    const { refetchSpy, wrapper } = makeHarness({
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
    })
    const { result } = renderHook(() => useOptimisticConflict('c-1'), { wrapper })
    const out = await result.current(new ApiError(409, 'Conflict', '{}'))
    await waitFor(() => expect(refetchSpy).toHaveBeenCalledOnce())
    expect(refetchSpy).toHaveBeenCalledWith({ queryKey: ['component', 'c-1'], type: 'active' })
    expect(out).not.toBeNull()
    expect(out!.title).toBe('Save conflict')
    // describeOptimisticConflict includes the server's updatedAt in the body
    expect(out!.description).toContain('2026-05-17T12:00:00Z')
  })

  it('on 409 without a cached component, returns the generic conflict description', async () => {
    const { wrapper } = makeHarness()
    const { result } = renderHook(() => useOptimisticConflict('c-missing'), { wrapper })
    const out = await result.current(new ApiError(409, 'Conflict', '{}'))
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
    const { refetchSpy, wrapper } = makeHarness()
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
    expect(refetchSpy).not.toHaveBeenCalled()
  })

  it('OPTIMISTIC_LOCK → the reload-and-reapply flow (refetch + "Save conflict")', async () => {
    const { refetchSpy, wrapper } = makeHarness()
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
    await waitFor(() => expect(refetchSpy).toHaveBeenCalledOnce())
    expect(out!.kind).toBe('optimistic')
    expect(out!.title).toBe('Save conflict')
    expect(out!.description).toMatch(/another user/i)
  })

  it('other machine-coded 409 (e.g. DATA_INTEGRITY) → "Save failed" with the server message', async () => {
    const { refetchSpy, wrapper } = makeHarness()
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
    expect(refetchSpy).not.toHaveBeenCalled()
  })

  it('409 with no errorCode (older server) keeps the legacy optimistic-lock flow', async () => {
    const { refetchSpy, wrapper } = makeHarness()
    const { result } = renderHook(() => useOptimisticConflict('c-1'), { wrapper })
    const out = await result.current(
      new ApiError(409, 'some conflict', JSON.stringify({ errorMessage: 'some conflict' })),
    )
    await waitFor(() => expect(refetchSpy).toHaveBeenCalledOnce())
    expect(out!.title).toBe('Save conflict')
  })
})
