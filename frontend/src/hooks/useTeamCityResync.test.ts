import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import {
  useRunTeamCityResync,
  useTeamCityResyncJob,
  type TeamCityResyncResult,
} from './useTeamCityResync'
import { api, ApiError } from '../lib/api'
import type { TeamCityResyncJobResponse } from '../lib/types'

// Pin the wire paths and the parseSameKindAttach branching contract for the
// async TC resync. The endpoint paths only live in this hook; a typo would
// 404 in production but pass every existing panel-level test (the panel
// mocks the hooks). See useMigration.test.ts for the precedent we mirror.

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api')
  return {
    ...actual,
    api: { get: vi.fn(), post: vi.fn() },
  }
})
const mockApi = vi.mocked(api)

const RESULT: TeamCityResyncResult = {
  scanned: 0,
  updated: 0,
  unchanged: 0,
  skipped_no_match: 0,
  skipped_ambiguous: 0,
  errors: [],
}

const RUNNING_JOB: TeamCityResyncJobResponse = {
  kind: 'job',
  id: 'tc-1',
  state: 'RUNNING',
  startedAt: '2026-05-06T10:00:00Z',
  finishedAt: null,
  errorMessage: null,
  result: null,
}

const COMPLETED_JOB: TeamCityResyncJobResponse = {
  ...RUNNING_JOB,
  state: 'COMPLETED',
  finishedAt: '2026-05-06T10:00:42Z',
  result: { ...RESULT, scanned: 12, updated: 3, unchanged: 9 },
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

describe('useRunTeamCityResync', () => {
  it('POSTs /admin/teamcity-project-ids/sync with no body', async () => {
    mockApi.post.mockResolvedValue(RUNNING_JOB)
    const { wrapper } = makeWrapper()

    const { result } = renderHook(() => useRunTeamCityResync(), { wrapper })
    await result.current.mutateAsync()

    // Pin the exact endpoint path — a typo here would 404 in prod.
    expect(mockApi.post).toHaveBeenCalledWith('/admin/teamcity-project-ids/sync')
    // Resync takes no payload — assert single positional arg, no body.
    expect(mockApi.post.mock.calls[0]).toHaveLength(1)
  })

  it('resolves with the freshly-started job on 202', async () => {
    mockApi.post.mockResolvedValue(RUNNING_JOB)
    const { wrapper } = makeWrapper()

    const { result } = renderHook(() => useRunTeamCityResync(), { wrapper })
    const data = await result.current.mutateAsync()

    expect(data).toEqual(RUNNING_JOB)
  })

  it('treats same-kind 409 as attach — resolves with the existing job body', async () => {
    // Backend returns the existing job body (kind="job") with HTTP 409 when a
    // resync is already RUNNING. The hook should resolve as success so the
    // panel attaches to the in-flight job rather than rendering a destructive
    // banner under a button it just clicked.
    //
    // Use the three-arg ApiError(status, message, rawBody) constructor — the
    // production path at api.ts:90 always passes the human-readable message
    // separately from the raw body, and `parseSameKindAttach` reads
    // `err.rawBody`. The two-arg form would set message=rawBody and pass the
    // test by accident, masking a regression where someone reads `err.message`.
    mockApi.post.mockRejectedValue(new ApiError(409, 'Conflict', JSON.stringify(RUNNING_JOB)))
    const { wrapper } = makeWrapper()

    const { result } = renderHook(() => useRunTeamCityResync(), { wrapper })
    const data = await result.current.mutateAsync()

    expect(data).toEqual(RUNNING_JOB)
  })

  it('rethrows cross-kind 409 (kind="conflict") as error so the panel renders the destructive block', async () => {
    const conflict = {
      kind: 'conflict',
      code: 'components-migration-running',
      message: 'Cross-kind migration conflict: COMPONENTS job xyz is already running',
      activeKind: 'COMPONENTS',
      activeJobId: 'xyz',
    }
    mockApi.post.mockRejectedValue(
      new ApiError(409, conflict.message, JSON.stringify(conflict)),
    )
    const { wrapper } = makeWrapper()

    const { result } = renderHook(() => useRunTeamCityResync(), { wrapper })

    await expect(result.current.mutateAsync()).rejects.toBeInstanceOf(ApiError)
  })

  it('invalidates ["components"] on COMPLETED-on-start race (executor finished before response built)', async () => {
    mockApi.post.mockResolvedValue(COMPLETED_JOB)
    const { wrapper, queryClient } = makeWrapper()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useRunTeamCityResync(), { wrapper })
    await result.current.mutateAsync()

    await waitFor(() => {
      const invalidatedKeys = invalidateSpy.mock.calls.map(
        (call) => (call[0] as { queryKey?: readonly unknown[] } | undefined)?.queryKey,
      )
      expect(invalidatedKeys).toContainEqual(['components'])
    })
  })

  it('does NOT invalidate ["components"] on a fresh RUNNING start (DB is not yet updated)', async () => {
    mockApi.post.mockResolvedValue(RUNNING_JOB)
    const { wrapper, queryClient } = makeWrapper()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useRunTeamCityResync(), { wrapper })
    await result.current.mutateAsync()

    const invalidatedKeys = invalidateSpy.mock.calls.map(
      (call) => (call[0] as { queryKey?: readonly unknown[] } | undefined)?.queryKey,
    )
    expect(invalidatedKeys).not.toContainEqual(['components'])
  })
})

describe('useTeamCityResyncJob', () => {
  it('GETs /admin/teamcity-project-ids/sync/job and returns the parsed body', async () => {
    mockApi.get.mockResolvedValue(COMPLETED_JOB)
    const { wrapper } = makeWrapper()

    const { result } = renderHook(() => useTeamCityResyncJob(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApi.get).toHaveBeenCalledWith('/admin/teamcity-project-ids/sync/job')
    expect(result.current.data).toEqual(COMPLETED_JOB)
  })

  it('returns null (idle) on 404 instead of erroring', async () => {
    mockApi.get.mockRejectedValue(new ApiError(404, 'no current job'))
    const { wrapper } = makeWrapper()

    const { result } = renderHook(() => useTeamCityResyncJob(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toBeNull()
  })
})
