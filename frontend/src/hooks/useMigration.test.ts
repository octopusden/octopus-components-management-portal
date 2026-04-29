import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useMigrationJob, useMigrationStatus, useRunMigration } from './useMigration'
import { api, ApiError } from '../lib/api'
import type { MigrationJobResponse, MigrationStatus } from '../lib/types'

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api')
  return {
    ...actual,
    api: { get: vi.fn(), post: vi.fn() },
  }
})
const mockApi = vi.mocked(api)

const STATUS: MigrationStatus = { git: 12, db: 3, total: 15 }

const RUNNING_JOB: MigrationJobResponse = {
  id: 'job-1',
  state: 'RUNNING',
  startedAt: '2026-04-29T10:00:00Z',
  finishedAt: null,
  total: 15,
  migrated: 0,
  failed: 0,
  skipped: 0,
  currentComponent: null,
  errorMessage: null,
  result: null,
}

const COMPLETED_JOB: MigrationJobResponse = {
  ...RUNNING_JOB,
  state: 'COMPLETED',
  finishedAt: '2026-04-29T10:00:13Z',
  total: 15,
  migrated: 14,
  failed: 1,
  skipped: 0,
  result: {
    defaults: { build: { javaVersion: '21' } },
    components: { total: 15, migrated: 14, failed: 1, skipped: 0, results: [] },
  },
}

const assignSpy = vi.fn()
const originalLocation = window.location

beforeEach(() => {
  vi.clearAllMocks()
  assignSpy.mockReset()
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: { ...originalLocation, assign: (url: string | URL) => assignSpy(String(url)) },
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

afterAll(() => {
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: originalLocation,
  })
})

function makeWrapper(client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })) {
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children)
  return { wrapper, client }
}

