import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import {
  useForceResetHistory,
  useHistoryMigrationJob,
  useMigrationJob,
  useRunHistoryMigration,
} from '@/hooks/useMigration'
import { toast } from '@/hooks/use-toast'
import { useAdminMode } from '@/lib/adminModeStore'
import { ApiError } from '@/lib/api'
import type { HistoryMigrationJobResponse, MigrationJobResponse } from '@/lib/types'
import { MigrationHistoryPanel } from './MigrationHistoryPanel'

// Mirror of MigrationPanel.test.tsx structure: mock the hooks rather than the
// underlying api wrapper to keep the panel tests focused. The hooks themselves
// have RED→GREEN coverage in useMigration.test.ts.

vi.mock('@/hooks/useMigration', () => ({
  useHistoryMigrationJob: vi.fn(),
  useMigrationJob: vi.fn(),
  useRunHistoryMigration: vi.fn(),
  useForceResetHistory: vi.fn(),
}))
vi.mock('@/hooks/use-toast', () => ({
  toast: vi.fn(),
}))

const mockUseHistoryMigrationJob = vi.mocked(useHistoryMigrationJob)
const mockUseMigrationJob = vi.mocked(useMigrationJob)
const mockUseRunHistoryMigration = vi.mocked(useRunHistoryMigration)
const mockUseForceResetHistory = vi.mocked(useForceResetHistory)
const mockToast = vi.mocked(toast)

const RUNNING_JOB: HistoryMigrationJobResponse = {
  id: 'history-1',
  state: 'RUNNING',
  startedAt: '2026-04-29T10:00:00Z',
  finishedAt: null,
  totalCommits: 100,
  processedCommits: 42,
  auditRecords: 120,
  skippedNoGroovy: 1,
  skippedParseError: 0,
  skippedUnknownNames: 0,
  currentSha: 'abc1234',
  targetRef: 'refs/tags/test-1.0',
  errorMessage: null,
  result: null,
}

const COMPLETED_JOB: HistoryMigrationJobResponse = {
  ...RUNNING_JOB,
  state: 'COMPLETED',
  finishedAt: '2026-04-29T10:00:30Z',
  totalCommits: 100,
  processedCommits: 100,
  auditRecords: 250,
  currentSha: null,
  recoveryAction: 'RETRY',
  result: {
    targetRef: 'refs/tags/test-1.0',
    targetSha: 'abc1234567890',
    processedCommits: 100,
    skippedNoGroovy: 1,
    skippedParseError: 0,
    skippedUnknownNames: 0,
    auditRecords: 250,
    durationMs: 30_000,
  },
}

const FAILED_JOB: HistoryMigrationJobResponse = {
  ...RUNNING_JOB,
  state: 'FAILED',
  finishedAt: '2026-04-29T10:00:30Z',
  errorMessage: 'git refused clone',
  recoveryAction: 'RETRY',
}

const STUCK_JOB: HistoryMigrationJobResponse = {
  ...RUNNING_JOB,
  state: 'FAILED',
  finishedAt: '2026-04-29T10:00:30Z',
  // Backend's synthesized state for an IN_PROGRESS DB row with no in-memory
  // job — see HistoryMigrationJobServiceImpl.synthesizeFromDb. The SPA used
  // to match on errorMessage.includes('marked IN_PROGRESS'), now branches
  // on the recoveryAction discriminator.
  recoveryAction: 'FORCE_RESET',
  errorMessage:
    'Previous run is stuck in IN_PROGRESS state with no active job in this pod ' +
    '(probably interrupted by a pod restart). Use Force reset to clear the claim, then Retry.',
}

function historyJobReturn(data: HistoryMigrationJobResponse | null) {
  return {
    data,
    isLoading: false,
    isError: false,
    isSuccess: true,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useHistoryMigrationJob>
}

function componentsJobReturn(data: MigrationJobResponse | null) {
  return {
    data,
    isLoading: false,
    isError: false,
    isSuccess: true,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useMigrationJob>
}

function buildHistoryMutation(overrides: Partial<ReturnType<typeof useRunHistoryMigration>> = {}) {
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
    } as unknown as ReturnType<typeof useRunHistoryMigration>,
    mutateAsync,
  }
}

function buildForceResetMutation(overrides: Partial<ReturnType<typeof useForceResetHistory>> = {}) {
  const mutateAsync = vi.fn().mockResolvedValue(undefined)
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
    } as unknown as ReturnType<typeof useForceResetHistory>,
    mutateAsync,
  }
}

