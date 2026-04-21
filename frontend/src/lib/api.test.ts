import { describe, it, expect, vi, afterEach, beforeEach, afterAll } from 'vitest'
import { api, ApiError } from './api'
import { OIDC_AUTHORIZE_PATH } from './auth'

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
    value: { ...fakeLocation, pathname: '/components' },
  })
})

afterEach(() => {
  vi.restoreAllMocks()
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
})
