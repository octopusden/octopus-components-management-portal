import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { api, ApiError } from '../lib/api'
import { useClientCodes } from './useClientCodes'
import { useJiraProjectKeys } from './useJiraProjectKeys'
import { useParentComponentNames } from './useParentComponentNames'
import { useGroupKeys } from './useGroupKeys'

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api')
  return { ...actual, api: { get: vi.fn() } }
})
const mockApi = vi.mocked(api)

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
}

beforeEach(() => vi.clearAllMocks())

// The four in-use meta-option dropdowns (SYS-046) share the useLabels contract:
// a lazy `enabled` gate, and 404/501 → empty vocabulary so the picker still
// opens against a CRS that has not yet shipped the endpoint.
const cases = [
  { name: 'useClientCodes', hook: useClientCodes, path: '/components/meta/client-codes' },
  { name: 'useJiraProjectKeys', hook: useJiraProjectKeys, path: '/components/meta/jira-project-keys' },
  { name: 'useParentComponentNames', hook: useParentComponentNames, path: '/components/meta/parent-component-names' },
  { name: 'useGroupKeys', hook: useGroupKeys, path: '/components/meta/group-keys' },
]

describe.each(cases)('$name', ({ hook, path }) => {
  it('fetches the option list from its endpoint', async () => {
    mockApi.get.mockResolvedValue(['A', 'B'])
    const { result } = renderHook(() => hook(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(['A', 'B'])
    expect((mockApi.get as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toBe(path)
  })

  it('treats 404 as an empty vocabulary (no error, data === [])', async () => {
    mockApi.get.mockRejectedValue(new ApiError(404, 'Not Found'))
    const { result } = renderHook(() => hook(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.isError).toBe(false)
    expect(result.current.data).toEqual([])
  })

  it('treats 501 as an empty vocabulary (no error, data === [])', async () => {
    mockApi.get.mockRejectedValue(new ApiError(501, 'Not Implemented'))
    const { result } = renderHook(() => hook(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([])
  })

  it('does not fire the request when enabled is false', async () => {
    mockApi.get.mockResolvedValue(['A'])
    renderHook(() => hook({ enabled: false }), { wrapper: makeWrapper() })
    // Give React Query a chance to (incorrectly) fire — assert it didn't.
    await new Promise((r) => setTimeout(r, 20))
    expect(mockApi.get).not.toHaveBeenCalled()
  })
})
