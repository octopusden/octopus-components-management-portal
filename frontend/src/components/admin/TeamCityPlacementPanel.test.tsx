import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import {
  useRunPlacementDiff,
  usePlacementDiffJob,
  usePlacementDiffReport,
  useRunPlacementSync,
  usePlacementSyncJob,
} from '@/hooks/useTeamCityPlacement'
import { useHistoryMigrationJob, useMigrationJob } from '@/hooks/useMigration'
import { useTeamCityResyncJob } from '@/hooks/useTeamCityResync'
import { useTeamCityValidationJob } from '@/hooks/useTeamCityValidation'
import { useAdminMode } from '@/lib/adminModeStore'
import { ApiError } from '@/lib/api'
import type {
  PlacementDiffResult,
  TeamcityPlacementDiffJobResponse,
  TeamcityPlacementSyncJobResponse,
} from '@/lib/types'
import { TeamCityPlacementPanel } from './TeamCityPlacementPanel'

// Hooks are mocked so this test focuses on panel behaviour — admin-mode gate,
// confirm dialogs, RUNNING/COMPLETED/FAILED rendering, the result table's
// filters/selection, and cross-kind disable. The hooks themselves are covered
// by useTeamCityPlacement.test.ts.

vi.mock('@/hooks/useTeamCityPlacement', () => ({
  useRunPlacementDiff: vi.fn(),
  usePlacementDiffJob: vi.fn(),
  usePlacementDiffReport: vi.fn(),
  useRunPlacementSync: vi.fn(),
  usePlacementSyncJob: vi.fn(),
}))
vi.mock('@/hooks/useMigration', () => ({
  useMigrationJob: vi.fn(),
  useHistoryMigrationJob: vi.fn(),
}))
vi.mock('@/hooks/useTeamCityResync', () => ({
  useTeamCityResyncJob: vi.fn(),
}))
vi.mock('@/hooks/useTeamCityValidation', () => ({
  useTeamCityValidationJob: vi.fn(),
}))

const mockUseRunDiff = vi.mocked(useRunPlacementDiff)
const mockUseDiffJob = vi.mocked(usePlacementDiffJob)
const mockUseReport = vi.mocked(usePlacementDiffReport)
const mockUseRunSync = vi.mocked(useRunPlacementSync)
const mockUseSyncJob = vi.mocked(usePlacementSyncJob)
const mockUseMigrationJob = vi.mocked(useMigrationJob)
const mockUseHistoryJob = vi.mocked(useHistoryMigrationJob)
const mockUseResyncJob = vi.mocked(useTeamCityResyncJob)
const mockUseValidationJob = vi.mocked(useTeamCityValidationJob)

function buildMutation<T>(overrides: Partial<Record<string, unknown>> = {}) {
  const mutateAsync = vi.fn().mockResolvedValue(undefined as unknown as T)
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
    },
    mutateAsync,
  }
}

function buildQuery<T>(data: T | null = null) {
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
  }
}

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
  rowCount: 2,
}

const FAILED_DIFF_JOB: TeamcityPlacementDiffJobResponse = {
  ...RUNNING_DIFF_JOB,
  state: 'FAILED',
  finishedAt: '2026-09-30T10:00:05Z',
  errorMessage: 'TC unreachable',
}

