import { describe, it, expect, vi, afterEach, beforeEach, afterAll } from 'vitest'
import { api, apiAbsolute, ApiError, resetOidcRedirectGuardForTests } from './api'
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
  resetOidcRedirectGuardForTests()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
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
  it('prefixes requests with BASE_URL + rest/api/4', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ content: [] }), { status: 200 }),
    )
    vi.stubGlobal('fetch', mockFetch)

    await api.get('/components')

    const calledUrl = mockFetch.mock.calls[0]![0] as string
    expect(calledUrl).toBe(`${import.meta.env.BASE_URL}rest/api/4/components`)
  })

  it('includes deployment sub-path prefix so gateway can route API calls', async () => {
    // Regression: API_BASE was '/rest/api/4' (absolute), so browser requests went
    // to the gateway root without the sub-path prefix — gateway returned 404.
    vi.stubEnv('BASE_URL', '/components-management-portal/')
    vi.resetModules()
    const { api: freshApi } = await import('./api')

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ content: [] }), { status: 200 }),
    )
    vi.stubGlobal('fetch', mockFetch)

    await freshApi.get('/components')

    const calledUrl = mockFetch.mock.calls[0]![0] as string
    expect(calledUrl).toBe('/components-management-portal/rest/api/4/components')
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

  it('extracts message from JSON ErrorResponse body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: 'TC sync is not configured: teamcity.base-url is blank' }), { status: 500 }),
      ),
    )

    const error = await api.get('/admin/resync').catch((e) => e) as ApiError
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(500)
    expect(error.message).toBe('TC sync is not configured: teamcity.base-url is blank')
  })

  it('extracts errorMessage from CRS error envelope ({"errorMessage":"..."})', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ errorMessage: 'TC sync is not configured: teamcity.base-url is blank. Set the TEAMCITY_BASE_URL environment variable.' }),
          { status: 500 },
        ),
      ),
    )

    const error = await api.post('/admin/teamcity-project-ids/resync').catch((e) => e) as ApiError
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(500)
    expect(error.message).toBe('TC sync is not configured: teamcity.base-url is blank. Set the TEAMCITY_BASE_URL environment variable.')
    // rawBody must still carry the original JSON for callers that need to inspect it
    expect(error.rawBody).toBe(JSON.stringify({ errorMessage: 'TC sync is not configured: teamcity.base-url is blank. Set the TEAMCITY_BASE_URL environment variable.' }))
  })

  it('prefers errorMessage over message when both are present', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ errorMessage: 'CRS message', message: 'Spring message' }),
          { status: 400 },
        ),
      ),
    )

    const error = await api.post('/components').catch((e) => e) as ApiError
    expect(error.message).toBe('CRS message')
  })

  it('falls back to raw body when error response is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('Internal Server Error', { status: 500 })),
    )

    const error = await api.get('/admin/resync').catch((e) => e) as ApiError
    expect(error).toBeInstanceOf(ApiError)
    expect(error.message).toBe('Internal Server Error')
  })

  it('falls back to statusText when body is empty', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('', { status: 502, statusText: 'Bad Gateway' })),
    )

    const error = await api.get('/components').catch((e) => e) as ApiError
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(502)
    expect(error.message).toBe('Bad Gateway')
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

  it('redirects only once when several concurrent requests get 401 (post-redeploy race)', async () => {
    // After a portal redeploy the in-memory BFF session is gone and every in-flight
    // API call 401s at once. Each navigation to /oauth2/authorization/keycloak mints
    // a fresh OAuth2 `state` and overwrites the previous one in the (new) server
    // session, so concurrent redirects race the state Keycloak echoes back and the
    // callback dies with authorization_request_not_found -> /login?error. Only the
    // first 401 may navigate; the rest must just throw.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => Promise.resolve(new Response('nope', { status: 401 }))),
    )

    await Promise.all([
      api.get('/components').catch(() => {}),
      api.get('/components/foo').catch(() => {}),
      apiAbsolute.get('/rest/api/2/common/supported-groups').catch(() => {}),
    ])

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

// ---------------------------------------------------------------------------
// apiAbsolute — calls REST paths that don't live under /rest/api/4.
// Reuses the same auth / CSRF / 401-redirect plumbing as `api`.
// ---------------------------------------------------------------------------

describe('apiAbsolute — URL construction', () => {
  it('prefixes requests with BASE_URL (no rest/api/4 segment)', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(['com.example']), { status: 200 }),
    )
    vi.stubGlobal('fetch', mockFetch)

    await apiAbsolute.get('/rest/api/2/common/supported-groups')

    const calledUrl = mockFetch.mock.calls[0]![0] as string
    expect(calledUrl).toBe(`${import.meta.env.BASE_URL}rest/api/2/common/supported-groups`)
  })

  it('respects deployment sub-path prefix in BASE_URL', async () => {
    vi.stubEnv('BASE_URL', '/components-management-portal/')
    vi.resetModules()
    const { apiAbsolute: freshApi } = await import('./api')

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(['com.example']), { status: 200 }),
    )
    vi.stubGlobal('fetch', mockFetch)

    await freshApi.get('/rest/api/2/common/supported-groups')

    const calledUrl = mockFetch.mock.calls[0]![0] as string
    expect(calledUrl).toBe('/components-management-portal/rest/api/2/common/supported-groups')
  })

  it('accepts paths without a leading slash', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('[]', { status: 200 }))
    vi.stubGlobal('fetch', mockFetch)

    await apiAbsolute.get('rest/api/2/common/supported-groups')

    const calledUrl = mockFetch.mock.calls[0]![0] as string
    expect(calledUrl).toBe(`${import.meta.env.BASE_URL}rest/api/2/common/supported-groups`)
  })

  it('throws ApiError on non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('boom', { status: 500 })),
    )

    const err = await apiAbsolute.get('/rest/api/2/anything').catch((e) => e) as ApiError
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(500)
  })

  it('sends credentials: include on every request (BFF session cookie)', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('[]', { status: 200 }))
    vi.stubGlobal('fetch', mockFetch)

    await apiAbsolute.get('/rest/api/2/common/supported-groups')

    const init = mockFetch.mock.calls[0]![1] as RequestInit
    expect(init.credentials).toBe('include')
  })

  it('sets X-Requested-With on every request (routes to API auth entry point)', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('[]', { status: 200 }))
    vi.stubGlobal('fetch', mockFetch)

    await apiAbsolute.get('/rest/api/2/common/supported-groups')

    const headers = (mockFetch.mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['X-Requested-With']).toBe('XMLHttpRequest')
  })
})

