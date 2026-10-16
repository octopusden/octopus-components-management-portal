import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import {
  useRunPlacementDiff,
  usePlacementDiffJob,
  usePlacementDiffReport,
  useRunPlacementSync,
  usePlacementSyncJob,
} from './useTeamCityPlacement'
import { api, ApiError } from '../lib/api'
import type {
  PlacementDiffResult,
  TeamcityPlacementDiffJobResponse,
  TeamcityPlacementSyncJobResponse,
} from '../lib/types'

// Pins the wire paths and the parseSameKindAttach branching contract for the
// two new async jobs (Diff, Sync) — see useTeamCityResync.test.ts for the
// precedent this mirrors.

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api')
  return {
    ...actual,
    api: { get: vi.fn(), post: vi.fn() },
  }
})
const mockApi = vi.mocked(api)

const RUNNING_DIFF_JOB: TeamcityPlacementDiffJobResponse = {
  kind: 'job',
  id: 'diff-1',
  state: 'RUNNING',
  startedAt: '2026-09-30T10:00:00Z',
  finishedAt: null,
  errorMessage: null,
  rowCount: null,
}

const COMPLETED_DIFF_JOB: TeamcityPlacementDiffJobResponse = {
  ...RUNNING_DIFF_JOB,
  state: 'COMPLETED',
  finishedAt: '2026-09-30T10:00:42Z',
  rowCount: 3,
}

const REPORT: PlacementDiffResult = {
  generatedAt: '2026-09-30T10:00:42Z',
  rows: [],
}

const RUNNING_SYNC_JOB: TeamcityPlacementSyncJobResponse = {
  kind: 'job',
  id: 'sync-1',
  state: 'RUNNING',
  startedAt: '2026-09-30T10:05:00Z',
  finishedAt: null,
  errorMessage: null,
  result: null,
}

const COMPLETED_SYNC_JOB: TeamcityPlacementSyncJobResponse = {
  ...RUNNING_SYNC_JOB,
  state: 'COMPLETED',
  finishedAt: '2026-09-30T10:05:05Z',
  result: {
    triggeredBy: 'alice',
    requested: 1,
    applied: 1,
    skipped: 0,
    failed: 0,
    components: [],
    fieldChanges: [],
  },
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

describe('useRunPlacementDiff', () => {
  it('POSTs /admin/teamcity-placement/diff with no body', async () => {
    mockApi.post.mockResolvedValue(RUNNING_DIFF_JOB)
    const { wrapper } = makeWrapper()

    const { result } = renderHook(() => useRunPlacementDiff(), { wrapper })
    await result.current.mutateAsync()

    expect(mockApi.post).toHaveBeenCalledWith('/admin/teamcity-placement/diff')
    expect(mockApi.post.mock.calls[0]).toHaveLength(1)
  })

  it('treats same-kind 409 as attach — resolves with the existing job body', async () => {
    mockApi.post.mockRejectedValue(new ApiError(409, 'Conflict', JSON.stringify(RUNNING_DIFF_JOB)))
    const { wrapper } = makeWrapper()

    const { result } = renderHook(() => useRunPlacementDiff(), { wrapper })
    const data = await result.current.mutateAsync()

    expect(data).toEqual(RUNNING_DIFF_JOB)
  })

  it('rethrows cross-kind 409 (kind="conflict") as error', async () => {
    const conflict = {
      kind: 'conflict',
      code: 'components-migration-running',
      message: 'Cross-kind migration conflict: COMPONENTS job xyz is already running',
      activeKind: 'COMPONENTS',
      activeJobId: 'xyz',
    }
    mockApi.post.mockRejectedValue(new ApiError(409, conflict.message, JSON.stringify(conflict)))
    const { wrapper } = makeWrapper()

    const { result } = renderHook(() => useRunPlacementDiff(), { wrapper })

    await expect(result.current.mutateAsync()).rejects.toBeInstanceOf(ApiError)
  })

  it('invalidates the diff report cache once the job COMPLETES', async () => {
    mockApi.post.mockResolvedValue(COMPLETED_DIFF_JOB)
    const { wrapper, queryClient } = makeWrapper()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useRunPlacementDiff(), { wrapper })
    await result.current.mutateAsync()

    await waitFor(() => {
      const invalidatedKeys = invalidateSpy.mock.calls.map(
        (call) => (call[0] as { queryKey?: readonly unknown[] } | undefined)?.queryKey,
      )
      expect(invalidatedKeys).toContainEqual(['tc-placement-diff', 'report'])
    })
  })

  it('does NOT invalidate the report cache on a fresh RUNNING start', async () => {
    mockApi.post.mockResolvedValue(RUNNING_DIFF_JOB)
    const { wrapper, queryClient } = makeWrapper()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useRunPlacementDiff(), { wrapper })
    await result.current.mutateAsync()

    const invalidatedKeys = invalidateSpy.mock.calls.map(
      (call) => (call[0] as { queryKey?: readonly unknown[] } | undefined)?.queryKey,
    )
    expect(invalidatedKeys).not.toContainEqual(['tc-placement-diff', 'report'])
  })
})

