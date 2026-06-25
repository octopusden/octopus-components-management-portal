import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from './App'
import { useUiOverlay } from './lib/uiOverlayStore'

// Prevent real API calls from the components list page
vi.mock('./hooks/useComponents', () => ({
  useComponents: vi.fn(() => ({ data: undefined, isLoading: true, isFetching: false, error: null })),
}))

// Mock /auth/me so Layout exercises the happy path, not the isError fallback.
vi.mock('./hooks/useCurrentUser', () => ({
  useCurrentUser: vi.fn(() => ({
    data: { username: 'alice', roles: [], groups: [] },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  })),
}))

beforeEach(() => {
  vi.clearAllMocks()
  useUiOverlay.setState({ paletteOpen: false, shortcutsOpen: false })
  // Layout (environment banner) and AppFooter both query the anonymous info
  // endpoints via plain fetch — answer those with "no data" ({} → no banner, no
  // version label). Every OTHER fetch rejects, mirroring jsdom's no-network
  // behavior this suite has always relied on: components like MultiSelectFilter
  // expect array payloads and must take their isError fallback, not parse {}.
  vi.stubGlobal(
    'fetch',
    vi.fn((url: RequestInfo | URL) => {
      const u = String(url)
      return u.includes('portal/info') || u.includes('rest/api/4/info')
        ? Promise.resolve(new Response('{}', { status: 200 }))
        : Promise.reject(new Error(`App.test: unstubbed fetch ${u}`))
    }),
  )
})

describe('App routing', () => {
  it('renders the app shell when navigated to /components', () => {
    window.history.pushState({}, '', '/components')

    render(<App />)

    // Layout always renders the app title; if routing is broken, nothing renders
    expect(screen.getByText('Components Registry')).toBeDefined()
  })

  it('redirects from / to /components', () => {
    window.history.pushState({}, '', '/')

    render(<App />)

    expect(screen.getByText('Components Registry')).toBeDefined()
  })
})

describe('App command palette wiring', () => {
  it('opens the palette on ⌘K and closes it on Esc', async () => {
    const user = userEvent.setup()
    window.history.pushState({}, '', '/components')
    render(<App />)

    // Not open initially.
    expect(screen.queryByPlaceholderText(/jump to a page/i)).toBeNull()

    // ⌘K opens it (the global hotkey listener lives on window).
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(await screen.findByPlaceholderText(/jump to a page/i)).toBeInTheDocument()

    // Esc closes it.
    await user.keyboard('{Escape}')
    await waitFor(() =>
      expect(screen.queryByPlaceholderText(/jump to a page/i)).toBeNull(),
    )
  })

  it('opens the keyboard shortcuts panel on "?"', async () => {
    window.history.pushState({}, '', '/components')
    render(<App />)

    fireEvent.keyDown(window, { key: '?' })
    // "Keyboard shortcuts" is also the footer link text, so target the dialog
    // heading specifically.
    expect(await screen.findByRole('heading', { name: 'Keyboard shortcuts' })).toBeInTheDocument()
  })
})

describe('App routing with custom BASE_URL', () => {
  it('renders correctly when deployed under a sub-path', () => {
    const base = '/components-management-portal/'
    vi.stubEnv('BASE_URL', base)
    window.history.pushState({}, '', `${base}components`)

    render(<App />)

    expect(screen.getByText('Components Registry')).toBeDefined()

    vi.unstubAllEnvs()
  })

  it('redirects from base root to /components under sub-path', () => {
    const base = '/components-management-portal/'
    vi.stubEnv('BASE_URL', base)
    window.history.pushState({}, '', base)

    render(<App />)

    expect(screen.getByText('Components Registry')).toBeDefined()

    vi.unstubAllEnvs()
  })

  it('renders when URL has no trailing slash on sub-path', () => {
    // Regression: BASE_URL ends with '/' but React Router basename must not,
    // otherwise URL '/components-management-portal' (no trailing slash) won't match
    // basename '/components-management-portal/' and Router renders nothing.
    vi.stubEnv('BASE_URL', '/components-management-portal/')
    window.history.pushState({}, '', '/components-management-portal')

    render(<App />)

    expect(screen.getByText('Components Registry')).toBeDefined()

    vi.unstubAllEnvs()
  })
})
