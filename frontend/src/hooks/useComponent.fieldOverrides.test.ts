import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import {
  useCreateFieldOverride,
  useUpdateFieldOverride,
  useDeleteFieldOverride,
} from './useComponent'
import { api } from '../lib/api'

vi.mock('../lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    put: vi.fn(),
  },
}))

const mockApi = vi.mocked(api)

function makeHarness() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
  return { queryClient, invalidateSpy, wrapper }
}

beforeEach(() => vi.clearAllMocks())

const COMPONENT_ID = 'c-42'

describe('field-override mutations — cache invalidation', () => {
  it('useCreateFieldOverride invalidates both field-overrides AND component query', async () => {
    mockApi.post.mockResolvedValue({ id: 'fo-1' })
    const { invalidateSpy, wrapper } = makeHarness()

    const { result } = renderHook(() => useCreateFieldOverride(COMPONENT_ID), {
      wrapper,
    })

    result.current.mutate({
      overriddenAttribute: 'build.javaVersion',
      versionRange: '*',
      value: '21',
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const keys = invalidateSpy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey)
    expect(keys).toEqual(
      expect.arrayContaining([
        ['field-overrides', COMPONENT_ID],
        ['component', COMPONENT_ID],
      ]),
    )
  })

  it('useUpdateFieldOverride invalidates both field-overrides AND component query', async () => {
    mockApi.patch.mockResolvedValue({ id: 'fo-1' })
    const { invalidateSpy, wrapper } = makeHarness()

    const { result } = renderHook(() => useUpdateFieldOverride(COMPONENT_ID), {
      wrapper,
    })

    result.current.mutate({ overrideId: 'fo-1', value: '17' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const keys = invalidateSpy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey)
    expect(keys).toEqual(
      expect.arrayContaining([
        ['field-overrides', COMPONENT_ID],
        ['component', COMPONENT_ID],
      ]),
    )
  })

  it('useDeleteFieldOverride invalidates both field-overrides AND component query', async () => {
    mockApi.delete.mockResolvedValue(undefined)
    const { invalidateSpy, wrapper } = makeHarness()

    const { result } = renderHook(() => useDeleteFieldOverride(COMPONENT_ID), {
      wrapper,
    })

    result.current.mutate('fo-1')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const keys = invalidateSpy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey)
    expect(keys).toEqual(
      expect.arrayContaining([
        ['field-overrides', COMPONENT_ID],
        ['component', COMPONENT_ID],
      ]),
    )
  })
})

// Round-trip checks: the previous block pins cache invalidation; this block
// pins the actual HTTP shape (URL + body) so a refactor that points the
// hook at the wrong endpoint, drops the overrideId from the URL, or forwards
// a malformed body would trip a unit test before reaching e2e.
describe('field-override mutations — wire contract', () => {
  it('useCreateFieldOverride POSTs to /components/:id/field-overrides with the request body', async () => {
    mockApi.post.mockResolvedValue({ id: 'fo-1' })
    const { wrapper } = makeHarness()

    const { result } = renderHook(() => useCreateFieldOverride(COMPONENT_ID), { wrapper })
    const body = {
      overriddenAttribute: 'build.javaVersion',
      versionRange: '[11,12)',
      value: '21',
    }
    result.current.mutate(body)
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApi.post).toHaveBeenCalledOnce()
    expect(mockApi.post).toHaveBeenCalledWith(`/components/${COMPONENT_ID}/field-overrides`, body)
  })

  it('useCreateFieldOverride POSTs a marker body unchanged (markerChildren survives the hook)', async () => {
    mockApi.post.mockResolvedValue({ id: 'fo-mk' })
    const { wrapper } = makeHarness()

    const { result } = renderHook(() => useCreateFieldOverride(COMPONENT_ID), { wrapper })
    const body = {
      overriddenAttribute: 'build.requiredTools',
      versionRange: '*',
      value: null,
      markerChildren: { requiredTools: ['gradle-8.6', 'java-21'] },
    }
    result.current.mutate(body)
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApi.post).toHaveBeenCalledWith(`/components/${COMPONENT_ID}/field-overrides`, body)
  })

  it('useUpdateFieldOverride PATCHes /components/:id/field-overrides/:overrideId and strips overrideId from the body', async () => {
    mockApi.patch.mockResolvedValue({ id: 'fo-1' })
    const { wrapper } = makeHarness()

    const { result } = renderHook(() => useUpdateFieldOverride(COMPONENT_ID), { wrapper })
    result.current.mutate({
      overrideId: 'fo-1',
      versionRange: '[12,13)',
      value: '17',
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApi.patch).toHaveBeenCalledOnce()
    expect(mockApi.patch).toHaveBeenCalledWith(
      `/components/${COMPONENT_ID}/field-overrides/fo-1`,
      // overrideId is the path parameter, not part of the JSON body
      { versionRange: '[12,13)', value: '17' },
    )
  })

  it('useDeleteFieldOverride DELETEs /components/:id/field-overrides/:overrideId', async () => {
    mockApi.delete.mockResolvedValue(undefined)
    const { wrapper } = makeHarness()

    const { result } = renderHook(() => useDeleteFieldOverride(COMPONENT_ID), { wrapper })
    result.current.mutate('fo-9')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApi.delete).toHaveBeenCalledOnce()
    expect(mockApi.delete).toHaveBeenCalledWith(`/components/${COMPONENT_ID}/field-overrides/fo-9`)
  })
})
