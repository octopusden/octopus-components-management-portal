import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { Layout } from './Layout'
import type { User } from '../lib/auth'
import { useAdminMode } from '@/lib/adminModeStore'

vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: vi.fn(),
}))

import { useCurrentUser } from '@/hooks/useCurrentUser'
const mockedUseCurrentUser = vi.mocked(useCurrentUser)

// Helper: set Zustand adminMode state directly
function setAdminMode(enabled: boolean) {
  useAdminMode.setState({ enabled })
}

function renderLayout(portalInfo: Record<string, unknown> = {}) {
  // AppFooter mounts inside Layout and uses useQuery via @tanstack/react-query.
  // Without a QueryClient in the tree, those hooks throw — failing the
  // existing nav-visibility tests. Stub fetch as well so the footer's info
  // queries don't reach the network in jsdom. The /portal/info request gets
  // `portalInfo` (environment-banner tests inject a payload); everything else `{}`.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  vi.stubGlobal(
    'fetch',
    vi.fn((url: RequestInfo | URL) =>
      Promise.resolve(
        new Response(String(url).includes('portal/info') ? JSON.stringify(portalInfo) : '{}', {
          status: 200,
        }),
      ),
    ),
  )
  return render(
    React.createElement(
      QueryClientProvider,
      { client },
      <MemoryRouter initialEntries={['/components']}>
        <Layout>
          <div>child content</div>
        </Layout>
      </MemoryRouter>,
    ),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  // Reset adminMode to false before each test
  setAdminMode(false)
})

