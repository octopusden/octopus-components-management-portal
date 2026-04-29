import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useMigrationJob, useMigrationStatus, useRunMigration } from '@/hooks/useMigration'
import { toast } from '@/hooks/use-toast'
import { useAdminMode } from '@/lib/adminModeStore'
import { ApiError } from '@/lib/api'
import type { MigrationJobResponse, MigrationStatus } from '@/lib/types'
import { MigrationPanel } from './MigrationPanel'

// MigrationPanel sits behind two gates and bridges them to a destructive
// backend action:
//
//   1. Route gate: RequirePermission(IMPORT_DATA) on /admin (existing).
//   2. UX gate: the Admin-mode toggle in AppFooter (zustand adminModeStore).
//
// The panel itself encodes #2 by disabling the Run-migration button until
// adminMode === true AND no migration job is currently RUNNING.
//
// Hooks are mocked rather than the underlying api wrapper so the tests stay
// focused on panel behavior; the hooks themselves have their own RED→GREEN
// coverage in useMigration.test.ts.

vi.mock('@/hooks/useMigration', () => ({
  useMigrationStatus: vi.fn(),
  useMigrationJob: vi.fn(),
  useRunMigration: vi.fn(),
}))
vi.mock('@/hooks/use-toast', () => ({
  toast: vi.fn(),
}))

const mockUseMigrationStatus = vi.mocked(useMigrationStatus)
const mockUseMigrationJob = vi.mocked(useMigrationJob)
const mockUseRunMigration = vi.mocked(useRunMigration)
const mockToast = vi.mocked(toast)

const STATUS: MigrationStatus = { git: 12, db: 3, total: 15 }

const RUNNING_JOB: MigrationJobResponse = {
  id: 'job-1',
  state: 'RUNNING',
  startedAt: '2026-04-29T10:00:00Z',
  finishedAt: null,
  total: 15,
  migrated: 6,
  failed: 1,
  skipped: 0,
  currentComponent: 'comp-7',
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
  currentComponent: null,
  result: {
    defaults: {},
    components: {
      total: 15,
      migrated: 14,
      failed: 1,
      skipped: 0,
      results: [
        { componentName: 'comp-broken', success: false, dryRun: false, message: 'Boom: missing artifactId', discrepancies: [] },
        { componentName: 'comp-ok', success: true, dryRun: false, message: 'ok', discrepancies: [] },
      ],
    },
  },
}

const FAILED_JOB: MigrationJobResponse = {
  ...RUNNING_JOB,
  state: 'FAILED',
  finishedAt: '2026-04-29T10:00:13Z',
  errorMessage: 'disk full',
}

function statusReturn(data: MigrationStatus = STATUS) {
  return {
    data,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useMigrationStatus>
}

function jobReturn(data: MigrationJobResponse | null) {
  return {
    data,
    isLoading: false,
    isError: false,
    isSuccess: true,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useMigrationJob>
}

function buildMutation(overrides: Partial<ReturnType<typeof useRunMigration>> = {}) {
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
    } as unknown as ReturnType<typeof useRunMigration>,
    mutateAsync,
  }
}

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return {
    client,
    ...render(React.createElement(QueryClientProvider, { client }, <MigrationPanel />)),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  useAdminMode.setState({ enabled: false })
  // Sensible idle defaults — individual tests override what they care about.
  mockUseMigrationStatus.mockReturnValue(statusReturn())
  mockUseMigrationJob.mockReturnValue(jobReturn(null))
  mockUseRunMigration.mockReturnValue(buildMutation().base)
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  useAdminMode.setState({ enabled: false })
})

describe('MigrationPanel — status + Admin-mode gate', () => {
  it('shows {git, db, total} counters from useMigrationStatus', () => {
    renderPanel()
    expect(screen.getByText('12')).toBeDefined()
    expect(screen.getByText('3')).toBeDefined()
    expect(screen.getByText('15')).toBeDefined()
  })

  it('disables Run migration when adminMode is false and shows the helper text', () => {
    renderPanel()
    const button = screen.getByRole('button', { name: /run migration/i })
    expect(button).toBeDisabled()
    expect(screen.getByText(/Enable Admin mode in the footer/i)).toBeDefined()
  })

  it('enables Run migration once adminMode flips to true and no job is RUNNING', () => {
    renderPanel()
    expect(screen.getByRole('button', { name: /run migration/i })).toBeDisabled()

    act(() => {
      useAdminMode.setState({ enabled: true })
    })

    expect(screen.getByRole('button', { name: /run migration/i })).not.toBeDisabled()
  })
})

describe('MigrationPanel — confirm dialog + start mutation', () => {
  it('opens confirm dialog on click and fires useRunMigration on confirm', async () => {
    const { base, mutateAsync } = buildMutation()
    mockUseRunMigration.mockReturnValue(base)
    useAdminMode.setState({ enabled: true })

    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: /run migration/i }))

    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /confirm/i }))

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledOnce())
  })

  it('toasts on RUNNING → COMPLETED transition with migrated/total + failed counts', () => {
    useAdminMode.setState({ enabled: true })
    // First render: job is RUNNING.
    mockUseMigrationJob.mockReturnValue(jobReturn(RUNNING_JOB))
    const { rerender, client } = renderPanel()

    expect(mockToast).not.toHaveBeenCalled()

    // Server tick: job flipped to COMPLETED. Re-render the same provider.
    mockUseMigrationJob.mockReturnValue(jobReturn(COMPLETED_JOB))
    rerender(React.createElement(QueryClientProvider, { client }, <MigrationPanel />))

    expect(mockToast).toHaveBeenCalledTimes(1)
    const arg = mockToast.mock.calls[0]![0] as { description?: string; title?: string }
    const text = `${arg.title ?? ''} ${arg.description ?? ''}`
    expect(text).toMatch(/14\/15/)
    expect(text).toMatch(/1 failed/)
  })
})

