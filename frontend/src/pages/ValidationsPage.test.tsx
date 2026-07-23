import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import React from 'react'
import { ValidationsPage } from './ValidationsPage'
import { TooltipProvider } from '../components/ui/tooltip'
import { useHealthStatistics } from '../hooks/useHealthStatistics'
import { useValidationProblems } from '../hooks/useValidationProblems'
import { useTeamCityValidationSummary, useTeamCityValidations } from '../hooks/useTeamCityValidations'
import type { HealthStatistics, ComponentValidation, TeamcityValidationSummary, TeamcityValidationRow } from '../lib/types'
import type { UseValidationProblemsResult } from '../hooks/useValidationProblems'

vi.mock('../components/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'layout' }, children),
}))
vi.mock('../hooks/useHealthStatistics', () => ({ useHealthStatistics: vi.fn() }))
vi.mock('../hooks/useValidationProblems', () => ({ useValidationProblems: vi.fn() }))
vi.mock('../hooks/useTeamCityValidations', () => ({
  useTeamCityValidationSummary: vi.fn(),
  useTeamCityValidations: vi.fn(),
}))

const mockStats = vi.mocked(useHealthStatistics)
const mockValidation = vi.mocked(useValidationProblems)
const mockTcSummary = vi.mocked(useTeamCityValidationSummary)
const mockTcRows = vi.mocked(useTeamCityValidations)

function cv(component: string, missingCount: number): ComponentValidation {
  return {
    component,
    problems: [
      {
        type: 'UNREGISTERED_RELEASED_VERSIONS',
        severity: 'ERROR',
        message: `${missingCount} not registered`,
        details: { missingCount, versions: Array.from({ length: missingCount }, (_, i) => `v${i}`) },
      },
    ],
    checkFailed: false,
    checkError: null,
  }
}

const sampleStats: HealthStatistics = {
  // total (12) ≠ active (10) so the active-based health math is provable: the
  // ratios must divide by 10, not 12.
  totalComponents: 12,
  activeComponents: 10,
  componentsByOwner: { alice: 6, bob: 4 },
  componentsByReleaseManager: { carol: 3 },
  componentsBySecurityChampion: { dan: 2 },
}

// Two problem-bearing components: a=2 problem versions, b=5.
function validationResult(
  overrides: Partial<UseValidationProblemsResult> = {},
): UseValidationProblemsResult {
  const byComponent = new Map<string, ComponentValidation>([
    ['a', cv('a', 2)],
    ['b', cv('b', 5)],
  ])
  return {
    byComponent,
    generatedAt: '2026-06-13T10:00:00Z',
    lastAttemptAt: '2026-06-13T11:00:00Z',
    refreshError: null,
    isLoading: false,
    isError: false,
    error: null,
    ...overrides,
  }
}

function statsResult(overrides: Partial<ReturnType<typeof useHealthStatistics>> = {}) {
  return {
    data: sampleStats,
    isLoading: false,
    isError: false,
    isSuccess: true,
    error: null,
    ...overrides,
  } as ReturnType<typeof useHealthStatistics>
}

const sampleTcSummary: TeamcityValidationSummary = {
  byStatus: { FAILED: 3, WARNING: 1 },
  byType: { BUILD_CONFIG_DRIFT: 4, HAS_CUSTOM_BUILD_STEP: 1 },
  componentsWithIssues: 2,
  findings: 4,
}

function tcSummaryResult(overrides: Partial<ReturnType<typeof useTeamCityValidationSummary>> = {}) {
  return {
    data: sampleTcSummary,
    isLoading: false,
    isError: false,
    isSuccess: true,
    error: null,
    ...overrides,
  } as ReturnType<typeof useTeamCityValidationSummary>
}

const sampleTcRows: TeamcityValidationRow[] = [
  {
    componentId: 'c-1',
    componentName: 'payments-core',
    message: 'drift',
    projectId: 'Payments_Build',
    projectUrl: 'https://tc.example.com/project/Payments_Build',
    status: 'FAILED',
    // A finding's `type` is a comma-separated list — this row flags two rules
    // at once, exercising the multi-badge rendering.
    type: 'BUILD_CONFIG_DRIFT,HAS_CUSTOM_BUILD_STEP',
    updatedAt: '2026-06-13T10:00:00Z',
  },
]

function tcRowsResult(overrides: Partial<ReturnType<typeof useTeamCityValidations>> = {}) {
  return {
    data: sampleTcRows,
    isLoading: false,
    isError: false,
    isSuccess: true,
    error: null,
    ...overrides,
  } as ReturnType<typeof useTeamCityValidations>
}

function renderPage(initialEntries: string[] = ['/validations']) {
  return render(
    React.createElement(
      MemoryRouter,
      { initialEntries },
      React.createElement(TooltipProvider, null, React.createElement(ValidationsPage)),
    ),
  )
}

