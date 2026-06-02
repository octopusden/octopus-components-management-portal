import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useComponentAsCode } from './useComponentAsCode'
import { api, ApiError } from '../lib/api'

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api')
  return {
    ...actual,
    api: { getText: vi.fn() },
  }
})
const mockApi = vi.mocked(api)

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
}

const lastUrl = () =>
  (mockApi.getText as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0] as string

beforeEach(() => vi.clearAllMocks())

describe('useComponentAsCode', () => {
  it('FULL mode hits /components/{id}/as-code with no version', async () => {
    mockApi.getText.mockResolvedValue('bcomponent {\n}\n')
    const { result } = renderHook(() => useComponentAsCode('c1', { mode: 'full' }), {
      wrapper: makeWrapper(),
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toContain('bcomponent {')
    expect(lastUrl()).toBe('/components/c1/as-code')
  })

  it('RESOLVED mode appends an encoded version param', async () => {
    mockApi.getText.mockResolvedValue('resolved')
    const { result } = renderHook(
      () => useComponentAsCode('c1', { mode: 'resolved', version: '1.0 beta' }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(lastUrl()).toBe('/components/c1/as-code?version=1.0%20beta')
  })

  it('does not fire in RESOLVED mode when the version is blank', async () => {
    mockApi.getText.mockResolvedValue('x')
    renderHook(() => useComponentAsCode('c1', { mode: 'resolved', version: '  ' }), {
      wrapper: makeWrapper(),
    })
    await new Promise((r) => setTimeout(r, 20))
    expect(mockApi.getText).not.toHaveBeenCalled()
  })

  it('does not fire when id is empty', async () => {
    mockApi.getText.mockResolvedValue('x')
    renderHook(() => useComponentAsCode('', { mode: 'full' }), { wrapper: makeWrapper() })
    await new Promise((r) => setTimeout(r, 20))
    expect(mockApi.getText).not.toHaveBeenCalled()
  })

  it('surfaces a 404 as an error (not swallowed)', async () => {
    mockApi.getText.mockRejectedValue(new ApiError(404, 'No configuration resolves'))
    const { result } = renderHook(
      () => useComponentAsCode('c1', { mode: 'resolved', version: '9.9' }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect((result.current.error as ApiError).status).toBe(404)
  })
})
