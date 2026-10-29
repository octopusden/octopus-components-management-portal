import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { asCodeSearchPath, useAsCodeSearch } from './useAsCodeSearch'
import { api, ApiError } from '../lib/api'

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

const emptyResponse = { query: 'x', regex: false, totalComponents: 0, truncated: false, results: [] }

beforeEach(() => vi.clearAllMocks())

describe('asCodeSearchPath', () => {
  it('sends only q for a plain substring search over all components', () => {
    expect(asCodeSearchPath({ query: '  org.example  ', regex: false })).toBe('/components/as-code/search?q=org.example')
  })

  it('adds regex, archived and limit when set', () => {
    expect(asCodeSearchPath({ query: 'a.*b', regex: true, archived: false, limit: 1000 })).toBe(
      '/components/as-code/search?q=a.*b&regex=true&archived=false&limit=1000',
    )
  })

  it('percent-encodes the query', () => {
    expect(asCodeSearchPath({ query: 'projectKey = "FOO"', regex: false })).toBe(
      '/components/as-code/search?q=projectKey+%3D+%22FOO%22',
    )
  })
})

describe('useAsCodeSearch', () => {
  it('fetches once the trimmed query reaches the server minimum', async () => {
    mockApi.get.mockResolvedValue(emptyResponse)
    const { result } = renderHook(() => useAsCodeSearch({ query: 'ab', regex: false }), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockApi.get).toHaveBeenCalledWith('/components/as-code/search?q=ab')
  })

  it('does not fire for a query shorter than the server minimum (no 400 per keystroke)', async () => {
    mockApi.get.mockResolvedValue(emptyResponse)
    renderHook(() => useAsCodeSearch({ query: ' a ', regex: false }), { wrapper: makeWrapper() })
    await new Promise((r) => setTimeout(r, 20))
    expect(mockApi.get).not.toHaveBeenCalled()
  })

  it('surfaces a 400 (e.g. invalid regex) as an error with the server message', async () => {
    mockApi.get.mockRejectedValue(new ApiError(400, 'Invalid regular expression: Unclosed group'))
    const { result } = renderHook(() => useAsCodeSearch({ query: '([a', regex: true }), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect((result.current.error as ApiError).message).toContain('Invalid regular expression')
  })
})
