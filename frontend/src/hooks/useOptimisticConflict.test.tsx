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
      displayName: null,
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
})