const REPORT: PlacementDiffResult = {
  generatedAt: '2026-09-30T10:00:42Z',
  rows: [
    {
      componentId: 'comp-a',
      componentKey: 'app-alpha',
      configurationRowId: 'row-a',
      versionRange: '[1.0,)',
      rowLabel: 'BASE',
      status: 'RESOLVED',
      entries: [
        {
          name: 'main',
          vcsPath: '.',
          currentCheckoutDirectory: undefined,
          derivedCheckoutDirectory: 'app-alpha',
          currentSourcePath: undefined,
          derivedSourcePath: undefined,
        },
      ],
      currentBuildWorkingDirectory: undefined,
      derivedBuildWorkingDirectory: 'app-alpha',
      sourceBuildTypeIds: ['Build_App_Alpha'],
      notes: [],
    },
    {
      componentId: 'comp-b',
      componentKey: 'app-beta',
      configurationRowId: 'row-b',
      versionRange: '[1.0,)',
      rowLabel: 'BASE',
      status: 'CONFLICT',
      entries: [],
      currentBuildWorkingDirectory: undefined,
      derivedBuildWorkingDirectory: undefined,
      sourceBuildTypeIds: ['Build_App_Beta_1', 'Build_App_Beta_2'],
      notes: ['two compile configurations disagree'],
    },
    {
      componentId: 'comp-c',
      componentKey: 'app-gamma',
      configurationRowId: 'row-c',
      versionRange: '[2.0,)',
      rowLabel: 'vcs.settings',
      status: 'OUTSIDE_SCOPE',
      entries: [],
      currentBuildWorkingDirectory: undefined,
      derivedBuildWorkingDirectory: undefined,
      sourceBuildTypeIds: [],
      notes: ['marker row — report-only'],
    },
  ],
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
    requested: 2,
    applied: 1,
    skipped: 1,
    failed: 0,
    components: [
      {
        componentId: 'comp-a',
        componentKey: 'app-alpha',
        rows: [{ configurationRowId: 'row-a', rowLabel: 'BASE', outcome: 'applied' }],
      },
      {
        componentId: 'comp-c',
        componentKey: 'app-gamma',
        rows: [{ configurationRowId: 'row-c', rowLabel: 'vcs.settings', outcome: 'skipped: outside scope' }],
      },
    ],
    fieldChanges: [],
  },
}

function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return {
    client,
    ...render(React.createElement(QueryClientProvider, { client }, <TeamCityPlacementPanel />)),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  useAdminMode.setState({ enabled: false })
  mockUseRunDiff.mockReturnValue(buildMutation().base as unknown as ReturnType<typeof useRunPlacementDiff>)
  mockUseDiffJob.mockReturnValue(buildQuery<TeamcityPlacementDiffJobResponse>(null) as unknown as ReturnType<
    typeof usePlacementDiffJob
  >)
  mockUseReport.mockReturnValue(buildQuery<PlacementDiffResult>(null) as unknown as ReturnType<
    typeof usePlacementDiffReport
  >)
  mockUseRunSync.mockReturnValue(buildMutation().base as unknown as ReturnType<typeof useRunPlacementSync>)
  mockUseSyncJob.mockReturnValue(buildQuery<TeamcityPlacementSyncJobResponse>(null) as unknown as ReturnType<
    typeof usePlacementSyncJob
  >)
  mockUseMigrationJob.mockReturnValue(buildQuery(null) as never)
  mockUseHistoryJob.mockReturnValue(buildQuery(null) as never)
  mockUseResyncJob.mockReturnValue(buildQuery(null) as never)
  mockUseValidationJob.mockReturnValue(buildQuery(null) as never)
})

afterEach(() => {
  cleanup()
  useAdminMode.setState({ enabled: false })
})

describe('TeamCityPlacementPanel — admin-mode gate', () => {
  it('disables Run Diff when adminMode is false', () => {
    renderPanel()
    expect(screen.getByRole('button', { name: /run diff/i })).toBeDisabled()
  })

  it('enables Run Diff once adminMode flips to true', () => {
    renderPanel()
    act(() => useAdminMode.setState({ enabled: true }))
    expect(screen.getByRole('button', { name: /run diff/i })).not.toBeDisabled()
  })
})

describe('TeamCityPlacementPanel — Run Diff confirm + mutation', () => {
  it('opens confirm dialog and fires useRunPlacementDiff on confirm', async () => {
    const { base, mutateAsync } = buildMutation()
    mockUseRunDiff.mockReturnValue(base as unknown as ReturnType<typeof useRunPlacementDiff>)
    useAdminMode.setState({ enabled: true })

    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: /run diff/i }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /confirm/i }))

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledOnce())
  })

  it('renders the RUNNING progress region with aria-live', () => {
    mockUseDiffJob.mockReturnValue(buildQuery(RUNNING_DIFF_JOB) as unknown as ReturnType<typeof usePlacementDiffJob>)
    useAdminMode.setState({ enabled: true })
    renderPanel()
    const region = screen.getByTestId('tc-placement-diff-progress')
    expect(region.getAttribute('aria-live')).toBe('polite')
  })

  it('renders a destructive banner with errorMessage on FAILED', () => {
    mockUseDiffJob.mockReturnValue(buildQuery(FAILED_DIFF_JOB) as unknown as ReturnType<typeof usePlacementDiffJob>)
    useAdminMode.setState({ enabled: true })
    renderPanel()
    expect(screen.getByText(/Diff failed: TC unreachable/i)).toBeDefined()
  })
})

