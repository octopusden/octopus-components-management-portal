import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import React from 'react'
import { RegistryHealthPage } from './RegistryHealthPage'
import { useHealthStatistics } from '../hooks/useHealthStatistics'
import { useValidationProblems } from '../hooks/useValidationProblems'
import type { HealthStatistics, ComponentValidation } from '../lib/types'
import type { UseValidationProblemsResult } from '../hooks/useValidationProblems'

vi.mock('../components/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'layout' }, children),
}))
vi.mock('../hooks/useHealthStatistics', () => ({ useHealthStatistics: vi.fn() }))
vi.mock('../hooks/useValidationProblems', () => ({ useValidationProblems: vi.fn() }))

const mockStats = vi.mocked(useHealthStatistics)
const mockValidation = vi.mocked(useValidationProblems)

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

function renderPage() {
  return render(
    React.createElement(MemoryRouter, null, React.createElement(RegistryHealthPage)),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('RegistryHealthPage — KPIs', () => {
  it('renders total/active and the derived problem + healthy KPIs', () => {
    mockStats.mockReturnValue(statsResult())
    mockValidation.mockReturnValue(validationResult())
    renderPage()

    // Total card shows the grand total (12); the active count (10) is the hint.
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

describe('RegistryHealthPage — top offenders', () => {
  it('orders by problem versions desc and links to the component detail route', () => {
    mockStats.mockReturnValue(statsResult())
    mockValidation.mockReturnValue(validationResult())
    renderPage()

    const panel = screen.getByRole('region', { name: /top offenders/i })
    const links = within(panel).getAllByRole('link')
    // b (5) before a (2)
    expect(links[0]).toHaveTextContent('b')
    expect(links[0]).toHaveAttribute('href', '/components/b')
    expect(links[1]).toHaveTextContent('a')
    expect(links[1]).toHaveAttribute('href', '/components/a')
  })
})

describe('RegistryHealthPage — people breakdowns', () => {
  it('ranks people and deep-links to the pre-filtered list per role', () => {
    mockStats.mockReturnValue(statsResult())
    mockValidation.mockReturnValue(validationResult())
    renderPage()

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

  it('shows an empty placeholder when a role map is empty', () => {
    mockStats.mockReturnValue(
      statsResult({ data: { ...sampleStats, componentsBySecurityChampion: {} } }),
    )
    mockValidation.mockReturnValue(validationResult())
    renderPage()

    const sc = screen.getByText('Components by security champion').closest('section')!
    expect(within(sc).getByText('No assignments.')).toBeInTheDocument()
  })
})

describe('RegistryHealthPage — loading / error / stale', () => {
  it('renders a skeleton while statistics load', () => {
    mockStats.mockReturnValue(statsResult({ data: undefined, isLoading: true, isSuccess: false }))
    mockValidation.mockReturnValue(validationResult())
    renderPage()
    expect(screen.getByTestId('health-loading')).toBeInTheDocument()
    expect(screen.queryByText('Total components')).not.toBeInTheDocument()
  })

  it('renders a page-level error when statistics fail', () => {
    mockStats.mockReturnValue(
      statsResult({ data: undefined, isError: true, isSuccess: false, error: new Error('nope') }),
    )
    mockValidation.mockReturnValue(validationResult())
    renderPage()
    expect(screen.getByRole('alert')).toHaveTextContent(/Failed to load registry statistics: nope/)
  })

  it('shows a stale banner when the validation report refresh failed, KPIs still render', () => {
    mockStats.mockReturnValue(statsResult())
    mockValidation.mockReturnValue(validationResult({ refreshError: 'CRS timeout' }))
    renderPage()
    expect(screen.getByText(/could not be refreshed/)).toHaveTextContent('CRS timeout')
    // KPIs from CRS stats still render
    expect(screen.getByText('Total components')).toBeInTheDocument()
  })

  it('hides top offenders and warns when the validation report is unavailable', () => {
    mockStats.mockReturnValue(statsResult())
    mockValidation.mockReturnValue(
      validationResult({ byComponent: new Map(), isError: true, error: new Error('down') }),
    )
    renderPage()
    expect(screen.getByText(/validation report is unavailable/)).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /top offenders/i })).not.toBeInTheDocument()
    // People panels (from CRS stats) still render
    expect(screen.getByText('Components by owner')).toBeInTheDocument()
    // Problem-derived KPIs read em-dash, NOT 0 — a failed report must not look "clean".
    const withProblems = screen.getByText('With validation problems').closest('div')!.parentElement!
    expect(within(withProblems).getByText('—')).toBeInTheDocument()
    expect(within(withProblems).queryByText('0% of active')).not.toBeInTheDocument()
    // Total / active (from CRS stats) are unaffected.
    const total = screen.getByText('Total components').closest('div')!.parentElement!
    expect(within(total).getByText('12')).toBeInTheDocument()
  })

  it('shows the top-offenders empty state when there are no problems', () => {
    mockStats.mockReturnValue(statsResult())
    mockValidation.mockReturnValue(validationResult({ byComponent: new Map() }))
    renderPage()
    const panel = screen.getByRole('region', { name: /top offenders/i })
    expect(within(panel).getByText(/No components with validation problems/)).toBeInTheDocument()
  })
})