async function switchToUnregisteredRelease() {
  const user = userEvent.setup()
  await user.click(screen.getByRole('tab', { name: /Unregistered Release/i }))
}

beforeEach(() => {
  vi.clearAllMocks()
  mockStats.mockReturnValue(statsResult())
  mockValidation.mockReturnValue(validationResult())
  mockTcSummary.mockReturnValue(tcSummaryResult())
  mockTcRows.mockReturnValue(tcRowsResult())
})

describe('ValidationsPage — tabs', () => {
  it('renders both tabs and defaults to TeamCity', () => {
    renderPage()
    expect(screen.getByRole('tab', { name: /^TeamCity$/i })).toBeDefined()
    expect(screen.getByRole('tab', { name: /Unregistered Release/i })).toBeDefined()
    expect(screen.getByText('TeamCity Validations')).toBeInTheDocument()
    expect(screen.queryByText('Unregistered Released Validations')).not.toBeInTheDocument()
  })

  it('switches to the Unregistered Release tab on click', async () => {
    renderPage()
    await switchToUnregisteredRelease()
    expect(screen.getByText('Unregistered Released Validations')).toBeInTheDocument()
    expect(
      screen.getByText('Component with unregistered released version in the configuration.'),
    ).toBeInTheDocument()
  })

  it('opens directly on the Unregistered Release tab when ?tab=unregistered-release is present (the retired /health redirect target)', () => {
    renderPage(['/validations?tab=unregistered-release'])
    expect(screen.getByText('Unregistered Released Validations')).toBeInTheDocument()
    expect(screen.queryByText('TeamCity Validations')).not.toBeInTheDocument()
  })

  it('falls back to the TeamCity tab for an unrecognized ?tab value', () => {
    renderPage(['/validations?tab=bogus'])
    expect(screen.getByText('TeamCity Validations')).toBeInTheDocument()
  })
})

