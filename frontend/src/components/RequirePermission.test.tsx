import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router'
import { RequirePermission } from './RequirePermission'
import { CONTINUE_PATH_STORAGE_KEY, OIDC_AUTHORIZE_PATH, type User } from '../lib/auth'

const refetchMock = vi.fn()

vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: vi.fn(),
}))

import { useCurrentUser } from '@/hooks/useCurrentUser'
const mockedUseCurrentUser = vi.mocked(useCurrentUser)

// Same location-faking approach as api.test.ts: jsdom's location.assign cannot be
// re-spied across tests, so swap the whole object once and restore at end-of-file.
const assignSpy = vi.fn()
const originalLocation = window.location
const fakeLocation = {
  ...originalLocation,
  assign: (url: string | URL) => assignSpy(String(url)),
  pathname: '/admin',
  search: '',
} as unknown as Location

function renderAt(initial: string) {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route
          path="/admin"
          element={
            <RequirePermission permission="IMPORT_DATA" fallback="/components">
              <div>ADMIN PAGE CONTENT</div>
            </RequirePermission>
          }
        />
        <Route path="/components" element={<div>COMPONENTS LIST</div>} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  assignSpy.mockReset()
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: { ...fakeLocation, pathname: '/admin', search: '' },
  })
  sessionStorage.clear()
})

afterEach(() => {
  sessionStorage.clear()
})

afterAll(() => {
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: originalLocation,
  })
})

describe('RequirePermission', () => {
  it('renders nothing while the auth query is loading', () => {
    mockedUseCurrentUser.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: refetchMock,
    } as unknown as ReturnType<typeof useCurrentUser>)

    const { container } = renderAt('/admin')
    expect(container.textContent).toBe('')
  })

  it('renders the error banner with Retry on backend error (NOT redirect)', () => {
    mockedUseCurrentUser.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('500 internal'),
      refetch: refetchMock,
    } as unknown as ReturnType<typeof useCurrentUser>)

    renderAt('/admin')

    // Banner-specific copy — "auth check failed" also appears as a Layout indicator.
    expect(screen.getByText(/Could not verify your permissions/i)).toBeDefined()
    expect(screen.getByText(/500 internal/)).toBeDefined()
    expect(screen.queryByText('COMPONENTS LIST')).toBeNull()
    expect(screen.queryByText('ADMIN PAGE CONTENT')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(refetchMock).toHaveBeenCalledOnce()
  })

  it('triggers OIDC entry point directly (single navigation) when user is null', () => {
    mockedUseCurrentUser.mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
      error: null,
      refetch: refetchMock,
    } as unknown as ReturnType<typeof useCurrentUser>)

    renderAt('/admin')

    // Should NOT bounce through the in-SPA fallback (would issue an extra /rest/ call → 401);
    // instead jumps straight to the OAuth2 authorization endpoint.
    expect(assignSpy).toHaveBeenCalledOnce()
    expect(assignSpy).toHaveBeenCalledWith(OIDC_AUTHORIZE_PATH)
    // And stashes the deep-link path so the post-login bootstrap can restore it.
    expect(sessionStorage.getItem(CONTINUE_PATH_STORAGE_KEY)).toBe('/admin')
    // No content rendered while the browser tears down the SPA.
    expect(screen.queryByText('ADMIN PAGE CONTENT')).toBeNull()
    expect(screen.queryByText('COMPONENTS LIST')).toBeNull()
  })

  it('redirects to fallback when user lacks the required permission', () => {
    const viewer: User = {
      username: 'carol',
      roles: [{ name: 'ROLE_REGISTRY_VIEWER', permissions: ['ACCESS_COMPONENTS'] }],
      groups: [],
    }
    mockedUseCurrentUser.mockReturnValue({
      data: viewer,
      isLoading: false,
      isError: false,
      error: null,
      refetch: refetchMock,
    } as unknown as ReturnType<typeof useCurrentUser>)

    renderAt('/admin')
    expect(screen.getByText('COMPONENTS LIST')).toBeDefined()
    expect(screen.queryByText('ADMIN PAGE CONTENT')).toBeNull()
  })

  it('renders children when user has the required permission', () => {
    const admin: User = {
      username: 'alice',
      roles: [{ name: 'ROLE_F1_ADMIN', permissions: ['ACCESS_COMPONENTS', 'IMPORT_DATA'] }],
      groups: [],
    }
    mockedUseCurrentUser.mockReturnValue({
      data: admin,
      isLoading: false,
      isError: false,
      error: null,
      refetch: refetchMock,
    } as unknown as ReturnType<typeof useCurrentUser>)

    renderAt('/admin')
    expect(screen.getByText('ADMIN PAGE CONTENT')).toBeDefined()
  })
})
