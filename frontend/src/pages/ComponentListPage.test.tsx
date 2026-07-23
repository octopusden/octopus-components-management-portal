import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { ComponentListPage } from './ComponentListPage'
import { TooltipProvider } from '@/components/ui/tooltip'
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
vi.mock('../hooks/useTeamCityValidations', () => ({
  useTeamCityValidations: vi.fn(),
}))

vi.mock('../components/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'layout' }, children),
}))
// Filters stub: the "With problems" facility moved to the preset bar (the page
// renders the real ListPresetBar), so the filters stub just surfaces whether the
// page told it problems-only is active (via the `problemsOnly` prop) for the
// "filters dimmed" contract — no toggle of its own anymore.
vi.mock('../components/ComponentFilters', () => ({
  ComponentFilters: ({ problemsOnly }: { problemsOnly?: boolean }) =>
    React.createElement('div', {
      'data-testid': 'filters',
      'data-problems-only': problemsOnly ? 'yes' : 'no',
    }),
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

describe('ComponentListPage — presets + active-filter chips (spec §1.1/1.2)', () => {
  beforeEach(() => {
    mockComponentsOk()
  })

  it('defaults to the "All" preset active for a bare /components URL', () => {
    mockUser(editorUser)
    renderPage()
    expect(screen.getByRole('button', { name: 'All' }).getAttribute('aria-pressed')).toBe('true')
    // No chips for the active-only default.
    expect(screen.queryByTestId('active-filter-chips')).toBeNull()
  })

  it('selecting "My Components" scopes owner to the current user and renders the matching chips', async () => {
    mockUser(editorUser) // username: bob
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'My Components' }))
    // The segment lights up...
    expect(
      screen.getByRole('button', { name: 'My Components' }).getAttribute('aria-pressed'),
    ).toBe('true')
    // ...and the chips reflect both the preset and the owner filter it set.
    expect(screen.getByText(/Preset: My Components/i)).toBeDefined()
    expect(screen.getByText(/Owner: bob/i)).toBeDefined()
  })

  it('round-trips a deep-linked preset + filter from the URL (My Components)', () => {
    mockUser(editorUser) // username: bob
    renderPage(['/components?preset=mine&owner=bob'])
    expect(
      screen.getByRole('button', { name: 'My Components' }).getAttribute('aria-pressed'),
    ).toBe('true')
    expect(screen.getByText(/Owner: bob/i)).toBeDefined()
  })

  it('selecting "Archived" activates the archived preset and shows a Status chip', async () => {
    mockUser(editorUser)
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Archived' }))
    expect(screen.getByRole('button', { name: 'Archived' }).getAttribute('aria-pressed')).toBe(
      'true',
    )
    expect(screen.getByText(/Status: Archived/i)).toBeDefined()
  })

  it('removing the owner chip drops just that value and returns to the All preset', async () => {
    mockUser(editorUser) // username: bob
    renderPage(['/components?preset=mine&owner=bob'])
    expect(screen.getByText(/Owner: bob/i)).toBeDefined()
    await userEvent.click(screen.getByRole('button', { name: /remove owner: bob/i }))
    // Owner cleared → back to the default "All" preset, no owner chip.
    expect(screen.queryByText(/Owner: bob/i)).toBeNull()
    expect(screen.getByRole('button', { name: 'All' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('"Clear all" resets every filter + preset back to the active-only default', async () => {
    mockUser(editorUser)
    renderPage(['/components?preset=mine&owner=bob&search=foo'])
    expect(screen.getByTestId('active-filter-chips')).toBeDefined()
    await userEvent.click(screen.getByRole('button', { name: /clear all/i }))
    expect(screen.queryByTestId('active-filter-chips')).toBeNull()
    expect(screen.getByRole('button', { name: 'All' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('selecting a preset records it in the URL (round-trip)', async () => {
    mockUser(editorUser)
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Archived' }))
    // The Archived preset writes both its filter footprint and the preset name.
    const search = screen.getByTestId('loc-search').textContent ?? ''
    expect(search).toContain('preset=archived')
    expect(search).toContain('archived=true')
  })

  it('removing the preset chip clears to the bare URL (no redundant preset=all)', async () => {
    mockUser(editorUser) // username: bob
    renderPage(['/components?preset=mine&owner=bob'])
    await userEvent.click(screen.getByRole('button', { name: /remove preset: my components/i }))
    // Back to the active-only default: no chips, "All" active, and crucially the
    // URL is bare — not ?preset=all (which would be redundant clutter).
    expect(screen.queryByTestId('active-filter-chips')).toBeNull()
    expect(screen.getByRole('button', { name: 'All' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId('loc-search').textContent).toBe('')
  })

  it('selecting "I am Release Manager" scopes releaseManager to the current user and records it in the URL (Phase 1b)', async () => {
    mockUser(editorUser) // username: bob
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'I am Release Manager' }))
    expect(
      screen.getByRole('button', { name: 'I am Release Manager' }).getAttribute('aria-pressed'),
    ).toBe('true')
    const search = screen.getByTestId('loc-search').textContent ?? ''
    expect(search).toContain('preset=release-manager')
    expect(search).toContain('releaseManager=bob')
  })

  it('selecting "I am Security Champion" scopes securityChampion to the current user (Phase 1b)', async () => {
    mockUser(editorUser) // username: bob
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'I am Security Champion' }))
    expect(
      screen.getByRole('button', { name: 'I am Security Champion' }).getAttribute('aria-pressed'),
    ).toBe('true')
    const search = screen.getByTestId('loc-search').textContent ?? ''
    expect(search).toContain('preset=security-champion')
    expect(search).toContain('securityChampion=bob')
  })

  it('hydrates a Health "people" deep-link (?releaseManager=<u>) into the list filter on mount (Phase 1b)', () => {
    mockUser(editorUser) // username: bob — but the deep-link names someone else
    renderPage(['/components?releaseManager=carol'])
    // The list filter is hydrated from the URL: the RM filter chip is shown.
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

    it('renders the "With problems" preset for an admin', () => {
      mockComponentsOk()
      renderPage()
      expect(screen.getByRole('button', { name: 'With problems' })).toBeDefined()
    })

    it('swaps the list source to the problem set when the "With problems" preset is selected', async () => {
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
      // After selecting the preset: table fed from the 1-entry problem set.
      expect(screen.getByTestId('table').getAttribute('data-row-count')).toBe('1')
      expect(screen.getByTestId('table').getAttribute('data-has-validation')).toBe('yes')
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
  })

  // ── NOT admin: no filter, no inline triangle, no validation fetch. ──
  describe('non-admin (hidden + no fetch)', () => {
    it('does not render the "With problems" preset for a non-admin user (adminMode off)', () => {
      mockUser(adminUser) // has IMPORT_DATA, but adminMode is OFF (default)
      mockComponentsOk()
      renderPage()
      expect(screen.queryByRole('button', { name: 'With problems' })).toBeNull()
    })

    it('does not render the "With problems" preset for a viewer even with adminMode on (no IMPORT_DATA)', () => {
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