describe('Layout nav visibility', () => {
  it('shows only Components for a user without audit/import permissions', () => {
    const viewer: User = {
      username: 'carol',
      roles: [{ name: 'ROLE_COMPONENTS_REGISTRY_VIEWER', permissions: ['ACCESS_COMPONENTS'] }],
      groups: [],
    }
    mockedUseCurrentUser.mockReturnValue({
      data: viewer,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useCurrentUser>)

    renderLayout()
    expect(screen.getByRole('link', { name: /Components/i })).toBeDefined()
    expect(screen.queryByRole('link', { name: /Audit/i })).toBeNull()
    expect(screen.queryByRole('link', { name: /Admin/i })).toBeNull()
    expect(screen.queryByRole('link', { name: /Health/i })).toBeNull()
  })

  it('shows Audit and Admin for F1_ADMIN', () => {
    const admin: User = {
      username: 'alice',
      roles: [
        {
          name: 'ROLE_F1_ADMIN',
          permissions: ['ACCESS_COMPONENTS', 'ACCESS_AUDIT', 'IMPORT_DATA'],
        },
      ],
      groups: [],
    }
    mockedUseCurrentUser.mockReturnValue({
      data: admin,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useCurrentUser>)

    renderLayout()
    expect(screen.getByRole('link', { name: /Components/i })).toBeDefined()
    expect(screen.getByRole('link', { name: /Audit/i })).toBeDefined()
    expect(screen.getByRole('link', { name: /Admin/i })).toBeDefined()
    expect(screen.getByText('alice')).toBeDefined()
    // Health is admin-mode-gated (not just permission-gated); adminMode is
    // false here, so even an IMPORT_DATA holder must not see it.
    expect(screen.queryByRole('link', { name: /Health/i })).toBeNull()
  })

  it('renders a <footer> region with the brand line so the version label has a host', () => {
    const viewer: User = {
      username: 'carol',
      roles: [{ name: 'ROLE_COMPONENTS_REGISTRY_VIEWER', permissions: ['ACCESS_COMPONENTS'] }],
      groups: [],
    }
    mockedUseCurrentUser.mockReturnValue({
      data: viewer,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useCurrentUser>)

    renderLayout()
    // The footer must be in the DOM as a <footer> region. Before this change,
    // Layout had no footer at all — adding one is part of the DMS-style
    // migration UI work (build versions + Admin-mode toggle).
    expect(screen.getByRole('contentinfo')).toBeDefined()
    expect(screen.getByText(/Components Registry by F1 team/i)).toBeDefined()
  })

  it('uses a vertical flex column so AppFooter can stick to the bottom (mt-auto)', () => {
    const viewer: User = {
      username: 'carol',
      roles: [{ name: 'ROLE_COMPONENTS_REGISTRY_VIEWER', permissions: ['ACCESS_COMPONENTS'] }],
      groups: [],
    }
    mockedUseCurrentUser.mockReturnValue({
      data: viewer,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useCurrentUser>)

    const { container } = renderLayout()

    // Root must be min-h-screen + flex flex-col so AppFooter's mt-auto pushes
    // the footer to the bottom of viewports taller than the content. Without
    // flex-col on the root, the footer just sits flush under <main>.
    const root = container.firstChild as HTMLElement
    expect(root.className).toContain('min-h-screen')
    expect(root.className).toContain('flex')
    expect(root.className).toContain('flex-col')

    // <main> must be flex-1 so it fills the space between header and footer.
    const main = container.querySelector('main') as HTMLElement
    expect(main.className).toContain('flex-1')
  })

  it('fails open on auth backend error — shows all nav items and an auth-failed indicator', () => {
    mockedUseCurrentUser.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('500 internal'),
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useCurrentUser>)

    renderLayout()

    // All nav items visible — the server is the authoritative gate.
    expect(screen.getByRole('link', { name: /Components/i })).toBeDefined()
    expect(screen.getByRole('link', { name: /Audit/i })).toBeDefined()
    expect(screen.getByRole('link', { name: /Admin/i })).toBeDefined()
    // Explicit "auth check failed" signal so the operator sees the cause.
    expect(screen.getByText(/auth check failed/i)).toBeDefined()
  })
})

describe('Layout ADMIN badge — double-gate', () => {
  const adminUser: User = {
    username: 'alice',
    roles: [
      {
        name: 'ROLE_F1_ADMIN',
        permissions: ['ACCESS_COMPONENTS', 'ACCESS_AUDIT', 'IMPORT_DATA'],
      },
    ],
    groups: [],
  }

  const viewerUser: User = {
    username: 'carol',
    roles: [{ name: 'ROLE_COMPONENTS_REGISTRY_VIEWER', permissions: ['ACCESS_COMPONENTS'] }],
    groups: [],
  }

  it('(a) admin user + adminMode true → ADMIN badge visible', () => {
    setAdminMode(true)
    mockedUseCurrentUser.mockReturnValue({
      data: adminUser,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useCurrentUser>)

    renderLayout()
    expect(screen.getByText('ADMIN')).toBeDefined()
  })

  it('(b) admin user + adminMode false → no ADMIN badge', () => {
    setAdminMode(false)
    mockedUseCurrentUser.mockReturnValue({
      data: adminUser,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useCurrentUser>)

    renderLayout()
    expect(screen.queryByText('ADMIN')).toBeNull()
  })

  it('(c) viewer + adminMode true (localStorage bypass) → no ADMIN badge (security canary)', () => {
    // This is the key security case: a viewer can set adminMode=true in localStorage,
    // but without IMPORT_DATA permission the badge must NOT render.
    setAdminMode(true)
    mockedUseCurrentUser.mockReturnValue({
      data: viewerUser,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useCurrentUser>)

    renderLayout()
    expect(screen.queryByText('ADMIN')).toBeNull()
  })

  it('(d) no user (unauthenticated) → no ADMIN badge', () => {
    setAdminMode(true)
    mockedUseCurrentUser.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useCurrentUser>)

    renderLayout()
    expect(screen.queryByText('ADMIN')).toBeNull()
  })
})

describe('Layout Health nav — adminMode + IMPORT_DATA double-gate', () => {
  const adminUser: User = {
    username: 'alice',
    roles: [
      { name: 'ROLE_F1_ADMIN', permissions: ['ACCESS_COMPONENTS', 'ACCESS_AUDIT', 'IMPORT_DATA'] },
    ],
    groups: [],
  }

  const viewerUser: User = {
    username: 'carol',
    roles: [{ name: 'ROLE_COMPONENTS_REGISTRY_VIEWER', permissions: ['ACCESS_COMPONENTS'] }],
    groups: [],
  }

  function mockUser(user: User | undefined) {
    mockedUseCurrentUser.mockReturnValue({
      data: user,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useCurrentUser>)
  }

  it('shows Health for an IMPORT_DATA holder when adminMode is on', () => {
    setAdminMode(true)
    mockUser(adminUser)
    renderLayout()
    expect(screen.getByRole('link', { name: /Health/i })).toBeDefined()
  })

  it('hides Health when adminMode is off (even with IMPORT_DATA)', () => {
    setAdminMode(false)
    mockUser(adminUser)
    renderLayout()
    expect(screen.queryByRole('link', { name: /Health/i })).toBeNull()
  })

  it('hides Health for a viewer even with adminMode forced on (security canary)', () => {
    setAdminMode(true)
    mockUser(viewerUser)
    renderLayout()
    expect(screen.queryByRole('link', { name: /Health/i })).toBeNull()
  })
})

describe('Layout environment banner', () => {
  const viewer: User = {
    username: 'carol',
    roles: [{ name: 'ROLE_COMPONENTS_REGISTRY_VIEWER', permissions: ['ACCESS_COMPONENTS'] }],
    groups: [],
  }

  beforeEach(() => {
    mockedUseCurrentUser.mockReturnValue({
      data: viewer,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useCurrentUser>)
  })

  it('shows a full-width warning banner in the sticky header when /portal/info returns environmentLabel', async () => {
    renderLayout({ name: 'portal', version: '9.9.9', environmentLabel: 'TEST' })
    // findByText: the label arrives async via the /portal/info query.
    expect(await screen.findByText('TEST')).toBeDefined()
    const banner = screen.getByTestId('environment-banner')
    expect(banner.getAttribute('data-variant')).toBe('warning')
    // Must live INSIDE the sticky <header> so it stays visible on scroll —
    // EmployeeIntegrationAlert sits below the header and scrolls away; the
    // environment strip must not.
    expect(banner.closest('header')).not.toBeNull()
  })

  it('shows no environment banner when environmentLabel is absent (prod shape)', async () => {
    renderLayout({ name: 'portal', version: '9.9.9' })
    // Wait until the /portal/info query has resolved AND rendered — the footer
    // version label is driven by the same query — so the absence check below
    // cannot false-pass on a not-yet-rendered banner.
    await screen.findByText(/portal 9\.9\.9/)
    expect(screen.queryByTestId('environment-banner')).toBeNull()
  })
})
