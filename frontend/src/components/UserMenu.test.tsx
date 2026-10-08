import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { UserMenu } from './UserMenu'
import { useAdminMode } from '@/lib/adminModeStore'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { logout, type User } from '@/lib/auth'

// AdminPane (rendered inside the menu) reads the current user itself.
vi.mock('@/hooks/useCurrentUser', () => ({ useCurrentUser: vi.fn() }))
vi.mock('@/lib/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth')
  return { ...actual, logout: vi.fn() }
})
const mockedUseCurrentUser = vi.mocked(useCurrentUser)

const admin: User = {
  username: 'alice',
  roles: [{ name: 'ROLE_ADMIN', permissions: ['ACCESS_COMPONENTS', 'IMPORT_DATA'] }],
  groups: [],
}
const viewer: User = {
  username: 'carol',
  roles: [{ name: 'ROLE_COMPONENTS_REGISTRY_VIEWER', permissions: ['ACCESS_COMPONENTS'] }],
  groups: [],
}

function renderMenu(user: User | undefined, { authError = false, openFeedbackCount = 0 } = {}) {
  mockedUseCurrentUser.mockReturnValue({ data: user } as ReturnType<typeof useCurrentUser>)
  return render(
    <MemoryRouter>
      <UserMenu user={user} authError={authError} openFeedbackCount={openFeedbackCount} />
    </MemoryRouter>,
  )
}

async function openMenu() {
  await userEvent.click(screen.getByRole('button', { name: /^Account/ }))
}

beforeEach(() => {
  vi.clearAllMocks()
  useAdminMode.setState({ enabled: false })
})

describe('UserMenu', () => {
  it('a viewer gets their name and Log out only', async () => {
    renderMenu(viewer)
    await openMenu()
    expect(screen.getByText('carol')).toBeDefined()
    expect(screen.queryByRole('switch', { name: /admin mode/i })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: /admin settings/i })).toBeNull()
    await userEvent.click(screen.getByRole('menuitem', { name: /log out/i }))
    expect(logout).toHaveBeenCalled()
  })

  it('an IMPORT_DATA holder gets the Admin-mode switch and Admin settings', async () => {
    renderMenu(admin)
    await openMenu()
    expect(screen.getByRole('switch', { name: /admin mode/i })).toBeDefined()
    expect(screen.getByRole('menuitem', { name: /admin settings/i }).getAttribute('href')).toBe('/admin')
  })

  it('flipping Admin mode keeps the menu open and reveals Validations + the ADMIN badge', async () => {
    renderMenu(admin)
    await openMenu()
    expect(screen.queryByRole('menuitem', { name: /validations/i })).toBeNull()
    await userEvent.click(screen.getByRole('switch', { name: /admin mode/i }))
    expect(useAdminMode.getState().enabled).toBe(true)
    expect(screen.getByRole('menuitem', { name: /validations/i }).getAttribute('href')).toBe('/validations')
    expect(screen.getByText('ADMIN')).toBeDefined()
  })

  it('a viewer with admin mode forced on gets neither badge nor Validations (security canary)', async () => {
    useAdminMode.setState({ enabled: true })
    renderMenu(viewer, { openFeedbackCount: 5 })
    expect(screen.queryByText('ADMIN')).toBeNull()
    expect(screen.queryByTestId('open-feedback-dot')).toBeNull()
    await openMenu()
    expect(screen.queryByRole('menuitem', { name: /validations/i })).toBeNull()
  })

  it('shows open feedback as a dot on the avatar and a count on Admin settings', async () => {
    useAdminMode.setState({ enabled: true })
    renderMenu(admin, { openFeedbackCount: 120 })
    expect(screen.getByTestId('open-feedback-dot')).toBeDefined()
    await openMenu()
    expect(screen.getByTestId('open-feedback-badge').textContent).toBe('99+')
  })

  it('fails open on an auth backend error: Admin settings stays reachable', async () => {
    renderMenu(undefined, { authError: true })
    await openMenu()
    expect(screen.getByRole('menuitem', { name: /admin settings/i })).toBeDefined()
    expect(screen.queryByRole('menuitem', { name: /validations/i })).toBeNull()
  })
})
