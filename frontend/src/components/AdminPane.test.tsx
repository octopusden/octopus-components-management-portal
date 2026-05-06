import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useAdminMode } from '@/lib/adminModeStore'
import type { User } from '@/lib/auth'
import { AdminPane } from './AdminPane'

// AdminPane is a UX-only gate. The IMPORT_DATA permission decides whether
// the toggle even renders; once visible, the Switch arms (or disarms) the
// Run-migration button on the Admin page via the persisted adminMode store.
//
// The component is mounted unconditionally inside <AppFooter>, so visibility
// has to be self-managed: when the current user lacks IMPORT_DATA, the pane
// must render absolutely nothing (not an empty <div>) so the footer's flex
// layout doesn't pin a phantom slot for non-admin users.

vi.mock('@/hooks/useCurrentUser', () => ({ useCurrentUser: vi.fn() }))
const mockUseCurrentUser = vi.mocked(useCurrentUser)

beforeEach(() => {
  // Reset the persisted store between tests so the toggle starts at false
  // for every case. The store reads localStorage at import time, so a stale
  // entry would leak `enabled: true` into the next test.
  localStorage.clear()
  vi.clearAllMocks()
  vi.resetModules()
})

afterEach(() => {
  localStorage.clear()
})

const adminUser: User = {
  username: 'alice',
  roles: [{ name: 'ROLE_ADMIN', permissions: ['IMPORT_DATA'] }],
  groups: [],
}
const viewerUser: User = {
  username: 'carol',
  roles: [{ name: 'ROLE_COMPONENTS_REGISTRY_VIEWER', permissions: ['ACCESS_COMPONENTS'] }],
  groups: [],
}

function mockUser(user: User | null) {
  mockUseCurrentUser.mockReturnValue({
    data: user ?? undefined,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useCurrentUser>)
}

describe('AdminPane', () => {
  it('renders nothing when there is no current user', () => {
    mockUser(null)
    const { container } = render(<AdminPane />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when the user lacks IMPORT_DATA', () => {
    mockUser(viewerUser)
    const { container } = render(<AdminPane />)
    expect(container.firstChild).toBeNull()
  })

  it('renders an unchecked Switch + Admin mode label for users with IMPORT_DATA', () => {
    mockUser(adminUser)
    render(<AdminPane />)

    const sw = screen.getByRole('switch', { name: /admin mode/i })
    expect(sw.getAttribute('aria-checked')).toBe('false')
    expect(screen.getByText(/admin mode/i)).toBeDefined()
  })

  it('flips the persisted store when the Switch is clicked', () => {
    mockUser(adminUser)
    render(<AdminPane />)

    const sw = screen.getByRole('switch', { name: /admin mode/i })
    expect(sw.getAttribute('aria-checked')).toBe('false')

    fireEvent.click(sw)
    expect(sw.getAttribute('aria-checked')).toBe('true')

    fireEvent.click(sw)
    expect(sw.getAttribute('aria-checked')).toBe('false')
  })

  it('writes the explicit checked state from Radix into the store (idempotent on same-state callbacks)', () => {
    // Regression for Copilot review on PR #8 d_r3158719022: wiring
    // onCheckedChange to a blind toggle() ignores the next-state value Radix
    // hands us. If Radix ever fires onCheckedChange(false) while the store
    // is already false (programmatic state sync, double-fire on focus
    // changes, dev-mode StrictMode double-invoke), a toggle() would flip
    // the store TRUE — opposite of what the user sees in the Switch.
    // Wiring through `set` (which writes the explicit value) makes the
    // callback idempotent: invoking it with the current state is a no-op.
    mockUser(adminUser)
    render(<AdminPane />)

    expect(useAdminMode.getState().enabled).toBe(false)

    // Simulate Radix firing onCheckedChange(false) — same as the current
    // state. With `set` this is a no-op; with toggle() it would flip TRUE
    // and the test would fail.
    act(() => {
      useAdminMode.getState().set(false)
    })
    expect(useAdminMode.getState().enabled).toBe(false)
  })
})
