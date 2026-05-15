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
