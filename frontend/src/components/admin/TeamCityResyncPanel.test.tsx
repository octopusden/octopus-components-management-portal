import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import {
  useRunTeamCityResync,
  useTeamCityResyncJob,
  type TeamCityResyncResult,
} from '@/hooks/useTeamCityResync'
import { useHistoryMigrationJob, useMigrationJob } from '@/hooks/useMigration'
import { toast } from '@/hooks/use-toast'
import { useAdminMode } from '@/lib/adminModeStore'
import type { TeamCityResyncJobResponse } from '@/lib/types'
import { TeamCityResyncPanel } from './TeamCityResyncPanel'

// Hooks are mocked so the panel test focuses on panel behaviour: admin-mode
// gate, confirm dialog, RUNNING/COMPLETED/FAILED rendering, terminal-state
// toast, cross-kind disable. The hooks themselves are covered by
// useTeamCityResync.test.ts and useMigration.test.ts.

vi.mock('@/hooks/useTeamCityResync', () => ({
  useRunTeamCityResync: vi.fn(),
  useTeamCityResyncJob: vi.fn(),
}))
vi.mock('@/hooks/useMigration', () => ({
  useMigrationJob: vi.fn(),
  useHistoryMigrationJob: vi.fn(),
}))
vi.mock('@/hooks/use-toast', () => ({
  toast: vi.fn(),
}))

const mockUseRun = vi.mocked(useRunTeamCityResync)
const mockUseJob = vi.mocked(useTeamCityResyncJob)
const mockUseMigrationJob = vi.mocked(useMigrationJob)
const mockUseHistoryJob = vi.mocked(useHistoryMigrationJob)
const mockToast = vi.mocked(toast)

const RESULT: TeamCityResyncResult = {
  scanned: 650,
  updated: 12,
  unchanged: 580,
  skipped_no_match: 50,
  skipped_ambiguous: 8,
  ambiguous_auto_resolved: 4,
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
  result: RESULT,
}

const FAILED_JOB: TeamCityResyncJobResponse = {
  ...RUNNING_JOB,
  state: 'FAILED',
  finishedAt: '2026-05-06T10:00:05Z',
  errorMessage: 'TC unreachable',
}

function buildMutation(
  overrides: Partial<ReturnType<typeof useRunTeamCityResync>> = {},
) {
  const mutateAsync = vi.fn().mockResolvedValue(RUNNING_JOB)
  return {
    base: {
      mutate: vi.fn(),
      mutateAsync,
      reset: vi.fn(),
      isPending: false,
      isSuccess: false,
      isError: false,
      isIdle: true,
      data: undefined,
      error: null,
      status: 'idle',
      variables: undefined,
      submittedAt: 0,
      failureCount: 0,
      failureReason: null,
      isPaused: false,
      ...overrides,
    } as unknown as ReturnType<typeof useRunTeamCityResync>,
    mutateAsync,
  }
}

function buildJobQuery(
  data: TeamCityResyncJobResponse | null = null,
): ReturnType<typeof useTeamCityResyncJob> {
  return {
    data,
    isPending: false,
    isError: false,
    isSuccess: true,
    error: null,
    status: 'success',
    refetch: vi.fn(),
    isFetching: false,
    isRefetching: false,
    isStale: false,
    dataUpdatedAt: 0,
    errorUpdatedAt: 0,
    failureCount: 0,
    failureReason: null,
    isFetchedAfterMount: true,
    isFetched: true,
    isLoading: false,
    isLoadingError: false,
    isPaused: false,
    isPlaceholderData: false,
    isRefetchError: false,
    fetchStatus: 'idle',
  } as unknown as ReturnType<typeof useTeamCityResyncJob>
}

function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return {
    client,
    ...render(
      React.createElement(QueryClientProvider, { client }, <TeamCityResyncPanel />),
    ),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  useAdminMode.setState({ enabled: false })
  mockUseRun.mockReturnValue(buildMutation().base)
  mockUseJob.mockReturnValue(buildJobQuery(null))
  // Default: no other migration kind running, so the cross-disable text
  // doesn't render.
  mockUseMigrationJob.mockReturnValue(buildJobQuery(null) as never)
  mockUseHistoryJob.mockReturnValue(buildJobQuery(null) as never)
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  useAdminMode.setState({ enabled: false })
})

