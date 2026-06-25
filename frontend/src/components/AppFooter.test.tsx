import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import userEvent from '@testing-library/user-event'
import { AppFooter } from './AppFooter'
import type { User } from '@/lib/auth'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useUiOverlay } from '@/lib/uiOverlayStore'

// AppFooter has two responsibilities:
//   1. render the build labels — but degrade gracefully when one or both
//      info endpoints fail so the footer stays rendered.
//   2. host the AdminPane (Admin-mode toggle) on the left when the user
//      has IMPORT_DATA, otherwise leave the slot empty so the version
//      label still hugs the right edge via ml-auto.
//
// The plan calls out an explicit foot-gun: if AdminPane is hidden and the
// flex container uses `justify-between`, the version becomes the only
// flex child and ends up pinned LEFT instead of right. The footer must use
// an empty left placeholder + ml-auto to keep the version on the right
// regardless of pane visibility.

vi.mock('@/hooks/useCurrentUser', () => ({ useCurrentUser: vi.fn() }))
const mockUseCurrentUser = vi.mocked(useCurrentUser)

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

function renderFooter() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    React.createElement(QueryClientProvider, { client }, React.createElement(AppFooter)),
  )
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  useUiOverlay.setState({ paletteOpen: false, shortcutsOpen: false })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('AppFooter — version line', () => {
  it('renders "portal X · service Y" when both info endpoints succeed', async () => {
    mockUser(viewerUser)
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.endsWith('/portal/info')) {
          return Promise.resolve(new Response(JSON.stringify({ name: 'portal', version: '1.2.3' }), { status: 200 }))
        }
        if (url.endsWith('/rest/api/4/info')) {
          return Promise.resolve(new Response(JSON.stringify({ name: 'crs', version: '3.0.42' }), { status: 200 }))
        }
        return Promise.reject(new Error(`unexpected fetch ${url}`))
      }),
    )

    renderFooter()
    await waitFor(() =>
      expect(screen.getByText(/Components Registry by F1 team \(portal 1\.2\.3 · service 3\.0\.42\)/i)).toBeDefined(),
    )
  })

  it('falls back to "(portal X)" when CRS info 5xx', async () => {
    mockUser(viewerUser)
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.endsWith('/portal/info')) {
          return Promise.resolve(new Response(JSON.stringify({ name: 'portal', version: '1.2.3' }), { status: 200 }))
        }
        return Promise.resolve(new Response('boom', { status: 503 }))
      }),
    )

    renderFooter()
    await waitFor(() => expect(screen.getByText(/portal 1\.2\.3/)).toBeDefined())
    expect(screen.queryByText(/service/i)).toBeNull()
  })

  it('renders the bare brand line when both endpoints fail', async () => {
    mockUser(viewerUser)
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('boom', { status: 503 }))))

    renderFooter()
    // Use waitFor so React-Query has a chance to settle the queries to error.
    await waitFor(() => {
      expect(screen.getByText(/Components Registry by F1 team/i).textContent).not.toMatch(/[()]/)
    })
  })
})

describe('AppFooter — keyboard shortcuts link', () => {
  it('opens the shortcuts panel via the store when the link is clicked', async () => {
    const user = userEvent.setup()
    mockUser(viewerUser)
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('{}', { status: 200 }))))

    renderFooter()
    await user.click(screen.getByRole('button', { name: /keyboard shortcuts/i }))
    expect(useUiOverlay.getState().shortcutsOpen).toBe(true)
  })
})

describe('AppFooter — AdminPane visibility', () => {
  it('shows the Admin-mode switch for users with IMPORT_DATA', async () => {
    mockUser(adminUser)
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('{}', { status: 200 }))),
    )

    renderFooter()
    await waitFor(() => expect(screen.getByRole('switch', { name: /admin mode/i })).toBeDefined())
  })

  it('does not show the Admin-mode switch for users without IMPORT_DATA', async () => {
    mockUser(viewerUser)
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('{}', { status: 200 }))),
    )

    renderFooter()
    // Brand line is always there; the switch is the gate.
    await waitFor(() => expect(screen.getByText(/Components Registry by F1 team/i)).toBeDefined())
    expect(screen.queryByRole('switch', { name: /admin mode/i })).toBeNull()
  })
})
