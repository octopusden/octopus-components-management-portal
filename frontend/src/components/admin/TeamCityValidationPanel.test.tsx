import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import {
  useRunTeamCityValidation,
  useTeamCityValidationJob,
} from '@/hooks/useTeamCityValidation'
import { useHistoryMigrationJob, useMigrationJob } from '@/hooks/useMigration'
import { useTeamCityResyncJob } from '@/hooks/useTeamCityResync'
import { toast } from '@/hooks/use-toast'
import { useAdminMode } from '@/lib/adminModeStore'
import type { TeamCityValidationJobResponse, TeamCityValidationResult } from '@/lib/types'
import { TeamCityValidationPanel } from './TeamCityValidationPanel'

// Hooks are mocked so the panel test focuses on panel behaviour: admin-mode
// gate, confirm dialog, RUNNING/COMPLETED/FAILED rendering, terminal-state
// toast, cross-kind disable. The hooks themselves are covered by
// useTeamCityValidation.test.ts.

vi.mock('@/hooks/useTeamCityValidation', () => ({
  useRunTeamCityValidation: vi.fn(),
  useTeamCityValidationJob: vi.fn(),
}))
vi.mock('@/hooks/useMigration', () => ({
  useMigrationJob: vi.fn(),
  useHistoryMigrationJob: vi.fn(),
}))
vi.mock('@/hooks/useTeamCityResync', () => ({
  useTeamCityResyncJob: vi.fn(),
}))
vi.mock('@/hooks/use-toast', () => ({
  toast: vi.fn(),
}))

const mockUseRun = vi.mocked(useRunTeamCityValidation)
const mockUseJob = vi.mocked(useTeamCityValidationJob)
const mockUseMigrationJob = vi.mocked(useMigrationJob)
const mockUseHistoryJob = vi.mocked(useHistoryMigrationJob)
const mockUseResyncJob = vi.mocked(useTeamCityResyncJob)
const mockToast = vi.mocked(toast)

// Literal shape of CRS's TeamcityValidationResult — every field required
// there. Guards against the panel silently falling back to `undefined` for
// fields that don't exist on the real backend response (the bug this test
// was added to catch: the old type had `findings`/`componentsWithIssues`,
// which CRS never sends).
const RESULT: TeamCityValidationResult = {
  scanned: 650,
  succeeded: 600,
  failed: 5,
  projectsWithIssues: 45,
  removed: 3,
  errors: [],
}

const RUNNING_JOB: TeamCityValidationJobResponse = {
  kind: 'job',
  id: 'tcv-1',
  state: 'RUNNING',
  startedAt: '2026-05-06T10:00:00Z',
  finishedAt: null,
  errorMessage: null,
  result: null,
}

const COMPLETED_JOB: TeamCityValidationJobResponse = {
  ...RUNNING_JOB,
  state: 'COMPLETED',
  finishedAt: '2026-05-06T10:00:42Z',
  result: RESULT,
}

const FAILED_JOB: TeamCityValidationJobResponse = {
  ...RUNNING_JOB,
  state: 'FAILED',
  finishedAt: '2026-05-06T10:00:05Z',
  errorMessage: 'TC unreachable',
}

function buildMutation(
  overrides: Partial<ReturnType<typeof useRunTeamCityValidation>> = {},
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
    } as unknown as ReturnType<typeof useRunTeamCityValidation>,
    mutateAsync,
  }
}

function buildJobQuery(
  data: TeamCityValidationJobResponse | null = null,
): ReturnType<typeof useTeamCityValidationJob> {
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
  } as unknown as ReturnType<typeof useTeamCityValidationJob>
}