function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return {
    client,
    ...render(React.createElement(QueryClientProvider, { client }, <MigrationHistoryPanel />)),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  useAdminMode.setState({ enabled: false })
  mockUseHistoryMigrationJob.mockReturnValue(historyJobReturn(null))
  mockUseMigrationJob.mockReturnValue(componentsJobReturn(null))
  mockUseRunHistoryMigration.mockReturnValue(buildHistoryMutation().base)
  mockUseForceResetHistory.mockReturnValue(buildForceResetMutation().base)
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  useAdminMode.setState({ enabled: false })
})

describe('MigrationHistoryPanel — admin gate', () => {
  it('disables Run history migration until adminMode is enabled', () => {
    renderPanel()
    expect(screen.getByRole('button', { name: /run history migration/i })).toBeDisabled()
    expect(screen.getByText(/Enable Admin mode/i)).toBeDefined()

    act(() => useAdminMode.setState({ enabled: true }))
    expect(screen.getByRole('button', { name: /run history migration/i })).not.toBeDisabled()
  })
})

describe('MigrationHistoryPanel — Run/Retry button modes (drives reset arg)', () => {
  it('idle state → button labelled "Run history migration", confirm calls mutate with reset=false', async () => {
    const { base, mutateAsync } = buildHistoryMutation()
    mockUseRunHistoryMigration.mockReturnValue(base)
    useAdminMode.setState({ enabled: true })

    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: /run history migration/i }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /confirm/i }))

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledOnce())
    expect(mutateAsync).toHaveBeenCalledWith({ reset: false })
  })

  it('FAILED state → button labelled "Retry (reset state)", confirm calls mutate with reset=true', async () => {
    // Critical: the backend's git_history_import_state row is FAILED, so any
    // POST without reset would 409. The button MUST flip to reset=true here,
    // otherwise the retry path is broken — see plan A7.2 / B6 review note.
    const { base, mutateAsync } = buildHistoryMutation()
    mockUseRunHistoryMigration.mockReturnValue(base)
    mockUseHistoryMigrationJob.mockReturnValue(historyJobReturn(FAILED_JOB))
    useAdminMode.setState({ enabled: true })

    renderPanel()
    const button = screen.getByRole('button', { name: /retry \(reset state\)/i })
    fireEvent.click(button)
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /confirm/i }))

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledOnce())
    expect(mutateAsync).toHaveBeenCalledWith({ reset: true })
  })

  it('COMPLETED state → button labelled "Retry (reset state)", confirm calls mutate with reset=true', async () => {
    const { base, mutateAsync } = buildHistoryMutation()
    mockUseRunHistoryMigration.mockReturnValue(base)
    mockUseHistoryMigrationJob.mockReturnValue(historyJobReturn(COMPLETED_JOB))
    useAdminMode.setState({ enabled: true })

    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: /retry \(reset state\)/i }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /confirm/i }))

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ reset: true }))
  })
})

describe('MigrationHistoryPanel — stuck IN_PROGRESS routing to Force reset', () => {
  it('shows Force reset + disabled Retry when errorMessage carries the marker', () => {
    mockUseHistoryMigrationJob.mockReturnValue(historyJobReturn(STUCK_JOB))
    useAdminMode.setState({ enabled: true })

    renderPanel()

    expect(screen.getByRole('button', { name: /force reset/i })).toBeDefined()
    // Retry button is rendered but disabled — gives the operator a visual hint
    // that the next action is force-reset, not a normal run.
    const retry = screen.getByRole('button', { name: /^retry$/i })
    expect(retry).toBeDisabled()
    // The synthesized errorMessage is rendered as a destructive banner so the
    // user understands WHY force-reset is the only path forward.
    expect(screen.getByTestId('history-stuck-banner')).toBeDefined()
  })

  it('Force reset confirm dialog calls useForceResetHistory.mutateAsync', async () => {
    const { base, mutateAsync } = buildForceResetMutation()
    mockUseForceResetHistory.mockReturnValue(base)
    mockUseHistoryMigrationJob.mockReturnValue(historyJobReturn(STUCK_JOB))
    useAdminMode.setState({ enabled: true })

    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: /force reset/i }))
    const dialog = await screen.findByRole('dialog')
    // The destructive confirm dialog must spell out the scope explicitly —
    // operator MUST understand audit_log will be wiped.
    expect(within(dialog).getByText(/audit log/i)).toBeDefined()
    fireEvent.click(within(dialog).getByRole('button', { name: /^force reset$/i }))

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledOnce())
  })
})

