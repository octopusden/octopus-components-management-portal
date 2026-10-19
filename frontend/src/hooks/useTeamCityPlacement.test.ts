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
})

function invalidatedKeys(spy: { mock: { calls: unknown[][] } }) {
  return spy.mock.calls.map((call) => (call[0] as { queryKey?: readonly unknown[] } | undefined)?.queryKey)
}

describe('usePlacementDiffJob', () => {
  it('refreshes the report once the job it reads is COMPLETED', async () => {
    mockApi.get.mockResolvedValue(COMPLETED_DIFF_JOB)
    const { wrapper, queryClient } = makeWrapper()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    renderHook(() => usePlacementDiffJob(), { wrapper })

    await waitFor(() => expect(invalidatedKeys(invalidateSpy)).toContainEqual(['tc-placement-diff', 'report']))
  })

  it('does not refresh the report while the job is RUNNING', async () => {
    mockApi.get.mockResolvedValue(RUNNING_DIFF_JOB)
    const { wrapper, queryClient } = makeWrapper()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => usePlacementDiffJob(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(invalidatedKeys(invalidateSpy)).not.toContainEqual(['tc-placement-diff', 'report'])
  })

  it('refreshes the report when the start response is already COMPLETED', async () => {
    mockApi.get.mockResolvedValue(null)
    mockApi.post.mockResolvedValue(COMPLETED_DIFF_JOB)
    const { wrapper, queryClient } = makeWrapper()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => ({ run: useRunPlacementDiff(), job: usePlacementDiffJob() }), { wrapper })
    await waitFor(() => expect(result.current.job.isSuccess).toBe(true))
    await result.current.run.mutateAsync()

    await waitFor(() => expect(invalidatedKeys(invalidateSpy)).toContainEqual(['tc-placement-diff', 'report']))
  })

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
})

describe('usePlacementSyncJob', () => {
  it('refreshes the component caches once the Sync it reads is COMPLETED', async () => {
    mockApi.get.mockResolvedValue(COMPLETED_SYNC_JOB)
    const { wrapper, queryClient } = makeWrapper()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    renderHook(() => usePlacementSyncJob(), { wrapper })

    await waitFor(() => expect(invalidatedKeys(invalidateSpy)).toContainEqual(['components']))
  })

  it('refreshes the component caches when the start response is already COMPLETED', async () => {
    mockApi.get.mockResolvedValue(null)
    mockApi.post.mockResolvedValue(COMPLETED_SYNC_JOB)
    const { wrapper, queryClient } = makeWrapper()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => ({ run: useRunPlacementSync(), job: usePlacementSyncJob() }), { wrapper })
    await waitFor(() => expect(result.current.job.isSuccess).toBe(true))
    await result.current.run.mutateAsync({ diffId: 'diff-1', componentIds: ['c-1'] })

    await waitFor(() => expect(invalidatedKeys(invalidateSpy)).toContainEqual(['components']))
  })

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
