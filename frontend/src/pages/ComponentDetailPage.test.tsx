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
// ui-swift-sloth §3.5: ComponentDetailPage gates the save on the supported
// group-prefix list. Stub with a permissive list so the existing tests
// continue to exercise the post-prefix-check code path.
vi.mock('../hooks/useSupportedGroups', () => ({
  useSupportedGroups: () => ({
    data: ['org.example', 'com.example'],
    isLoading: false,
    isError: false,
  }),
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
  system: 'SYS1',
  // ui-swift-sloth §3.5: group is required server-side, so the fixture seeds
  // a valid groupKey to exercise the post-guard save path. Tests that need to
  // hit the empty/disallowed-prefix code path override this per-call.
  group: { groupKey: 'org.example.alpha', isFake: false, role: 'MEMBER' },
  clientCode: null,
  archived: false,
  solution: false,
  parentComponentName: null,
  version: 1,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-02T00:00:00Z',
  labels: [],
  docs: [],
  artifactIds: [],
  securityGroups: [],
  teamcityProjects: [],
  configurations: [
    {
      id: 'cfg-1',
      versionRange: '(,0),[0,)',
      rowType: 'BASE',
      overriddenAttribute: null,
      isSyntheticBase: false,
      build: { buildSystem: 'GRADLE' },
      escrow: null,
      jira: { projectKey: 'PROJ' },
      vcsEntries: [{ id: 'e-1', name: 'main', vcsPath: 'org/repo', sortOrder: 0 }],
      mavenArtifacts: [],
      fileUrlArtifacts: [],
      dockerImages: [],
      packages: [],
      requiredTools: [],
    },
  ],
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
    isError: false,
  }))
  // Default GeneralTab stub. Hydrates `system` from `component.system`
  // so the page-level save guard (PR #44 P2 systems — "server had
  // systems, form has none" blocks the save) doesn't false-positive on
  // tests that never touch the systems field. Mirrors the real
  // GeneralTab.useEffect mirror-server-into-form behavior.
  // Individual tests can still override this implementation to test
  // specific scenarios (e.g. the clear-all-systems guard).
  vi.mocked(GeneralTab).mockImplementation(({ component, form }) => {
    useEffect(() => {
      form.setValue('system', component.system ?? '')
    }, [component, form])
    return React.createElement('div', { 'data-testid': 'general-tab' })
  })
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

  it('(e) BuildSystem badge renders when BASE row build aspect has buildSystem', () => {
    const user = makeUser(['ACCESS_COMPONENTS'])
    renderPage(baseComponent, user)
    expect(screen.getByText('GRADLE')).toBeDefined()
  })

  it('(e) System badge not rendered when system array is empty', () => {
    const user = makeUser(['ACCESS_COMPONENTS'])
    renderPage({ ...baseComponent, system: null }, user)
    expect(screen.queryByText('SYS1')).toBeNull()
  })

  it('(e) BuildSystem badge not rendered when BASE row has no build aspect', () => {
    const user = makeUser(['ACCESS_COMPONENTS'])
    renderPage(
      {
        ...baseComponent,
        configurations: [{ ...baseComponent.configurations![0]!, build: null }],
      },
      user,
    )
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
      {
        ...baseComponent,
        configurations: [
          { ...baseComponent.configurations![0]!, jira: { projectKey: null } },
        ],
      },
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

  it('(f) Git link does NOT render when BASE row has no vcsEntries', () => {
    mockedUsePortalLinks.mockReturnValue({
      data: { jiraBaseUrl: null, gitBaseUrl: 'https://git.example.com', tcBaseUrl: null, dmsBaseUrl: null },
      isLoading: false,
      isError: false,
      error: null,
    } as unknown as ReturnType<typeof usePortalLinks>)
    const user = makeUser(['ACCESS_COMPONENTS'])
    renderPage(
      {
        ...baseComponent,
        configurations: [{ ...baseComponent.configurations![0]!, vcsEntries: [] }],
      },
      user,
    )
    expect(screen.queryByTitle(/bitbucket:/i)).toBeNull()
  })

  it('(g) TeamCity link renders when teamcityProjectUrl is set; href is the verbatim webUrl', () => {
    // Per CRS PR-2 the URL is self-sufficient — gated only on the
    // per-component URL, not on /portal/links tcBaseUrl.
    const user = makeUser(['ACCESS_COMPONENTS'])
    renderPage(
      {
        ...baseComponent,
        teamcityProjects: [
          {
            id: 'tc-1',
            projectId: 'MyProject_Build',
            projectUrl: 'https://teamcity.example.com/project/MyProject_Build',
            sortOrder: 0,
          },
        ],
      },
      user,
    )
    const link = screen.getByTitle('TeamCity: my-component') as HTMLAnchorElement
    expect(link).toBeDefined()
    expect(link.href).toBe('https://teamcity.example.com/project/MyProject_Build')
    expect(within(link).getByTestId('brand-icon-teamcity')).toBeDefined()
  })

  it('(g) TeamCity link does NOT render when teamcityProjects[0].projectUrl is null', () => {
    const user = makeUser(['ACCESS_COMPONENTS'])
    renderPage(
      {
        ...baseComponent,
        teamcityProjects: [{ id: 'tc-1', projectId: 'X', projectUrl: null, sortOrder: 0 }],
      },
      user,
    )
    expect(screen.queryByTitle(/teamcity/i)).toBeNull()
  })

  it('(g) TeamCity link does NOT render when teamcityProjects is empty', () => {
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

  it('save with unchanged defaults does NOT include teamcityProjects in PATCH', async () => {
    const updateMutateAsync = vi.fn(() => Promise.resolve())
    const user = makeUser(['ACCESS_COMPONENTS', 'EDIT_COMPONENTS'])
    renderPage(baseComponent, user, { updateMutation: { mutateAsync: updateMutateAsync } })

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalledOnce())
    const payload = (updateMutateAsync.mock.calls[0] as unknown as [Record<string, unknown>])[0]
    // schema-v2: blank form fields → no teamcityProjects key in payload.
    expect(payload['teamcityProjects']).toBeUndefined()
  })

  it('blank form values + prior TC project DO NOT clear (pre-hydration Save safety)', async () => {
    // Race-condition guard: if Save fires before GeneralTab.useEffect has
    // mirrored `component.teamcityProjects` into the form (form defaults
    // are `[]`), naïve "blank + had prior → []" logic would wipe the
    // server-side list. The dirty-fields gate in handleSave catches this:
    // an untouched form (no useFieldArray append/remove → not dirty) MUST
    // omit teamcityProjects from the patch even when the component has
    // prior server data.
    // Test exercise: GeneralTab is mocked as an empty stub, so the form's
    // teamcityProjects stays at the default `[]` AND dirtyFields stays
    // empty. Expected wire result: no teamcityProjects key in payload.
    const updateMutateAsync = vi.fn(() => Promise.resolve())
    const user = makeUser(['ACCESS_COMPONENTS', 'EDIT_COMPONENTS'])
    const seeded: ComponentDetail = {
      ...baseComponent,
      teamcityProjects: [
        {
          id: 'tc-1',
          projectId: 'MyProject_Build',
          projectUrl: 'https://teamcity.example.com/project/MyProject_Build',
          sortOrder: 0,
        },
      ],
    }
    renderPage(seeded, user, { updateMutation: { mutateAsync: updateMutateAsync } })

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalledOnce())
    const payload = (updateMutateAsync.mock.calls[0] as unknown as [Record<string, unknown>])[0]
    expect(payload['teamcityProjects']).toBeUndefined()
  })

  // The positive-clear path (user removes all TC rows via useFieldArray
  // → field dirty → Save emits `teamcityProjects: []`) is verified by the
  // chromium-viewer Playwright spec against a real backend, not here.
  // RHF's `setValue('teamcityProjects', [], { shouldDirty: true })` does
  // not mark a field dirty when the new value matches the form default
  // ([]), so the React-Testing-Library mock can't cleanly reproduce the
  // dirty=true + value=[] state without dragging useFieldArray into the
  // GeneralTab stub. The safety branch above already pins the load-bearing
  // contract: a non-dirty form NEVER sends `[]`.

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
        // Hydrate system too — the PR #44 P2 systems guard reads
        // component.system vs form.system and would otherwise block save.
        form.setValue('system', component.system ?? '')
        form.setValue(
          'teamcityProjects',
          (component.teamcityProjects ?? []).map((tc) => ({ projectId: tc.projectId })),
        )
      }, [component, form])
      return React.createElement('div', { 'data-testid': 'general-tab-mirrored' })
    })
    const updateMutateAsync = vi.fn(() => Promise.resolve())
    const user = makeUser(['ACCESS_COMPONENTS', 'EDIT_COMPONENTS'])
    const seeded: ComponentDetail = {
      ...baseComponent,
      teamcityProjects: [
        {
          id: 'tc-1',
          projectId: 'Existing_Build',
          projectUrl: 'https://teamcity.example.com/project/Existing_Build',
          sortOrder: 0,
        },
      ],
    }
    renderPage(seeded, user, { updateMutation: { mutateAsync: updateMutateAsync } })

    // Sanity check: the per-test mock rendered (not the default).
    await waitFor(() => {
      expect(screen.getByTestId('general-tab-mirrored')).toBeDefined()
    })

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalledOnce())
    const payload = (updateMutateAsync.mock.calls[0] as unknown as [Record<string, unknown>])[0]
    // schema-v2: TC link is now a list (single-element from the form). The URL
    // is server-derived (TeamcityProjectRequest has only `projectId`), so the
    // payload carries projectId only — URL is dropped at the boundary.
    expect(payload['teamcityProjects']).toEqual([{ projectId: 'Existing_Build' }])
  })

  it('FC hidden skips teamcityProjects on save (defence-in-depth)', async () => {
    // Even if the form somehow held a value, hidden FC visibility must
    // make handleSave drop the list from the payload — server-side does
    // NOT enforce field-config (CRS PR-2 spec note), so the SPA is the
    // line of defence against an editor with a stale form snapshot
    // overwriting a hidden field. Either FC entry hidden suppresses the
    // whole section per the pair-visibility rule.
    mockedUseFieldConfigEntry.mockImplementation((path: string) => {
      if (
        path === 'component.teamcityProjectId' ||
        path === 'component.teamcityProjectUrl'
      ) {
        return {
          entry: { visibility: 'hidden', required: false },
          isLoading: false,
          isError: false,
        }
      }
      return {
        entry: { visibility: 'editable', required: false },
        isLoading: false,
        isError: false,
      }
    })
    const updateMutateAsync = vi.fn(() => Promise.resolve())
    const user = makeUser(['ACCESS_COMPONENTS', 'EDIT_COMPONENTS'])
    renderPage(baseComponent, user, { updateMutation: { mutateAsync: updateMutateAsync } })

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalledOnce())
    const payload = (updateMutateAsync.mock.calls[0] as unknown as [Record<string, unknown>])[0]
    expect(payload['teamcityProjects']).toBeUndefined()
  })

  it('blank-row entries in teamcityProjects are filtered out before sending', async () => {
    // Wave B list editor: rows with blank projectId after trim are dropped.
    // Used to be the "partial pair (tcId filled, tcUrl blank)" Wave A guard;
    // schema-v2 has no URL field, so the analogue is "blank row gets dropped".
    vi.mocked(GeneralTab).mockImplementation(({ component, form }) => {
      useEffect(() => {
        // Hydrate system so the PR #44 P2 systems guard doesn't block save.
        form.setValue('system', component.system ?? '')
        form.setValue('teamcityProjects', [{ projectId: 'OnlyId_Build' }, { projectId: '  ' }])
      }, [component, form])
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
    // schema-v2 list: the trimmed-blank row is dropped at handleSave's
    // .filter step, the populated row survives.
    expect(payload['teamcityProjects']).toEqual([{ projectId: 'OnlyId_Build' }])
  })
})

