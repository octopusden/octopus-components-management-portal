import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React, { useEffect } from 'react'
import { ComponentDetailPage } from './ComponentDetailPage'
import type { User } from '@/lib/auth'
import type { ComponentDetail } from '@/lib/types'

// ── mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/hooks/useCurrentUser', () => ({ useCurrentUser: vi.fn() }))
vi.mock('../hooks/useCurrentUser', () => ({ useCurrentUser: vi.fn() }))
vi.mock('../hooks/useComponent', () => ({
  useComponent: vi.fn(),
  useUpdateComponent: vi.fn(),
  useDeleteComponent: vi.fn(),
}))
vi.mock('../hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))
// AppFooter uses its own queries; stub fetch globally.
vi.mock('../components/AppFooter', () => ({
  AppFooter: () => React.createElement('footer', null, 'footer'),
}))
vi.mock('../hooks/useInfo', () => ({
  usePortalLinks: vi.fn(),
  useCrsInfo: vi.fn(),
}))
// Field-config hook — mocked so individual tests can pin TC fields to
// 'hidden' / 'editable'. Default (set in beforeEach) returns editable for
// every field path so existing tests behave unchanged.
vi.mock('../hooks/useFieldConfig', () => ({
  useFieldConfigEntry: vi.fn(),
  useFieldConfigOptions: () => ({ options: [], isLoading: false }),
}))
// Editor tabs — stub so only the header/action-area is tested here.
// GeneralTab also exports GENERAL_TAB_FIELDS, which ComponentDetailPage imports
// for the 400-error routing. importActual preserves real exports so any future
// test exercising the 400 path doesn't crash on a missing constant.
//
// GeneralTab is wrapped in vi.fn() (not a plain arrow) so individual tests can
// mockImplementationOnce to simulate the real component's form-population
// behavior — see the "populated values flow through to PATCH" test below.
// Default impl returns an empty div, matching the original stub.
vi.mock('../components/editor/GeneralTab', async () => {
  const actual = await vi.importActual<typeof import('../components/editor/GeneralTab')>(
    '../components/editor/GeneralTab',
  )
  return {
    ...actual,
    GeneralTab: vi.fn(() => React.createElement('div', { 'data-testid': 'general-tab' })),
  }
})
vi.mock('../components/editor/BuildTab', () => ({
  BuildTab: () => React.createElement('div', { 'data-testid': 'build-tab' }),
}))
vi.mock('../components/editor/VcsTab', () => ({
  VcsTab: () => React.createElement('div', { 'data-testid': 'vcs-tab' }),
}))
vi.mock('../components/editor/DistributionTab', () => ({
  DistributionTab: () => React.createElement('div', { 'data-testid': 'distribution-tab' }),
}))
vi.mock('../components/editor/JiraTab', () => ({
  JiraTab: () => React.createElement('div', { 'data-testid': 'jira-tab' }),
}))
vi.mock('../components/editor/EscrowTab', () => ({
  EscrowTab: () => React.createElement('div', { 'data-testid': 'escrow-tab' }),
}))
vi.mock('../components/editor/FieldOverrides', () => ({
  FieldOverrides: () => React.createElement('div', { 'data-testid': 'field-overrides' }),
}))
vi.mock('../components/editor/ComponentHistoryTab', () => ({
  ComponentHistoryTab: () => React.createElement('div', { 'data-testid': 'history-tab' }),
}))

import { useCurrentUser } from '../hooks/useCurrentUser'
import { useComponent, useUpdateComponent, useDeleteComponent } from '../hooks/useComponent'
import { usePortalLinks } from '../hooks/useInfo'
import { useFieldConfigEntry } from '../hooks/useFieldConfig'
import { GeneralTab } from '../components/editor/GeneralTab'

const mockedUsePortalLinks = vi.mocked(usePortalLinks)
const mockedUseFieldConfigEntry = vi.mocked(useFieldConfigEntry)

const mockedUseCurrentUser = vi.mocked(useCurrentUser)
const mockedUseComponent = vi.mocked(useComponent)
const mockedUseUpdateComponent = vi.mocked(useUpdateComponent)
const mockedUseDeleteComponent = vi.mocked(useDeleteComponent)

// ── fixtures ──────────────────────────────────────────────────────────────────

const baseComponent: ComponentDetail = {
  id: 'comp-1',
  name: 'my-component',
  displayName: 'My Component',
  componentOwner: 'alice',
  productType: 'TYPE_A',
  system: ['SYS1'],
  clientCode: null,
  archived: false,
  solution: false,
  parentComponentName: null,
  metadata: {},
  version: 1,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-02T00:00:00Z',
  buildConfigurations: [{ id: 'bc-1', buildSystem: 'GRADLE', buildFilePath: null, javaVersion: null, deprecated: false, metadata: {} }],
  vcsSettings: [{ id: 'vs-1', vcsType: 'GIT', externalRegistry: null, entries: [{ id: 'e-1', name: 'main', vcsPath: 'org/repo', repositoryType: 'FEATURE', tag: null, branch: null }] }],
  distributions: [],
  jiraComponentConfigs: [{ id: 'jcc-1', projectKey: 'PROJ', displayName: null, componentVersionFormat: null, technical: false, metadata: {} }],
  escrowConfigurations: [],
  versions: [],
}

const archivedComponent: ComponentDetail = { ...baseComponent, archived: true }

const idleMutation = {
  mutate: vi.fn(),
  mutateAsync: vi.fn(() => Promise.resolve()),
  reset: vi.fn(),
  isPending: false,
  isSuccess: false,
  isError: false,
  isIdle: true,
  data: undefined,
  error: null,
  status: 'idle' as const,
  variables: undefined,
  submittedAt: 0,
  failureCount: 0,
  failureReason: null,
  isPaused: false,
  context: undefined,
}

function makeUser(permissions: string[]): User {
  return {
    username: 'testuser',
    roles: [{ name: 'ROLE_TEST', permissions }],
    groups: [],
  }
}

interface RenderPageOptions {
  updateMutation?: Partial<typeof idleMutation>
  deleteMutation?: Partial<typeof idleMutation>
}

function renderPage(component: ComponentDetail, user: User | null, opts: RenderPageOptions = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('{}', { status: 200 }))))

  mockedUseCurrentUser.mockReturnValue({
    data: user ?? undefined,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useCurrentUser>)

  mockedUseComponent.mockReturnValue({
    data: component,
    isLoading: false,
    error: null,
  } as unknown as ReturnType<typeof useComponent>)

  mockedUseUpdateComponent.mockReturnValue({
    ...idleMutation,
    ...(opts.updateMutation ?? {}),
  } as unknown as ReturnType<typeof useUpdateComponent>)

  mockedUseDeleteComponent.mockReturnValue({
    ...idleMutation,
    ...(opts.deleteMutation ?? {}),
  } as unknown as ReturnType<typeof useDeleteComponent>)

  return render(
    React.createElement(
      QueryClientProvider,
      { client },
      // Add a /components route so navigate('/components') doesn't produce a "no routes matched" warning
      <MemoryRouter initialEntries={['/components/comp-1']}>
        <Routes>
          <Route path="/components" element={<div data-testid="list-page" />} />
          <Route path="/components/:id" element={<ComponentDetailPage />} />
        </Routes>
      </MemoryRouter>,
    ),
  )
}

// ── tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  mockedUsePortalLinks.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
  } as unknown as ReturnType<typeof usePortalLinks>)
  // Default: every field-config entry resolves as 'editable'. Individual
  // tests override per-field by re-mocking this implementation.
  mockedUseFieldConfigEntry.mockImplementation(() => ({
    entry: { visibility: 'editable', required: false },
    isLoading: false,
  }))
  // Default GeneralTab stub — empty div. Individual tests can override
  // (e.g. the populated-values save test mirrors the real component's
  // useEffect setValue dance). Re-set every beforeEach because tests that
  // call mockImplementation would otherwise leak across the suite.
  vi.mocked(GeneralTab).mockImplementation(() =>
    React.createElement('div', { 'data-testid': 'general-tab' }),
  )
})

describe('ComponentDetailPage — Archive / Unarchive buttons', () => {
  it('(a) Archive button renders for user with DELETE_COMPONENTS, archived=false', () => {
    const user = makeUser(['ACCESS_COMPONENTS', 'DELETE_COMPONENTS'])
    renderPage(baseComponent, user)
    expect(screen.getByRole('button', { name: /archive/i })).toBeDefined()
  })

  it('(a) Archive button uses Button variant="destructive" (no inline custom classes)', () => {
    const user = makeUser(['ACCESS_COMPONENTS', 'DELETE_COMPONENTS'])
    renderPage(baseComponent, user)
    // Header Archive (not the dialog confirm button) is the only one before
    // any click; assert via data-variant attribute set by Button.
    const archiveBtn = screen.getByRole('button', { name: /^archive$/i })
    expect(archiveBtn.getAttribute('data-variant')).toBe('destructive')
  })

  it('(a) Archive button is hidden for user without DELETE_COMPONENTS', () => {
    const user = makeUser(['ACCESS_COMPONENTS'])
    renderPage(baseComponent, user)
    expect(screen.queryByRole('button', { name: /^archive$/i })).toBeNull()
  })

  it('(b) Unarchive button renders for user with ARCHIVE_COMPONENTS when archived=true', () => {
    const user = makeUser(['ACCESS_COMPONENTS', 'ARCHIVE_COMPONENTS'])
    renderPage(archivedComponent, user)
    expect(screen.getByRole('button', { name: /unarchive/i })).toBeDefined()
  })

  it('(b) Unarchive button is hidden for user without ARCHIVE_COMPONENTS when archived=true', () => {
    const user = makeUser(['ACCESS_COMPONENTS'])
    renderPage(archivedComponent, user)
    expect(screen.queryByRole('button', { name: /unarchive/i })).toBeNull()
  })

  it('(b) Archive button is hidden when component.archived=true (even with DELETE_COMPONENTS)', () => {
    const user = makeUser(['ACCESS_COMPONENTS', 'DELETE_COMPONENTS'])
    renderPage(archivedComponent, user)
    // No "Archive" button — component is already archived, show "Unarchive" instead
    expect(screen.queryByRole('button', { name: /^archive$/i })).toBeNull()
  })

  it('(c) Archive button click opens confirmation dialog and triggers DELETE call', async () => {
    const deleteMutateAsync = vi.fn(() => Promise.resolve())
    const user = makeUser(['ACCESS_COMPONENTS', 'DELETE_COMPONENTS'])
    renderPage(baseComponent, user, { deleteMutation: { mutateAsync: deleteMutateAsync } })

    fireEvent.click(screen.getByRole('button', { name: /^archive$/i }))

    // Dialog should open
    await waitFor(() => {
      expect(screen.getByText(/archive component/i)).toBeDefined()
    })

    // Click the destructive Archive button inside dialog (last Archive button is the confirm one)
    const archiveBtns = screen.getAllByRole('button', { name: /^archive$/i })
    const lastBtn = archiveBtns[archiveBtns.length - 1] as HTMLElement
    fireEvent.click(lastBtn)

    await waitFor(() => {
      expect(deleteMutateAsync).toHaveBeenCalledOnce()
    })
  })

  it('(d) Unarchive button triggers PATCH with archived:false', async () => {
    const updateMutateAsync = vi.fn(() => Promise.resolve())
    const user = makeUser(['ACCESS_COMPONENTS', 'ARCHIVE_COMPONENTS'])
    renderPage(archivedComponent, user, { updateMutation: { mutateAsync: updateMutateAsync } })

    fireEvent.click(screen.getByRole('button', { name: /unarchive/i }))

    await waitFor(() => {
      expect(updateMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ archived: false })
      )
    })
  })
})