describe('TeamCityResyncPanel — admin-mode gate', () => {
  it('disables the button when adminMode is false', () => {
    renderPanel()
    expect(screen.getByRole('button', { name: /resync tc project ids/i })).toBeDisabled()
    expect(screen.getByText(/Arm Admin mode above/i)).toBeDefined()
  })

  it('enables the button once adminMode flips to true', () => {
    renderPanel()
    act(() => {
      useAdminMode.setState({ enabled: true })
    })
    expect(screen.getByRole('button', { name: /resync tc project ids/i })).not.toBeDisabled()
  })
})

describe('TeamCityResyncPanel — confirm + mutation', () => {
  it('opens confirm dialog and fires useRunTeamCityResync on confirm', async () => {
    const { base, mutateAsync } = buildMutation()
    mockUseRun.mockReturnValue(base)
    useAdminMode.setState({ enabled: true })

    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: /resync tc project ids/i }))

    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /confirm/i }))

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledOnce())
  })

  it('cancels without firing the mutation when Cancel is clicked', async () => {
    const { base, mutateAsync } = buildMutation()
    mockUseRun.mockReturnValue(base)
    useAdminMode.setState({ enabled: true })

    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: /resync tc project ids/i }))

    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /cancel/i }))

    expect(mutateAsync).not.toHaveBeenCalled()
  })
})

describe('TeamCityResyncPanel — RUNNING / COMPLETED / FAILED rendering', () => {
  it('renders the indeterminate progress block while the job is RUNNING', () => {
    mockUseJob.mockReturnValue(buildJobQuery(RUNNING_JOB))
    useAdminMode.setState({ enabled: true })
    renderPanel()
    expect(screen.getByTestId('tc-resync-progress')).toBeDefined()
    // Button shows "Resyncing…" while a RUNNING job is being polled.
    expect(screen.getByRole('button', { name: /resyncing/i })).toBeDisabled()
  })

  it('renders all seven counter tiles on COMPLETED', () => {
    mockUseJob.mockReturnValue(buildJobQuery(COMPLETED_JOB))
    useAdminMode.setState({ enabled: true })
    renderPanel()
    expect(screen.getByText('650')).toBeDefined()
    expect(screen.getByText('12')).toBeDefined()
    expect(screen.getByText('580')).toBeDefined()
    expect(screen.getByText('50')).toBeDefined()
    expect(screen.getByText('8')).toBeDefined()
    expect(screen.getByText('Auto-resolved')).toBeDefined()
    // Pin the new sub-counter value to guard against tile reordering accidentally
    // mapping a number to the wrong label.
    expect(screen.getByText('4')).toBeDefined()
    expect(screen.getByText('Errors')).toBeDefined()
  })

  it('renders Auto-resolved as 0 when the field is absent (older CRS without ambiguous_auto_resolved)', () => {
    const { ambiguous_auto_resolved: _omit, ...legacyResult } = RESULT
    void _omit
    // No cast: ambiguous_auto_resolved is optional on TeamCityResyncResult, so
    // omitting it via destructuring still satisfies the type.
    const legacyJob: TeamCityResyncJobResponse = {
      ...COMPLETED_JOB,
      result: legacyResult,
    }
    mockUseJob.mockReturnValue(buildJobQuery(legacyJob))
    useAdminMode.setState({ enabled: true })
    renderPanel()
    // Scope the assertion to the Auto-resolved tile because the Errors tile
    // also renders "0" with this fixture; a global getByText('0') would
    // ambiguously match both. Walk the DOM via parentElement (the StatCard
    // root) rather than a Tailwind class selector, so the test is stable
    // against purely presentational refactors of StatCard.
    const autoResolvedTile = screen.getByText('Auto-resolved').parentElement as HTMLElement
    expect(autoResolvedTile).not.toBeNull()
    expect(within(autoResolvedTile).getByText('0')).toBeDefined()
  })

  it('expands the errors disclosure with each error string when errors are present', () => {
    const failures: TeamCityResyncJobResponse = {
      ...COMPLETED_JOB,
      result: {
        ...RESULT,
        errors: ['comp-alpha: TC 500 (timeout)', 'comp-beta: ambiguous match'],
      },
    }
    mockUseJob.mockReturnValue(buildJobQuery(failures))
    useAdminMode.setState({ enabled: true })
    renderPanel()
    expect(screen.getByText(/Errors \(2\)/i)).toBeDefined()
    expect(screen.getByText(/comp-alpha: TC 500/)).toBeDefined()
    expect(screen.getByText(/comp-beta: ambiguous match/)).toBeDefined()
  })

  it('renders a destructive banner with errorMessage on FAILED', () => {
    mockUseJob.mockReturnValue(buildJobQuery(FAILED_JOB))
    useAdminMode.setState({ enabled: true })
    renderPanel()
    expect(screen.getByText(/TC resync failed: TC unreachable/i)).toBeDefined()
  })

  it('renders a destructive banner when the start mutation errors (cross-kind 409 etc.)', () => {
    mockUseRun.mockReturnValue(
      buildMutation({
        isError: true,
        isIdle: false,
        status: 'error',
        error: new Error('Components migration is currently running. Wait for it to finish.'),
      }).base,
    )
    useAdminMode.setState({ enabled: true })
    renderPanel()
    expect(screen.getByText(/Components migration is currently running/i)).toBeDefined()
  })
})