describe('TeamCityPlacementPanel — report links', () => {
  it('shows Open report (HTML) and Download CSV once a Diff has completed', () => {
    mockUseDiffJob.mockReturnValue(buildQuery(COMPLETED_DIFF_JOB) as unknown as ReturnType<typeof usePlacementDiffJob>)
    mockUseReport.mockReturnValue(buildQuery(REPORT) as unknown as ReturnType<typeof usePlacementDiffReport>)
    renderPanel()
    const htmlLink = screen.getByRole('link', { name: /open report \(html\)/i })
    const csvLink = screen.getByRole('link', { name: /download csv/i })
    expect(htmlLink.getAttribute('href')).toMatch(/\/admin\/teamcity-placement\/diff\/report\.html$/)
    expect(csvLink.getAttribute('href')).toMatch(/\/admin\/teamcity-placement\/diff\/report\.csv$/)
  })

  it('does not show report links before any Diff has completed', () => {
    renderPanel()
    expect(screen.queryByRole('link', { name: /open report/i })).toBeNull()
  })
})

describe('TeamCityPlacementPanel — result table', () => {
  beforeEach(() => {
    mockUseDiffJob.mockReturnValue(buildQuery(COMPLETED_DIFF_JOB) as unknown as ReturnType<typeof usePlacementDiffJob>)
    mockUseReport.mockReturnValue(buildQuery(REPORT) as unknown as ReturnType<typeof usePlacementDiffReport>)
  })

  it('renders one row per report row with its status', () => {
    renderPanel()
    const table = within(screen.getByRole('table'))
    expect(table.getByText('app-alpha')).toBeDefined()
    expect(table.getByText('app-beta')).toBeDefined()
    expect(table.getByText('RESOLVED')).toBeDefined()
    expect(table.getByText('CONFLICT')).toBeDefined()
  })

  it('enables the row checkbox only for the RESOLVED + BASE row', () => {
    renderPanel()
    expect(screen.getByRole('checkbox', { name: /select app-alpha/i })).not.toBeDisabled()
    expect(screen.getByRole('checkbox', { name: /select app-beta/i })).toBeDisabled()
  })

  it('renders an OUTSIDE_SCOPE marker row (archived component / per-range row) with a disabled checkbox', () => {
    renderPanel()
    const table = within(screen.getByRole('table'))
    expect(table.getByText('app-gamma')).toBeDefined()
    expect(table.getByText('OUTSIDE_SCOPE')).toBeDefined()
    expect(screen.getByRole('checkbox', { name: /select app-gamma/i })).toBeDisabled()
    // Also offered as a status filter option.
    expect(within(screen.getByLabelText(/^status$/i)).getByRole('option', { name: 'OUTSIDE_SCOPE' })).toBeDefined()
  })

  it('filters rows by status', () => {
    renderPanel()
    fireEvent.change(screen.getByLabelText(/^status$/i), { target: { value: 'CONFLICT' } })
    expect(screen.queryByText('app-alpha')).toBeNull()
    expect(screen.getByText('app-beta')).toBeDefined()
  })

  it('filters rows by component text', () => {
    renderPanel()
    fireEvent.change(screen.getByLabelText(/component/i), { target: { value: 'alpha' } })
    expect(screen.getByText('app-alpha')).toBeDefined()
    expect(screen.queryByText('app-beta')).toBeNull()
  })

  it('"Select all resolved" selects every RESOLVED + BASE row', () => {
    renderPanel()
    fireEvent.click(screen.getByRole('checkbox', { name: /select all resolved/i }))
    expect(screen.getByRole('checkbox', { name: /select app-alpha/i })).toBeChecked()
  })
})

