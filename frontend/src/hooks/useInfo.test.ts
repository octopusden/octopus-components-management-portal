import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useCrsInfo, usePortalInfo } from './useInfo'

// useInfo deliberately does NOT use the shared api wrapper from src/lib/api.ts.
// `api` redirects to /oauth2/authorization/<id> on 401, which is the right
// behavior for authenticated endpoints — but /portal/info and /rest/api/4/info
// are anonymous build-info endpoints that the footer queries before login.
// Bouncing to OIDC on a transient 5xx (or a misrouted 401 mid-OIDC dance)
// would break the footer's degraded-mode promise: "render the labels you can,
// silently drop the rest." So this test pins:
//   1. URLs are computed from import.meta.env.BASE_URL — same convention as
//      api.ts:4 — otherwise sub-path deployments break.
//   2. staleTime is effectively infinite so two consumers (e.g. AppFooter
//      and a debug page) don't pile up duplicate /info requests.
//   3. A 5xx surfaces as isError without ever invoking
//      window.location.assign (i.e. no OIDC redirect).
//   4. (Same guard, in stricter form) a 401 also stays in isError — covers
//      the case where TokenRelay forwards anonymous through and CRS/portal
//      respond 401 transiently.

const assignSpy = vi.fn()
const originalLocation = window.location
const fakeLocation: Location = {
  ...originalLocation,
  assign: (url: string | URL) => assignSpy(String(url)),
} as Location

beforeEach(() => {
  assignSpy.mockReset()
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: { ...fakeLocation, pathname: '/components', search: '' },
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.resetModules()
})

afterAll(() => {
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: originalLocation,
  })
})

function makeWrapper(client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children)
}

describe('useCrsInfo', () => {
  it('GETs ${BASE_URL}rest/api/4/info and parses the JSON body', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ name: 'crs', version: '3.1.4' }), { status: 200 }))
    vi.stubGlobal('fetch', mockFetch)

    const { result } = renderHook(() => useCrsInfo(), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const calledUrl = mockFetch.mock.calls[0]![0] as string
    expect(calledUrl).toBe(`${import.meta.env.BASE_URL}rest/api/4/info`)
    expect(result.current.data).toEqual({ name: 'crs', version: '3.1.4' })
  })

  it('honors deployment sub-path BASE_URL', async () => {
    vi.stubEnv('BASE_URL', '/components-management-portal/')
    vi.resetModules()
    const { useCrsInfo: freshHook } = await import('./useInfo')
    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ name: 'crs', version: '3.1.4' }), { status: 200 }))
    vi.stubGlobal('fetch', mockFetch)

    const { result } = renderHook(() => freshHook(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockFetch.mock.calls[0]![0]).toBe('/components-management-portal/rest/api/4/info')
  })

  it('5xx surfaces as isError without redirecting to OIDC', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('boom', { status: 503 })),
    )

    const { result } = renderHook(() => useCrsInfo(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(assignSpy).not.toHaveBeenCalled()
  })

  it('401 also stays in isError — never redirects to OIDC for the anonymous footer endpoint', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('nope', { status: 401 })),
    )

    const { result } = renderHook(() => useCrsInfo(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(assignSpy).not.toHaveBeenCalled()
  })

  it('does not refetch within the same QueryClient session (staleTime Infinity)', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ name: 'crs', version: '3.1.4' }), { status: 200 }))
    vi.stubGlobal('fetch', mockFetch)
    const sharedClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    const first = renderHook(() => useCrsInfo(), { wrapper: makeWrapper(sharedClient) })
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true))

    // Mount a second consumer of the same key against the same client. With
    // staleTime: Infinity, react-query treats the cached entry as fresh and
    // skips the network round-trip — fetch must still have been called only once.
    const second = renderHook(() => useCrsInfo(), { wrapper: makeWrapper(sharedClient) })
    await waitFor(() => expect(second.result.current.isSuccess).toBe(true))

    expect(mockFetch).toHaveBeenCalledTimes(1)
  })
})

describe('usePortalInfo', () => {
  it('GETs ${BASE_URL}portal/info and parses the JSON body', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ name: 'portal', version: '1.2.3' }), { status: 200 }))
    vi.stubGlobal('fetch', mockFetch)

    const { result } = renderHook(() => usePortalInfo(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockFetch.mock.calls[0]![0]).toBe(`${import.meta.env.BASE_URL}portal/info`)
    expect(result.current.data).toEqual({ name: 'portal', version: '1.2.3' })
  })

  it('honors deployment sub-path BASE_URL', async () => {
    vi.stubEnv('BASE_URL', '/components-management-portal/')
    vi.resetModules()
    const { usePortalInfo: freshHook } = await import('./useInfo')
    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ name: 'portal', version: '1.2.3' }), { status: 200 }))
    vi.stubGlobal('fetch', mockFetch)

    const { result } = renderHook(() => freshHook(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockFetch.mock.calls[0]![0]).toBe('/components-management-portal/portal/info')
  })

  it('5xx surfaces as isError without redirecting to OIDC', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('boom', { status: 502 })),
    )

    const { result } = renderHook(() => usePortalInfo(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(assignSpy).not.toHaveBeenCalled()
  })
})
