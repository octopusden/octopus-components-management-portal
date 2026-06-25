import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
// is narrow: (1) New Component button visibility gated on CREATE_COMPONENTS, and
// (2) friendlier 403 message instead of raw "Failed to load: Access Denied".
// We stub the sub-components so the mounted DOM only contains what we assert
// against — keeps the test focused on the page-level guards.

vi.mock('@/hooks/useCurrentUser', () => ({ useCurrentUser: vi.fn() }))
vi.mock('../hooks/useComponents', () => ({ useComponents: vi.fn() }))
// Validation Problems hooks: the page consumes both the full-report overlay
// and the problemsOnly list source. Stub them to a benign empty result so the
// page tests stay focused on the gating/error contracts (the hooks have their
// own unit tests). Tests that exercise the toggle override these.
vi.mock('../hooks/useValidationProblems', () => ({
  useValidationProblems: vi.fn(),
  useComponentsWithProblems: vi.fn(),
}))

vi.mock('../components/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'layout' }, children),
}))
// Filters stub surfaces the page→filters "Only with problems" contract: a
// trigger that flips problemsOnly so a page test can exercise the list swap.
vi.mock('../components/ComponentFilters', () => ({
  ComponentFilters: ({
    onProblemsOnlyChange,
  }: {
    onProblemsOnlyChange?: (v: boolean) => void
  }) =>
    React.createElement(
      'div',
      { 'data-testid': 'filters' },
      onProblemsOnlyChange
        ? React.createElement('button', {
            'data-testid': 'problems-only-trigger',
            onClick: () => onProblemsOnlyChange(true),
          })
        : null,
    ),
}))
// The table stub surfaces the page→table `onCopy` contract: when the page
// passes the callback (CREATE_COMPONENTS holders only) the stub renders a
// trigger that reports a fixed row id, mirroring a real per-row Copy click.
vi.mock('../components/ComponentTable', () => ({
  ComponentTable: ({
    data,
    onCopy,
    validationByComponent,
  }: {
    data: { name: string }[]
    onCopy?: (id: string) => void
    validationByComponent?: Map<string, unknown>
  }) =>
    React.createElement(
      'div',
      {
        'data-testid': 'table',
        // Expose the row count + whether a validation overlay was supplied so a
        // page test can assert the list source swapped in problemsOnly mode.
        'data-row-count': String(data.length),
        'data-has-validation': validationByComponent ? 'yes' : 'no',
      },
      onCopy
        ? React.createElement('button', {
            'data-testid': 'table-copy-trigger',
            onClick: () => onCopy('comp-x'),
          })
        : null,
    ),
}))
vi.mock('../components/Pagination', () => ({
  Pagination: () => React.createElement('div', { 'data-testid': 'pagination' }),
}))
// CreateComponentDialog and CreateComponentButton live in the same module;
// keep the real button (the "New Component" gate is under test) and stub only
// the dialog to a sourceId probe.
vi.mock('../components/CreateComponentDialog', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../components/CreateComponentDialog')>()
  return {
    ...actual,
    CreateComponentDialog: ({ sourceId, open }: { sourceId?: string; open: boolean }) =>
      open ? React.createElement('div', { 'data-testid': 'copy-dialog' }, sourceId) : null,
  }
})

import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useComponents } from '../hooks/useComponents'
import {
  useValidationProblems,
  useComponentsWithProblems,
} from '../hooks/useValidationProblems'
import { useAdminMode } from '@/lib/adminModeStore'
import type { ComponentValidation } from '@/lib/types'

const mockedUseCurrentUser = vi.mocked(useCurrentUser)
const mockedUseComponents = vi.mocked(useComponents)
const mockedUseValidationProblems = vi.mocked(useValidationProblems)
const mockedUseComponentsWithProblems = vi.mocked(useComponentsWithProblems)

function makeValidationResult(byComponent = new Map<string, ComponentValidation>(), over = {}) {
  return {
    byComponent,
    generatedAt: null,
    lastAttemptAt: null,
    refreshError: null,
    isLoading: false,
    isError: false,
    error: null,
    ...over,
  }
}

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
      permissions: ['ACCESS_COMPONENTS', 'CREATE_COMPONENTS', 'ACCESS_AUDIT'],
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
        'CREATE_COMPONENTS',
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
  // Validation Problems is admin-mode only. Default adminMode OFF so the
  // baseline tests (New Component gating, error rendering, copy) see the list
  // exactly as a non-admin would — no validation UI. The dedicated Validation
  // Problems describe flips adminMode on + uses an IMPORT_DATA user.
  useAdminMode.setState({ enabled: false })
  // Benign validation defaults; toggle tests override useComponentsWithProblems.
  mockedUseValidationProblems.mockReturnValue(
    makeValidationResult() as unknown as ReturnType<typeof useValidationProblems>,
  )
  mockedUseComponentsWithProblems.mockReturnValue(
    makeValidationResult() as unknown as ReturnType<typeof useComponentsWithProblems>,
  )
})