describe('usePlacementDiffJob', () => {
  it('GETs /admin/teamcity-placement/diff/job and returns the parsed body', async () => {
    mockApi.get.mockResolvedValue(COMPLETED_DIFF_JOB)
    const { wrapper } = makeWrapper()

    const { result } = renderHook(() => usePlacementDiffJob(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApi.get).toHaveBeenCalledWith('/admin/teamcity-placement/diff/job')
    expect(result.current.data).toEqual(COMPLETED_DIFF_JOB)
  })

  it('returns null (idle) on 404 instead of erroring', async () => {
    mockApi.get.mockRejectedValue(new ApiError(404, 'no current job'))
    const { wrapper } = makeWrapper()

    const { result } = renderHook(() => usePlacementDiffJob(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toBeNull()
  })
})

describe('usePlacementDiffReport', () => {
  it('GETs /admin/teamcity-placement/diff/report.json and returns the parsed body', async () => {
    mockApi.get.mockResolvedValue(REPORT)
    const { wrapper } = makeWrapper()

    const { result } = renderHook(() => usePlacementDiffReport(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApi.get).toHaveBeenCalledWith('/admin/teamcity-placement/diff/report.json')
    expect(result.current.data).toEqual(REPORT)
  })

  it('returns null on 404 (no Diff has ever completed)', async () => {
    mockApi.get.mockRejectedValue(new ApiError(404, 'no report'))
    const { wrapper } = makeWrapper()

    const { result } = renderHook(() => usePlacementDiffReport(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toBeNull()
  })
})

describe('useRunPlacementSync', () => {
  it('POSTs /admin/teamcity-placement/sync with {diffId, componentIds}', async () => {
    mockApi.post.mockResolvedValue(RUNNING_SYNC_JOB)
    const { wrapper } = makeWrapper()

    const { result } = renderHook(() => useRunPlacementSync(), { wrapper })
    await result.current.mutateAsync({ diffId: 'diff-1', componentIds: ['c-1', 'c-2'] })

    expect(mockApi.post).toHaveBeenCalledWith('/admin/teamcity-placement/sync', {
      diffId: 'diff-1',
      componentIds: ['c-1', 'c-2'],
    })
  })

  it('treats same-kind 409 as attach — resolves with the existing job body', async () => {
    mockApi.post.mockRejectedValue(new ApiError(409, 'Conflict', JSON.stringify(RUNNING_SYNC_JOB)))
    const { wrapper } = makeWrapper()

    const { result } = renderHook(() => useRunPlacementSync(), { wrapper })
    const data = await result.current.mutateAsync({ diffId: 'diff-1', componentIds: [] })

    expect(data).toEqual(RUNNING_SYNC_JOB)
  })

  it('rethrows a "diff replaced" 409 (plain error body, no kind) as error', async () => {
    mockApi.post.mockRejectedValue(
      new ApiError(
        409,
        'diff replaced, re-run Diff',
        JSON.stringify({ errorMessage: 'diff replaced, re-run Diff', errorCode: 'placement-diff-stale' }),
      ),
    )
    const { wrapper } = makeWrapper()

    const { result } = renderHook(() => useRunPlacementSync(), { wrapper })

    await expect(result.current.mutateAsync({ diffId: 'stale', componentIds: [] })).rejects.toBeInstanceOf(
      ApiError,
    )
  })

  it('invalidates components + per-component caches on COMPLETED', async () => {
    mockApi.post.mockResolvedValue(COMPLETED_SYNC_JOB)
    const { wrapper, queryClient } = makeWrapper()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useRunPlacementSync(), { wrapper })
    await result.current.mutateAsync({ diffId: 'diff-1', componentIds: ['c-1'] })

    await waitFor(() => {
      const invalidatedKeys = invalidateSpy.mock.calls.map(
        (call) => (call[0] as { queryKey?: readonly unknown[] } | undefined)?.queryKey,
      )
      expect(invalidatedKeys).toContainEqual(['components'])
    })
  })
})

describe('usePlacementSyncJob', () => {
  it('GETs /admin/teamcity-placement/sync/job and returns the parsed body', async () => {
    mockApi.get.mockResolvedValue(COMPLETED_SYNC_JOB)
    const { wrapper } = makeWrapper()

    const { result } = renderHook(() => usePlacementSyncJob(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApi.get).toHaveBeenCalledWith('/admin/teamcity-placement/sync/job')
    expect(result.current.data).toEqual(COMPLETED_SYNC_JOB)
  })

  it('returns null (idle) on 404 instead of erroring', async () => {
    mockApi.get.mockRejectedValue(new ApiError(404, 'no current job'))
    const { wrapper } = makeWrapper()

    const { result } = renderHook(() => usePlacementSyncJob(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toBeNull()
  })
})
