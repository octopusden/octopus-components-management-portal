import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useTeamCityResync, type TeamCityResyncResult } from './useTeamCityResync'
import { api } from '../lib/api'

// The endpoint path lives only in the hook (line 42 of useTeamCityResync.ts)
// and the panel test (TeamCityResyncPanel.test.tsx) mocks the hook entirely
// — meaning a typo like '/admin/teamcity-project-id/resync' would 404 in
// production but pass every existing test. This file pins the wire path
// directly. See useComponents.test.ts / useMigration.test.ts for the
// renderHook + QueryClientProvider precedent we mirror here.

vi.mock('../lib/api', () => ({
  api: {
    post: vi.fn(),
  },
}))

const mockApi = vi.mocked(api)

const RESULT: TeamCityResyncResult = {
  scanned: 0,
  updated: 0,
  unchanged: 0,
  skipped_no_match: 0,
  skipped_ambiguous: 0,
  errors: [],
}

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
  return { wrapper, queryClient }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useTeamCityResync', () => {
  it('POSTs to /admin/teamcity-project-ids/resync with no body', async () => {
    mockApi.post.mockResolvedValue(RESULT)
    const { wrapper } = makeWrapper()

    const { result } = renderHook(() => useTeamCityResync(), { wrapper })
    await result.current.mutateAsync()

    // Pin the exact endpoint path — a typo here would 404 in prod and the
    // panel-level test wouldn't catch it (the panel mocks this hook).
    expect(mockApi.post).toHaveBeenCalledWith('/admin/teamcity-project-ids/resync')
    // Resync takes no payload — assert single positional arg, no body.
    expect(mockApi.post.mock.calls[0]).toHaveLength(1)
  })

  it('resolves with the parsed result on success', async () => {
    const fixture: TeamCityResyncResult = {
      scanned: 650,
      updated: 12,
      unchanged: 580,
      skipped_no_match: 50,
      skipped_ambiguous: 8,
      errors: ['comp-x: TC 503'],
    }
    mockApi.post.mockResolvedValue(fixture)
    const { wrapper } = makeWrapper()

    const { result } = renderHook(() => useTeamCityResync(), { wrapper })
    const data = await result.current.mutateAsync()

    expect(data).toEqual(fixture)
  })

  it('invalidates the [components] query on success so the list view picks up new TC URLs', async () => {
    mockApi.post.mockResolvedValue(RESULT)
    const { wrapper, queryClient } = makeWrapper()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useTeamCityResync(), { wrapper })
    await result.current.mutateAsync()

    await waitFor(() => {
      const invalidatedKeys = invalidateSpy.mock.calls.map(
        (call) => (call[0] as { queryKey?: readonly unknown[] } | undefined)?.queryKey,
      )
      expect(invalidatedKeys).toContainEqual(['components'])
    })
  })
})
