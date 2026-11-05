import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import {
  useDistributionPreview,
  type DistributionPreviewRequest,
  type DistributionPreviewResponse,
} from './useDistributionPreview'
import { api, ApiError } from '../lib/api'

// Pins the wire path + body. The endpoint path only lives in this hook.
vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api')
  return { ...actual, api: { ...actual.api, post: vi.fn() } }
})
const mockApi = vi.mocked(api)

const RESPONSE: DistributionPreviewResponse = {
  version: '1.5',
  supported: true,
  paths: [{ attribute: 'distribution.maven', source: 'OVERRIDE', matchedRanges: ['[1.0,2.0)'], unevaluableRanges: [] }],
}

function request(version: string): DistributionPreviewRequest {
  return {
    version,
    fieldOverrides: [
      { overriddenAttribute: 'distribution.maven', versionRange: '[1.0,2.0)', markerChildren: { mavenArtifacts: [] } },
    ],
    supportedVersions: { all: false, ranges: ['[1.0,3.0)'] },
  }
}

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useDistributionPreview', () => {
  it('POSTs the version with the override and supported-version drafts', async () => {
    mockApi.post.mockResolvedValue(RESPONSE)
    const { result } = renderHook(() => useDistributionPreview('c-1', request('1.5'), true), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApi.post).toHaveBeenCalledWith('/components/c-1/distribution/preview', request('1.5'))
    expect(result.current.data).toEqual(RESPONSE)
  })

  it('issues no request for an empty version (the caller trims)', () => {
    const { result } = renderHook(() => useDistributionPreview('c-1', request(''), true), { wrapper: makeWrapper() })
    expect(mockApi.post).not.toHaveBeenCalled()
    expect(result.current.isInvalid).toBe(false)
    expect(result.current.isError).toBe(false)
  })

  it('issues no request when disabled', () => {
    renderHook(() => useDistributionPreview('c-1', request('1.5'), false), { wrapper: makeWrapper() })
    expect(mockApi.post).not.toHaveBeenCalled()
  })

  it('maps a 400 to an invalid-input state', async () => {
    mockApi.post.mockRejectedValue(new ApiError(400, 'Bad version'))
    const { result } = renderHook(() => useDistributionPreview('c-1', request('abc'), true), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.isInvalid).toBe(true)
  })

  it('does not treat other failures as invalid input', async () => {
    mockApi.post.mockRejectedValue(new ApiError(403, 'Forbidden'))
    const { result } = renderHook(() => useDistributionPreview('c-1', request('1.5'), true), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.isInvalid).toBe(false)
  })
})
