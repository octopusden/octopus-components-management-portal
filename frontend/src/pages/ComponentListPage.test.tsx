import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { ComponentListPage } from './ComponentListPage'
import type { User } from '@/lib/auth'
import type { ComponentSummary, Page } from '@/lib/types'
import { ApiError } from '@/lib/api'

// ── mocks ─────────────────────────────────────────────────────────────────────
//
// ComponentListPage delegates to several heavy sub-components (filters, table,
// pagination) that pull their own queries. The page-level contract under test
// is narrow: (1) New Component button visibility gated on EDIT_COMPONENTS, and
// (2) friendlier 403 message instead of raw "Failed to load: Access Denied".
// We stub the sub-components so the mounted DOM only contains what we assert
// against — keeps the test focused on the page-level guards.

vi.mock('@/hooks/useCurrentUser', () => ({ useCurrentUser: vi.fn() }))
vi.mock('../hooks/useComponents', () => ({ useComponents: vi.fn() }))

vi.mock('../components/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'layout' }, children),
}))
vi.mock('../components/ComponentFilters', () => ({
  ComponentFilters: () => React.createElement('div', { 'data-testid': 'filters' }),
}))
vi.mock('../components/ComponentTable', () => ({
  ComponentTable: () => React.createElement('div', { 'data-testid': 'table' }),
}))
vi.mock('../components/Pagination', () => ({
  Pagination: () => React.createElement('div', { 'data-testid': 'pagination' }),
}))

import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useComponents } from '../hooks/useComponents'

const mockedUseCurrentUser = vi.mocked(useCurrentUser)
const mockedUseComponents = vi.mocked(useComponents)

// ── fixtures ──────────────────────────────────────────────────────────────────

const viewerUser: User = {
  username: 'carol',
  roles: [
    {
      name: 'ROLE_COMPONENTS_REGISTRY_VIEWER',
      permissions: ['ACCESS_COMPONENTS', 'ACCESS_AUDIT'],
    },
  ],
  groups: [],
}

const editorUser: User = {
  username: 'bob',
  roles: [
    {
      name: 'ROLE_COMPONENTS_REGISTRY_EDITOR',
      permissions: ['ACCESS_COMPONENTS', 'EDIT_COMPONENTS', 'ACCESS_AUDIT'],
    },
  ],
  groups: [],
}

const adminUser: User = {
  username: 'alice',
  roles: [
    {
      name: 'ROLE_ADMIN',
      permissions: [
        'ACCESS_COMPONENTS',
        'EDIT_COMPONENTS',
        'ARCHIVE_COMPONENTS',
        'RENAME_COMPONENTS',
        'DELETE_COMPONENTS',
        'IMPORT_DATA',
        'ACCESS_AUDIT',
      ],
    },
  ],
  groups: [],
}

/**
 * Real Page<T> shape — the hook returns this directly via api.get<Page<...>>().
 * Using `{ items: [] }` here would silently pass a few asserts and crash others
 * once the production page reads `data.totalElements` / `data.totalPages` /
 * `data.content`. Keep this in sync with frontend/src/lib/types.ts:144.
 */
const emptyPage: Page<ComponentSummary> = {
  content: [],
  totalElements: 0,
  totalPages: 0,
  number: 0,
  size: 20,
  first: true,
  last: true,
}

function mockUser(user: User | null) {
  mockedUseCurrentUser.mockReturnValue({
    data: user ?? undefined,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useCurrentUser>)
}

function mockComponentsOk(page: Page<ComponentSummary> = emptyPage) {
  mockedUseComponents.mockReturnValue({
    data: page,
    isLoading: false,
    error: null,
  } as unknown as ReturnType<typeof useComponents>)
}

function mockComponentsError(error: unknown) {
  mockedUseComponents.mockReturnValue({
    data: undefined,
    isLoading: false,
    error,
  } as unknown as ReturnType<typeof useComponents>)
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    React.createElement(
      QueryClientProvider,
      { client },
      <MemoryRouter initialEntries={['/components']}>
        <ComponentListPage />
      </MemoryRouter>,
    ),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ComponentListPage — New Component button gating', () => {
  it('hides "New Component" for a viewer-only user (no EDIT_COMPONENTS)', () => {
    mockUser(viewerUser)
    mockComponentsOk()

    renderPage()

    // Page itself rendered (Components heading present) but the write-action
    // button is suppressed because hasPermission(user, EDIT_COMPONENTS) is false.
    expect(screen.getByRole('heading', { name: /components/i })).toBeDefined()
    expect(screen.queryByRole('button', { name: /new component/i })).toBeNull()
  })

  it('shows "New Component" for an editor user with EDIT_COMPONENTS', () => {
    mockUser(editorUser)
    mockComponentsOk()

    renderPage()

    expect(screen.getByRole('button', { name: /new component/i })).toBeDefined()
  })

  it('shows "New Component" for an admin user (full permissions)', () => {
    mockUser(adminUser)
    mockComponentsOk()

    renderPage()

    expect(screen.getByRole('button', { name: /new component/i })).toBeDefined()
  })
})

describe('ComponentListPage — error message rendering', () => {
  it('renders friendlier message on 403 ApiError, no raw "Access Denied"', () => {
    // Any user — the 403 branch is independent of who the user is. Picking
    // viewer to also implicitly verify the New Component button stays hidden
    // alongside the friendlier message.
    mockUser(viewerUser)
    mockComponentsError(new ApiError(403, 'Access Denied'))

    renderPage()

    expect(
      screen.getByText(
        /You do not have permission to view components\. Contact your administrator\./i,
      ),
    ).toBeDefined()
    // Crucial: the raw backend phrase must NOT leak through. If it did, that
    // would mean the 403 special-case ran the default branch and we'd be
    // showing "Failed to load components: Access Denied" again.
    expect(screen.queryByText(/Access Denied/)).toBeNull()
    expect(screen.queryByText(/Failed to load components/)).toBeNull()
  })

  it('renders default error text for non-403 errors', () => {
    mockUser(editorUser)
    mockComponentsError(new ApiError(500, 'Internal Server Error'))

    renderPage()

    expect(screen.getByText(/Failed to load components: Internal Server Error/i)).toBeDefined()
    // Friendly 403 copy must NOT show for non-403 paths.
    expect(
      screen.queryByText(/You do not have permission to view components/i),
    ).toBeNull()
  })
})
