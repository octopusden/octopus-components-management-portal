import { describe, it, expect, vi, afterEach } from 'vitest'
import { api, ApiError } from './api'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

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
})