function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return {
    client,
    ...render(
      React.createElement(QueryClientProvider, { client }, <TeamCityValidationPanel />),
    ),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  useAdminMode.setState({ enabled: false })
  mockUseRun.mockReturnValue(buildMutation().base)
  mockUseJob.mockReturnValue(buildJobQuery(null))
  // Default: no other job kind running, so the cross-disable text doesn't render.
  mockUseMigrationJob.mockReturnValue(buildJobQuery(null) as never)
  mockUseHistoryJob.mockReturnValue(buildJobQuery(null) as never)
  mockUseResyncJob.mockReturnValue(buildJobQuery(null) as never)
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  useAdminMode.setState({ enabled: false })
})

describe('TeamCityValidationPanel — admin-mode gate', () => {
  it('disables the button when adminMode is false', () => {
    renderPanel()
    expect(screen.getByRole('button', { name: /run tc validation/i })).toBeDisabled()
    expect(screen.getByText(/Arm Admin mode above/i)).toBeDefined()
  })

  it('enables the button once adminMode flips to true', () => {
    renderPanel()
    act(() => {
      useAdminMode.setState({ enabled: true })
    })
    expect(screen.getByRole('button', { name: /run tc validation/i })).not.toBeDisabled()
  })
})

describe('TeamCityValidationPanel — confirm + mutation', () => {
  it('opens confirm dialog and fires useRunTeamCityValidation on confirm', async () => {
    const { base, mutateAsync } = buildMutation()
    mockUseRun.mockReturnValue(base)
    useAdminMode.setState({ enabled: true })

    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: /run tc validation/i }))

    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /confirm/i }))

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledOnce())
  })

  it('cancels without firing the mutation when Cancel is clicked', async () => {
    const { base, mutateAsync } = buildMutation()
    mockUseRun.mockReturnValue(base)
    useAdminMode.setState({ enabled: true })

    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: /run tc validation/i }))

    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /cancel/i }))

    expect(mutateAsync).not.toHaveBeenCalled()
  })
})