describe('useMigrationStatus', () => {
  it('GETs /admin/migration-status and returns the parsed body', async () => {
    mockApi.get.mockResolvedValue(STATUS)
    const { wrapper } = makeWrapper()

    const { result } = renderHook(() => useMigrationStatus(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApi.get).toHaveBeenCalledWith('/admin/migration-status')
    expect(result.current.data).toEqual(STATUS)
  })
})

describe('useRunMigration', () => {
  it('POSTs /admin/migrate and resolves with the freshly-started JobResponse on 202', async () => {
    mockApi.post.mockResolvedValue(RUNNING_JOB)
    const { wrapper } = makeWrapper()

    const { result } = renderHook(() => useRunMigration(), { wrapper })
    const data = await result.current.mutateAsync()

    expect(mockApi.post).toHaveBeenCalledWith('/admin/migrate')
    expect(data).toEqual(RUNNING_JOB)
  })

  it('treats 409 Conflict as success — server returns the same JobResponse shape, just attached to an in-flight job', async () => {
    // The api wrapper throws ApiError(409, response.text()). For our endpoint
    // the response body is the same JSON shape as 202, just for the existing
    // RUNNING job. Hook should parse the message and resolve as success;
    // surfacing 409 as an error would put a destructive block under a button
    // the SPA just clicked, even though the run is going fine.
    mockApi.post.mockRejectedValue(new ApiError(409, JSON.stringify(RUNNING_JOB)))
    const { wrapper } = makeWrapper()

    const { result } = renderHook(() => useRunMigration(), { wrapper })
    const data = await result.current.mutateAsync()

    expect(data).toEqual(RUNNING_JOB)
    expect(result.current.isError).toBe(false)
    expect(assignSpy).not.toHaveBeenCalled()
  })

  it('surfaces ApiError(403) as isError and does NOT redirect to OIDC', async () => {
    mockApi.post.mockRejectedValue(new ApiError(403, 'Forbidden'))
    const { wrapper } = makeWrapper()

    const { result } = renderHook(() => useRunMigration(), { wrapper })
    await result.current.mutateAsync().catch(() => undefined)

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect((result.current.error as ApiError).status).toBe(403)
    expect(assignSpy).not.toHaveBeenCalled()
  })

  it('primes the [migration, job] cache on success so useMigrationJob picks up immediately', async () => {
    mockApi.post.mockResolvedValue(RUNNING_JOB)
    const { wrapper, client } = makeWrapper()

    const { result } = renderHook(() => useRunMigration(), { wrapper })
    await result.current.mutateAsync()

    expect(client.getQueryData(['migration', 'job'])).toEqual(RUNNING_JOB)
  })

  it('invalidates [migration,status] AND [config,component-defaults] when POST returns a COMPLETED job (fast-path)', async () => {
    // CRS can return COMPLETED directly when the migration finishes inside
    // the request lifecycle (small migration, or the test SyncTaskExecutor
    // swap). The panel's RUNNING → COMPLETED transition listener never sees
    // the start, so onSuccess has to invalidate the downstream caches itself
    // — otherwise the top status tiles + the component-defaults editor stay
    // stuck on pre-migration data.
    mockApi.post.mockResolvedValue(COMPLETED_JOB)
    const { wrapper, client } = makeWrapper()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(() => useRunMigration(), { wrapper })
    await result.current.mutateAsync()

    const invalidatedKeys = invalidateSpy.mock.calls.map(
      (call) => (call[0] as { queryKey?: readonly unknown[] } | undefined)?.queryKey,
    )
    expect(invalidatedKeys).toContainEqual(['migration', 'status'])
    expect(invalidatedKeys).toContainEqual(['config', 'component-defaults'])
  })

  it('does NOT invalidate downstream caches when POST returns a still-RUNNING job', async () => {
    // For the common case (POST → 202 + RUNNING) the panel handles the
    // RUNNING → COMPLETED transition itself and triggers invalidations
    // there. Doing it here too would just thrash the status query mid-run.
    mockApi.post.mockResolvedValue(RUNNING_JOB)
    const { wrapper, client } = makeWrapper()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(() => useRunMigration(), { wrapper })
    await result.current.mutateAsync()

    const invalidatedKeys = invalidateSpy.mock.calls.map(
      (call) => (call[0] as { queryKey?: readonly unknown[] } | undefined)?.queryKey,
    )
    expect(invalidatedKeys).not.toContainEqual(['migration', 'status'])
    expect(invalidatedKeys).not.toContainEqual(['config', 'component-defaults'])
  })
})

describe('useMigrationJob', () => {
  it('GETs /admin/migrate/job and returns the parsed body', async () => {
    mockApi.get.mockResolvedValue(RUNNING_JOB)
    const { wrapper } = makeWrapper()

    const { result } = renderHook(() => useMigrationJob(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApi.get).toHaveBeenCalledWith('/admin/migrate/job')
    expect(result.current.data).toEqual(RUNNING_JOB)
  })

  it('treats 404 as "no job" — returns data=null without surfacing as an error', async () => {
    // The endpoint returns 404 when no migration has been started since pod
    // boot; the SPA needs to know "nothing here yet" without painting a
    // destructive error in the panel.
    mockApi.get.mockRejectedValue(new ApiError(404, 'Not Found'))
    const { wrapper } = makeWrapper()

    const { result } = renderHook(() => useMigrationJob(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toBeNull()
    expect(result.current.isError).toBe(false)
  })

  it('polls every second while state is RUNNING', async () => {
    vi.useFakeTimers()
    mockApi.get.mockResolvedValue(RUNNING_JOB)
    const { wrapper } = makeWrapper()

    const { result } = renderHook(() => useMigrationJob(), { wrapper })
    await vi.waitFor(() => expect(result.current.data).toEqual(RUNNING_JOB))

    expect(mockApi.get).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1100)
    expect(mockApi.get).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1100)
    expect(mockApi.get).toHaveBeenCalledTimes(3)
  })

  it('stops polling once state transitions to COMPLETED', async () => {
    vi.useFakeTimers()
    // First call returns RUNNING; second call returns COMPLETED — that should
    // arm + then disarm the refetchInterval.
    mockApi.get.mockResolvedValueOnce(RUNNING_JOB).mockResolvedValueOnce(COMPLETED_JOB)
    const { wrapper } = makeWrapper()

    const { result } = renderHook(() => useMigrationJob(), { wrapper })
    await vi.waitFor(() => expect(result.current.data?.state).toBe('RUNNING'))

    await vi.advanceTimersByTimeAsync(1100)
    await vi.waitFor(() => expect(result.current.data?.state).toBe('COMPLETED'))

    const callCountAfterComplete = mockApi.get.mock.calls.length
    // No further polls — the interval should disarm now that state !== RUNNING.
    await vi.advanceTimersByTimeAsync(3000)
    expect(mockApi.get).toHaveBeenCalledTimes(callCountAfterComplete)
  })
})
