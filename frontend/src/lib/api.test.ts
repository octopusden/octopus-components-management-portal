import { describe, it, expect, vi, afterEach } from 'vitest'
import { api, ApiError } from './api'

afterEach(() => {
  vi.restoreAllMocks()
})

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
})