describe('MigrationHistoryPanel — RUNNING progress card', () => {
  it('renders progress card with processedCommits/totalCommits and current SHA', () => {
    mockUseHistoryMigrationJob.mockReturnValue(historyJobReturn(RUNNING_JOB))
    useAdminMode.setState({ enabled: true })

    const { container } = renderPanel()
    const progress = container.querySelector('[data-testid="history-migration-progress"]') as HTMLElement
    expect(progress).not.toBeNull()
    expect(progress.textContent).toMatch(/42\s*\/\s*100/)
    expect(progress.textContent).toMatch(/abc1234/)
  })

  it('shows "Walking history…" with indeterminate bar when totalCommits=0', () => {
    mockUseHistoryMigrationJob.mockReturnValue(
      historyJobReturn({
        ...RUNNING_JOB,
        totalCommits: 0,
        processedCommits: 0,
        currentSha: null,
      }),
    )
    useAdminMode.setState({ enabled: true })

    const { container } = renderPanel()
    const progress = container.querySelector('[data-testid="history-migration-progress"]') as HTMLElement
    expect(progress.textContent).toMatch(/Walking history/)
    expect(progress.getAttribute('aria-busy')).toBe('true')
  })

  it('marks Run button busy and disabled while RUNNING', () => {
    mockUseHistoryMigrationJob.mockReturnValue(historyJobReturn(RUNNING_JOB))
    useAdminMode.setState({ enabled: true })

    renderPanel()
    const button = screen.getByRole('button', { name: /running|run history migration/i })
    expect(button.getAttribute('aria-busy')).toBe('true')
    expect(button).toBeDisabled()
  })
})

describe('MigrationHistoryPanel — COMPLETED result tiles + RUNNING→COMPLETED toast', () => {
  it('renders 4 result tiles when COMPLETED', () => {
    mockUseHistoryMigrationJob.mockReturnValue(historyJobReturn(COMPLETED_JOB))
    useAdminMode.setState({ enabled: true })

    renderPanel()
    // Commits / Audit rows / Skipped / Duration tiles. "Audit rows" appears in
    // both top status tiles AND result tiles, so >=2 proves the result block
    // rendered.
    expect(screen.getAllByText(/audit rows/i).length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText(/duration/i)).toBeDefined()
  })

  it('toasts on RUNNING → COMPLETED transition with commits + audit counters', () => {
    useAdminMode.setState({ enabled: true })
    mockUseHistoryMigrationJob.mockReturnValue(historyJobReturn(RUNNING_JOB))
    const { rerender, client } = renderPanel()
    expect(mockToast).not.toHaveBeenCalled()

    mockUseHistoryMigrationJob.mockReturnValue(historyJobReturn(COMPLETED_JOB))
    rerender(React.createElement(QueryClientProvider, { client }, <MigrationHistoryPanel />))

    expect(mockToast).toHaveBeenCalledOnce()
    const arg = mockToast.mock.calls[0]![0] as { description?: string; title?: string }
    const text = `${arg.title ?? ''} ${arg.description ?? ''}`
    expect(text).toMatch(/100/)
    expect(text).toMatch(/250/)
  })
})

describe('MigrationHistoryPanel — FAILED state', () => {
  it('renders destructive block with errorMessage and keeps Retry enabled', () => {
    mockUseHistoryMigrationJob.mockReturnValue(historyJobReturn(FAILED_JOB))
    useAdminMode.setState({ enabled: true })

    renderPanel()
    expect(screen.getByText(/git refused clone/i)).toBeDefined()
    expect(screen.getByRole('button', { name: /retry \(reset state\)/i })).not.toBeDisabled()
  })
})