describe('ComponentDetailPage — solution flag dirty-gate', () => {
  it('untouched solution toggle on a component with server null does NOT send false', async () => {
    // Race-condition guard analogous to the TC pre-hydration safety test
    // above. Form default is `false`; server `solution` is `null` ("unknown").
    // Without the dirtyFields gate, a Save fired before the user touches
    // the toggle would send `solution: false` and wipe the stored null
    // (JSON merge-patch treats present-and-false as a real write).
    const updateMutateAsync = vi.fn(() => Promise.resolve())
    const user = makeUser(['ACCESS_COMPONENTS', 'EDIT_COMPONENTS'])
    const seeded: ComponentDetail = { ...baseComponent, solution: null }
    renderPage(seeded, user, { updateMutation: { mutateAsync: updateMutateAsync } })

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalledOnce())
    const payload = (updateMutateAsync.mock.calls[0] as unknown as [Record<string, unknown>])[0]
    expect(payload['solution']).toBeUndefined()
  })
})

describe('ComponentDetailPage — system clear-blocks-save guard (task #14 single-select)', () => {
  it('user clears the system → save is blocked, no PATCH fires', async () => {
    // Task #14 single-select shape: form.system is a scalar string.
    // The page-level guard fires when server had a system and form now
    // has '' — without it the user would click Save, hit
    // buildUpdateRequest (which omits systems on dirty-empty), see a
    // green toast, and walk away thinking the clear took (server keeps
    // the original list since the field was absent on the wire).
    // Stub leaves form.system at the '' default while baseComponent
    // (`system: 'SYS1'`) has the prior list.
    vi.mocked(GeneralTab).mockImplementation(() =>
      React.createElement('div', { 'data-testid': 'general-tab-systems-cleared' }),
    )
    const updateMutateAsync = vi.fn(() => Promise.resolve())
    const user = makeUser(['ACCESS_COMPONENTS', 'EDIT_COMPONENTS'])
    renderPage(baseComponent, user, { updateMutation: { mutateAsync: updateMutateAsync } })

    await waitFor(() => {
      expect(screen.getByTestId('general-tab-systems-cleared')).toBeDefined()
    })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    // Give React-Query a tick to settle if the mutation were to fire.
    await new Promise((r) => setTimeout(r, 50))
    expect(updateMutateAsync).not.toHaveBeenCalled()
  })

  it('user clears the system but field-config hides the row → save still fires (guard skipped)', async () => {
    // If admins configured the systems field as hidden via field-config,
    // the empty-system guard must NOT block: the field isn't user-visible,
    // so we cannot demand the user select one. buildUpdateRequest already
    // omits systems on hidden visibility.
    mockedUseFieldConfigEntry.mockImplementation((path: string) => ({
      entry: path === 'component.system'
        ? { visibility: 'hidden' as const, required: false }
        : { visibility: 'editable' as const, required: false },
      isLoading: false,
      isError: false,
    }))
    vi.mocked(GeneralTab).mockImplementation(() =>
      React.createElement('div', { 'data-testid': 'general-tab-systems-hidden' }),
    )
    const updateMutateAsync = vi.fn(() => Promise.resolve())
    const user = makeUser(['ACCESS_COMPONENTS', 'EDIT_COMPONENTS'])
    renderPage(baseComponent, user, { updateMutation: { mutateAsync: updateMutateAsync } })

    await waitFor(() => {
      expect(screen.getByTestId('general-tab-systems-hidden')).toBeDefined()
    })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalledOnce())
  })
})