describe('TeamCityValidationPanel — RUNNING / COMPLETED / FAILED rendering', () => {
  it('renders the indeterminate progress block while the job is RUNNING', () => {
    mockUseJob.mockReturnValue(buildJobQuery(RUNNING_JOB))
    useAdminMode.setState({ enabled: true })
    renderPanel()
    expect(screen.getByTestId('tc-validation-progress')).toBeDefined()
    expect(screen.getByRole('button', { name: /validating/i })).toBeDisabled()
  })

  it('renders all six counter tiles on COMPLETED using the real CRS field names', () => {
    mockUseJob.mockReturnValue(buildJobQuery(COMPLETED_JOB))
    useAdminMode.setState({ enabled: true })
    renderPanel()
    expect(screen.getByText('Scanned')).toBeDefined()
    expect(screen.getByText('650')).toBeDefined()
    expect(screen.getByText('Succeeded')).toBeDefined()
    expect(screen.getByText('600')).toBeDefined()
    expect(screen.getByText('Failed')).toBeDefined()
    expect(screen.getByText('5')).toBeDefined()
    expect(screen.getByText('Projects with issues')).toBeDefined()
    expect(screen.getByText('45')).toBeDefined()
    expect(screen.getByText('Removed')).toBeDefined()
    expect(screen.getByText('3')).toBeDefined()
    expect(screen.getByText('Errors')).toBeDefined()
  })

  it('expands the errors disclosure with each error string when errors are present', () => {
    const failures: TeamCityValidationJobResponse = {
      ...COMPLETED_JOB,
      result: {
        ...RESULT,
        errors: ['comp-alpha: TC 500 (timeout)', 'comp-beta: no matching project'],
      },
    }
    mockUseJob.mockReturnValue(buildJobQuery(failures))
    useAdminMode.setState({ enabled: true })
    renderPanel()
    expect(screen.getByText(/Errors \(2\)/i)).toBeDefined()
    expect(screen.getByText(/comp-alpha: TC 500/)).toBeDefined()
    expect(screen.getByText(/comp-beta: no matching project/)).toBeDefined()
  })

  it('renders a destructive banner with errorMessage on FAILED', () => {
    mockUseJob.mockReturnValue(buildJobQuery(FAILED_JOB))
    useAdminMode.setState({ enabled: true })
    renderPanel()
    expect(screen.getByText(/TC validation failed: TC unreachable/i)).toBeDefined()
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

describe('TeamCityValidationPanel — terminal COMPLETED side-effects', () => {
  it('emits a success toast using the real CRS fields and invalidates caches on COMPLETED', async () => {
    useAdminMode.setState({ enabled: true })

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')

    mockUseJob.mockReturnValue(buildJobQuery(COMPLETED_JOB))
    render(
      React.createElement(QueryClientProvider, { client }, <TeamCityValidationPanel />),
    )

    await waitFor(() => expect(mockToast).toHaveBeenCalledOnce())
    const call = mockToast.mock.calls[0]?.[0] as { title: string; description: string }
    expect(call.title).toMatch(/TC validation completed/i)
    expect(call.description).toContain('650 scanned')
    expect(call.description).toContain('600 succeeded')
    expect(call.description).toContain('5 failed')
    expect(call.description).toContain('45 projects with issues')
    expect(call.description).toContain('3 removed')

    const calls = invalidateSpy.mock.calls
    const queryKeyForms = calls.map(
      (c) => (c[0] as { queryKey?: readonly unknown[] } | undefined)?.queryKey,
    )
    const hasPredicateCall = calls.some(
      (c) =>
        typeof (c[0] as { predicate?: unknown } | undefined)?.predicate === 'function',
    )
    expect(queryKeyForms).toContainEqual(['components'])
    expect(queryKeyForms).toContainEqual(['teamcity-validations'])
    expect(hasPredicateCall).toBe(true)
  })

  it('does NOT re-fire toast/invalidations on subsequent re-renders for the same job id', async () => {
    useAdminMode.setState({ enabled: true })

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    mockUseJob.mockReturnValue(buildJobQuery(COMPLETED_JOB))
    const { rerender } = render(
      React.createElement(QueryClientProvider, { client }, <TeamCityValidationPanel />),
    )
    await waitFor(() => expect(mockToast).toHaveBeenCalledOnce())
    const initialCount = mockToast.mock.calls.length

    rerender(
      React.createElement(QueryClientProvider, { client }, <TeamCityValidationPanel />),
    )

    expect(mockToast.mock.calls.length).toBe(initialCount)
  })
})

describe('TeamCityValidationPanel — cross-kind disable', () => {
  it('disables the button + shows hint when components migration is RUNNING', () => {
    mockUseMigrationJob.mockReturnValue(
      buildJobQuery({ state: 'RUNNING', id: 'comp-1' } as never) as never,
    )
    useAdminMode.setState({ enabled: true })
    renderPanel()
    expect(screen.getByRole('button', { name: /run tc validation/i })).toBeDisabled()
    expect(screen.getByText(/Components migration is running/i)).toBeDefined()
  })

  it('disables the button + shows hint when history migration is RUNNING', () => {
    mockUseHistoryJob.mockReturnValue(
      buildJobQuery({ state: 'RUNNING', id: 'hist-1' } as never) as never,
    )
    useAdminMode.setState({ enabled: true })
    renderPanel()
    expect(screen.getByRole('button', { name: /run tc validation/i })).toBeDisabled()
    expect(screen.getByText(/History migration is running/i)).toBeDefined()
  })

  it('disables the button + shows hint when TC resync is RUNNING', () => {
    mockUseResyncJob.mockReturnValue(
      buildJobQuery({ state: 'RUNNING', id: 'resync-1' } as never) as never,
    )
    useAdminMode.setState({ enabled: true })
    renderPanel()
    expect(screen.getByRole('button', { name: /run tc validation/i })).toBeDisabled()
    expect(screen.getByText(/TC resync is running/i)).toBeDefined()
  })
})