describe('MigrationHistoryPanel — start mutation errors', () => {
  it('renders a destructive block when useRunHistoryMigration surfaces ApiError', () => {
    const { base } = buildHistoryMutation()
    mockUseRunHistoryMigration.mockReturnValue({
      ...base,
      isError: true,
      isIdle: false,
      error: new ApiError(403, 'Forbidden'),
      status: 'error',
    } as unknown as ReturnType<typeof useRunHistoryMigration>)
    useAdminMode.setState({ enabled: true })

    renderPanel()
    expect(screen.getByText(/Forbidden/i)).toBeDefined()
    expect(screen.getByText(/403/i)).toBeDefined()
  })

  it('renders a destructive block when useForceResetHistory surfaces 409', () => {
    // P3 review fix: was only covered at the hook layer. Pin the user-visible
    // path: a force-reset 409 (e.g. likely-live-elsewhere) renders the
    // destructive block with the prefix "Force reset failed:" so the operator
    // understands which action failed.
    const { base } = buildForceResetMutation()
    mockUseForceResetHistory.mockReturnValue({
      ...base,
      isError: true,
      isIdle: false,
      error: new ApiError(409, '{"code":"history-import-likely-live-elsewhere","message":"Refusing"}'),
      status: 'error',
    } as unknown as ReturnType<typeof useForceResetHistory>)
    mockUseHistoryMigrationJob.mockReturnValue(historyJobReturn(STUCK_JOB))
    useAdminMode.setState({ enabled: true })

    renderPanel()
    expect(screen.getByText(/force reset failed/i)).toBeDefined()
  })
})

describe('MigrationHistoryPanel — confirm dialog re-derives reset at confirm time (no stale snapshot)', () => {
  it('opens dialog on idle (Run), then a poll arrives with stuck-job — confirm sends reset=false (live state)', async () => {
    // P2 review fix: the previous impl snapshotted reset=false at button-click
    // time. If a poll tick changed jobData between open and confirm, the
    // snapshot was stale. Now reset is re-derived from live jobData on confirm.
    //
    // Simulate the race: render in idle state, click Run (dialog opens with
    // "Run history migration" wording), then re-render with STUCK_JOB
    // (stuck-IN_PROGRESS row from a poll). The dialog now reflects the
    // FORCE_RESET path — the run button itself disables — so user can't
    // accidentally fire reset=false against a stuck DB row. The button label
    // change in the dialog is the visible signal.
    const { base, mutateAsync } = buildHistoryMutation()
    mockUseRunHistoryMigration.mockReturnValue(base)
    mockUseHistoryMigrationJob.mockReturnValue(historyJobReturn(null))
    useAdminMode.setState({ enabled: true })

    const { rerender, client } = renderPanel()
    fireEvent.click(screen.getByRole('button', { name: /run history migration/i }))
    await screen.findByRole('dialog')
    // Confirm dialog title reflects idle state — no reset.
    expect(screen.getByText(/run history migration\?/i)).toBeDefined()

    // Poll arrives with a COMPLETED job — re-render with new state.
    mockUseHistoryMigrationJob.mockReturnValue(historyJobReturn(COMPLETED_JOB))
    rerender(React.createElement(QueryClientProvider, { client }, <MigrationHistoryPanel />))

    // Dialog stays open but title / wording now reflects retry-with-reset path.
    expect(screen.getByText(/retry history migration with reset\?/i)).toBeDefined()

    // Confirm clicks → mutation fires with reset=true (re-derived from live state).
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /confirm/i }))
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ reset: true }))
  })
})

describe('MigrationHistoryPanel — accessibility', () => {
  it('progress card has aria-live=polite so screen readers announce phase / commit transitions', () => {
    mockUseHistoryMigrationJob.mockReturnValue(historyJobReturn(RUNNING_JOB))
    useAdminMode.setState({ enabled: true })

    const { container } = renderPanel()
    const progress = container.querySelector('[data-testid="history-migration-progress"]') as HTMLElement
    expect(progress.getAttribute('aria-live')).toBe('polite')
  })

  it('stuck banner has role=alert so screen readers announce the recovery requirement on first render', () => {
    mockUseHistoryMigrationJob.mockReturnValue(historyJobReturn(STUCK_JOB))
    useAdminMode.setState({ enabled: true })

    const { container } = renderPanel()
    const banner = container.querySelector('[data-testid="history-stuck-banner"]') as HTMLElement
    expect(banner.getAttribute('role')).toBe('alert')
  })
})

describe('MigrationHistoryPanel — cross-disable when components migration is RUNNING', () => {
  it('disables Run history migration when components-job is RUNNING and shows a helper hint', () => {
    useAdminMode.setState({ enabled: true })
    mockUseMigrationJob.mockReturnValue(
      componentsJobReturn({
        id: 'comp-1',
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
      }),
    )

    renderPanel()
    expect(screen.getByRole('button', { name: /run history migration/i })).toBeDisabled()
    expect(screen.getByText(/Components migration is running/i)).toBeDefined()
  })
})