describe('TeamCityResyncPanel — terminal COMPLETED side-effects', () => {
  it('emits success toast and invalidates components + per-component caches on COMPLETED (post-restart mount path included)', async () => {
    useAdminMode.setState({ enabled: true })

    // Spy BEFORE the render — the panel's effect fires invalidateQueries
    // synchronously on mount when state is already COMPLETED, so a spy
    // installed post-render misses the call.
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')

    // Mount directly into COMPLETED — covers the post-pod-restart path where
    // the panel never observed RUNNING but the recovered job is COMPLETED.
    // The id-based dedupe in the panel ensures the toast/invalidations fire
    // exactly once per job id.
    mockUseJob.mockReturnValue(buildJobQuery(COMPLETED_JOB))
    render(
      React.createElement(QueryClientProvider, { client }, <TeamCityResyncPanel />),
    )

    await waitFor(() => expect(mockToast).toHaveBeenCalledOnce())
    const call = mockToast.mock.calls[0]?.[0] as { title: string; description: string }
    expect(call.title).toMatch(/TC resync completed/i)
    expect(call.description).toContain('650 scanned')
    expect(call.description).toContain('12 updated')
    expect(call.description).toContain('4 auto-resolved')

    // Pin BOTH invalidation calls so a regression that drops one (the
    // queryKey-based call OR the predicate-based call) is caught.
    const calls = invalidateSpy.mock.calls
    const queryKeyForms = calls.map(
      (c) => (c[0] as { queryKey?: readonly unknown[] } | undefined)?.queryKey,
    )
    const hasPredicateCall = calls.some(
      (c) =>
        typeof (c[0] as { predicate?: unknown } | undefined)?.predicate === 'function',
    )
    expect(queryKeyForms).toContainEqual(['components'])
    expect(hasPredicateCall).toBe(true)
  })

  it('does NOT re-fire toast/invalidations on subsequent re-renders for the same job id', async () => {
    useAdminMode.setState({ enabled: true })

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    mockUseJob.mockReturnValue(buildJobQuery(COMPLETED_JOB))
    const { rerender } = render(
      React.createElement(QueryClientProvider, { client }, <TeamCityResyncPanel />),
    )
    await waitFor(() => expect(mockToast).toHaveBeenCalledOnce())
    const initialCount = mockToast.mock.calls.length

    // Re-render with the same COMPLETED job — the id-based dedupe must
    // suppress a second toast/invalidation cycle.
    rerender(
      React.createElement(QueryClientProvider, { client }, <TeamCityResyncPanel />),
    )

    expect(mockToast.mock.calls.length).toBe(initialCount)
  })
})

describe('TeamCityResyncPanel — cross-kind disable', () => {
  it('disables the button + shows hint when components migration is RUNNING', () => {
    mockUseMigrationJob.mockReturnValue(
      buildJobQuery({ state: 'RUNNING', id: 'comp-1' } as never) as never,
    )
    useAdminMode.setState({ enabled: true })
    renderPanel()
    expect(screen.getByRole('button', { name: /resync tc project ids/i })).toBeDisabled()
    expect(screen.getByText(/Components migration is running/i)).toBeDefined()
  })

  it('disables the button + shows hint when history migration is RUNNING', () => {
    mockUseHistoryJob.mockReturnValue(
      buildJobQuery({ state: 'RUNNING', id: 'hist-1' } as never) as never,
    )
    useAdminMode.setState({ enabled: true })
    renderPanel()
    expect(screen.getByRole('button', { name: /resync tc project ids/i })).toBeDisabled()
    expect(screen.getByText(/History migration is running/i)).toBeDefined()
  })
})
