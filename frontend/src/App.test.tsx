import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { App } from './App'

// Prevent real API calls from the components list page
vi.mock('./hooks/useComponents', () => ({
  useComponents: vi.fn(() => ({ data: undefined, isLoading: true, error: null })),
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
  // Layout (environment badge) and AppFooter both query the anonymous info
  // endpoints via plain fetch — answer those with "no data" ({} → no badge, no
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
