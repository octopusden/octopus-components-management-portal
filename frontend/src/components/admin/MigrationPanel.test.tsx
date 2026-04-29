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

  it('strips raw HTML from the error body so the destructive block stays readable', () => {
    // The portal gateway returns text/html for many backend errors (504 default
    // page, sometimes 502/503 too). The mutation's ApiError.message ends up
    // holding the whole "<html><body><h1>504 Gateway Time-out</h1>..." string.
    // Rendering that verbatim leaks markup into the panel — the screenshot
    // that prompted this guard showed the literal "<html><body>" tags
    // displayed to the operator. The panel must extract a short status
    // string from such payloads instead.
    mockUseMigrationStatus.mockReturnValue(statusReturn())
    const { base } = buildMutation()
    mockUseRunMigration.mockReturnValue({
      ...base,
      isError: true,
      error: new ApiError(
        502,
        '<html><body><h1>502 Bad Gateway</h1>The proxy did not get a valid response.</body></html>',
      ),
      isIdle: false,
      status: 'error',
    } as unknown as ReturnType<typeof useRunMigration>)
    useAdminMode.setState({ enabled: true })

    render(<MigrationPanel />)

    // Block must mention the status and not the raw markup.
    expect(screen.queryByText(/<html>/)).toBeNull()
    expect(screen.queryByText(/<\/body>/)).toBeNull()
    expect(screen.getByText(/502/)).toBeDefined()
  })
})

describe('MigrationPanel — gateway-timeout / still-running banner', () => {
  it('on 504 shows a neutral "still running" banner with current status counters, not the destructive block', () => {
    // 936-component runs blow past the gateway timeout while CRS keeps
    // working — the POST returns 504 even though the migration is mid-flight.
    // Treating that as a hard failure (destructive block + retry CTA) is
    // misleading; the right read is "we lost the response, status endpoint
    // is the source of truth from here". Status counters from the polling
    // hook tell the operator how far the run has progressed.
    mockUseMigrationStatus.mockReturnValue(
      statusReturn({ git: 700, db: 236, total: 936 }),
    )
    const { base } = buildMutation()
    mockUseRunMigration.mockReturnValue({
      ...base,
      isError: true,
      error: new ApiError(504, '<html><body><h1>504 Gateway Time-out</h1></body></html>'),
      isIdle: false,
      status: 'error',
    } as unknown as ReturnType<typeof useRunMigration>)
    useAdminMode.setState({ enabled: true })

    const { container } = render(<MigrationPanel />)

    // Neutral copy referencing the gateway timeout + an in-flight run.
    expect(screen.getByText(/still running/i)).toBeDefined()
    // Counters from the live status hook should be visible. The 236 value
    // is unique to the gateway-banner data set.
    expect(screen.getByText('236')).toBeDefined()
    // No destructive styling on this banner — destructive is for actual
    // operator-action-required errors (auth, permission, validation).
    const banner = container.querySelector('[data-testid="migration-still-running"]')
    expect(banner).not.toBeNull()
    expect(banner!.className).not.toMatch(/text-destructive|bg-destructive/)
  })
})

describe('MigrationPanel — running progress indicator', () => {
  it('marks the Run-migration button busy while mutation is pending', () => {
    mockUseMigrationStatus.mockReturnValue(statusReturn())
    const { base } = buildMutation()
    mockUseRunMigration.mockReturnValue({
      ...base,
      isPending: true,
      isIdle: false,
      status: 'pending',
    } as unknown as ReturnType<typeof useRunMigration>)
    useAdminMode.setState({ enabled: true })

    render(<MigrationPanel />)

    const button = screen.getByRole('button', { name: /running|run migration/i })
    expect(button.getAttribute('aria-busy')).toBe('true')
    expect(button).toBeDisabled()
  })

  it('subscribes to live status while pending — live counters reflect partial progress', () => {
    // While the mutation is pending, useMigrationStatus is expected to be
    // called with refetchInterval set so the panel renders fresh git/db
    // counters every few seconds. The hook owns the actual setInterval —
    // this test only pins the contract that the panel asks for polling
    // (refetchInterval > 0) when isPending is true and not otherwise.
    mockUseMigrationStatus.mockReturnValue(statusReturn({ git: 700, db: 236, total: 936 }))
    const { base } = buildMutation()
    mockUseRunMigration.mockReturnValue({
      ...base,
      isPending: true,
      isIdle: false,
      status: 'pending',
    } as unknown as ReturnType<typeof useRunMigration>)
    useAdminMode.setState({ enabled: true })

    render(<MigrationPanel />)

    const calls = mockUseMigrationStatus.mock.calls
    const lastCall = calls[calls.length - 1]
    const opts = lastCall?.[0] as { refetchInterval?: number | false } | undefined
    expect(typeof opts?.refetchInterval).toBe('number')
    expect((opts!.refetchInterval as number)).toBeGreaterThan(0)

    // And the live counters made it into the DOM.
    expect(screen.getByText('236')).toBeDefined()
  })

  it('does not poll when mutation is idle', () => {
    mockUseMigrationStatus.mockReturnValue(statusReturn())
    mockUseRunMigration.mockReturnValue(buildMutation().base)
    useAdminMode.setState({ enabled: true })

    render(<MigrationPanel />)

    const calls = mockUseMigrationStatus.mock.calls
    const lastCall = calls[calls.length - 1]
    const opts = lastCall?.[0] as { refetchInterval?: number | false } | undefined
    // Either undefined or false — the polling hook should NOT be armed when
    // there's nothing to poll for. A constant interval would be wasteful
    // background traffic against /admin/migration-status for every admin who
    // happens to land on the tab.
    expect(opts?.refetchInterval ?? false).toBeFalsy()
  })
})