describe('TeamCityPlacementPanel — Sync selected', () => {
  beforeEach(() => {
    mockUseDiffJob.mockReturnValue(buildQuery(COMPLETED_DIFF_JOB) as unknown as ReturnType<typeof usePlacementDiffJob>)
    mockUseReport.mockReturnValue(buildQuery(REPORT) as unknown as ReturnType<typeof usePlacementDiffReport>)
    useAdminMode.setState({ enabled: true })
  })

  it('disables Sync selected until a row is selected', () => {
    renderPanel()
    expect(screen.getByRole('button', { name: /sync selected/i })).toBeDisabled()
  })

  it('confirm dialog shows the selected count and fires useRunPlacementSync with diffId + componentIds', async () => {
    const { base, mutateAsync } = buildMutation()
    mockUseRunSync.mockReturnValue(base as unknown as ReturnType<typeof useRunPlacementSync>)

    renderPanel()
    fireEvent.click(screen.getByRole('checkbox', { name: /select app-alpha/i }))
    fireEvent.click(screen.getByRole('button', { name: /sync selected/i }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: /sync 1 component\?/i })).toBeDefined()
    fireEvent.click(within(dialog).getByRole('button', { name: /confirm/i }))

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({ diffId: 'diff-1', componentIds: ['comp-a'] }),
    )
  })

  it('shows "Diff was replaced" and clears the selection on a diff-replaced 409', async () => {
    const conflict = new ApiError(
      409,
      'diff replaced, re-run Diff',
      JSON.stringify({ timestamp: 'now', status: 409, error: 'Conflict', message: 'diff replaced, re-run Diff', path: '/x' }),
    )
    const mutateAsync = vi.fn().mockRejectedValue(conflict)
    mockUseRunSync.mockReturnValue({
      ...buildMutation().base,
      mutateAsync,
      isError: true,
      error: conflict,
    } as unknown as ReturnType<typeof useRunPlacementSync>)

    renderPanel()
    fireEvent.click(screen.getByRole('checkbox', { name: /select app-alpha/i }))
    fireEvent.click(screen.getByRole('button', { name: /sync selected/i }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /confirm/i }))

    await waitFor(() => expect(screen.getByText(/diff was replaced/i)).toBeDefined())
    expect(screen.getByRole('checkbox', { name: /select app-alpha/i })).not.toBeChecked()
  })

  it('renders applied/skipped/failed + a link to the sync CSV report on COMPLETED', () => {
    mockUseSyncJob.mockReturnValue(buildQuery(COMPLETED_SYNC_JOB) as unknown as ReturnType<typeof usePlacementSyncJob>)
    renderPanel()
    expect(screen.getByText('Applied')).toBeDefined()
    const csvLink = screen.getByRole('link', { name: /sync report/i })
    expect(csvLink.getAttribute('href')).toMatch(/\/admin\/teamcity-placement\/sync\/report\.csv$/)
  })

  it('lists the per-component outcome on COMPLETED', () => {
    mockUseSyncJob.mockReturnValue(buildQuery(COMPLETED_SYNC_JOB) as unknown as ReturnType<typeof usePlacementSyncJob>)
    renderPanel()
    const results = within(screen.getByText(/^results \(2 components\)$/i).closest('details') as HTMLElement)
    expect(results.getByText('app-alpha')).toBeDefined()
    expect(results.getByText(/applied/i)).toBeDefined()
    expect(results.getByText('app-gamma')).toBeDefined()
    expect(results.getByText(/skipped: outside scope/i)).toBeDefined()
  })
})

describe('TeamCityPlacementPanel — cross-kind disable', () => {
  it('disables Run Diff + shows hint when components migration is RUNNING', () => {
    mockUseMigrationJob.mockReturnValue(buildQuery({ state: 'RUNNING', id: 'comp-1' }) as never)
    useAdminMode.setState({ enabled: true })
    renderPanel()
    expect(screen.getByRole('button', { name: /run diff/i })).toBeDisabled()
    expect(screen.getByText(/Components migration is running/i)).toBeDefined()
  })
})