describe('ComponentDetailPage — breadcrumb badges', () => {
  it('(e) System badge renders when system array is non-empty', () => {
    const user = makeUser(['ACCESS_COMPONENTS'])
    renderPage(baseComponent, user)
    expect(screen.getByText('SYS1')).toBeDefined()
  })

  it('(e) BuildSystem badge renders when buildConfigurations[0].buildSystem is present', () => {
    const user = makeUser(['ACCESS_COMPONENTS'])
    renderPage(baseComponent, user)
    expect(screen.getByText('GRADLE')).toBeDefined()
  })

  it('(e) System badge not rendered when system array is empty', () => {
    const user = makeUser(['ACCESS_COMPONENTS'])
    renderPage({ ...baseComponent, system: [] }, user)
    expect(screen.queryByText('SYS1')).toBeNull()
  })

  it('(e) BuildSystem badge not rendered when buildConfigurations is empty', () => {
    const user = makeUser(['ACCESS_COMPONENTS'])
    renderPage({ ...baseComponent, buildConfigurations: [] }, user)
    expect(screen.queryByText('GRADLE')).toBeNull()
  })
})

describe('ComponentDetailPage — Jira/Git quick-links', () => {
  it('(f) Jira link renders when jiraBaseUrl is set and projectKey exists', () => {
    mockedUsePortalLinks.mockReturnValue({
      data: { jiraBaseUrl: 'https://jira.example.com', gitBaseUrl: null, tcBaseUrl: null, dmsBaseUrl: null },
      isLoading: false,
      isError: false,
      error: null,
    } as unknown as ReturnType<typeof usePortalLinks>)
    const user = makeUser(['ACCESS_COMPONENTS'])
    renderPage(baseComponent, user)
    const link = screen.getByTitle('Jira: PROJ') as HTMLAnchorElement
    expect(link).toBeDefined()
    expect(link.href).toContain('jira.example.com/browse/PROJ')
  })

  it('(f) Jira link does NOT render when jiraBaseUrl is null', () => {
    const user = makeUser(['ACCESS_COMPONENTS'])
    renderPage(baseComponent, user)
    expect(screen.queryByTitle(/jira/i)).toBeNull()
  })

  it('(f) Jira link does NOT render when projectKey is null', () => {
    mockedUsePortalLinks.mockReturnValue({
      data: { jiraBaseUrl: 'https://jira.example.com', gitBaseUrl: null, tcBaseUrl: null, dmsBaseUrl: null },
      isLoading: false,
      isError: false,
      error: null,
    } as unknown as ReturnType<typeof usePortalLinks>)
    const user = makeUser(['ACCESS_COMPONENTS'])
    renderPage(
      { ...baseComponent, jiraComponentConfigs: [{ id: 'j1', projectKey: null, displayName: null, componentVersionFormat: null, technical: false, metadata: {} }] },
      user,
    )
    expect(screen.queryByTitle(/jira/i)).toBeNull()
  })

  it('(f) Git link renders when gitBaseUrl is set and vcsPath exists', () => {
    mockedUsePortalLinks.mockReturnValue({
      data: { jiraBaseUrl: null, gitBaseUrl: 'https://git.example.com', tcBaseUrl: null, dmsBaseUrl: null },
      isLoading: false,
      isError: false,
      error: null,
    } as unknown as ReturnType<typeof usePortalLinks>)
    const user = makeUser(['ACCESS_COMPONENTS'])
    renderPage(baseComponent, user)
    const link = screen.getByTitle('Bitbucket: org/repo') as HTMLAnchorElement
    expect(link).toBeDefined()
    // Bitbucket-Server browser URL: vcsPath "org/repo" → /projects/org/repos/repo
    expect(link.href).toBe('https://git.example.com/projects/org/repos/repo')
    // Pin the brand icon — see ComponentTable.test.tsx for rationale.
    expect(within(link).getByTestId('brand-icon-bitbucket')).toBeDefined()
  })

  it('(f) Bitbucket link does NOT render when gitBaseUrl is null', () => {
    const user = makeUser(['ACCESS_COMPONENTS'])
    renderPage(baseComponent, user)
    expect(screen.queryByTitle(/bitbucket:/i)).toBeNull()
  })

  it('(f) Git link does NOT render when vcsSettings is empty', () => {
    mockedUsePortalLinks.mockReturnValue({
      data: { jiraBaseUrl: null, gitBaseUrl: 'https://git.example.com', tcBaseUrl: null, dmsBaseUrl: null },
      isLoading: false,
      isError: false,
      error: null,
    } as unknown as ReturnType<typeof usePortalLinks>)
    const user = makeUser(['ACCESS_COMPONENTS'])
    renderPage({ ...baseComponent, vcsSettings: [] }, user)
    expect(screen.queryByTitle(/bitbucket:/i)).toBeNull()
  })

  it('(g) TeamCity link renders when teamcityProjectUrl is set; href is the verbatim webUrl', () => {
    // Per CRS PR-2 the URL is self-sufficient — gated only on the
    // per-component URL, not on /portal/links tcBaseUrl.
    const user = makeUser(['ACCESS_COMPONENTS'])
    renderPage(
      {
        ...baseComponent,
        teamcityProjectUrl: 'https://teamcity.example.com/project/MyProject_Build',
      },
      user,
    )
    const link = screen.getByTitle('TeamCity: my-component') as HTMLAnchorElement
    expect(link).toBeDefined()
    expect(link.href).toBe('https://teamcity.example.com/project/MyProject_Build')
    expect(within(link).getByTestId('brand-icon-teamcity')).toBeDefined()
  })

  it('(g) TeamCity link does NOT render when teamcityProjectUrl is null', () => {
    const user = makeUser(['ACCESS_COMPONENTS'])
    renderPage({ ...baseComponent, teamcityProjectUrl: null }, user)
    expect(screen.queryByTitle(/teamcity/i)).toBeNull()
  })

  it('(g) TeamCity link does NOT render when teamcityProjectUrl is undefined', () => {
    const user = makeUser(['ACCESS_COMPONENTS'])
    renderPage(baseComponent, user)
    expect(screen.queryByTitle(/teamcity/i)).toBeNull()
  })
})

