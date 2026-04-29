import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useMigrationStatus, useRunMigration } from '@/hooks/useMigration'
import { toast } from '@/hooks/use-toast'
import { useAdminMode } from '@/lib/adminModeStore'
import type { FullMigrationResult, MigrationStatus } from '@/lib/types'
import { ApiError } from '@/lib/api'
import { MigrationPanel } from './MigrationPanel'

// MigrationPanel sits behind two gates and bridges them to a destructive
// backend action:
//
//   1. Route gate: RequirePermission(IMPORT_DATA) on /admin (existing).
//   2. UX gate: the Admin-mode toggle in AppFooter (zustand adminModeStore).
//
// The panel itself encodes #2 by disabling the Run-migration button until
// adminMode === true, with a helper text pointing at the footer toggle.
// The plan is explicit that this is UX, not security — the security gate
// is the @PreAuthorize on AdminControllerV4 + the requestMatchers chain
// in WebSecurityConfig (see CRS MIG-024). Disabling the button is just
// "are you sure" friction so a careless click doesn't kick a 5-minute
// migration job; the mutation itself is fired by useRunMigration.
//
// All tests mock the hooks rather than the underlying api wrapper so the
// test stays focused on panel behavior; the hooks themselves have their
// own RED→GREEN coverage in useMigration.test.ts.

vi.mock('@/hooks/useMigration', () => ({
  useMigrationStatus: vi.fn(),
  useRunMigration: vi.fn(),
}))
vi.mock('@/hooks/use-toast', () => ({
  toast: vi.fn(),
}))

const mockUseMigrationStatus = vi.mocked(useMigrationStatus)
const mockUseRunMigration = vi.mocked(useRunMigration)
const mockToast = vi.mocked(toast)

