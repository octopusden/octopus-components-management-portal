import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useMigrationStatus, useRunMigration } from './useMigration'
import { api, ApiError } from '../lib/api'
import type { FullMigrationResult, MigrationStatus } from '../lib/types'

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api')
  return {
    ...actual,
    api: { get: vi.fn(), post: vi.fn() },
  }
})
const mockApi = vi.mocked(api)

// useRunMigration must invalidate two query keys after a successful migration:
//   - ['migration', 'status']         — re-fetches MigrationStatus.
//   - ['config', 'component-defaults'] — re-fetches the defaults the migration
//     just rewrote (FullMigrationResult.defaults is the new shape, but the
//     /config/component-defaults endpoint is what other admin tabs read).
// Without invalidating both, the AdminSettingsPage shows pre-migration data
// even after a successful run.

const STATUS: MigrationStatus = { git: 12, db: 3, total: 15 }
const FULL_RESULT: FullMigrationResult = {
  defaults: { build: { javaVersion: '21' } },
  components: { total: 15, migrated: 14, failed: 1, skipped: 0, results: [] },
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
  it('POSTs /admin/migrate and resolves with FullMigrationResult', async () => {
    mockApi.post.mockResolvedValue(FULL_RESULT)
    const { wrapper } = makeWrapper()

    const { result } = renderHook(() => useRunMigration(), { wrapper })
    const data = await result.current.mutateAsync()

    expect(mockApi.post).toHaveBeenCalledWith('/admin/migrate')
    expect(data).toEqual(FULL_RESULT)
  })

  it('invalidates [migration,status] AND [config,component-defaults] on success', async () => {
    mockApi.post.mockResolvedValue(FULL_RESULT)
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

  it('surfaces ApiError(403) as isError and does NOT redirect to OIDC', async () => {
    // The api wrapper redirects on 401; for 403 it should just throw the
    // ApiError. The hook must not transform or hide it. The Run-migration
    // button needs the error to render the inline failure block — bouncing
    // the user to login on a permission failure is wrong.
    mockApi.post.mockRejectedValue(new ApiError(403, 'Forbidden'))
    const { wrapper } = makeWrapper()

    const { result } = renderHook(() => useRunMigration(), { wrapper })
    await result.current.mutateAsync().catch(() => undefined)

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect((result.current.error as ApiError).status).toBe(403)
    expect(assignSpy).not.toHaveBeenCalled()
  })
})
