import { describe, it, expect, vi, afterEach, beforeEach, afterAll } from 'vitest'
import { api, ApiError } from './api'
import { CONTINUE_PATH_STORAGE_KEY, OIDC_AUTHORIZE_PATH } from './auth'

// jsdom's default window.location.assign cannot be re-spied across tests, so swap the
// whole location object once with a plain object that exposes a fake assign and a
// writable pathname, then restore at end-of-file.
const assignSpy = vi.fn()
const originalLocation = window.location
const fakeLocation: Location = {
  ...originalLocation,
  assign: (url: string | URL) => assignSpy(String(url)),
  pathname: '/components',
} as Location

beforeEach(() => {
  assignSpy.mockReset()
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: { ...fakeLocation, pathname: '/components', search: '' },
  })
  sessionStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
  sessionStorage.clear()
})

afterAll(() => {
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: originalLocation,
  })
})

function setPathname(pathname: string) {
  ;(window.location as unknown as { pathname: string }).pathname = pathname
}

describe('api — URL construction', () => {
  it('prefixes requests with /rest/api/4', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ content: [] }), { status: 200 }),
    )
    vi.stubGlobal('fetch', mockFetch)

    await api.get('/components')

    const calledUrl = mockFetch.mock.calls[0]![0] as string
    expect(calledUrl).toBe('/rest/api/4/components')
  })

  it('throws ApiError with status on non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('Not Found', { status: 404 })),
    )

    const error = await api.get('/components').catch((e) => e) as ApiError
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(404)
  })

  it('sends credentials on every request (BFF session cookie)', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 }),
    )
    vi.stubGlobal('fetch', mockFetch)

    await api.get('/components')

    const init = mockFetch.mock.calls[0]![1] as RequestInit
    expect(init.credentials).toBe('include')
  })
})

describe('api — CSRF double-submit', () => {
  beforeEach(() => {
    document.cookie = 'XSRF-TOKEN=tok-123; path=/'
  })

  afterEach(() => {
    document.cookie = 'XSRF-TOKEN=; path=/; max-age=0'
  })

  it('does NOT send X-XSRF-TOKEN on safe (GET) requests', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', mockFetch)

    await api.get('/components')

    const headers = (mockFetch.mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['X-XSRF-TOKEN']).toBeUndefined()
  })

  it('sends X-XSRF-TOKEN on POST / PATCH / PUT / DELETE', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', mockFetch)

    await api.post('/components', { a: 1 })
    await api.patch('/components/1', { a: 1 })
    await api.put('/components/1', { a: 1 })
    await api.delete('/components/1')

    for (const call of mockFetch.mock.calls) {
      const headers = (call[1] as RequestInit).headers as Record<string, string>
      expect(headers['X-XSRF-TOKEN']).toBe('tok-123')
    }
  })

  it('omits X-XSRF-TOKEN on non-safe request when cookie is missing', async () => {
    document.cookie = 'XSRF-TOKEN=; path=/; max-age=0'
    const mockFetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', mockFetch)

    await api.post('/components', { a: 1 })

    const headers = (mockFetch.mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['X-XSRF-TOKEN']).toBeUndefined()
  })
})

describe('api — 401 handling', () => {
  it('on 401 redirects to the OIDC authorization entry point and throws 401 ApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('nope', { status: 401 })),
    )

    const err = await api.get('/components').catch((e) => e) as ApiError

    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(401)
    expect(assignSpy).toHaveBeenCalledOnce()
    expect(assignSpy).toHaveBeenCalledWith(OIDC_AUTHORIZE_PATH)
  })

  it('on 401 stashes the deep-link path so it can be restored after login', async () => {
    ;(window.location as unknown as { pathname: string; search: string }).pathname = '/components/foo'
    ;(window.location as unknown as { pathname: string; search: string }).search = '?tab=releases'
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('nope', { status: 401 })),
    )

    await api.get('/components').catch(() => {})

    expect(sessionStorage.getItem(CONTINUE_PATH_STORAGE_KEY)).toBe('/components/foo?tab=releases')
  })

  it('does NOT redirect when already inside the OIDC flow (anti-loop: /oauth2)', async () => {
    setPathname('/oauth2/authorization/keycloak')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('nope', { status: 401 })),
    )

    await api.get('/components').catch(() => {})

    expect(assignSpy).not.toHaveBeenCalled()
  })

  it('does NOT redirect when already on the login callback path', async () => {
    setPathname('/login/oauth2/code/keycloak')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('nope', { status: 401 })),
    )

    await api.get('/components').catch(() => {})

    expect(assignSpy).not.toHaveBeenCalled()
  })

  it('DOES redirect for SPA paths that merely share a prefix (e.g. /login-help)', async () => {
    // Anti-loop guard must be exact-prefix: /login-help is a hypothetical SPA route,
    // not the OIDC flow, so a 401 there should still trigger the OIDC entry point.
    setPathname('/login-help')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('nope', { status: 401 })),
    )

    await api.get('/components').catch(() => {})

    expect(assignSpy).toHaveBeenCalledOnce()
    expect(assignSpy).toHaveBeenCalledWith(OIDC_AUTHORIZE_PATH)
  })

  it('DOES redirect from /oauth2-settings (not the OIDC namespace)', async () => {
    setPathname('/oauth2-settings')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('nope', { status: 401 })),
    )

    await api.get('/components').catch(() => {})

    expect(assignSpy).toHaveBeenCalledOnce()
    expect(assignSpy).toHaveBeenCalledWith(OIDC_AUTHORIZE_PATH)
  })
})