afterEach(() => {
  // Reset the persisted zustand store so adminMode doesn't bleed across tests.
  useAdminMode.setState({ enabled: false })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ComponentListPage — New Component button gating', () => {
  it('hides "New Component" for a viewer-only user (no CREATE_COMPONENTS)', () => {
    mockUser(viewerUser)
    mockComponentsOk()

    renderPage()

    // Page itself rendered (Components heading present) but the write-action
    // button is suppressed because hasPermission(user, CREATE_COMPONENTS) is false.
    expect(screen.getByRole('heading', { name: /components/i })).toBeDefined()
    expect(screen.queryByRole('button', { name: /new component/i })).toBeNull()
  })

  it('shows "New Component" for an editor user with CREATE_COMPONENTS', () => {
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

describe('ComponentListPage — per-row Copy gating + dialog wiring', () => {
  it('passes onCopy to the table for a user with CREATE_COMPONENTS and opens the dialog with the row id', async () => {
    mockUser(editorUser)
    mockComponentsOk()
    renderPage()

    await userEvent.click(screen.getByTestId('table-copy-trigger'))
    expect(await screen.findByTestId('copy-dialog')).toBeDefined()
    expect(screen.getByTestId('copy-dialog').textContent).toBe('comp-x')
  })

  it('does not pass onCopy without CREATE_COMPONENTS — no copy trigger rendered', () => {
    mockUser(viewerUser)
    mockComponentsOk()
    renderPage()
    expect(screen.queryByTestId('table-copy-trigger')).toBeNull()
  })
})

describe('ComponentListPage — Validation Problems', () => {
  const problemValidation: ComponentValidation = {
    component: 'example-component',
    problems: [
      {
        type: 'UNREGISTERED_RELEASED_VERSIONS',
        severity: 'ERROR',
        message: '1 released version(s) not registered in components-registry',
        details: { versions: ['ExampleService.1.0.1'], missingCount: 1, releasedCount: 5 },
      },
    ],
    checkFailed: false,
    checkError: null,
  }

  function checkFailedValidation(component: string): ComponentValidation {
    return { component, problems: [], checkFailed: true, checkError: 'DecodingException' }
  }

  // ── Admin mode ON + IMPORT_DATA user: the facility is visible/active. ──
  describe('admin mode on (IMPORT_DATA user)', () => {
    beforeEach(() => {
      useAdminMode.setState({ enabled: true })
      mockUser(adminUser)
    })

    it('passes the full-report overlay to the table in the normal paged view', () => {
      mockComponentsOk()
      mockedUseValidationProblems.mockReturnValue(
        makeValidationResult(
          new Map([['example-component', problemValidation]]),
        ) as unknown as ReturnType<typeof useValidationProblems>,
      )
      renderPage()
      expect(screen.getByTestId('table').getAttribute('data-has-validation')).toBe('yes')
    })

    it('does not pass an overlay when the report is empty (so no inline triangles)', () => {
      mockComponentsOk()
      renderPage()
      expect(screen.getByTestId('table').getAttribute('data-has-validation')).toBe('no')
    })

    it('surfaces a stale-report warning (categorized reason + config hint) when the latest refresh failed', () => {
      mockComponentsOk()
      // The backend now returns a categorized, host-free reason; the banner shows
      // it plus a generic actionable config hint (no URL/host in the UI text).
      mockedUseValidationProblems.mockReturnValue(
        makeValidationResult(new Map(), {
          refreshError: 'components-registry unreachable: WebClientRequestException',
        }) as unknown as ReturnType<typeof useValidationProblems>,
      )
      renderPage()
      // The banner renders three adjacent text nodes (static lead, the
      // interpolated reason, static hint). Match each on its own node with a
      // substring regex (normalizer collapses whitespace).
      const normalize = (s: string) => s.replace(/\s+/g, ' ').trim()
      expect(
        screen.getByText(/Validation report may be stale — last refresh failed:/i),
      ).toBeDefined()
      expect(
        screen.getByText(/components-registry unreachable: WebClientRequestException/),
      ).toBeDefined()
      expect(
        screen.getByText((content) =>
          normalize(content).includes(
            'Check that the validation service URLs (components-registry / release-management) ' +
              'are configured and reachable over https',
          ),
        ),
      ).toBeDefined()
    })

    it('surfaces ONE system-level banner (not per-component triangles) when the report has check-failed components', () => {
      mockComponentsOk()
      mockedUseValidationProblems.mockReturnValue(
        makeValidationResult(
          new Map<string, ComponentValidation>([
            ['a', checkFailedValidation('a')],
            ['b', checkFailedValidation('b')],
            ['c', problemValidation],
          ]),
        ) as unknown as ReturnType<typeof useValidationProblems>,
      )
      renderPage()
      const banner = screen.getByTestId('validation-system-failure')
      // Counts only the check-failed components (2), NOT the genuine problem (c).
      expect(banner).toHaveTextContent(/2 components could not be checked/i)
      // The raw exception class is never shown to the user.
      expect(banner.textContent).not.toContain('DecodingException')
    })

    it('does NOT render the system-failure banner when no check failed', () => {
      mockComponentsOk()
      mockedUseValidationProblems.mockReturnValue(
        makeValidationResult(
          new Map([['c', problemValidation]]),
        ) as unknown as ReturnType<typeof useValidationProblems>,
      )
      renderPage()
      expect(screen.queryByTestId('validation-system-failure')).toBeNull()
    })

    it('renders the "with validation problems" filter toggle', () => {
      mockComponentsOk()
      renderPage()
      expect(screen.getByTestId('problems-only-trigger')).toBeDefined()
    })

    it('swaps the list source to the problem set when "with validation problems" is toggled on', async () => {
      // Paged CRS list has many rows; the problem set has just one.
      mockComponentsOk({ ...emptyPage, totalElements: 99 })
      mockedUseComponentsWithProblems.mockReturnValue(
        makeValidationResult(
          new Map([['example-component', problemValidation]]),
        ) as unknown as ReturnType<typeof useComponentsWithProblems>,
      )
      renderPage()
      // Before toggle: table fed from the (empty content) CRS page.
      expect(screen.getByTestId('table').getAttribute('data-row-count')).toBe('0')
      await userEvent.click(screen.getByTestId('problems-only-trigger'))
      // After toggle: table fed from the 1-entry problem set.
      expect(screen.getByTestId('table').getAttribute('data-row-count')).toBe('1')
      expect(screen.getByTestId('table').getAttribute('data-has-validation')).toBe('yes')
    })
  })

  // ── NOT admin: no filter, no inline triangle, no validation fetch. ──
  describe('non-admin (hidden + no fetch)', () => {
    it('does not render the filter toggle for a non-admin user (adminMode off)', () => {
      mockUser(adminUser) // has IMPORT_DATA, but adminMode is OFF (default)
      mockComponentsOk()
      renderPage()
      expect(screen.queryByTestId('problems-only-trigger')).toBeNull()
    })

    it('does not render the filter toggle for a viewer even with adminMode on (no IMPORT_DATA)', () => {
      useAdminMode.setState({ enabled: true })
      mockUser(viewerUser) // adminMode on but lacks IMPORT_DATA → not admin
      mockComponentsOk()
      renderPage()
      expect(screen.queryByTestId('problems-only-trigger')).toBeNull()
    })

    it('passes no validation overlay to the table (no inline triangles) when not admin', () => {
      mockUser(viewerUser)
      mockComponentsOk()
      // Even if the report hook somehow returned data, the page must not pass it.
      mockedUseValidationProblems.mockReturnValue(
        makeValidationResult(
          new Map([['example-component', problemValidation]]),
        ) as unknown as ReturnType<typeof useValidationProblems>,
      )
      renderPage()
      expect(screen.getByTestId('table').getAttribute('data-has-validation')).toBe('no')
    })

    it('does not render the system-failure banner for a non-admin even if the report has check failures', () => {
      mockUser(viewerUser)
      mockComponentsOk()
      mockedUseValidationProblems.mockReturnValue(
        makeValidationResult(
          new Map<string, ComponentValidation>([
            ['a', { component: 'a', problems: [], checkFailed: true, checkError: 'x' }],
          ]),
        ) as unknown as ReturnType<typeof useValidationProblems>,
      )
      renderPage()
      expect(screen.queryByTestId('validation-system-failure')).toBeNull()
    })

    it('disables the validation report fetch (enabled=false) when not admin', () => {
      mockUser(viewerUser)
      mockComponentsOk()
      renderPage()
      // The page gates the fetch via the hook's `enabled` flag = isAdmin.
      expect(mockedUseValidationProblems).toHaveBeenCalledWith(false)
      // The problems-set hook is gated on (showProblemsOnly && isAdmin) → false.
      expect(mockedUseComponentsWithProblems).toHaveBeenCalledWith(false)
    })
  })
})
