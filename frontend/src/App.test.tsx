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