describe('ComponentDetailPage — labels clear-all sends [] (PR #44 follow-up: close RHF blind-spot)', () => {
  // The systems guard (above) and the labels clear case both hit the same
  // RHF quirk: setValue('field', []) does NOT mark the field dirty when
  // the form default is also [], so `formState.dirtyFields.<field>` stays
  // false even after a user-driven clear-all. For systems we BLOCK save
  // (systems is required server-side). For labels we SEND `[]` (labels
  // is OPTIONAL — clear-all is a valid intent that the previous code
  // silently dropped because buildUpdateRequest's `dirtyFields.labels !==
  // true` clause omitted the field).
  //
  // The fix synthesises a `dirtyFlags.labels` from the server-vs-form
  // value compare and feeds that into buildUpdateRequest.

  it('component had labels + user removes them all via chips × → PATCH body contains labels: []', async () => {
    // Stub mimics the real GeneralTab + ChipsInput interaction: hydrate
    // from component.labels, then simulate the chip × path which calls
    // setValue with shouldDirty + shouldTouch. RHF's value-equality
    // check keeps dirty=false (final value [] == default []), but
    // touchedFields.labels flips to true — the signal handleSave's
    // synth-dirty depends on.
    vi.mocked(GeneralTab).mockImplementation(({ component, form }) => {
      useEffect(() => {
        form.setValue('labels', component.labels ?? [])
        form.setValue('labels', [], { shouldDirty: true, shouldTouch: true })
        // Hydrate systems too so the unrelated systems guard doesn't trip.
        form.setValue('system', component.system ?? '')
      }, [component, form])
      return React.createElement('div', { 'data-testid': 'general-tab-labels-cleared' })
    })
    const updateMutateAsync = vi.fn(() => Promise.resolve())
    const user = makeUser(['ACCESS_COMPONENTS', 'EDIT_COMPONENTS'])
    const seeded: ComponentDetail = { ...baseComponent, labels: ['backend', 'internal'] }
    renderPage(seeded, user, { updateMutation: { mutateAsync: updateMutateAsync } })

    await waitFor(() => {
      expect(screen.getByTestId('general-tab-labels-cleared')).toBeDefined()
    })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalledOnce())
    const payload = (updateMutateAsync.mock.calls[0] as unknown as [Record<string, unknown>])[0]
    // The explicit `labels: []` clear must reach the wire — not undefined,
    // not absent. PATCH semantics: present-and-empty-array == REPLACE
    // with empty list.
    expect(payload['labels']).toEqual([])
  })

  it('component had NO labels + form is empty + untouched → labels omitted (no-op-write guard)', async () => {
    // The value-compare synthetic-dirty must NOT fire when the server
    // had no labels to begin with — that case is "nothing to clear", and
    // emitting labels:[] would be a no-op write the server doesn't need.
    const updateMutateAsync = vi.fn(() => Promise.resolve())
    const user = makeUser(['ACCESS_COMPONENTS', 'EDIT_COMPONENTS'])
    const seeded: ComponentDetail = { ...baseComponent, labels: [] }
    renderPage(seeded, user, { updateMutation: { mutateAsync: updateMutateAsync } })

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalledOnce())
    const payload = (updateMutateAsync.mock.calls[0] as unknown as [Record<string, unknown>])[0]
    expect(payload['labels']).toBeUndefined()
  })

  it('PRE-HYDRATION RACE: component HAS labels, form not yet hydrated, untouched → labels omitted (fails closed)', async () => {
    // The dangerous race: useComponent resolves → React renders → Save
    // button is enabled → GeneralTab.useEffect has NOT fired → user
    // clicks Save. form.getValues('labels') returns the form default [].
    // Without the touched-gate, the value-compare would fire (server has
    // ['backend'], form has []) and emit labels:[] — silently wiping the
    // server data. The touched-gate `touchedFields.labels === true`
    // makes this fail closed: synth-dirty stays false until the user
    // actually interacts with the field.
    //
    // The default GeneralTab stub in beforeEach only hydrates `system`
    // (per the systems guard's needs). Labels stays at the form default
    // [], exactly modelling the pre-hydration window for this field.
    const updateMutateAsync = vi.fn(() => Promise.resolve())
    const user = makeUser(['ACCESS_COMPONENTS', 'EDIT_COMPONENTS'])
    const seeded: ComponentDetail = { ...baseComponent, labels: ['backend', 'internal'] }
    renderPage(seeded, user, { updateMutation: { mutateAsync: updateMutateAsync } })

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalledOnce())
    const payload = (updateMutateAsync.mock.calls[0] as unknown as [Record<string, unknown>])[0]
    // Critical: the payload must NOT carry labels (omit, not []) because
    // the user hasn't touched the field. The server keeps its existing
    // ['backend', 'internal'] under PATCH no-op semantics.
    expect(payload['labels']).toBeUndefined()
  })

  it('labels hidden via field-config → clear-all is NOT synthesised (defence-in-depth)', async () => {
    // Admins who hid the labels field can't see or fix it from the form,
    // so the save path must not force-emit []: that would let a hidden
    // form snapshot overwrite the server value. The hidden gate must
    // short-circuit before the value-compare runs.
    mockedUseFieldConfigEntry.mockImplementation((path: string) => ({
      entry: path === 'component.labels'
        ? { visibility: 'hidden' as const, required: false }
        : { visibility: 'editable' as const, required: false },
      isLoading: false,
      isError: false,
    }))
    const updateMutateAsync = vi.fn(() => Promise.resolve())
    const user = makeUser(['ACCESS_COMPONENTS', 'EDIT_COMPONENTS'])
    const seeded: ComponentDetail = { ...baseComponent, labels: ['backend'] }
    renderPage(seeded, user, { updateMutation: { mutateAsync: updateMutateAsync } })

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalledOnce())
    const payload = (updateMutateAsync.mock.calls[0] as unknown as [Record<string, unknown>])[0]
    expect(payload['labels']).toBeUndefined()
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