describe('ComponentDetailPage — TC manual override save (Portal PR-3)', () => {
  // These tests mount ComponentDetailPage with GeneralTab mocked out (the
  // file-wide mock above), which means the form values stay at their
  // useForm `defaultValues` — empty string for both TC fields. That's
  // exactly the right surface to assert: save with unchanged defaults
  // should NOT include the TC fields in the PATCH payload (empty → undefined),
  // and we can flip FC visibility to 'hidden' to assert the gate works.

  it('save with unchanged defaults does NOT include teamcity* in PATCH (empty → undefined)', async () => {
    const updateMutateAsync = vi.fn(() => Promise.resolve())
    const user = makeUser(['ACCESS_COMPONENTS', 'EDIT_COMPONENTS'])
    renderPage(baseComponent, user, { updateMutation: { mutateAsync: updateMutateAsync } })

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalledOnce())
    const payload = (updateMutateAsync.mock.calls[0] as unknown as [Record<string, unknown>])[0]
    // Empty-string defaults map to undefined per the "(values.X || undefined)"
    // helper in handleSave. JSON.stringify drops undefined keys, so the
    // backend sees no teamcity* keys at all → "don't touch" semantics.
    expect(payload['teamcityProjectId']).toBeUndefined()
    expect(payload['teamcityProjectUrl']).toBeUndefined()
  })

  it('skips teamcity* fields when GeneralTab stub leaves form at defaults (both undefined → omit pair)', async () => {
    // Seed the component with TC values; the form's useEffect (in the real
    // GeneralTab) would mirror these into the form, but here GeneralTab is
    // mocked so the form values stay empty — meaning unchanged-defaults
    // means "user hasn't touched, send undefined". The save payload should
    // therefore NOT include the persisted values either: both halves are
    // undefined, so the pair-enforcement block emits nothing ("don't touch").
    const updateMutateAsync = vi.fn(() => Promise.resolve())
    const user = makeUser(['ACCESS_COMPONENTS', 'EDIT_COMPONENTS'])
    const seeded: ComponentDetail = {
      ...baseComponent,
      teamcityProjectId: 'MyProject_Build',
      teamcityProjectUrl: 'https://teamcity.example.com/project/MyProject_Build',
    }
    renderPage(seeded, user, { updateMutation: { mutateAsync: updateMutateAsync } })

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalledOnce())
    const payload = (updateMutateAsync.mock.calls[0] as unknown as [Record<string, unknown>])[0]
    // Same as above — without typing, both fields are skipped.
    expect(payload['teamcityProjectId']).toBeUndefined()
    expect(payload['teamcityProjectUrl']).toBeUndefined()
  })

  it('populated teamcity* values flow through to PATCH when the form mirrors server state', async () => {
    // The previous test pins the contract for the *empty* GeneralTab stub:
    // unchanged defaults emit nothing. This test exercises the populated
    // branch of the `(values.teamcityProjectId || undefined)` helper at
    // ComponentDetailPage.tsx:224-231 — a regression that swapped the
    // truthy/falsy halves would still pass every undefined-asserting test
    // above. Override the GeneralTab mock for this case only with a stub
    // that mirrors the real component's `useEffect` setValue dance so the
    // form holds the seeded TC values when handleSave runs.
    vi.mocked(GeneralTab).mockImplementation(({ component, form }) => {
      useEffect(() => {
        form.setValue('teamcityProjectId', component.teamcityProjectId ?? '')
        form.setValue('teamcityProjectUrl', component.teamcityProjectUrl ?? '')
      }, [component, form])
      return React.createElement('div', { 'data-testid': 'general-tab-mirrored' })
    })
    const updateMutateAsync = vi.fn(() => Promise.resolve())
    const user = makeUser(['ACCESS_COMPONENTS', 'EDIT_COMPONENTS'])
    const seeded: ComponentDetail = {
      ...baseComponent,
      teamcityProjectId: 'Existing_Build',
      teamcityProjectUrl: 'https://teamcity.example.com/project/Existing_Build',
    }
    renderPage(seeded, user, { updateMutation: { mutateAsync: updateMutateAsync } })

    // Sanity check: the per-test mock rendered (not the default).
    await waitFor(() => {
      expect(screen.getByTestId('general-tab-mirrored')).toBeDefined()
    })

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalledOnce())
    const payload = (updateMutateAsync.mock.calls[0] as unknown as [Record<string, unknown>])[0]
    // Both keys present AND populated — proves the truthy half of the helper
    // and the editable-FC visibility branch both fire.
    expect(payload['teamcityProjectId']).toBe('Existing_Build')
    expect(payload['teamcityProjectUrl']).toBe('https://teamcity.example.com/project/Existing_Build')
  })

  it('FC hidden skips both teamcity* fields on save (defence-in-depth)', async () => {
    // Even if the form somehow held a value, hidden FC visibility must
    // make handleSave drop both keys from the payload — server-side does
    // NOT enforce field-config (CRS PR-2 spec note), so the SPA is the
    // line of defence against an editor with a stale form snapshot
    // overwriting a hidden field.
    mockedUseFieldConfigEntry.mockImplementation((path: string) => {
      if (
        path === 'component.teamcityProjectId' ||
        path === 'component.teamcityProjectUrl'
      ) {
        return {
          entry: { visibility: 'hidden', required: false },
          isLoading: false,
        }
      }
      return { entry: { visibility: 'editable', required: false }, isLoading: false }
    })
    const updateMutateAsync = vi.fn(() => Promise.resolve())
    const user = makeUser(['ACCESS_COMPONENTS', 'EDIT_COMPONENTS'])
    renderPage(baseComponent, user, { updateMutation: { mutateAsync: updateMutateAsync } })

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalledOnce())
    const payload = (updateMutateAsync.mock.calls[0] as unknown as [Record<string, unknown>])[0]
    expect(payload['teamcityProjectId']).toBeUndefined()
    expect(payload['teamcityProjectUrl']).toBeUndefined()
  })

  it('partial pair (tcId filled, tcUrl blank) omits BOTH from PATCH (pair invariant)', async () => {
    // Regression guard for Bug B: when the user fills only teamcityProjectId
    // and leaves teamcityProjectUrl blank, the `||` condition would have sent
    // a partial PATCH (id=value, url=undefined → JSON.stringify drops url,
    // server receives only one half). With `&&` both must be non-empty or
    // neither is included.
    vi.mocked(GeneralTab).mockImplementation(({ form }) => {
      useEffect(() => {
        form.setValue('teamcityProjectId', 'OnlyId_Build')
        // teamcityProjectUrl intentionally left at default '' (falsy)
      }, [form])
      return React.createElement('div', { 'data-testid': 'general-tab-partial' })
    })
    const updateMutateAsync = vi.fn(() => Promise.resolve())
    const user = makeUser(['ACCESS_COMPONENTS', 'EDIT_COMPONENTS'])
    renderPage(baseComponent, user, { updateMutation: { mutateAsync: updateMutateAsync } })

    await waitFor(() => {
      expect(screen.getByTestId('general-tab-partial')).toBeDefined()
    })

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalledOnce())
    const payload = (updateMutateAsync.mock.calls[0] as unknown as [Record<string, unknown>])[0]
    // tcUrl is '' → undefined; because only one half is defined, && condition
    // suppresses both keys — server sees no teamcity* fields at all.
    expect(payload['teamcityProjectId']).toBeUndefined()
    expect(payload['teamcityProjectUrl']).toBeUndefined()
  })
})

describe('ComponentDetailPage — confirmation dialog text', () => {
  it('dialog says "Archive Component" and "restore it later", not "cannot be undone"', async () => {
    const user = makeUser(['ACCESS_COMPONENTS', 'DELETE_COMPONENTS'])
    renderPage(baseComponent, user)

    fireEvent.click(screen.getByRole('button', { name: /^archive$/i }))

    await waitFor(() => {
      expect(screen.getByText(/archive component/i)).toBeDefined()
      expect(screen.getByText(/restore it later/i)).toBeDefined()
      expect(screen.queryByText(/cannot be undone/i)).toBeNull()
    })
  })
})