describe('apiAbsolute — CSRF double-submit', () => {
  beforeEach(() => {
    document.cookie = 'XSRF-TOKEN=tok-abs; path=/'
  })

  afterEach(() => {
    document.cookie = 'XSRF-TOKEN=; path=/; max-age=0'
  })

  it('does NOT send X-XSRF-TOKEN on safe (GET) requests', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('[]', { status: 200 }))
    vi.stubGlobal('fetch', mockFetch)

    await apiAbsolute.get('/rest/api/2/common/supported-groups')

    const headers = (mockFetch.mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['X-XSRF-TOKEN']).toBeUndefined()
  })

  it('sends X-XSRF-TOKEN on POST / PATCH / PUT / DELETE', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', mockFetch)

    await apiAbsolute.post('/rest/api/2/anything', { a: 1 })
    await apiAbsolute.patch('/rest/api/2/anything', { a: 1 })
    await apiAbsolute.put('/rest/api/2/anything', { a: 1 })
    await apiAbsolute.delete('/rest/api/2/anything')

    for (const call of mockFetch.mock.calls) {
      const headers = (call[1] as RequestInit).headers as Record<string, string>
      expect(headers['X-XSRF-TOKEN']).toBe('tok-abs')
    }
  })
})

describe('apiAbsolute — 401 handling', () => {
  it('on 401 redirects to the OIDC authorization entry point', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('nope', { status: 401 })),
    )

    const err = await apiAbsolute.get('/rest/api/2/common/supported-groups').catch((e) => e) as ApiError

    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(401)
    expect(assignSpy).toHaveBeenCalledOnce()
    expect(assignSpy).toHaveBeenCalledWith(OIDC_AUTHORIZE_PATH)
  })

  it('does NOT redirect when already inside the OIDC flow', async () => {
    setPathname('/oauth2/authorization/keycloak')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('nope', { status: 401 })),
    )

    await apiAbsolute.get('/rest/api/2/common/supported-groups').catch(() => {})

    expect(assignSpy).not.toHaveBeenCalled()
  })
})

describe('api.getText — text/plain bodies', () => {
  it('returns the raw text body and asks for text/plain (no JSON content-type)', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response('bcomponent {\n}\n', { status: 200, headers: { 'Content-Type': 'text/plain' } }),
    )
    vi.stubGlobal('fetch', mockFetch)

    const body = await api.getText('/components/c1/as-code')

    expect(body).toBe('bcomponent {\n}\n')
    const calledUrl = mockFetch.mock.calls[0]![0] as string
    expect(calledUrl).toBe(`${import.meta.env.BASE_URL}rest/api/4/components/c1/as-code`)
    const headers = (mockFetch.mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['Accept']).toBe('text/plain')
    expect(headers['Content-Type']).toBeUndefined()
  })

  it('throws ApiError with status + raw body on a non-OK text response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('component not found', { status: 404 })),
    )

    const err = (await api.getText('/components/ghost/as-code').catch((e) => e)) as ApiError
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(404)
    expect(err.rawBody).toBe('component not found')
  })
})
