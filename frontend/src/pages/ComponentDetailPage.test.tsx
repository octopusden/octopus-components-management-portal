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
import { CANNOT_EDIT_TITLE } from '../components/editor/editPermission'

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
  // Fixture group for the read-only Group Key display + role badge. R1: a group is
  // migration-owned aggregator membership, not API-editable — just display data here;
  // there is no save-guard / prefix-check path anymore.
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

describe('ComponentDetailPage — Save gating on canEdit', () => {
  // The header Save button is the only "Save" (tab-specific saves like "Save Build"
  // live in inactive, unmounted tabs); match its exact accessible name.
  const SAVE = { name: 'Save' } as const

  // Render with a GeneralTab stub exposing an edit button; clicking it makes a real
  // (dirty) change so the merged Save dirty-gate is satisfied, isolating the canEdit
  // gate from "nothing to save".
  function renderDirty(component: ComponentDetail, user: User) {
    vi.mocked(GeneralTab).mockImplementation(({ component: c, form }) => {
      useEffect(() => {
        form.setValue('system', c.system ?? '')
      }, [c, form])
      return React.createElement(
        'button',
        {
          'data-testid': 'edit-display-name',
          onClick: () => form.setValue('displayName', 'Edited Name', { shouldDirty: true }),
        },
        'edit',
      )
    })
    renderPage(component, user)
    fireEvent.click(screen.getByTestId('edit-display-name'))
  }

  it('Save enables when component.canEdit is true (after a real edit)', async () => {
    const user = makeUser(['ACCESS_COMPONENTS', 'EDIT_COMPONENTS'])
    renderDirty({ ...baseComponent, canEdit: true }, user)
    await waitFor(() => expect(screen.getByRole('button', SAVE)).not.toBeDisabled())
  })

  it('Save stays disabled when canEdit is false even after an edit (and with EDIT_COMPONENTS)', async () => {
    const user = makeUser(['ACCESS_COMPONENTS', 'EDIT_COMPONENTS'])
    renderDirty({ ...baseComponent, canEdit: false }, user)
    // The edit applied (sibling control reacted), yet Save is gated by canEdit — and
    // the wrapper tooltip names that reason, not "no changes".
    const save = screen.getByRole('button', SAVE)
    expect(save).toBeDisabled()
    expect(save.parentElement).toHaveAttribute('title', CANNOT_EDIT_TITLE)
  })

  it('absent canEdit falls back to EDIT_COMPONENTS — enables after an edit', async () => {
    const user = makeUser(['ACCESS_COMPONENTS', 'EDIT_COMPONENTS'])
    renderDirty(baseComponent, user) // baseComponent has no canEdit
    await waitFor(() => expect(screen.getByRole('button', SAVE)).not.toBeDisabled())
  })

  it('absent canEdit falls back to EDIT_COMPONENTS — disabled without the permission', () => {
    const user = makeUser(['ACCESS_COMPONENTS'])
    renderDirty(baseComponent, user)
    const save = screen.getByRole('button', SAVE)
    expect(save).toBeDisabled()
    expect(save.parentElement).toHaveAttribute('title', CANNOT_EDIT_TITLE)
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
    const link = screen.getByTitle('TeamCity: MyProject_Build') as HTMLAnchorElement
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

  it('(g) renders one TeamCity link per project with a valid URL (item 6 multi-link)', () => {
    const user = makeUser(['ACCESS_COMPONENTS'])
    renderPage(
      {
        ...baseComponent,
        teamcityProjects: [
          { id: 'tc-1', projectId: 'Build_A', projectUrl: 'https://teamcity.example.com/project/Build_A', sortOrder: 0 },
          { id: 'tc-2', projectId: 'Build_B', projectUrl: 'https://teamcity.example.com/project/Build_B', sortOrder: 1 },
          { id: 'tc-3', projectId: 'NoUrl', projectUrl: null, sortOrder: 2 },
        ],
      },
      user,
    )
    // Two projects have valid URLs → two links; the null-URL row is skipped.
    expect(screen.getAllByTitle(/^TeamCity: /).length).toBe(2)
    expect((screen.getByTitle('TeamCity: Build_A') as HTMLAnchorElement).href).toBe(
      'https://teamcity.example.com/project/Build_A',
    )
    expect((screen.getByTitle('TeamCity: Build_B') as HTMLAnchorElement).href).toBe(
      'https://teamcity.example.com/project/Build_B',
    )
  })
})

describe('ComponentDetailPage — solution flag dirty-gate', () => {
  it('untouched form (server solution=null) → Save is disabled, so no clobbering PATCH can fire', async () => {
    // Stronger guarantee than the old "untouched save omits solution" assertion:
    // with the Save dirty-gate, an untouched General form leaves Save DISABLED,
    // so the JSON-merge-patch clobber (`solution: false` overwriting the stored
    // null) cannot happen at all. The omit semantics themselves remain unit-
    // tested in buildUpdateRequest.test.ts.
    const updateMutateAsync = vi.fn(() => Promise.resolve())
    const user = makeUser(['ACCESS_COMPONENTS', 'EDIT_COMPONENTS'])
    const seeded: ComponentDetail = { ...baseComponent, solution: null }
    renderPage(seeded, user, { updateMutation: { mutateAsync: updateMutateAsync } })

    // Wait for GeneralTab's hydration useEffect to settle (system mirrored from
    // the server) — the gate then sees a pristine form and disables Save.
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /^save$/i }) as HTMLButtonElement
      expect(btn.disabled).toBe(true)
    })

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    // Disabled Save fires no handler, so no need to await: assert directly.
    expect(updateMutateAsync).not.toHaveBeenCalled()
  })
})