describe('MigrationPanel — progress while RUNNING', () => {
  it('shows progress bar with processed/total and currentComponent', () => {
    mockUseMigrationJob.mockReturnValue(jobReturn(RUNNING_JOB))
    useAdminMode.setState({ enabled: true })

    const { container } = renderPanel()

    const progress = container.querySelector('[data-testid="migration-progress"]')
    expect(progress).not.toBeNull()
    // 6 migrated + 1 failed + 0 skipped = 7 of 15
    expect(progress!.textContent).toMatch(/7\s*\/\s*15/)
    expect(progress!.textContent).toMatch(/comp-7/)
  })

  it('marks the Run-migration button busy and disables it while RUNNING', () => {
    mockUseMigrationJob.mockReturnValue(jobReturn(RUNNING_JOB))
    useAdminMode.setState({ enabled: true })

    renderPanel()
    const button = screen.getByRole('button', { name: /running|run migration/i })
    expect(button.getAttribute('aria-busy')).toBe('true')
    expect(button).toBeDisabled()
  })
})

describe('MigrationPanel — COMPLETED result block', () => {
  it('renders 4 stat tiles and a failed-components <details> when failed > 0', () => {
    mockUseMigrationJob.mockReturnValue(jobReturn(COMPLETED_JOB))
    useAdminMode.setState({ enabled: true })

    renderPanel()

    // 4 result tiles: Total/Migrated/Failed/Skipped. "Total" also appears in
    // the status header so it's matched twice — the count >=2 is what proves
    // the result grid rendered.
    expect(screen.getAllByText(/total/i).length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText(/migrated/i)).toBeDefined()
    expect(screen.getAllByText(/failed/i).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/skipped/i)).toBeDefined()

    // Failure list disclosure with the failed component name + message.
    expect(screen.getByText('comp-broken')).toBeDefined()
    expect(screen.getByText(/Boom: missing artifactId/)).toBeDefined()
  })
})

describe('MigrationPanel — FAILED job state', () => {
  it('renders a destructive block with errorMessage and keeps Run migration enabled for retry', () => {
    mockUseMigrationJob.mockReturnValue(jobReturn(FAILED_JOB))
    useAdminMode.setState({ enabled: true })

    renderPanel()

    expect(screen.getByText(/disk full/i)).toBeDefined()
    expect(screen.getByRole('button', { name: /run migration/i })).not.toBeDisabled()
  })
})

describe('MigrationPanel — start mutation errors', () => {
  it('renders a destructive block when useRunMigration surfaces ApiError(403)', () => {
    const { base } = buildMutation()
    mockUseRunMigration.mockReturnValue({
      ...base,
      isError: true,
      isIdle: false,
      error: new ApiError(403, 'Forbidden'),
      status: 'error',
    } as unknown as ReturnType<typeof useRunMigration>)
    useAdminMode.setState({ enabled: true })

    renderPanel()

    expect(screen.getByText(/Forbidden/i)).toBeDefined()
    expect(screen.getByText(/403/i)).toBeDefined()
  })

  it('strips raw HTML from a 5xx gateway error body so the destructive block stays readable', () => {
    // Defense in depth: even with the async backend deployed, an upstream
    // proxy / WAF / Portal-deployed-ahead-of-CRS can answer the POST with a
    // text/html error page. Without HTML stripping the panel would render
    // the literal "<html><body><h1>504..." document — same regression that
    // showed up in the QA screenshot before we added the formatter.
    const { base } = buildMutation()
    mockUseRunMigration.mockReturnValue({
      ...base,
      isError: true,
      isIdle: false,
      error: new ApiError(
        504,
        '<html><body><h1>504 Gateway Time-out</h1>The server didn’t respond in time.</body></html>',
      ),
      status: 'error',
    } as unknown as ReturnType<typeof useRunMigration>)
    useAdminMode.setState({ enabled: true })

    renderPanel()

    expect(screen.queryByText(/<html>/)).toBeNull()
    expect(screen.queryByText(/<\/body>/)).toBeNull()
    // The h1 already includes the status code — must not double-prefix.
    expect(screen.queryByText(/504 504/)).toBeNull()
    expect(screen.getByText(/504 Gateway Time-out/)).toBeDefined()
  })
})

describe('MigrationPanel — status polling while RUNNING', () => {
  it('arms refetchInterval on useMigrationStatus when the job is RUNNING', () => {
    mockUseMigrationJob.mockReturnValue(jobReturn(RUNNING_JOB))
    useAdminMode.setState({ enabled: true })

    renderPanel()

    const lastCall = mockUseMigrationStatus.mock.calls[mockUseMigrationStatus.mock.calls.length - 1]
    const opts = lastCall?.[0] as { refetchInterval?: number | false } | undefined
    expect(typeof opts?.refetchInterval).toBe('number')
    expect((opts!.refetchInterval as number)).toBeGreaterThan(0)
  })

  it('does NOT poll status when the job is idle / null', () => {
    // Default beforeEach gives jobReturn(null); status hook should be called
    // without a polling interval.
    renderPanel()

    const lastCall = mockUseMigrationStatus.mock.calls[mockUseMigrationStatus.mock.calls.length - 1]
    const opts = lastCall?.[0] as { refetchInterval?: number | false } | undefined
    expect(opts?.refetchInterval ?? false).toBeFalsy()
  })
})
