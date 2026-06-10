import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useCrsInfo, usePortalLinks, usePortalInfo } from './useInfo'
import portalLinksContract from '../test-fixtures/portal-links.contract.json'
import portalLinksEmptyContract from '../test-fixtures/portal-links.empty.contract.json'

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
    const fixture = { name: 'portal', version: '1.2.3' }
    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(fixture), { status: 200 }))
    vi.stubGlobal('fetch', mockFetch)

    const { result } = renderHook(() => usePortalInfo(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockFetch.mock.calls[0]![0]).toBe(`${import.meta.env.BASE_URL}portal/info`)
    expect(result.current.data).toEqual(fixture)
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

describe('usePortalLinks', () => {
  it('GETs ${BASE_URL}portal/links and parses the JSON body', async () => {
    const fixture = { jiraBaseUrl: 'https://jira.example.com', gitBaseUrl: null, tcBaseUrl: null, dmsBaseUrl: null }
    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(fixture), { status: 200 }))
    vi.stubGlobal('fetch', mockFetch)

    const { result } = renderHook(() => usePortalLinks(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockFetch.mock.calls[0]![0]).toBe(`${import.meta.env.BASE_URL}portal/links`)
    expect(result.current.data).toEqual(fixture)
  })

  it('honors deployment sub-path BASE_URL', async () => {
    vi.stubEnv('BASE_URL', '/components-management-portal/')
    vi.resetModules()
    const { usePortalLinks: freshHook } = await import('./useInfo')
    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ jiraBaseUrl: null, gitBaseUrl: null, tcBaseUrl: null, dmsBaseUrl: null }), { status: 200 }))
    vi.stubGlobal('fetch', mockFetch)

    const { result } = renderHook(() => freshHook(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockFetch.mock.calls[0]![0]).toBe('/components-management-portal/portal/links')
  })

  it('5xx surfaces as isError without redirecting to OIDC', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('boom', { status: 503 })),
    )

    const { result } = renderHook(() => usePortalLinks(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(assignSpy).not.toHaveBeenCalled()
  })

  // /portal/links values are server env config, not user input — but they end
  // up templated into <a href> across the app (ComponentTable, detail page).
  // Sanitizing here, at the single point where the payload enters the SPA,
  // means no consumer can accidentally render a javascript:/data: href even if
  // the backend (or a proxy in front of it) is compromised. teamcityProjectUrl
  // gets the same treatment per-component via safeHttpUrl in ComponentTable.
  it('nulls out non-http(s) base URLs so consumers never render javascript:/data: hrefs', async () => {
    const fixture = {
      jiraBaseUrl: 'javascript:alert(1)//',
      gitBaseUrl: 'data:text/html,x',
      tcBaseUrl: 'https://tc.example.com',
      dmsBaseUrl: 'vbscript:msgbox(1)',
    }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify(fixture), { status: 200 })),
    )

    const { result } = renderHook(() => usePortalLinks(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data?.jiraBaseUrl).toBeNull()
    expect(result.current.data?.gitBaseUrl).toBeNull()
    expect(result.current.data?.dmsBaseUrl).toBeNull()
    expect(result.current.data?.tcBaseUrl).toBe('https://tc.example.com')
  })

  // Contract guard against backend/frontend shape drift.
  // The fixtures in src/test-fixtures/portal-links*.contract.json are also read
  // by PortalLinksControllerContractTest on the Kotlin side to verify Spring's
  // serialized LinksResponse matches them byte-for-byte. If the frontend reverts
  // to a nested `{ links: { ... } }` envelope, these direct flat-key assertions
  // fail; if Spring starts wrapping the DTO, the backend test fails first.
  it('contract: flat /portal/links JSON populates the hook directly (no envelope)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(portalLinksContract), { status: 200 }),
      ),
    )

    const { result } = renderHook(() => usePortalLinks(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data?.jiraBaseUrl).toBe(portalLinksContract.jiraBaseUrl)
    expect(result.current.data?.gitBaseUrl).toBe(portalLinksContract.gitBaseUrl)
    expect(result.current.data?.tcBaseUrl).toBe(portalLinksContract.tcBaseUrl)
    expect(result.current.data?.dmsBaseUrl).toBe(portalLinksContract.dmsBaseUrl)
    // Reading 'links' on the data must yield undefined — guards against a future
    // type/access regression that re-introduces the nested envelope shape.
    expect((result.current.data as unknown as { links?: unknown })?.links).toBeUndefined()
  })

  // The portal serves `{}` when no PORTAL_LINKS_*_BASE_URL env vars are set —
  // Jackson omits null properties. Frontend code must treat each key as
  // possibly absent, not just null. PortalLinksControllerContractTest's
  // NoUrlsConfigured case binds the same fixture on the Kotlin side.
  it('contract: empty /portal/links body leaves all four keys undefined', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(portalLinksEmptyContract), { status: 200 }),
      ),
    )

    const { result } = renderHook(() => usePortalLinks(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data?.jiraBaseUrl).toBeUndefined()
    expect(result.current.data?.gitBaseUrl).toBeUndefined()
    expect(result.current.data?.tcBaseUrl).toBeUndefined()
    expect(result.current.data?.dmsBaseUrl).toBeUndefined()
  })
})
