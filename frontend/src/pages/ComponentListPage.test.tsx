import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { ComponentListPage } from './ComponentListPage'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { User } from '@/lib/auth'
import type { ComponentFilter, ComponentSummary, Page } from '@/lib/types'
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
vi.mock('../hooks/useTeamCityValidations', () => ({
  useTeamCityValidations: vi.fn(),
}))

vi.mock('../components/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'layout' }, children),
}))
// Filters stub: surfaces the page→filters contract — whether problems-only is on,
// the admin "With problems" toggle (rendered only when the page allows it), and a
// "Mine (stub)" button that emits a filter change the way the real Mine picker does.
vi.mock('../components/ComponentFilters', () => ({
  ComponentFilters: ({
    filter,
    onFilterChange,
    problemsOnly,
    canFilterProblems,
    onProblemsOnlyChange,
  }: {
    filter: ComponentFilter
    onFilterChange: (f: ComponentFilter) => void
    problemsOnly?: boolean
    canFilterProblems?: boolean
    onProblemsOnlyChange?: (on: boolean) => void
  }) =>
    React.createElement(
      'div',
      { 'data-testid': 'filters', 'data-problems-only': problemsOnly ? 'yes' : 'no' },
      canFilterProblems &&
        React.createElement('button', { onClick: () => onProblemsOnlyChange?.(!problemsOnly) }, 'With problems'),
      React.createElement(
        'button',
        { onClick: () => onFilterChange({ ...filter, involves: ['bob'], involvesRoles: ['owner'] }) },
        'Mine (stub)',
      ),
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
        // Row names, comma-joined — lets a test assert which components made it
        // into the (merged Unregistered-Released + TeamCity-only) problem set.
        'data-row-names': data.map((d) => d.name).join(','),
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
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useComponents } from '../hooks/useComponents'
import {
  useValidationProblems,
  useComponentsWithProblems,
} from '../hooks/useValidationProblems'
import { useTeamCityValidations } from '../hooks/useTeamCityValidations'
import { useAdminMode } from '@/lib/adminModeStore'
import type { ComponentValidation, TeamcityValidationRow } from '@/lib/types'

const mockedUseCurrentUser = vi.mocked(useCurrentUser)
const mockedUseComponents = vi.mocked(useComponents)
const mockedUseValidationProblems = vi.mocked(useValidationProblems)
const mockedUseComponentsWithProblems = vi.mocked(useComponentsWithProblems)
const mockedUseTeamCityValidations = vi.mocked(useTeamCityValidations)

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

// Exposes the live router search string so a test can assert URL round-trip.
function LocationProbe() {
  const loc = useLocation()
  return React.createElement('div', { 'data-testid': 'loc-search' }, loc.search)
}

function renderPage(initialEntries: string[] = ['/components']) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    React.createElement(
      QueryClientProvider,
      { client },
      // Matches the App mount context (TooltipProvider wraps the tree).
      <MemoryRouter initialEntries={initialEntries}>
        <TooltipProvider delayDuration={0}>
          <ComponentListPage />
          <LocationProbe />
        </TooltipProvider>
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
  mockedUseTeamCityValidations.mockReturnValue({
    data: [],
    isLoading: false,
    isError: false,
    error: null,
  } as unknown as ReturnType<typeof useTeamCityValidations>)
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

describe('ComponentListPage — Global search hand-off', () => {
  it('offers Global search for the key/name filter text', () => {
    mockUser(viewerUser)
    mockComponentsOk()

    renderPage(['/components?search=org.example'])

    expect(screen.getByRole('link', { name: /global search/i }).getAttribute('href')).toBe('/search?q=org.example')
  })

  it('offers nothing without filter text', () => {
    mockUser(viewerUser)
    mockComponentsOk()

    renderPage()

    expect(screen.queryByRole('link', { name: /global search/i })).toBeNull()
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

describe('ComponentListPage — per-row Copy gating + clone navigation', () => {
  it('passes onCopy to the table and navigates to the clone wizard with the row id', async () => {
    mockUser(editorUser)
    mockComponentsOk()
    renderPage()

    await userEvent.click(screen.getByTestId('table-copy-trigger'))
    // The per-row Copy action now navigates to the full-page clone wizard.
    expect(screen.getByTestId('loc-search').textContent).toBe('?from=comp-x')
  })

  it('does not pass onCopy without CREATE_COMPONENTS — no copy trigger rendered', () => {
    mockUser(viewerUser)
    mockComponentsOk()
    renderPage()
    expect(screen.queryByTestId('table-copy-trigger')).toBeNull()
  })
})

describe('ComponentListPage — Status / Mine filters + active-filter chips', () => {
  beforeEach(() => {
    mockComponentsOk()
  })

  const search = () => screen.getByTestId('loc-search').textContent ?? ''

  it('a bare /components URL is the Active default: no chips, no params', () => {
    mockUser(editorUser)
    renderPage()
    expect(screen.queryByTestId('active-filter-chips')).toBeNull()
    expect(search()).toBe('')
  })

  it('the preset bar is gone (Status and Mine live in the filter row)', () => {
    mockUser(editorUser)
    renderPage()
    expect(screen.queryByRole('button', { name: 'My Components' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'I am Release Manager' })).toBeNull()
  })

  it('a Mine change is written to the URL as involves + involvesRoles, with one chip', async () => {
    mockUser(editorUser) // username: bob
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Mine (stub)' }))
    expect(search()).toContain('involves=bob')
    expect(search()).toContain('involvesRoles=owner')
    expect(screen.getByText('Mine: owner')).toBeDefined()
  })

  it('removing the Mine chip clears involves and its roles', async () => {
    mockUser(editorUser)
    renderPage(['/components?involves=bob&involvesRoles=owner,releaseManager'])
    await userEvent.click(screen.getByRole('button', { name: /remove mine: owner, release manager/i }))
    expect(search()).toBe('')
    expect(screen.queryByTestId('active-filter-chips')).toBeNull()
  })

  it.each([
    ['mine', 'involvesRoles=owner'],
    ['release-manager', 'involvesRoles=releaseManager'],
    ['security-champion', 'involvesRoles=securityChampion'],
  ])('a legacy ?preset=%s link is rewritten to the Mine filter', (preset, roles) => {
    mockUser(editorUser) // username: bob
    renderPage([`/components?preset=${preset}&owner=bob`])
    expect(search()).toContain('involves=bob')
    expect(search()).toContain(roles)
    expect(search()).not.toContain('preset=')
  })

  it('a legacy ?preset=archived link becomes Status: Archived', () => {
    mockUser(editorUser)
    renderPage(['/components?preset=archived&archived=true'])
    expect(search()).toBe('?archived=true')
    expect(screen.getByText(/Status: Archived/i)).toBeDefined()
  })

  it('?archived=all shows Status: All; removing that chip returns to Active (bare URL)', async () => {
    mockUser(editorUser)
    renderPage(['/components?archived=all'])
    expect(screen.getByText(/Status: All/i)).toBeDefined()
    await userEvent.click(screen.getByRole('button', { name: /remove status: all/i }))
    expect(search()).toBe('')
  })

  it('"Clear all" resets every filter back to the Active default', async () => {
    mockUser(editorUser)
    renderPage(['/components?involves=bob&search=foo&archived=true'])
    expect(screen.getByTestId('active-filter-chips')).toBeDefined()
    await userEvent.click(screen.getByRole('button', { name: /clear all/i }))
    expect(screen.queryByTestId('active-filter-chips')).toBeNull()
    expect(search()).toBe('')
  })

  it('hydrates a Health "people" deep-link (?releaseManager=<u>) into the list filter on mount (Phase 1b)', () => {
    mockUser(editorUser) // username: bob — but the deep-link names someone else
    renderPage(['/components?releaseManager=carol'])
    expect(screen.getByText(/Release manager: carol/i)).toBeDefined()
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

    it('shows a TIMEOUT-specific stale warning (retry hint, no "reachable over https" config hint)', () => {
      mockComponentsOk()
      // A whole-sweep timeout: the backend sets this exact reason. The downstream is
      // reachable but slow, so the banner must NOT tell the operator to check URLs.
      mockedUseValidationProblems.mockReturnValue(
        makeValidationResult(new Map(), {
          refreshError: 'validation sweep timed out',
        }) as unknown as ReturnType<typeof useValidationProblems>,
      )
      renderPage()
      const normalize = (s: string) => s.replace(/\s+/g, ' ').trim()
      expect(
        screen.getByText((content) =>
          normalize(content).includes('the last refresh timed out'),
        ),
      ).toBeDefined()
      expect(
        screen.getByText((content) =>
          normalize(content).includes('retries automatically'),
        ),
      ).toBeDefined()
      // The misleading config hint must be absent for a timeout.
      expect(
        screen.queryByText((content) =>
          normalize(content).includes('reachable over https'),
        ),
      ).toBeNull()
    })

    it('renders the "With problems" toggle for an admin', () => {
      mockComponentsOk()
      renderPage()
      expect(screen.getByRole('button', { name: 'With problems' })).toBeDefined()
    })

    it('swaps the list source to the problem set when "With problems" is turned on', async () => {
      // Paged CRS list has many rows; the problem set has just one.
      mockComponentsOk({ ...emptyPage, totalElements: 99 })
      mockedUseComponentsWithProblems.mockReturnValue(
        makeValidationResult(
          new Map([['example-component', problemValidation]]),
        ) as unknown as ReturnType<typeof useComponentsWithProblems>,
      )
      renderPage()
      // Before selection: table fed from the (empty content) CRS page.
      expect(screen.getByTestId('table').getAttribute('data-row-count')).toBe('0')
      await userEvent.click(screen.getByRole('button', { name: 'With problems' }))
      // After turning it on: table fed from the 1-entry problem set, recorded as ?preset=problems.
      expect(screen.getByTestId('table').getAttribute('data-row-count')).toBe('1')
      expect(screen.getByTestId('table').getAttribute('data-has-validation')).toBe('yes')
      expect(screen.getByTestId('loc-search').textContent).toContain('preset=problems')
      // Its chip turns it off again.
      await userEvent.click(screen.getByRole('button', { name: /remove with problems/i }))
      expect(screen.getByTestId('table').getAttribute('data-row-count')).toBe('0')
    })

    it('includes a component that ONLY has a TeamCity finding (no Unregistered-Released issue) in the "With problems" set, without duplicating one that has both', async () => {
      mockComponentsOk({ ...emptyPage, totalElements: 99 })
      // "unregistered-only" has an Unregistered-Released problem; "both" has one
      // too AND a TeamCity finding (must appear once, not twice); "teamcity-only"
      // has ONLY a TeamCity finding — this is the row the fix must surface.
      // `.component` (not the map key) is what the page actually reads, so each
      // entry needs its own value there.
      mockedUseComponentsWithProblems.mockReturnValue(
        makeValidationResult(
          new Map([
            ['unregistered-only', { ...problemValidation, component: 'unregistered-only' }],
            ['both', { ...problemValidation, component: 'both' }],
          ]),
        ) as unknown as ReturnType<typeof useComponentsWithProblems>,
      )
      const tcRows: TeamcityValidationRow[] = [
        {
          componentId: 'tc-id-teamcity-only',
          componentName: 'teamcity-only',
          message: 'drift',
          projectId: 'Proj_A',
          projectUrl: null,
          status: 'FAILED',
          type: 'BUILD_CONFIG_DRIFT',
          updatedAt: '2026-06-13T10:00:00Z',
        },
        {
          componentId: 'tc-id-both',
          componentName: 'both',
          message: 'drift',
          projectId: 'Proj_B',
          projectUrl: null,
          status: 'FAILED',
          type: 'BUILD_CONFIG_DRIFT',
          updatedAt: '2026-06-13T10:00:00Z',
        },
      ]
      mockedUseTeamCityValidations.mockReturnValue({
        data: tcRows,
        isLoading: false,
        isError: false,
        error: null,
      } as unknown as ReturnType<typeof useTeamCityValidations>)

      renderPage()
      await userEvent.click(screen.getByRole('button', { name: 'With problems' }))

      const table = screen.getByTestId('table')
      const names = table.getAttribute('data-row-names')!.split(',')
      expect(names.sort()).toEqual(['both', 'teamcity-only', 'unregistered-only'])
      // Exactly 3 rows — "both" is not duplicated for having issues in both systems.
      expect(table.getAttribute('data-row-count')).toBe('3')
    })

    it('surfaces an error when the TeamCity findings query fails (badges/"With problems" may be incomplete)', () => {
      useAdminMode.setState({ enabled: true })
      mockUser(adminUser)
      mockComponentsOk()
      mockedUseTeamCityValidations.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: new Error('CRS unreachable'),
      } as unknown as ReturnType<typeof useTeamCityValidations>)

      renderPage()
      expect(screen.getByText(/Could not load TeamCity validation findings/i)).toBeInTheDocument()
      expect(screen.getByText(/CRS unreachable/)).toBeInTheDocument()
    })

    it('does NOT surface the TeamCity findings error banner for a non-admin', () => {
      mockUser(viewerUser)
      mockComponentsOk()
      mockedUseTeamCityValidations.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: new Error('CRS unreachable'),
      } as unknown as ReturnType<typeof useTeamCityValidations>)

      renderPage()
      expect(screen.queryByText(/Could not load TeamCity validation findings/i)).toBeNull()
    })
  })

  // ── NOT admin: no filter, no inline triangle, no validation fetch. ──
  describe('non-admin (hidden + no fetch)', () => {
    it('does not render the "With problems" toggle for a non-admin user (adminMode off)', () => {
      mockUser(adminUser) // has IMPORT_DATA, but adminMode is OFF (default)
      mockComponentsOk()
      renderPage()
      expect(screen.queryByRole('button', { name: 'With problems' })).toBeNull()
    })

    it('does not render the "With problems" toggle for a viewer even with adminMode on (no IMPORT_DATA)', () => {
      useAdminMode.setState({ enabled: true })
      mockUser(viewerUser) // adminMode on but lacks IMPORT_DATA → not admin
      mockComponentsOk()
      renderPage()
      expect(screen.queryByRole('button', { name: 'With problems' })).toBeNull()
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