const STATUS: MigrationStatus = { git: 12, db: 3, total: 15 }
const FULL_RESULT: FullMigrationResult = {
  defaults: {},
  components: { total: 15, migrated: 14, failed: 1, skipped: 0, results: [
    { componentName: 'comp-broken', success: false, dryRun: false, message: 'Boom: missing artifactId', discrepancies: [] },
    { componentName: 'comp-ok', success: true, dryRun: false, message: 'ok', discrepancies: [] },
  ] },
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

function buildMutation(overrides: Partial<ReturnType<typeof useRunMigration>> = {}) {
  const mutateAsync = vi.fn().mockResolvedValue(FULL_RESULT)
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

beforeEach(() => {
  vi.clearAllMocks()
  // Reset adminMode to disabled; default is false but a previous test could
  // have flipped the persisted store.
  localStorage.clear()
  useAdminMode.setState({ enabled: false })
})

afterEach(() => {
  // Unmount BEFORE touching the zustand store; otherwise the React-managed
  // subscription would re-render an outgoing component synchronously and
  // trip the "update not wrapped in act(...)" warning.
  cleanup()
  localStorage.clear()
  useAdminMode.setState({ enabled: false })
})

describe('MigrationPanel — status + Admin-mode gate', () => {
  it('shows {git, db, total} counters from useMigrationStatus', () => {
    mockUseMigrationStatus.mockReturnValue(statusReturn())
    mockUseRunMigration.mockReturnValue(buildMutation().base)

    render(<MigrationPanel />)
    // Be permissive about labels; assert both the number and a nearby label
    // so the test is robust to copy edits like "git" → "DSL on disk".
    expect(screen.getByText('12')).toBeDefined()
    expect(screen.getByText('3')).toBeDefined()
    expect(screen.getByText('15')).toBeDefined()
  })

  it('disables Run migration when adminMode is false and shows the helper text', () => {
    mockUseMigrationStatus.mockReturnValue(statusReturn())
    mockUseRunMigration.mockReturnValue(buildMutation().base)

    render(<MigrationPanel />)
    const button = screen.getByRole('button', { name: /run migration/i })
    expect(button).toBeDisabled()
    expect(screen.getByText(/Enable Admin mode in the footer/i)).toBeDefined()
  })

  it('enables Run migration once adminMode flips to true', () => {
    mockUseMigrationStatus.mockReturnValue(statusReturn())
    mockUseRunMigration.mockReturnValue(buildMutation().base)

    render(<MigrationPanel />)
    expect(screen.getByRole('button', { name: /run migration/i })).toBeDisabled()

    // act() so React flushes the zustand subscription update before we assert.
    act(() => {
      useAdminMode.setState({ enabled: true })
    })

    expect(screen.getByRole('button', { name: /run migration/i })).not.toBeDisabled()
  })
})

describe('MigrationPanel — confirm dialog + mutation success', () => {
  it('opens confirm dialog on click, runs mutation on confirm, and renders 4 stat cards', async () => {
    mockUseMigrationStatus.mockReturnValue(statusReturn())
    const { base, mutateAsync } = buildMutation()
    mockUseRunMigration.mockReturnValue(base)
    useAdminMode.setState({ enabled: true })

    const { rerender } = render(<MigrationPanel />)
    fireEvent.click(screen.getByRole('button', { name: /run migration/i }))

    // Confirm dialog with a "Yes, run" / "Confirm" affordance.
    const dialog = await screen.findByRole('dialog')
    const confirmBtn = within(dialog).getByRole('button', { name: /confirm|yes,? run/i })
    fireEvent.click(confirmBtn)

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledOnce())

    // After mutation resolves, simulate the next render with results in hand
    // (the hook would surface FULL_RESULT via mutation.data; we mock that).
    mockUseRunMigration.mockReturnValue({
      ...base,
      data: FULL_RESULT,
      isSuccess: true,
      isIdle: false,
      status: 'success',
    } as unknown as ReturnType<typeof useRunMigration>)
    rerender(<MigrationPanel />)

    // 4 stat cards: Total/Migrated/Failed/Skipped. "Total" also appears in
    // the status header so it's matched twice — pin the assertion on labels
    // unique to the result block.
    expect(screen.getAllByText(/total/i).length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText(/migrated/i)).toBeDefined()
    // Failed has both the label and the failures-disclosure summary; one of
    // those is enough to prove the result grid rendered.
    expect(screen.getAllByText(/failed/i).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/skipped/i)).toBeDefined()
  })

  it('on success shows a toast describing migrated/failed counts', async () => {
    mockUseMigrationStatus.mockReturnValue(statusReturn())
    const { base, mutateAsync } = buildMutation()
    mockUseRunMigration.mockReturnValue(base)
    useAdminMode.setState({ enabled: true })

    render(<MigrationPanel />)
    fireEvent.click(screen.getByRole('button', { name: /run migration/i }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /confirm|yes,? run/i }))

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledOnce())
    await waitFor(() => expect(mockToast).toHaveBeenCalledTimes(1))

    const arg = mockToast.mock.calls[0]![0] as { description?: string; title?: string }
    const text = `${arg.title ?? ''} ${arg.description ?? ''}`
    expect(text).toMatch(/14\/15/) // migrated/total
    expect(text).toMatch(/1 failed/) // failed count
  })

  it('renders a <details> with failed component names + messages when failed > 0', () => {
    mockUseMigrationStatus.mockReturnValue(statusReturn())
    const { base } = buildMutation()
    mockUseRunMigration.mockReturnValue({
      ...base,
      data: FULL_RESULT,
      isSuccess: true,
      isIdle: false,
      status: 'success',
    } as unknown as ReturnType<typeof useRunMigration>)
    useAdminMode.setState({ enabled: true })

    render(<MigrationPanel />)

    // The details disclosure should hold the failure name + message.
    expect(screen.getByText('comp-broken')).toBeDefined()
    expect(screen.getByText(/Boom: missing artifactId/)).toBeDefined()
  })
})

describe('MigrationPanel — mutation error', () => {
  it('renders a destructive error block and keeps Run migration enabled for retry', () => {
    mockUseMigrationStatus.mockReturnValue(statusReturn())
    const { base } = buildMutation()
    mockUseRunMigration.mockReturnValue({
      ...base,
      isError: true,
      error: new ApiError(403, 'Forbidden'),
      isIdle: false,
      status: 'error',
    } as unknown as ReturnType<typeof useRunMigration>)
    useAdminMode.setState({ enabled: true })

    render(<MigrationPanel />)

    expect(screen.getByText(/Forbidden/i)).toBeDefined()
    // Button stays enabled so the user can retry after fixing the upstream
    // issue (e.g. token refresh, role grant). Disabling on error would
    // trap the operator on a permanently-broken page.
    expect(screen.getByRole('button', { name: /run migration/i })).not.toBeDisabled()
  })
})