describe('ValidationsPage — TeamCity tab', () => {
  it('renders KPI tiles, the type breakdown, and the findings summary line', () => {
    renderPage()
    const withIssues = screen.getByText('Components with validation problems').closest('div')!.parentElement!
    expect(within(withIssues).getByText('2')).toBeInTheDocument()
    // "Findings" also labels the table section heading below, so scope to the KPI card.
    const findings = screen.getAllByText('Findings')[0]!.closest('div')!.parentElement!
    expect(within(findings).getByText('4')).toBeInTheDocument()
    expect(screen.getByText(/Found 1 component across 1 TeamCity project/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'payments-core' })).toHaveAttribute('href', '/components/c-1')
  })

  it('renders one badge per type when a finding\'s type is a comma-separated list', () => {
    renderPage()
    const row = screen.getByRole('link', { name: 'payments-core' }).closest('tr')!
    // BUILD_CONFIG_DRIFT has no friendly-label entry, so it falls back to the
    // raw type; HAS_CUSTOM_BUILD_STEP does have one ("Custom build step").
    expect(within(row).getByText('BUILD_CONFIG_DRIFT')).toBeInTheDocument()
    expect(within(row).getByText('Custom build step')).toBeInTheDocument()
  })

  it('the Type filter is a multi-select showing friendly labels, not raw type ids', async () => {
    renderPage()
    // The Findings-table "Type" column header is ALSO a button named "Type"
    // (sort toggle), so the filter trigger has to be resolved via its
    // associated <Label htmlFor>, not by accessible name alone.
    await userEvent.click(screen.getByLabelText('Type'))
    expect(screen.getByRole('checkbox', { name: 'BUILD_CONFIG_DRIFT' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Custom build step' })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'HAS_CUSTOM_BUILD_STEP' })).toBeNull()
  })

  it('selecting two types by their labels calls useTeamCityValidations with the underlying type ids', async () => {
    renderPage()
    await userEvent.click(screen.getByLabelText('Type'))
    await userEvent.click(screen.getByRole('checkbox', { name: 'BUILD_CONFIG_DRIFT' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Custom build step' }))

    await waitFor(() =>
      expect(mockTcRows).toHaveBeenLastCalledWith({
        type: ['BUILD_CONFIG_DRIFT', 'HAS_CUSTOM_BUILD_STEP'],
        status: undefined,
      }),
    )
    // Trigger's visible text reflects the multi-selection (count badge, not a
    // single value) — its accessible name stays "Type" (label-driven).
    expect(screen.getByLabelText('Type')).toHaveTextContent('2 types')
  })
})

describe('ValidationsPage — Unregistered Release tab (KPIs)', () => {
  it('renders total/active and the derived problem + healthy KPIs', async () => {
    renderPage()
    await switchToUnregisteredRelease()

    const total = screen.getByText('Total components').closest('div')!.parentElement!
    expect(within(total).getByText('12')).toBeInTheDocument()
    expect(within(total).getByText(/10 active/)).toBeInTheDocument()

    // With problems = 2 → 2/10 active = 20% (NOT 2/12 = 17%).
    const withProblems = screen.getByText('With validation problems').closest('div')!.parentElement!
    expect(within(withProblems).getByText('2')).toBeInTheDocument()
    expect(within(withProblems).getByText('20% of active')).toBeInTheDocument()

    // Problem versions = 2 + 5 = 7
    const problemVersions = screen.getByText('Problem versions').closest('div')!.parentElement!
    expect(within(problemVersions).getByText('7')).toBeInTheDocument()

    // Healthy = active(10) − 2 = 8 → 8/10 = 80% (active-based, NOT 8/12).
    const healthy = screen.getByText('Healthy components').closest('div')!.parentElement!
    expect(within(healthy).getByText('8')).toBeInTheDocument()
    expect(within(healthy).getByText('80% of active')).toBeInTheDocument()
  })
})

describe('ValidationsPage — Unregistered Release tab (top offenders)', () => {
  it('orders by problem versions desc and links to the component detail route', async () => {
    renderPage()
    await switchToUnregisteredRelease()

    const panel = screen.getByRole('region', { name: /top offenders/i })
    const links = within(panel).getAllByRole('link')
    // b (5) before a (2)
    expect(links[0]).toHaveTextContent('b')
    expect(links[0]).toHaveAttribute('href', '/components/b')
    expect(links[1]).toHaveTextContent('a')
    expect(links[1]).toHaveAttribute('href', '/components/a')
  })
})

describe('ValidationsPage — Unregistered Release tab (people breakdowns)', () => {
  it('ranks people and deep-links to the pre-filtered list per role', async () => {
    renderPage()
    await switchToUnregisteredRelease()

    const owner = screen.getByText('Components by owner').closest('section')!
    const ownerLinks = within(owner).getAllByRole('link')
    expect(ownerLinks[0]).toHaveTextContent('alice') // 6 > 4
    expect(ownerLinks[0]).toHaveAttribute('href', '/components?owner=alice')
    expect(ownerLinks[1]).toHaveAttribute('href', '/components?owner=bob')

    const rm = screen.getByText('Components by release manager').closest('section')!
    expect(within(rm).getByRole('link', { name: /carol/ })).toHaveAttribute(
      'href',
      '/components?releaseManager=carol',
    )

    const sc = screen.getByText('Components by security champion').closest('section')!
    expect(within(sc).getByRole('link', { name: /dan/ })).toHaveAttribute(
      'href',
      '/components?securityChampion=dan',
    )
  })

  it('shows an empty placeholder when a role map is empty', async () => {
    mockStats.mockReturnValue(statsResult({ data: { ...sampleStats, componentsBySecurityChampion: {} } }))
    renderPage()
    await switchToUnregisteredRelease()

    const sc = screen.getByText('Components by security champion').closest('section')!
    expect(within(sc).getByText('No assignments.')).toBeInTheDocument()
  })
})

describe('ValidationsPage — Unregistered Release tab (loading / error / stale)', () => {
  it('renders a skeleton while statistics load', async () => {
    mockStats.mockReturnValue(statsResult({ data: undefined, isLoading: true, isSuccess: false }))
    renderPage()
    await switchToUnregisteredRelease()
    expect(screen.getByTestId('health-loading')).toBeInTheDocument()
    expect(screen.queryByText('Total components')).not.toBeInTheDocument()
  })

  it('renders a load-failed banner when statistics fail', async () => {
    mockStats.mockReturnValue(
      statsResult({ data: undefined, isError: true, isSuccess: false, error: new Error('nope') }),
    )
    renderPage()
    await switchToUnregisteredRelease()
    expect(screen.getByRole('alert')).toHaveTextContent(/Failed to load registry statistics: nope/)
  })

  it('shows a stale banner when the validation report refresh failed, KPIs still render', async () => {
    mockValidation.mockReturnValue(validationResult({ refreshError: 'CRS timeout' }))
    renderPage()
    await switchToUnregisteredRelease()
    expect(screen.getByText(/could not be refreshed/)).toHaveTextContent('CRS timeout')
    expect(screen.getByText('Total components')).toBeInTheDocument()
  })

  it('hides top offenders and warns when the validation report is unavailable', async () => {
    mockValidation.mockReturnValue(
      validationResult({ byComponent: new Map(), isError: true, error: new Error('down') }),
    )
    renderPage()
    await switchToUnregisteredRelease()
    expect(screen.getByText(/validation report is unavailable/)).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /top offenders/i })).not.toBeInTheDocument()
    expect(screen.getByText('Components by owner')).toBeInTheDocument()
    const withProblems = screen.getByText('With validation problems').closest('div')!.parentElement!
    expect(within(withProblems).getByText('—')).toBeInTheDocument()
  })
})
