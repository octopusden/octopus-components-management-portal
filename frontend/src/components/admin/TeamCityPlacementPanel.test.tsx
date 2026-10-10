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
import { CRS_SHAPED_REPORT } from './placementReport.crs-shaped.fixture'

// Hooks are mocked so this test focuses on panel behaviour — admin-mode gate,
// confirm dialogs, RUNNING/COMPLETED/FAILED rendering, the grouped result
// table's summary-bucket filters/selection, and cross-kind disable. The
// hooks themselves are covered by useTeamCityPlacement.test.ts; the pure
// grouping/label logic is covered by placementGrouping.test.ts and
// placementStatus.test.ts.

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

// Four components: app-alpha (RESOLVED/ready), app-beta (CONFLICT/needs a
// look), app-gamma (a per-range IN_SYNC marker row only — no Base row
// at all), app-delta (RESOLVED/ready).
const REPORT: PlacementDiffResult = {
  diffId: 'diff-1',
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
      status: 'IN_SYNC',
      entries: [],
      currentBuildWorkingDirectory: undefined,
      derivedBuildWorkingDirectory: undefined,
      sourceBuildTypeIds: [],
      notes: ['marker row — report-only'],
    },
    {
      componentId: 'comp-d',
      componentKey: 'app-delta',
      configurationRowId: 'row-d',
      versionRange: '[1.0,)',
      rowLabel: 'BASE',
      status: 'RESOLVED',
      entries: [],
      currentBuildWorkingDirectory: undefined,
      derivedBuildWorkingDirectory: 'app-delta',
      sourceBuildTypeIds: ['Build_App_Delta'],
      notes: [],
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
  it('opens confirm dialog (renamed for the redesign) and fires useRunPlacementDiff on confirm', async () => {
    const { base, mutateAsync } = buildMutation()
    mockUseRunDiff.mockReturnValue(base as unknown as ReturnType<typeof useRunPlacementDiff>)
    useAdminMode.setState({ enabled: true })

    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: /run diff/i }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: /run the checkout paths diff/i })).toBeDefined()
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

describe('TeamCityPlacementPanel — pre-Diff empty state', () => {
  it('explains what the card does before any Diff has run', () => {
    renderPanel()
    expect(
      screen.getByText(/Where TeamCity checks out each VCS root.*and where it builds/i),
    ).toBeDefined()
  })

  it('does not show the summary bar (report links, bucket counts) before any Diff has completed', () => {
    renderPanel()
    expect(screen.queryByRole('link', { name: /open report/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /^ready/i })).toBeNull()
  })
})