describe('ComponentDetailPage — Save dirty-gate', () => {
  it('Save is disabled on a pristine form, enables after a real edit, then PATCHes', async () => {
    vi.mocked(GeneralTab).mockImplementation(({ component, form }) => {
      useEffect(() => {
        form.setValue('system', component.system ?? '')
      }, [component, form])
      return React.createElement(
        'button',
        {
          'data-testid': 'edit-display-name',
          onClick: () => form.setValue('displayName', 'New Name', { shouldDirty: true }),
        },
        'edit',
      )
    })
    const updateMutateAsync = vi.fn(() => Promise.resolve())
    const user = makeUser(['ACCESS_COMPONENTS', 'EDIT_COMPONENTS'])
    renderPage(baseComponent, user, { updateMutation: { mutateAsync: updateMutateAsync } })

    // Pristine (system hydrated, nothing else changed) → Save disabled.
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /^save$/i }) as HTMLButtonElement
      expect(btn.disabled).toBe(true)
    })

    // A real edit → Save enables.
    fireEvent.click(screen.getByTestId('edit-display-name'))
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /^save$/i }) as HTMLButtonElement
      expect(btn.disabled).toBe(false)
    })

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalledOnce())
    const payload = (updateMutateAsync.mock.calls[0] as unknown as [Record<string, unknown>])[0]
    expect(payload['displayName']).toBe('New Name')
  })

  it('renders (Save button present) even when the API omits docs/artifactIds', () => {
    // Regression: the dirty-gate must never crash the whole page. Older CRS
    // images omit docs/artifactIds from ComponentDetailResponse; the TS type
    // says they're always arrays, but if the runtime payload disagrees the
    // gate must still render. (A previous version computed the gate by calling
    // buildUpdateRequest at render, which dereferenced component.docs.length
    // and blanked the entire /components/{id} page — caught by the E2E suite.)
    const user = makeUser(['ACCESS_COMPONENTS', 'EDIT_COMPONENTS'])
    const seeded = {
      ...baseComponent,
      docs: undefined,
      artifactIds: undefined,
    } as unknown as ComponentDetail
    renderPage(seeded, user)
    expect(screen.getByRole('button', { name: /^save$/i })).toBeDefined()
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
    // Disabled Save fires no handler, so no need to await: assert directly.
    expect(updateMutateAsync).not.toHaveBeenCalled()
  })

  it('system hidden + a real edit elsewhere → save fires, empty-system guard skipped', async () => {
    // If admins configured the systems field as hidden via field-config, the
    // empty-system guard must NOT block: the field isn't user-visible, so we
    // cannot demand the user select one. We make a real visible change
    // (displayName) so the Save dirty-gate enables the button, then assert the
    // save fires despite the form's system being empty — proving the guard is
    // skipped when the field is hidden. (buildUpdateRequest still omits system
    // on hidden visibility.)
    mockedUseFieldConfigEntry.mockImplementation((path: string) => ({
      entry: path === 'component.system'
        ? { visibility: 'hidden' as const, required: false }
        : { visibility: 'editable' as const, required: false },
      isLoading: false,
      isError: false,
    }))
    // Stub exposes a button that makes a real visible edit (displayName) on
    // click — a user-driven setValue reliably flips RHF's isDirty (mirrors how
    // the real GeneralTab's registered inputs behave). System is left at the ''
    // default to model the hidden-and-empty case.
    vi.mocked(GeneralTab).mockImplementation(({ form }) =>
      React.createElement(
        'button',
        {
          'data-testid': 'edit-display-name',
          onClick: () => form.setValue('displayName', 'Edited While System Hidden', { shouldDirty: true }),
        },
        'edit',
      ),
    )
    const updateMutateAsync = vi.fn(() => Promise.resolve())
    const user = makeUser(['ACCESS_COMPONENTS', 'EDIT_COMPONENTS'])
    renderPage(baseComponent, user, { updateMutation: { mutateAsync: updateMutateAsync } })

    // Make the edit, then wait for Save to enable before clicking it.
    fireEvent.click(screen.getByTestId('edit-display-name'))
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /^save$/i }) as HTMLButtonElement
      expect(btn.disabled).toBe(false)
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

  it('component had NO labels + form is empty + untouched → Save disabled (no no-op write)', async () => {
    // The server had no labels — there is nothing to clear, so an untouched
    // form is pristine and Save stays disabled. (The "labels:[] would be a
    // no-op write" omit is unit-tested in buildUpdateRequest.test.ts.)
    const updateMutateAsync = vi.fn(() => Promise.resolve())
    const user = makeUser(['ACCESS_COMPONENTS', 'EDIT_COMPONENTS'])
    const seeded: ComponentDetail = { ...baseComponent, labels: [] }
    renderPage(seeded, user, { updateMutation: { mutateAsync: updateMutateAsync } })

    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /^save$/i }) as HTMLButtonElement
      expect(btn.disabled).toBe(true)
    })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    // Disabled Save fires no handler, so no need to await: assert directly.
    expect(updateMutateAsync).not.toHaveBeenCalled()
  })

  it('PRE-HYDRATION / untouched labels (server HAS labels) → Save disabled (fails closed)', async () => {
    // The dangerous race the dirty-gate now closes structurally: server has
    // labels, the user has NOT touched the labels field, so the form must not
    // be able to emit labels:[] and wipe the server data. With Save disabled
    // on a pristine form, the clobbering PATCH cannot fire at all. (The
    // touched-gate value-compare itself is unit-tested in buildUpdateRequest.)
    //
    // The default GeneralTab stub hydrates only `system`; labels stays at the
    // form default [], modelling the untouched / pre-hydration window.
    const updateMutateAsync = vi.fn(() => Promise.resolve())
    const user = makeUser(['ACCESS_COMPONENTS', 'EDIT_COMPONENTS'])
    const seeded: ComponentDetail = { ...baseComponent, labels: ['backend', 'internal'] }
    renderPage(seeded, user, { updateMutation: { mutateAsync: updateMutateAsync } })

    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /^save$/i }) as HTMLButtonElement
      expect(btn.disabled).toBe(true)
    })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    // Disabled Save fires no handler, so no need to await: assert directly.
    expect(updateMutateAsync).not.toHaveBeenCalled()
  })

  it('labels hidden via field-config + untouched form → Save disabled (defence-in-depth)', async () => {
    // Admins who hid the labels field can't see or fix it from the form, so the
    // save path must not force-emit [] and overwrite the server value. An
    // untouched form keeps Save disabled, so nothing can be emitted. (The
    // hidden-visibility omit short-circuit is unit-tested in buildUpdateRequest.)
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

    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /^save$/i }) as HTMLButtonElement
      expect(btn.disabled).toBe(true)
    })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    // Disabled Save fires no handler, so no need to await: assert directly.
    expect(updateMutateAsync).not.toHaveBeenCalled()
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

