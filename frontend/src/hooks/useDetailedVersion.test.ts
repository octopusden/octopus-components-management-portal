import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useDetailedVersion } from './useDetailedVersion'
import { apiAbsolute } from '../lib/api'
import type { DetailedComponentVersion } from '../lib/types'

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api')
  return { ...actual, apiAbsolute: { get: vi.fn() } }
})
const mockApi = vi.mocked(apiAbsolute)

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
}

const detailed: DetailedComponentVersion = {
  component: 'acme',
  minorVersion: { type: 'MINOR', version: '03.62', jiraVersion: 'pgw-03.62' },
  lineVersion: { type: 'LINE', version: '03.62', jiraVersion: '03.62' },
  buildVersion: { type: 'BUILD', version: '03.62.30.19-9', jiraVersion: 'pgw-03.62.30.19-9' },
  rcVersion: { type: 'RC', version: '03.62.30.19', jiraVersion: 'pgw-03.62.30.19_RC' },
  releaseVersion: { type: 'RELEASE', version: '03.62.30.19', jiraVersion: 'pgw-03.62.30.19' },
  hotfixVersion: { type: 'HOTFIX', version: '03.62.30.19-9', jiraVersion: 'pgw-03.62.30.19-9' },
}

beforeEach(() => vi.clearAllMocks())

describe('useDetailedVersion', () => {
  it('fetches the legacy detailed-version endpoint, url-encoding component + version', async () => {
    mockApi.get.mockResolvedValue(detailed)
    const { result } = renderHook(() => useDetailedVersion('acme/core', '03.62.30.19-9', true), {
      wrapper: makeWrapper(),
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(detailed)
    const url = (mockApi.get as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    expect(url).toBe('rest/api/2/components/acme%2Fcore/versions/03.62.30.19-9/detailed-version')
  })

  it('does not fetch when disabled', () => {
    mockApi.get.mockResolvedValue(detailed)
    renderHook(() => useDetailedVersion('acme', '1.2.3', false), { wrapper: makeWrapper() })
    expect(mockApi.get).not.toHaveBeenCalled()
  })

  it('does not fetch for a blank version (nothing to render)', () => {
    mockApi.get.mockResolvedValue(detailed)
    renderHook(() => useDetailedVersion('acme', '   ', true), { wrapper: makeWrapper() })
    expect(mockApi.get).not.toHaveBeenCalled()
  })

  it('trims padded inputs so the gate, key and URL all agree', async () => {
    mockApi.get.mockResolvedValue(detailed)
    const { result } = renderHook(() => useDetailedVersion('  acme  ', '  03.62.30.19-4  ', true), {
      wrapper: makeWrapper(),
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const url = (mockApi.get as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    expect(url).toBe('rest/api/2/components/acme/versions/03.62.30.19-4/detailed-version')
  })
})