describe('TeamCityPlacementPanel — summary bar', () => {
  beforeEach(() => {
    mockUseDiffJob.mockReturnValue(buildQuery(COMPLETED_DIFF_JOB) as unknown as ReturnType<typeof usePlacementDiffJob>)
    mockUseReport.mockReturnValue(buildQuery(REPORT) as unknown as ReturnType<typeof usePlacementDiffReport>)
  })

  it('shows Open report (HTML) and Download CSV once a Diff has completed', () => {
    renderPanel()
    const htmlLink = screen.getByRole('link', { name: /open report \(html\)/i })
    const csvLink = screen.getByRole('link', { name: /download csv/i })
    expect(htmlLink.getAttribute('href')).toMatch(/\/admin\/teamcity-placement\/diff\/report\.html$/)
    expect(csvLink.getAttribute('href')).toMatch(/\/admin\/teamcity-placement\/diff\/report\.csv$/)
  })

  it('shows "Report from <local time>"', () => {
    renderPanel()
    expect(screen.getByText(/^Report from /)).toBeDefined()
  })

  it('shows a clickable, aria-pressed count button per bucket', () => {
    renderPanel()
    const ready = screen.getByRole('button', { name: /^Ready \(2\)$/ })
    const needsLook = screen.getByRole('button', { name: /^Needs a look \(1\)$/ })
    expect(ready.getAttribute('aria-pressed')).toBe('false')
    expect(needsLook.getAttribute('aria-pressed')).toBe('false')

    fireEvent.click(needsLook)
    expect(needsLook.getAttribute('aria-pressed')).toBe('true')
    // Only the CONFLICT (needs-a-look) component shows once filtered to that bucket.
    expect(screen.getByText('app-beta')).toBeDefined()
    expect(screen.queryByText('app-alpha')).toBeNull()

    // Clicking the same bucket again clears the filter back to the default view.
    fireEvent.click(needsLook)
    expect(needsLook.getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByText('app-alpha')).toBeDefined()
  })

  it('defaults to Ready + Needs a look; "Show all (N)" reveals the rest', () => {
    renderPanel()
    expect(screen.getByText('app-alpha')).toBeDefined()
    expect(screen.getByText('app-beta')).toBeDefined()
    // app-gamma is IN_SYNC ("Nothing to do") — hidden by default.
    expect(screen.queryByText('app-gamma')).toBeNull()

    const showAll = screen.getByRole('button', { name: /^Show all \(4\)$/ })
    expect(showAll.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(showAll)
    expect(showAll.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('app-gamma')).toBeDefined()
  })
})

describe('TeamCityPlacementPanel — zero state', () => {
  it('shows "All N components in sync — nothing to do" when the default view has no attention rows', () => {
    const onlyNothingToDo: PlacementDiffResult = {
      ...REPORT,
      rows: [REPORT.rows[2]!], // app-gamma, IN_SYNC only
    }
    mockUseDiffJob.mockReturnValue(buildQuery(COMPLETED_DIFF_JOB) as unknown as ReturnType<typeof usePlacementDiffJob>)
    mockUseReport.mockReturnValue(buildQuery(onlyNothingToDo) as unknown as ReturnType<typeof usePlacementDiffReport>)
    renderPanel()
    expect(screen.getByText(/All 1 components in sync — nothing to do/i)).toBeDefined()
    // Two "Show all (1)" affordances coexist on purpose: the summary bar's
    // toggle button, and the zero state's own inline link to the same action.
    expect(screen.getAllByRole('button', { name: /^Show all \(1\)$/ }).length).toBe(2)
  })
})

describe('TeamCityPlacementPanel — result table', () => {
  beforeEach(() => {
    mockUseDiffJob.mockReturnValue(buildQuery(COMPLETED_DIFF_JOB) as unknown as ReturnType<typeof usePlacementDiffJob>)
    mockUseReport.mockReturnValue(buildQuery(REPORT) as unknown as ReturnType<typeof usePlacementDiffReport>)
  })

  it('groups rows under one header per component, sorted by component key', () => {
    renderPanel()
    const headings = screen.getAllByRole('checkbox').map((el) => el.getAttribute('aria-label'))
    // Default view hides app-gamma (Nothing to do); alpha/beta/delta in key order.
    // (Excludes the "Select all visible ready" checkbox, which also starts with "Select ".)
    expect(headings.filter((l) => l?.startsWith('Select ') && !l.startsWith('Select all'))).toEqual([
      'Select app-alpha',
      'Select app-beta',
      'Select app-delta',
    ])
  })

  it('renders the human status label with the raw code as a tooltip/title', () => {
    renderPanel()
    // app-alpha's single RESOLVED row renders "Ready to sync" twice — once as
    // the group header's status chip, once as the detail row's Status cell.
    const readyBadges = screen.getAllByText('Ready to sync')
    expect(readyBadges.length).toBeGreaterThan(0)
    for (const badge of readyBadges) expect(badge.getAttribute('title')).toBe('RESOLVED')
    for (const badge of screen.getAllByText('TeamCity configurations disagree')) {
      expect(badge.getAttribute('title')).toBe('CONFLICT')
    }
  })

  it('renders a single "Proposed change" column with full field names, no CD/SP/BWD abbreviations', () => {
    renderPanel()
    expect(screen.getByText('Checkout Directory: (root) → app-alpha')).toBeDefined()
    expect(screen.getByText('Build Working Directory: (root) → app-alpha')).toBeDefined()
    expect(screen.getByText('Build Working Directory: (root) → app-delta')).toBeDefined()
    expect(screen.queryByText(/^CD:/)).toBeNull()
    expect(screen.queryByText(/^SP:/)).toBeNull()
    expect(screen.queryByText(/^BWD:/)).toBeNull()
  })

  it('renders the Proposed change column from a CRS-shaped report with explicit nulls', () => {
    mockUseReport.mockReturnValue(buildQuery(CRS_SHAPED_REPORT) as unknown as ReturnType<typeof usePlacementDiffReport>)
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: /^Show all \(3\)$/ }))
    const proposed = (key: string) =>
      screen.getByRole('checkbox', { name: `Select ${key}` }).closest('tr')?.nextElementSibling?.children[2]?.textContent
    // RESOLVED: derived Build Working Directory null is a real value, "(root)".
    expect(proposed('app-resolved')).toBe('Checkout Directory: (root) → app-resolvedBuild Working Directory: old/dir → (root)')
    // Report-only rows derive nothing: no "no change", no "→ (root)".
    expect(proposed('app-nochain')).toBe('')
    expect(proposed('app-tcerror')).toBe('')
  })

  it('"Applies to" shows Base / Override for versions <range>; the literal "vcs.settings" never appears', () => {
    mockUseDiffJob.mockReturnValue(buildQuery(COMPLETED_DIFF_JOB) as unknown as ReturnType<typeof usePlacementDiffJob>)
    mockUseReport.mockReturnValue(buildQuery(REPORT) as unknown as ReturnType<typeof usePlacementDiffReport>)
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: /^Show all \(4\)$/ }))
    expect(screen.getAllByText('Base').length).toBeGreaterThan(0)
    expect(screen.getByText('Override for versions [2.0,)')).toBeDefined()
    expect(screen.queryByText(/vcs\.settings/)).toBeNull()
  })

  it('disables the header checkbox for a component with no RESOLVED Base row', () => {
    renderPanel()
    expect(screen.getByRole('checkbox', { name: 'Select app-alpha' })).not.toBeDisabled()
    expect(screen.getByRole('checkbox', { name: 'Select app-beta' })).toBeDisabled()
  })

  it('filters rows by component text (kept from the previous design)', () => {
    renderPanel()
    fireEvent.change(screen.getByLabelText(/component/i), { target: { value: 'alpha' } })
    expect(screen.getByText('app-alpha')).toBeDefined()
    expect(screen.queryByText('app-beta')).toBeNull()
  })

  it('"Select all visible ready (N)" selects every currently-visible ready component and respects filters', () => {
    renderPanel()
    const selectAll = screen.getByRole('checkbox', { name: /select all visible ready \(2\)/i }) as HTMLInputElement
    fireEvent.click(selectAll)
    expect(screen.getByRole('checkbox', { name: 'Select app-alpha' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Select app-delta' })).toBeChecked()

    fireEvent.click(selectAll)
    // Narrow to "Needs a look" — no ready components are visible anymore.
    fireEvent.click(screen.getByRole('button', { name: /^Needs a look \(1\)$/ }))
    expect(screen.getByRole('checkbox', { name: /select all visible ready \(0\)/i })).toBeDisabled()
  })

  it('marks "Select all visible ready" indeterminate when only some visible ready rows are selected', () => {
    renderPanel()
    const selectAll = screen.getByRole('checkbox', { name: /select all visible ready/i }) as HTMLInputElement
    expect(selectAll.indeterminate).toBe(false)

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select app-alpha' }))
    expect(selectAll.indeterminate).toBe(true)
    expect(selectAll).not.toBeChecked()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select app-delta' }))
    expect(selectAll.indeterminate).toBe(false)
    expect(selectAll).toBeChecked()
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

  it('disables Sync selected when the current Diff job is not COMPLETED (e.g. a later Diff failed)', () => {
    mockUseDiffJob.mockReturnValue(
      buildQuery({ ...COMPLETED_DIFF_JOB, id: 'diff-2', state: 'FAILED', errorMessage: 'TC unreachable' }) as unknown as ReturnType<
        typeof usePlacementDiffJob
      >,
    )
    renderPanel()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select app-alpha' }))
    expect(screen.getByRole('button', { name: /sync selected/i })).toBeDisabled()
  })

  it('explains next to Sync why it is disabled when the latest Diff failed', () => {
    mockUseDiffJob.mockReturnValue(
      buildQuery({ ...COMPLETED_DIFF_JOB, id: 'diff-2', state: 'FAILED', errorMessage: 'TC unreachable' }) as unknown as ReturnType<
        typeof usePlacementDiffJob
      >,
    )
    renderPanel()
    expect(screen.getByText(/latest Diff failed.*previous run.*re-run Diff to sync/i)).toBeDefined()
  })

  it('explains next to Sync why it is disabled when the report is from an older Diff', () => {
    mockUseDiffJob.mockReturnValue(
      buildQuery({ ...COMPLETED_DIFF_JOB, id: 'diff-2' }) as unknown as ReturnType<typeof usePlacementDiffJob>,
    )
    renderPanel()
    expect(screen.getByText(/report shown is not from the latest Diff/i)).toBeDefined()
  })

  it('shows no blocked-Sync reason when the report is current', () => {
    renderPanel()
    expect(screen.queryByText(/re-run Diff to sync/i)).toBeNull()
  })

  it('enables Sync selected when the ids match, the job is COMPLETED and a row is selected', () => {
    renderPanel()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select app-alpha' }))
    expect(screen.getByRole('button', { name: /sync selected/i })).not.toBeDisabled()
  })

  it('confirm dialog lists the selected component keys, the field count, and the base-configuration note', async () => {
    const { base, mutateAsync } = buildMutation()
    mockUseRunSync.mockReturnValue(base as unknown as ReturnType<typeof useRunPlacementSync>)

    renderPanel()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select app-alpha' }))
    fireEvent.click(screen.getByRole('button', { name: /sync selected/i }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: /sync 1 component\?/i })).toBeDefined()
    expect(within(dialog).getByText('app-alpha')).toBeDefined()
    // app-alpha's Base row has 2 changed fields (Checkout Directory + Build Working Directory).
    expect(within(dialog).getByText(/2 fields will be written/i)).toBeDefined()
    expect(
      within(dialog).getByText(/Only base configurations are written\. A before\/after CSV is kept for rollback\./i),
    ).toBeDefined()

    fireEvent.click(within(dialog).getByRole('button', { name: /confirm/i }))
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({ diffId: 'diff-1', componentIds: ['comp-a'] }),
    )
  })

  it('lists the first 10 selected component keys then "and N more"', async () => {
    const manyRows = Array.from({ length: 12 }, (_, i) => ({
      ...REPORT.rows[0],
      componentId: `comp-${i}`,
      componentKey: `app-${String(i).padStart(2, '0')}`,
      configurationRowId: `row-${i}`,
    }))
    mockUseReport.mockReturnValue(
      buildQuery({ ...REPORT, rows: manyRows }) as unknown as ReturnType<typeof usePlacementDiffReport>,
    )
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: /^Show all \(12\)$/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /select all visible ready/i }))
    fireEvent.click(screen.getByRole('button', { name: /sync selected/i }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/and 2 more/i)).toBeDefined()
  })

  it('disables Sync while the report on screen is from an older Diff than the latest job', () => {
    mockUseDiffJob.mockReturnValue(
      buildQuery({ ...COMPLETED_DIFF_JOB, id: 'diff-2' }) as unknown as ReturnType<typeof usePlacementDiffJob>,
    )
    useAdminMode.setState({ enabled: true })

    renderPanel()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select app-alpha' }))

    expect(screen.getByRole('button', { name: /sync selected/i })).toBeDisabled()
  })

  it('clears the selection when a new Diff job id appears', () => {
    useAdminMode.setState({ enabled: true })
    const { rerender, client } = renderPanel()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select app-alpha' }))
    expect(screen.getByRole('checkbox', { name: 'Select app-alpha' })).toBeChecked()

    mockUseDiffJob.mockReturnValue(
      buildQuery({ ...COMPLETED_DIFF_JOB, id: 'diff-2' }) as unknown as ReturnType<typeof usePlacementDiffJob>,
    )
    rerender(React.createElement(QueryClientProvider, { client }, <TeamCityPlacementPanel />))

    expect(screen.getByRole('checkbox', { name: 'Select app-alpha' })).not.toBeChecked()
  })

  it('shows "Diff was replaced" and clears the selection on a diff-replaced 409', async () => {
    const conflict = new ApiError(
      409,
      'diff replaced, re-run Diff',
      JSON.stringify({ errorMessage: 'diff replaced, re-run Diff', errorCode: 'placement-diff-stale' }),
    )
    const mutateAsync = vi.fn().mockRejectedValue(conflict)
    mockUseRunSync.mockReturnValue({
      ...buildMutation().base,
      mutateAsync,
      isError: true,
      error: conflict,
    } as unknown as ReturnType<typeof useRunPlacementSync>)

    renderPanel()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select app-alpha' }))
    fireEvent.click(screen.getByRole('button', { name: /sync selected/i }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /confirm/i }))

    await waitFor(() => expect(screen.getByText(/diff was replaced/i)).toBeDefined())
    expect(screen.getByRole('checkbox', { name: 'Select app-alpha' })).not.toBeChecked()
  })

  it('renders applied/skipped/failed + a "Download rollback trace (CSV)" link on COMPLETED', () => {
    mockUseSyncJob.mockReturnValue(buildQuery(COMPLETED_SYNC_JOB) as unknown as ReturnType<typeof usePlacementSyncJob>)
    renderPanel()
    expect(screen.getByText('Applied')).toBeDefined()
    const csvLink = screen.getByRole('link', { name: /download rollback trace \(csv\)/i })
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

describe('TeamCityPlacementPanel — unknown status', () => {
  it('renders a row with a status this Portal does not know, without crashing', () => {
    const unknown = { ...REPORT.rows[1], componentId: 'comp-u', componentKey: 'app-unknown', status: 'SOMETHING_NEW' }
    mockUseReport.mockReturnValue(
      buildQuery({ ...REPORT, rows: [unknown] } as unknown as PlacementDiffResult) as unknown as ReturnType<
        typeof usePlacementDiffReport
      >,
    )
    renderPanel()
    expect(screen.getByText('app-unknown')).toBeDefined()
    expect(screen.getAllByText('SOMETHING_NEW').length).toBeGreaterThan(0)
    expect(screen.getByRole('checkbox', { name: 'Select app-unknown' })).toBeDisabled()
  })
})

describe('TeamCityPlacementPanel — query errors', () => {
  const failing = (message: string) => ({
    ...buildQuery(null),
    isError: true,
    isSuccess: false,
    error: new ApiError(500, message, JSON.stringify({ errorMessage: message })),
  })

  it('shows a destructive banner when the report fails to load', () => {
    mockUseReport.mockReturnValue(failing('report exploded') as unknown as ReturnType<typeof usePlacementDiffReport>)
    renderPanel()
    expect(screen.getByText(/Report: .*report exploded/)).toBeDefined()
  })

  it('shows a destructive banner when the Diff job poll fails', () => {
    mockUseDiffJob.mockReturnValue(failing('diff poll exploded') as unknown as ReturnType<typeof usePlacementDiffJob>)
    renderPanel()
    expect(screen.getByText(/Diff job: .*diff poll exploded/)).toBeDefined()
  })

  it('shows a destructive banner when the Sync job poll fails', () => {
    mockUseSyncJob.mockReturnValue(failing('sync poll exploded') as unknown as ReturnType<typeof usePlacementSyncJob>)
    renderPanel()
    expect(screen.getByText(/Sync job: .*sync poll exploded/)).toBeDefined()
  })

  it('still treats "no report yet" (data null, no error) as the empty state', () => {
    renderPanel()
    expect(screen.getByText(/run diff to see the current/i)).toBeDefined()
  })
})
