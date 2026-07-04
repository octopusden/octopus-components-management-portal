import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
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
  // item D: the page wrapper seeds OverridesDraftProvider from this.
  useFieldOverrides: vi.fn(() => ({ data: [] })),
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
  usePortalConfig: vi.fn(() => ({ data: undefined })),
  useCrsInfo: vi.fn(),
  // Layout consumes usePortalInfo for the environment banner; return "no data"
  // so these page tests render without a banner.
  usePortalInfo: vi.fn(() => ({ data: undefined })),
}))
// The always-rendered header labels editor calls useLabelsDictionary; mock it to
// a stable empty dictionary so the page test never hits the real fetch/api path.
vi.mock('../hooks/useLabelsDictionary', () => ({
  useLabelsDictionary: () => ({ data: [], isLoading: false }),
}))
// Supported groupId prefixes feed the distribution/ownership prefix Save-gate.
// Default empty ⇒ fail-open (gate off), so existing tests are unaffected.
vi.mock('../hooks/useSupportedGroups', () => ({ useSupportedGroups: vi.fn() }))
// Field-config hook — mocked so individual tests can pin TC fields to
// 'hidden' / 'editable'. Default (set in beforeEach) returns editable for
// every field path so existing tests behave unchanged.
vi.mock('../hooks/useFieldConfig', () => ({
  useFieldConfigEntry: vi.fn(),
  useFieldConfigOptions: () => ({ options: [], isLoading: false }),
  // Real DocumentationTab / SolutionTab render FieldLabelText (useFieldLabel)
  // when a 400 routes to them or the Solution topic is active — return the fallback.
  useFieldLabel: (_path: string, fallback: string) => fallback,
  // The page composes this into the Jira slice's payload-gating predicate (P-2a).
  isFieldEditableFor: () => true,
  // useVcsSection resolves External Registry editability through this hook;
  // default to editable (these tests don't exercise the admin gate).
  useFieldEditable: () => true,
}))
// The page reads the raw field-config blob for that predicate; stub it away.
vi.mock('../hooks/useAdminConfig', () => ({
  useFieldConfig: () => ({ data: undefined, isLoading: false, isError: false }),
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
// Keep the real MISC_TAB_FIELDS export (the 400 handler imports it) but stub the component
// so the Misc tab content renders without ComponentSelect's data dependencies.
vi.mock('../components/editor/MiscTab', async () => {
  const actual = await vi.importActual<typeof import('../components/editor/MiscTab')>(
    '../components/editor/MiscTab',
  )
  return { ...actual, MiscTab: () => React.createElement('div', { 'data-testid': 'misc-tab' }) }
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
vi.mock('../components/editor/DockerImagesTab', () => ({
  DockerImagesTab: () => React.createElement('div', { 'data-testid': 'docker-tab' }),
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
// WhoCanEditPanel fetches the /editors projection via react-query; stub it so the
// page test only asserts whether the read-only "who can edit" banner is mounted.
vi.mock('../components/editor/WhoCanEditPanel', () => ({
  WhoCanEditPanel: () => React.createElement('div', { 'data-testid': 'who-can-edit' }),
}))
// The Validation Problems tab is driven by the SAME cached report hook the list
// page uses (useValidationProblems). Mock it so tests can supply a report keyed
// by component name (HAS problems) or an empty report (clean), and assert the
// enabled-gating contract (non-admin → hook called with enabled=false).
vi.mock('../hooks/useValidationProblems', () => ({
  useValidationProblems: vi.fn(),
}))
// The Validation Problems tab's "Copy versions" button calls copyToClipboard;
// mock the module so the test can assert the newline-joined version list
// without touching the real clipboard API (same pattern as AsCodeTab.test).
vi.mock('../lib/clipboard', () => ({ copyToClipboard: vi.fn() }))
// CreateComponentDialog (copy mode) pulls hooks from the (mocked) useComponent
// module; stub it so the page test only asserts the open/sourceId wiring.
vi.mock('../components/CreateComponentDialog', () => ({
  CreateComponentDialog: ({ sourceId, open }: { sourceId?: string; open: boolean }) =>
    open ? React.createElement('div', { 'data-testid': 'copy-dialog' }, sourceId) : null,
}))

import { ApiError } from '../lib/api'
import { useCurrentUser } from '../hooks/useCurrentUser'
import { useComponent, useUpdateComponent, useDeleteComponent } from '../hooks/useComponent'
import { usePortalLinks, usePortalConfig } from '../hooks/useInfo'
import { useSupportedGroups } from '../hooks/useSupportedGroups'
import { useFieldConfigEntry } from '../hooks/useFieldConfig'
import { GeneralTab } from '../components/editor/GeneralTab'
import { TooltipProvider } from '../components/ui/tooltip'
import { CANNOT_EDIT_TITLE } from '../components/editor/editPermission'
import { useAdminMode } from '../lib/adminModeStore'
import { useValidationProblems } from '../hooks/useValidationProblems'
import { copyToClipboard } from '../lib/clipboard'
import type { ComponentValidation } from '@/lib/types'

const mockedUsePortalLinks = vi.mocked(usePortalLinks)
const mockedUsePortalConfig = vi.mocked(usePortalConfig)
const mockedUseSupportedGroups = vi.mocked(useSupportedGroups)
const mockedUseFieldConfigEntry = vi.mocked(useFieldConfigEntry)
const mockedUseValidationProblems = vi.mocked(useValidationProblems)
const mockedCopyToClipboard = vi.mocked(copyToClipboard)

/** Build a useValidationProblems result with the given component validations
 *  keyed by their `component` field — the exact map the real hook produces. */
function validationResult(cvs: ComponentValidation[]) {
  const byComponent = new Map<string, ComponentValidation>()
  for (const cv of cvs) byComponent.set(cv.component, cv)
  return {
    byComponent,
    generatedAt: null,
    lastAttemptAt: null,
    refreshError: null,
    isLoading: false,
    isError: false,
    error: null,
  } as unknown as ReturnType<typeof useValidationProblems>
}

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
  systems: ['SYS1'],
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

// Phase 3b save flow: click the sticky bar's "Save changes" to open the Review
// dialog, then "Confirm" to fire the single combined PATCH. Helper centralises
// that two-step interaction so the mutation-firing tests read cleanly.
async function clickSaveAndConfirm() {
  fireEvent.click(screen.getByRole('button', { name: /save changes/i }))
  const confirm = await screen.findByRole('button', { name: /^confirm$/i })
  fireEvent.click(confirm)
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

  // A data router (createMemoryRouter) is required because the page's
  // UnsavedChangesGuard uses react-router's useBlocker, which throws outside a
  // data-router context. The /components route lets navigate('/components')
  // resolve without a "no routes matched" warning.
  const router = createMemoryRouter(
    [
      { path: '/components', element: <div data-testid="list-page" /> },
      { path: '/components/:id', element: <ComponentDetailPage /> },
    ],
    { initialEntries: ['/components/comp-1'] },
  )
  return render(
    React.createElement(
      QueryClientProvider,
      { client },
      <TooltipProvider>
        <RouterProvider router={router} />
      </TooltipProvider>,
    ),
  )
}

// ── tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  // The Validation Problems tab is admin-mode only. Default adminMode OFF so
  // existing tests render no tab; the dedicated describe flips it on.
  useAdminMode.setState({ enabled: false })
  // Default: an empty validation report → no Validation Problems tab. The
  // dedicated describe overrides this to supply a problem-bearing report.
  mockedUseValidationProblems.mockReturnValue(validationResult([]))
  mockedUsePortalLinks.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
  } as unknown as ReturnType<typeof usePortalLinks>)
  mockedUseSupportedGroups.mockReturnValue({ groups: [], isLoading: false })
  // Default: no solution-key patterns → no Solution tab. Positive test overrides.
  mockedUsePortalConfig.mockReturnValue({ data: undefined } as unknown as ReturnType<typeof usePortalConfig>)
  // Default: every field-config entry resolves as 'editable'. Individual
  // tests override per-field by re-mocking this implementation.
  mockedUseFieldConfigEntry.mockImplementation(() => ({
    entry: { visibility: 'editable', required: false },
    isLoading: false,
    isError: false,
  }))
  // Default GeneralTab stub. Hydrates `system` AND `displayName` from the component
  // so the page-level save guards ("server had a value, form has none" for system /
  // displayName) don't false-positive on tests that never touch those fields. Mirrors
  // the real GeneralTab.useEffect mirror-server-into-form behavior. Individual tests can
  // still override this to exercise the clear-all guards.
  vi.mocked(GeneralTab).mockImplementation(({ component, form }) => {
    useEffect(() => {
      form.setValue('systems', component.systems ?? [])
      form.setValue('displayName', component.displayName ?? '')
    }, [component, form])
    return React.createElement('div', { 'data-testid': 'general-tab' })
  })
})

describe('ComponentDetailPage — Save gating on canEdit', () => {
  // The header Save button is the only "Save" (tab-specific saves like "Save Build"
  // live in inactive, unmounted tabs); match its exact accessible name.
  const SAVE = { name: 'Save changes' } as const

  // Render with a GeneralTab stub exposing an edit button; clicking it makes a real
  // (dirty) change so the merged Save dirty-gate is satisfied, isolating the canEdit
  // gate from "nothing to save".
  function renderDirty(component: ComponentDetail, user: User) {
    vi.mocked(GeneralTab).mockImplementation(({ component: c, form }) => {
      useEffect(() => {
        form.setValue('systems', c.systems ?? [])
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
    const user = makeUser(['ACCESS_COMPONENTS', 'CREATE_COMPONENTS'])
    renderDirty({ ...baseComponent, canEdit: true }, user)
    await waitFor(() => expect(screen.getByRole('button', SAVE)).not.toBeDisabled())
  })

  it('Save stays disabled when canEdit is false even after an edit (and with CREATE_COMPONENTS)', async () => {
    const user = makeUser(['ACCESS_COMPONENTS', 'CREATE_COMPONENTS'])
    renderDirty({ ...baseComponent, canEdit: false }, user)
    // The edit applied (sibling control reacted), yet Save is gated by canEdit — and
    // the wrapper tooltip names that reason, not "no changes".
    const save = screen.getByRole('button', SAVE)
    expect(save).toBeDisabled()
    expect(save.parentElement).toHaveAttribute('title', CANNOT_EDIT_TITLE)
  })

  it('absent canEdit falls back to CREATE_COMPONENTS — enables after an edit', async () => {
    const user = makeUser(['ACCESS_COMPONENTS', 'CREATE_COMPONENTS'])
    renderDirty(baseComponent, user) // baseComponent has no canEdit
    await waitFor(() => expect(screen.getByRole('button', SAVE)).not.toBeDisabled())
  })

  it('absent canEdit falls back to CREATE_COMPONENTS — disabled without the permission', () => {
    const user = makeUser(['ACCESS_COMPONENTS'])
    renderDirty(baseComponent, user)
    const save = screen.getByRole('button', SAVE)
    expect(save).toBeDisabled()
    expect(save.parentElement).toHaveAttribute('title', CANNOT_EDIT_TITLE)
  })
})

describe('ComponentDetailPage — view-only mode', () => {
  function renderWithGeneralControls(component: ComponentDetail) {
    vi.mocked(GeneralTab).mockImplementation(() =>
      React.createElement(
        'div',
        null,
        React.createElement('input', { 'aria-label': 'Editable field' }),
        React.createElement('button', null, 'Edit action'),
      ),
    )
    renderPage(component, makeUser(['ACCESS_COMPONENTS']))
  }

  it('shows View only and disables fields and actions when canEdit is false', () => {
    renderWithGeneralControls({ ...baseComponent, canEdit: false })

    expect(screen.getByText('View only')).toHaveAttribute('title', CANNOT_EDIT_TITLE)
    expect(screen.getByRole('group', { name: 'General fields' })).toBeDisabled()
    expect(screen.getByRole('textbox', { name: 'Editable field' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Edit action' })).toBeDisabled()
    // Read-only viewers get the "who can edit" banner under the name / above the tabs.
    expect(screen.getByTestId('who-can-edit')).toBeDefined()
    // The footer panel's mutual-exclusivity depends on canEdit reaching GeneralTab —
    // assert the prop pass-through (GeneralTab is mocked, so this is the only coverage).
    // Inspect the props arg directly to stay agnostic of React's call arity.
    expect(vi.mocked(GeneralTab).mock.calls.at(0)?.[0]).toEqual(
      expect.objectContaining({ canEdit: false }),
    )
  })

  it('keeps tab navigation available while each edit surface remains disabled', () => {
    renderWithGeneralControls({ ...baseComponent, canEdit: false })

    expect(screen.getByRole('tab', { name: /Build/ })).not.toBeDisabled()
    expect(screen.getByRole('group', { name: 'General fields' })).toBeDisabled()
  })

  it('hides View only and keeps fields enabled when canEdit is true', () => {
    renderWithGeneralControls({ ...baseComponent, canEdit: true })

    expect(screen.queryByText('View only')).toBeNull()
    expect(screen.getByRole('group', { name: 'General fields' })).not.toBeDisabled()
    expect(screen.getByRole('textbox', { name: 'Editable field' })).not.toBeDisabled()
    expect(screen.getByRole('button', { name: 'Edit action' })).not.toBeDisabled()
    // Editors don't get the header banner — they see the same panel at the foot of
    // the General tab instead (rendered inside the real GeneralTab, mocked out here).
    expect(screen.queryByTestId('who-can-edit')).toBeNull()
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
    renderPage({ ...baseComponent, systems: [] }, user)
    expect(screen.queryByText('SYS1')).toBeNull()
  })

  it('(D7) System badge not rendered when component.system field-config visibility is hidden', () => {
    // A read-only badge mirroring a field must respect field-config visibility:
    // hidden ⇒ the badge does not render (not only the input). baseComponent has
    // systems: ['SYS1'], so only the hidden gate can suppress it.
    const user = makeUser(['ACCESS_COMPONENTS'])
    mockedUseFieldConfigEntry.mockImplementation((path: string) => ({
      entry: path === 'component.system'
        ? { visibility: 'hidden' as const, required: false }
        : { visibility: 'editable' as const, required: false },
      isLoading: false,
      isError: false,
    }))
    renderPage(baseComponent, user)
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

describe('ComponentDetailPage — sidebar nav order', () => {
  it('renders the grouped sidebar order (Overview → Build & Release → Distribution → Metadata → Tools)', () => {
    const user = makeUser(['ACCESS_COMPONENTS'])
    renderPage(baseComponent, user)
    const tabs = within(screen.getByRole('tablist')).getAllByRole('tab')
    // Strip count badges ("Build1" → "Build") so the assertion only pins order.
    // The grouping (spec §2.1) puts Jira/Escrow under Build & Release before the
    // Distribution group (Distribution + Docker), then Metadata (Misc,
    // Configurations), then Tools (As Code, Overrides, History).
    expect(tabs.map((t) => (t.textContent ?? '').replace(/\d+$/, ''))).toEqual([
      'General',
      'Build',
      'VCS',
      'Jira',
      'Escrow',
      'Documentation',
      'Distribution',
      'Docker',
      'Misc',
      'Supported Versions',
      'Configurations',
      'As Code',
      'Overrides',
      'History',
    ])
  })

  it('renders every group heading in the sidebar', () => {
    const user = makeUser(['ACCESS_COMPONENTS'])
    renderPage(baseComponent, user)
    for (const heading of ['Overview', 'Build & Release', 'Metadata', 'Tools']) {
      expect(screen.getByText(heading)).toBeDefined()
    }
    // "Distribution" is both a group heading and the lone item under it.
    expect(screen.getAllByText('Distribution').length).toBeGreaterThanOrEqual(2)
  })

  it('no Solution tab for a non-candidate key (no matching pattern)', () => {
    const user = makeUser(['ACCESS_COMPONENTS'])
    // Default config (no patterns) → no Solution tab even though the flag exists.
    renderPage(baseComponent, user)
    expect(screen.queryByRole('tab', { name: /^Solution/ })).toBeNull()
  })

  it('a candidate key + matching pattern adds the Solution topic', () => {
    const user = makeUser(['ACCESS_COMPONENTS'])
    mockedUsePortalConfig.mockReturnValue({
      data: { solutionKeyPatterns: ['-solution'] },
    } as unknown as ReturnType<typeof usePortalConfig>)
    renderPage({ ...baseComponent, name: 'payment-solution' }, user)
    expect(screen.getAllByRole('tab', { name: /^Solution/ }).length).toBeGreaterThanOrEqual(1)
  })

  it('renaming the key to a candidate in-session reveals the Solution topic (live form value, not just the server key)', async () => {
    // A user with RENAME_COMPONENTS can change the key inline. The Solution
    // topic must react to the live form value so the flag can be set in the
    // same edit session — not only after a save + refetch of the server key.
    mockedUsePortalConfig.mockReturnValue({
      data: { solutionKeyPatterns: ['-solution'] },
    } as unknown as ReturnType<typeof usePortalConfig>)
    vi.mocked(GeneralTab).mockImplementation(({ component, form }) => {
      useEffect(() => {
        form.setValue('name', component.name)
      }, [component, form])
      return React.createElement(
        'button',
        {
          'data-testid': 'do-rename',
          type: 'button',
          onClick: () => form.setValue('name', 'payment-solution', { shouldDirty: true }),
        },
        'rename',
      )
    })
    const user = makeUser(['ACCESS_COMPONENTS', 'RENAME_COMPONENTS'])
    renderPage({ ...baseComponent, name: 'payment-service' }, user)
    // Server key is not a candidate yet → no Solution topic.
    expect(screen.queryByRole('tab', { name: /^Solution/ })).toBeNull()

    fireEvent.click(screen.getByTestId('do-rename'))
    await waitFor(() => {
      expect(screen.getAllByRole('tab', { name: /^Solution/ }).length).toBeGreaterThanOrEqual(1)
    })
  })

  it('shows per-section counts inside the sidebar items (VCS entries, Distribution items)', () => {
    const user = makeUser(['ACCESS_COMPONENTS'])
    // baseComponent's BASE row has 1 vcsEntry and a present build/jira aspect.
    renderPage(baseComponent, user)
    // VCS item carries its entry count (1), Build carries the aspect-present 1.
    expect(within(screen.getByRole('tab', { name: /^VCS/ })).getByText('1')).toBeDefined()
    expect(within(screen.getByRole('tab', { name: /^Build/ })).getByText('1')).toBeDefined()
  })

  it('marks the active sidebar item with aria-current', () => {
    const user = makeUser(['ACCESS_COMPONENTS'])
    renderPage(baseComponent, user)
    expect(screen.getByRole('tab', { name: 'General' })).toHaveAttribute('aria-current', 'page')
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
    const user = makeUser(['ACCESS_COMPONENTS', 'CREATE_COMPONENTS'])
    const seeded: ComponentDetail = { ...baseComponent, solution: null }
    renderPage(seeded, user, { updateMutation: { mutateAsync: updateMutateAsync } })

    // Wait for GeneralTab's hydration useEffect to settle (system mirrored from
    // the server) — the gate then sees a pristine form and disables Save.
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /save changes/i }) as HTMLButtonElement
      expect(btn.disabled).toBe(true)
    })

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))
    // Disabled Save fires no handler, so no need to await: assert directly.
    expect(updateMutateAsync).not.toHaveBeenCalled()
  })
})

describe('ComponentDetailPage — Save gating on owner validation', () => {
  it('disables Save while GeneralTab reports the owner lookup in flight', async () => {
    const user = makeUser(['ACCESS_COMPONENTS', 'CREATE_COMPONENTS'])
    vi.mocked(GeneralTab).mockImplementation(({ component: c, form, onOwnerValidatingChange }) => {
      useEffect(() => {
        form.setValue('systems', c.systems ?? [])
        form.setValue('displayName', c.displayName ?? '')
      }, [c, form])
      return React.createElement(
        'div',
        null,
        React.createElement(
          'button',
          { 'data-testid': 'edit', onClick: () => form.setValue('displayName', 'X', { shouldDirty: true }) },
          'edit',
        ),
        React.createElement(
          'button',
          { 'data-testid': 'validating-on', onClick: () => onOwnerValidatingChange?.(true) },
          'on',
        ),
        React.createElement(
          'button',
          { 'data-testid': 'validating-off', onClick: () => onOwnerValidatingChange?.(false) },
          'off',
        ),
      )
    })
    renderPage({ ...baseComponent, canEdit: true }, user)

    // Dirty edit so the dirty-gate passes and Save starts enabled.
    fireEvent.click(screen.getByTestId('edit'))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save changes' })).not.toBeDisabled())

    fireEvent.click(screen.getByTestId('validating-on'))
    const save = screen.getByRole('button', { name: 'Save changes' })
    expect(save).toBeDisabled()
    expect(save.parentElement).toHaveAttribute('title', 'Validating component owner…')

    fireEvent.click(screen.getByTestId('validating-off'))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save changes' })).not.toBeDisabled())
  })
})

describe('ComponentDetailPage — Save dirty-gate', () => {
  it('Save is disabled on a pristine form, enables after a real edit, then PATCHes', async () => {
    vi.mocked(GeneralTab).mockImplementation(({ component, form }) => {
      useEffect(() => {
        form.setValue('systems', component.systems ?? [])
        form.setValue('displayName', component.displayName ?? '')
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
    const user = makeUser(['ACCESS_COMPONENTS', 'CREATE_COMPONENTS'])
    renderPage(baseComponent, user, { updateMutation: { mutateAsync: updateMutateAsync } })

    // Pristine (system hydrated, nothing else changed) → Save disabled.
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /save changes/i }) as HTMLButtonElement
      expect(btn.disabled).toBe(true)
    })

    // A real edit → Save enables.
    fireEvent.click(screen.getByTestId('edit-display-name'))
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /save changes/i }) as HTMLButtonElement
      expect(btn.disabled).toBe(false)
    })

    await clickSaveAndConfirm()
    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalledOnce())
    const payload = (updateMutateAsync.mock.calls[0] as unknown as [Record<string, unknown>])[0]
    expect(payload['displayName']).toBe('New Name')
    // Single combined PATCH carries exactly one version (the page snapshot).
    expect(payload['version']).toBe(baseComponent.version)
  })

  it('clearing componentOwner flows through to the PATCH as "" (server clears to null)', async () => {
    // Regression: clearing componentOwner used to collapse to undefined → omitted from the
    // PATCH → JSON-merge-patch "don't touch" → the clear silently never persisted while the
    // user saw a success toast. The page now passes componentOwner as interacted (dirty OR
    // touched) so buildUpdateRequest emits '' (server stores null).
    vi.mocked(GeneralTab).mockImplementation(({ component, form }) => {
      useEffect(() => {
        form.setValue('systems', component.systems ?? [])
        form.setValue('componentOwner', component.componentOwner ?? '')
      }, [component, form])
      return React.createElement(
        'button',
        {
          'data-testid': 'clear-owner',
          onClick: () => form.setValue('componentOwner', '', { shouldDirty: true, shouldTouch: true }),
        },
        'clear',
      )
    })
    const updateMutateAsync = vi.fn(() => Promise.resolve())
    const user = makeUser(['ACCESS_COMPONENTS', 'CREATE_COMPONENTS'])
    renderPage(baseComponent, user, { updateMutation: { mutateAsync: updateMutateAsync } })

    fireEvent.click(screen.getByTestId('clear-owner'))
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /save changes/i }) as HTMLButtonElement
      expect(btn.disabled).toBe(false)
    })

    await clickSaveAndConfirm()
    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalledOnce())
    const payload = (updateMutateAsync.mock.calls[0] as unknown as [Record<string, unknown>])[0]
    expect(payload['componentOwner']).toBe('')
  })

  it('re-baselines the General form to the saved (server-normalized) component after save', async () => {
    // The GeneralTab re-hydration guard skips while the form is dirty/touched, so the page
    // must form.reset() to the SAVED component after a successful save — otherwise the form
    // stays dirty for the session and never reflects a value CRS normalized on write. The
    // mock hydrates ONCE (deps []), isolating the page-level post-save reset.
    vi.mocked(GeneralTab).mockImplementation(({ component, form }) => {
      useEffect(() => {
        form.setValue('systems', component.systems ?? [])
        form.setValue('componentOwner', component.componentOwner ?? '')
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])
      return React.createElement('div', {}, [
        React.createElement('span', { key: 'v', 'data-testid': 'owner-value' }, form.watch('componentOwner')),
        React.createElement(
          'button',
          {
            key: 'e',
            'data-testid': 'edit-owner',
            onClick: () => form.setValue('componentOwner', 'bob', { shouldDirty: true, shouldTouch: true }),
          },
          'edit',
        ),
      ])
    })
    // CRS normalizes the owner on write → the saved value differs from what the user typed.
    const saved = { ...baseComponent, componentOwner: 'BOB' }
    // The real mutateAsync resolves the saved ComponentDetail; the test harness option type
    // is the void-returning idle shape, so type the mock as void (runtime resolves `saved`).
    const updateMutateAsync = vi.fn((): Promise<void> => Promise.resolve(saved as unknown as void))
    const user = makeUser(['ACCESS_COMPONENTS', 'CREATE_COMPONENTS'])
    renderPage(baseComponent, user, { updateMutation: { mutateAsync: updateMutateAsync } })

    fireEvent.click(screen.getByTestId('edit-owner'))
    await waitFor(() => expect(screen.getByTestId('owner-value').textContent).toBe('bob'))

    await clickSaveAndConfirm()
    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalledOnce())

    // Without the post-save reset the form keeps 'bob'; with it, it re-baselines to 'BOB'.
    await waitFor(() => expect(screen.getByTestId('owner-value').textContent).toBe('BOB'))
  })

  it('carries the entered Jira key + comment from the Review dialog on the combined PATCH', async () => {
    vi.mocked(GeneralTab).mockImplementation(({ component, form }) => {
      useEffect(() => {
        form.setValue('systems', component.systems ?? [])
        form.setValue('displayName', component.displayName ?? '')
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
    const user = makeUser(['ACCESS_COMPONENTS', 'CREATE_COMPONENTS'])
    renderPage(baseComponent, user, { updateMutation: { mutateAsync: updateMutateAsync } })

    fireEvent.click(screen.getByTestId('edit-display-name'))
    await waitFor(() =>
      expect((screen.getByRole('button', { name: /save changes/i }) as HTMLButtonElement).disabled).toBe(false),
    )

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))
    fireEvent.change(await screen.findByLabelText(/jira task key/i), { target: { value: 'ABC-123' } })
    fireEvent.change(screen.getByLabelText(/comment/i), { target: { value: 'tidy up' } })
    fireEvent.click(screen.getByRole('button', { name: /^confirm$/i }))

    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalledOnce())
    const payload = (updateMutateAsync.mock.calls[0] as unknown as [Record<string, unknown>])[0]
    expect(payload['jiraTaskKey']).toBe('ABC-123')
    expect(payload['changeComment']).toBe('tidy up')
  })

  it('renders (Save button present) even when the API omits docs/artifactIds', () => {
    // Regression: the dirty-gate must never crash the whole page. Older CRS
    // images omit docs/artifactIds from ComponentDetailResponse; the TS type
    // says they're always arrays, but if the runtime payload disagrees the
    // gate must still render. (A previous version computed the gate by calling
    // buildUpdateRequest at render, which dereferenced component.docs.length
    // and blanked the entire /components/{id} page — caught by the E2E suite.)
    const user = makeUser(['ACCESS_COMPONENTS', 'CREATE_COMPONENTS'])
    const seeded = {
      ...baseComponent,
      docs: undefined,
      artifactIds: undefined,
    } as unknown as ComponentDetail
    renderPage(seeded, user)
    expect(screen.getByRole('button', { name: /save changes/i })).toBeDefined()
  })
})

describe('ComponentDetailPage — systems clear-all sends [] (guard removed; mirrors labels)', () => {
  // systems is now OPTIONAL server-side and mirrors labels exactly — the old
  // "system is required" block-save guard is gone. Clearing every system is a
  // valid user intent: the page now SENDS `systems: []` (explicit clear)
  // instead of blocking the save.

  it('component had systems + user removes them all via chips × → PATCH body contains systems: []', async () => {
    // Stub mimics the real GeneralTab + ChipsInput interaction: hydrate from
    // component.systems, then simulate the chip × path which calls setValue
    // with shouldDirty + shouldTouch. RHF's value-equality check keeps
    // dirty=false (final value [] == default []), but touchedFields.systems
    // flips to true — the signal handleSave's synth-dirty depends on (same
    // mechanism as the labels clear-all test below).
    vi.mocked(GeneralTab).mockImplementation(({ component, form }) => {
      useEffect(() => {
        form.setValue('systems', component.systems ?? [])
        form.setValue('systems', [], { shouldDirty: true, shouldTouch: true })
        form.setValue('displayName', component.displayName ?? '')
      }, [component, form])
      return React.createElement('div', { 'data-testid': 'general-tab-systems-cleared' })
    })
    const updateMutateAsync = vi.fn(() => Promise.resolve())
    const user = makeUser(['ACCESS_COMPONENTS', 'CREATE_COMPONENTS'])
    renderPage(baseComponent, user, { updateMutation: { mutateAsync: updateMutateAsync } })

    await waitFor(() => {
      expect(screen.getByTestId('general-tab-systems-cleared')).toBeDefined()
    })
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /save changes/i }) as HTMLButtonElement
      expect(btn.disabled).toBe(false)
    })
    await clickSaveAndConfirm()

    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalledOnce())
    const payload = (updateMutateAsync.mock.calls[0] as unknown as [Record<string, unknown>])[0]
    // The explicit `systems: []` clear must reach the wire — not undefined,
    // not absent. PATCH semantics: present-and-empty-array == REPLACE with
    // empty list.
    expect(payload['systems']).toEqual([])
  })

  it('systems hidden + a real edit elsewhere → save fires, systems omitted from the PATCH', async () => {
    // Hidden fields are never sent on the wire regardless of form state —
    // this is the same hidden-omit contract as every other GeneralTab field.
    mockedUseFieldConfigEntry.mockImplementation((path: string) => ({
      entry: path === 'component.system'
        ? { visibility: 'hidden' as const, required: false }
        : { visibility: 'editable' as const, required: false },
      isLoading: false,
      isError: false,
    }))
    // Stub exposes a button that makes a real visible edit (displayName) on
    // click — a user-driven setValue reliably flips RHF's isDirty (mirrors how
    // the real GeneralTab's registered inputs behave). systems is left at the
    // [] default to model the hidden-and-empty case.
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
    const user = makeUser(['ACCESS_COMPONENTS', 'CREATE_COMPONENTS'])
    renderPage(baseComponent, user, { updateMutation: { mutateAsync: updateMutateAsync } })

    // Make the edit, then wait for Save to enable before clicking it.
    fireEvent.click(screen.getByTestId('edit-display-name'))
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /save changes/i }) as HTMLButtonElement
      expect(btn.disabled).toBe(false)
    })
    await clickSaveAndConfirm()

    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalledOnce())
    const payload = (updateMutateAsync.mock.calls[0] as unknown as [Record<string, unknown>])[0]
    expect(payload['systems']).toBeUndefined()
  })
})

describe('ComponentDetailPage — labels clear-all sends [] (PR #44 follow-up: close RHF blind-spot)', () => {
  // The systems clear-all case (above) and the labels clear case both hit the
  // same RHF quirk: setValue('field', []) does NOT mark the field dirty when
  // the form default is also [], so `formState.dirtyFields.<field>` stays
  // false even after a user-driven clear-all. Both systems and labels are
  // OPTIONAL server-side, so both SEND `[]` (clear-all is a valid intent that
  // the previous code silently dropped because buildUpdateRequest's
  // `dirtyFields.<field> !== true` clause omitted the field).
  //
  // The fix synthesises a `dirtyFlags.<field>` from the server-vs-form value
  // compare and feeds that into buildUpdateRequest.

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
        // Hydrate systems too so it doesn't spuriously read as changed.
        form.setValue('systems', component.systems ?? [])
        form.setValue('displayName', component.displayName ?? '')
      }, [component, form])
      return React.createElement('div', { 'data-testid': 'general-tab-labels-cleared' })
    })
    const updateMutateAsync = vi.fn(() => Promise.resolve())
    const user = makeUser(['ACCESS_COMPONENTS', 'CREATE_COMPONENTS'])
    const seeded: ComponentDetail = { ...baseComponent, labels: ['backend', 'internal'] }
    renderPage(seeded, user, { updateMutation: { mutateAsync: updateMutateAsync } })

    await waitFor(() => {
      expect(screen.getByTestId('general-tab-labels-cleared')).toBeDefined()
    })
    await clickSaveAndConfirm()

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
    const user = makeUser(['ACCESS_COMPONENTS', 'CREATE_COMPONENTS'])
    const seeded: ComponentDetail = { ...baseComponent, labels: [] }
    renderPage(seeded, user, { updateMutation: { mutateAsync: updateMutateAsync } })

    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /save changes/i }) as HTMLButtonElement
      expect(btn.disabled).toBe(true)
    })
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))
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
    const user = makeUser(['ACCESS_COMPONENTS', 'CREATE_COMPONENTS'])
    const seeded: ComponentDetail = { ...baseComponent, labels: ['backend', 'internal'] }
    renderPage(seeded, user, { updateMutation: { mutateAsync: updateMutateAsync } })

    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /save changes/i }) as HTMLButtonElement
      expect(btn.disabled).toBe(true)
    })
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))
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
    const user = makeUser(['ACCESS_COMPONENTS', 'CREATE_COMPONENTS'])
    const seeded: ComponentDetail = { ...baseComponent, labels: ['backend'] }
    renderPage(seeded, user, { updateMutation: { mutateAsync: updateMutateAsync } })

    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /save changes/i }) as HTMLButtonElement
      expect(btn.disabled).toBe(true)
    })
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))
    // Disabled Save fires no handler, so no need to await: assert directly.
    expect(updateMutateAsync).not.toHaveBeenCalled()
  })

  it('a server 400 on `labels` surfaces inline in the header editor (not just a toast)', async () => {
    // Labels are edited in the always-visible header. Because `labels` is not a
    // GeneralTab field, the 400 handler must special-case it to form.setError so
    // HeaderLabelsEditor renders the message inline — otherwise the only surface
    // is a toast for a field the user is looking straight at.
    vi.mocked(GeneralTab).mockImplementation(({ component, form }) => {
      useEffect(() => {
        form.setValue('labels', component.labels ?? [])
        form.setValue('labels', ['x'], { shouldDirty: true, shouldTouch: true })
        form.setValue('systems', component.systems ?? [])
        form.setValue('displayName', component.displayName ?? '')
      }, [component, form])
      return React.createElement('div', { 'data-testid': 'general-tab' })
    })
    const updateMutateAsync = vi.fn(() =>
      Promise.reject(
        new ApiError(
          400,
          'Bad Request',
          JSON.stringify({ errorMessage: 'Validation failed: labels: too many labels' }),
        ),
      ),
    )
    const user = makeUser(['ACCESS_COMPONENTS', 'CREATE_COMPONENTS'])
    const seeded: ComponentDetail = { ...baseComponent, labels: [] }
    renderPage(seeded, user, { updateMutation: { mutateAsync: updateMutateAsync } })

    await clickSaveAndConfirm()
    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalledOnce())
    // Inline error is readable in the header without opening the popover.
    const err = await screen.findByText('too many labels')
    expect(err.id).toBe('header-labels-error')
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

describe('ComponentDetailPage — Copy button (CREATE_COMPONENTS gate)', () => {
  it('renders Copy for a user with CREATE_COMPONENTS and opens the dialog with the component id', async () => {
    const user = makeUser(['ACCESS_COMPONENTS', 'CREATE_COMPONENTS'])
    renderPage(baseComponent, user)

    const copyBtn = screen.getByRole('button', { name: /^create similar$/i })
    fireEvent.click(copyBtn)

    await waitFor(() => {
      expect(screen.getByTestId('copy-dialog').textContent).toBe('comp-1')
    })
  })

  it('hides Copy without CREATE_COMPONENTS', () => {
    const user = makeUser(['ACCESS_COMPONENTS'])
    renderPage(baseComponent, user)
    expect(screen.queryByRole('button', { name: /^create similar$/i })).toBeNull()
  })

  it('Copy is available even when per-component canEdit is false (global create gate, not canEdit)', () => {
    const user = makeUser(['ACCESS_COMPONENTS', 'CREATE_COMPONENTS'])
    renderPage({ ...baseComponent, canEdit: false }, user)
    expect(screen.getByRole('button', { name: /^create similar$/i })).toBeDefined()
  })
})

describe('ComponentDetailPage — cross-tab 400 + displayName clear', () => {
  it('auto-switches to the Misc tab when a 400 maps to a Misc-owned field', async () => {
    // GeneralTab stub hydrates displayName + exposes a dirty edit so Save enables.
    vi.mocked(GeneralTab).mockImplementation(({ component, form }) => {
      useEffect(() => {
        form.setValue('systems', component.systems ?? [])
        form.setValue('displayName', component.displayName ?? '')
      }, [component, form])
      return React.createElement(
        'button',
        { 'data-testid': 'edit', onClick: () => form.setValue('displayName', 'X', { shouldDirty: true }) },
        'edit',
      )
    })
    const mutateAsync = vi.fn(() =>
      Promise.reject(
        new ApiError(400, 'bad', JSON.stringify({ errorMessage: 'parentComponentName: invalid parent' })),
      ),
    )
    const user = makeUser(['ACCESS_COMPONENTS', 'CREATE_COMPONENTS'])
    renderPage({ ...baseComponent, canEdit: true }, user, { updateMutation: { mutateAsync } })

    fireEvent.click(screen.getByTestId('edit'))
    await clickSaveAndConfirm()

    await waitFor(() => expect(screen.getByTestId('misc-tab')).toBeDefined())
  })

  it('auto-switches to the Documentation tab when a 400 maps to a docs field', async () => {
    vi.mocked(GeneralTab).mockImplementation(({ component, form }) => {
      useEffect(() => {
        form.setValue('systems', component.systems ?? [])
        form.setValue('displayName', component.displayName ?? '')
      }, [component, form])
      return React.createElement(
        'button',
        { 'data-testid': 'edit', onClick: () => form.setValue('displayName', 'X', { shouldDirty: true }) },
        'edit',
      )
    })
    const mutateAsync = vi.fn(() =>
      Promise.reject(new ApiError(400, 'bad', JSON.stringify({ errorMessage: 'docs: invalid doc link' }))),
    )
    const user = makeUser(['ACCESS_COMPONENTS', 'CREATE_COMPONENTS'])
    renderPage({ ...baseComponent, canEdit: true }, user, { updateMutation: { mutateAsync } })

    fireEvent.click(screen.getByTestId('edit'))
    await clickSaveAndConfirm()

    // sectionForField('docs') → 'documentation'; the real DocumentationTab renders.
    await waitFor(() => expect(screen.getByText(/no documentation links configured/i)).toBeDefined())
  })

  it('auto-switches to the Docker tab when a 400 maps to a docker field', async () => {
    // Docker moved to its own tab — a dockerImages 400 must route there, not to
    // the (now docker-less) Distribution tab.
    vi.mocked(GeneralTab).mockImplementation(({ component, form }) => {
      useEffect(() => {
        form.setValue('systems', component.systems ?? [])
        form.setValue('displayName', component.displayName ?? '')
      }, [component, form])
      return React.createElement(
        'button',
        { 'data-testid': 'edit', onClick: () => form.setValue('displayName', 'X', { shouldDirty: true }) },
        'edit',
      )
    })
    const mutateAsync = vi.fn(() =>
      Promise.reject(new ApiError(400, 'bad', JSON.stringify({ errorMessage: 'dockerImages: invalid image name' }))),
    )
    const user = makeUser(['ACCESS_COMPONENTS', 'CREATE_COMPONENTS'])
    renderPage({ ...baseComponent, canEdit: true }, user, { updateMutation: { mutateAsync } })

    fireEvent.click(screen.getByTestId('edit'))
    await clickSaveAndConfirm()

    // sectionForField('dockerImages') → 'docker'; the Docker tab renders.
    await waitFor(() => expect(screen.getByTestId('docker-tab')).toBeDefined())
  })

  it('clearing displayName PATCHes it as "" (nullable — server clears to null, or 400s for explicit+external)', async () => {
    vi.mocked(GeneralTab).mockImplementation(({ component, form }) => {
      useEffect(() => {
        form.setValue('systems', component.systems ?? [])
        form.setValue('displayName', component.displayName ?? '')
      }, [component, form])
      return React.createElement(
        'button',
        {
          'data-testid': 'clear-dn',
          onClick: () => form.setValue('displayName', '', { shouldDirty: true, shouldTouch: true }),
        },
        'clear',
      )
    })
    const mutateAsync = vi.fn(() => Promise.resolve())
    const user = makeUser(['ACCESS_COMPONENTS', 'CREATE_COMPONENTS'])
    // baseComponent has a displayName ('My Component') and is not explicit+external, so a clear
    // is a valid edit: Save enables (dirty) and the PATCH carries displayName: "" (the server
    // stores null; an explicit+external component would be rejected with a 400 routed inline).
    renderPage({ ...baseComponent, canEdit: true }, user, { updateMutation: { mutateAsync } })

    fireEvent.click(screen.getByTestId('clear-dn'))
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /save changes/i }) as HTMLButtonElement
      expect(btn.disabled).toBe(false)
    })
    await clickSaveAndConfirm()
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledOnce())
    const payload = (mutateAsync.mock.calls[0] as unknown as [Record<string, unknown>])[0]
    expect(payload['displayName']).toBe('')
  })
})

describe('ComponentDetailPage — 409 conflict handling in the Review dialog', () => {
  function stubDirtyGeneralTab() {
    vi.mocked(GeneralTab).mockImplementation(({ component, form }) => {
      useEffect(() => {
        form.setValue('systems', component.systems ?? [])
        form.setValue('displayName', component.displayName ?? '')
      }, [component, form])
      return React.createElement(
        'button',
        { 'data-testid': 'edit', onClick: () => form.setValue('displayName', 'X', { shouldDirty: true }) },
        'edit',
      )
    })
  }

  it('a value conflict (UNIQUENESS_VIOLATION) keeps the dialog open and shows a persistent banner', async () => {
    stubDirtyGeneralTab()
    const serverMsg = 'Overlaps with existing override [1.4,1.5)'
    const mutateAsync = vi.fn(() =>
      Promise.reject(
        new ApiError(409, serverMsg, JSON.stringify({ errorMessage: serverMsg, errorCode: 'UNIQUENESS_VIOLATION' })),
      ),
    )
    const user = makeUser(['ACCESS_COMPONENTS', 'CREATE_COMPONENTS'])
    renderPage({ ...baseComponent, canEdit: true }, user, { updateMutation: { mutateAsync } })

    fireEvent.click(screen.getByTestId('edit'))
    await clickSaveAndConfirm()

    // Banner appears and the dialog stays open (Confirm still present) so the
    // user can fix the range and retry without losing the diff.
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(serverMsg))
    const confirm = screen.getByRole('button', { name: /^confirm$/i })
    expect(confirm).toBeInTheDocument()
    // Confirm is re-enabled so the user can fix the range and retry in place.
    expect(confirm).not.toBeDisabled()
  })

  it('an optimistic-lock conflict closes the dialog (stale diff) instead of showing a banner', async () => {
    stubDirtyGeneralTab()
    const mutateAsync = vi.fn(() =>
      Promise.reject(
        new ApiError(
          409,
          'stale',
          JSON.stringify({ errorMessage: 'expected version 3 but found 5', errorCode: 'OPTIMISTIC_LOCK' }),
        ),
      ),
    )
    const user = makeUser(['ACCESS_COMPONENTS', 'CREATE_COMPONENTS'])
    renderPage({ ...baseComponent, canEdit: true }, user, { updateMutation: { mutateAsync } })

    fireEvent.click(screen.getByTestId('edit'))
    await clickSaveAndConfirm()

    await waitFor(() => expect(screen.queryByRole('button', { name: /^confirm$/i })).toBeNull())
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('ComponentDetailPage — Validation Problems tab (admin gate + lookup by name)', () => {
  // A problem-bearing validation keyed by the COMPONENT NAME (`my-component`),
  // NOT the id (`comp-1`). The detail tab must look it up by name — the same
  // field the list overlay matches on — so an id != name component still shows
  // its problems (the discrepancy this rework fixes).
  function withProblems(versions: string[]): ComponentValidation {
    return {
      component: 'my-component',
      problems: [
        {
          type: 'UNREGISTERED_RELEASED_VERSIONS',
          severity: 'ERROR',
          message: `${versions.length} released version(s) not registered`,
          details: { versions, missingCount: versions.length },
        },
      ],
      checkFailed: false,
      checkError: null,
    } as unknown as ComponentValidation
  }

  // A check-failed validation (no problems) keyed by the component NAME. A
  // failed check is a SYSTEM condition (we could not verify), not a problem
  // with the component — it must NOT open a per-component Validation Problems
  // tab. It is surfaced once at report level on the list page instead.
  const checkFailedCv: ComponentValidation = {
    component: 'my-component',
    problems: [],
    checkFailed: true,
    checkError: 'RM returned 500',
  }

  it('renders a RED Validation Problems item (pinned at the top) for an admin when the component has problems, and shows the full versions list when selected', async () => {
    useAdminMode.setState({ enabled: true })
    const versions = ['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7']
    mockedUseValidationProblems.mockReturnValue(validationResult([withProblems(versions)]))
    const user = makeUser(['ACCESS_COMPONENTS', 'IMPORT_DATA'])
    renderPage(baseComponent, user)

    // The hook is enabled for an admin.
    expect(mockedUseValidationProblems).toHaveBeenCalledWith(true)

    const tab = screen.getByRole('tab', { name: /validation problems/i })
    expect(tab).toBeDefined()
    // Red styling applied to the trigger.
    expect(tab.className).toContain('text-destructive')
    // Pinned at the TOP of the sidebar (spec §2.1), i.e. the first tab.
    const tabs = within(screen.getByRole('tablist')).getAllByRole('tab')
    expect((tabs[0]!.textContent ?? '')).toMatch(/validation problems/i)

    // Selecting it shows the full versions list (untruncated). Radix Tabs ignore
    // plain fireEvent.click in jsdom (the trigger uses pointer-down/keyboard
    // semantics); userEvent simulates the full pointerdown → click → focus chain.
    await userEvent.setup().click(tab)
    await waitFor(() => {
      for (const v of versions) expect(screen.getByText(v)).toBeDefined()
    })
  })

  it('Copy versions (in the tab) copies the newline-joined version list to the clipboard', async () => {
    useAdminMode.setState({ enabled: true })
    const versions = ['v1', 'v2', 'v3']
    mockedUseValidationProblems.mockReturnValue(validationResult([withProblems(versions)]))
    const user = makeUser(['ACCESS_COMPONENTS', 'IMPORT_DATA'])
    renderPage(baseComponent, user)

    const ue = userEvent.setup()
    await ue.click(screen.getByRole('tab', { name: /validation problems/i }))
    const copyBtn = await screen.findByRole('button', { name: /copy versions/i })
    await ue.click(copyBtn)

    await waitFor(() => expect(mockedCopyToClipboard).toHaveBeenCalledWith(versions.join('\n')))
  })

  it('check-failed (no problems): does NOT render a Validation Problems tab (system failure is not a per-component problem)', () => {
    useAdminMode.setState({ enabled: true })
    mockedUseValidationProblems.mockReturnValue(validationResult([checkFailedCv]))
    const user = makeUser(['ACCESS_COMPONENTS', 'IMPORT_DATA'])
    renderPage(baseComponent, user)

    // No tab at all — and the raw exception text never reaches the UI.
    expect(screen.queryByRole('tab', { name: /validation problems/i })).toBeNull()
    expect(screen.queryByText('Check failed')).toBeNull()
    expect(screen.queryByText('RM returned 500')).toBeNull()
  })

  it('does NOT render the tab for an admin when the component is clean (not in report)', () => {
    useAdminMode.setState({ enabled: true })
    // Empty report (default in beforeEach) → component absent → no tab.
    const user = makeUser(['ACCESS_COMPONENTS', 'IMPORT_DATA'])
    renderPage(baseComponent, user)
    expect(screen.queryByRole('tab', { name: /validation problems/i })).toBeNull()
  })

  it('does NOT render the tab for an admin when the report entry has no issues', () => {
    useAdminMode.setState({ enabled: true })
    const cleanCv = {
      component: 'my-component',
      problems: [],
      checkFailed: false,
      checkError: null,
    } as unknown as ComponentValidation
    mockedUseValidationProblems.mockReturnValue(validationResult([cleanCv]))
    const user = makeUser(['ACCESS_COMPONENTS', 'IMPORT_DATA'])
    renderPage(baseComponent, user)
    expect(screen.queryByRole('tab', { name: /validation problems/i })).toBeNull()
  })

  it('does NOT render the tab when adminMode is off (even with IMPORT_DATA), and disables the fetch', () => {
    // adminMode defaults OFF (beforeEach). Provide a problem-bearing report to
    // prove the gate is admin, not data.
    mockedUseValidationProblems.mockReturnValue(validationResult([withProblems(['v1'])]))
    const user = makeUser(['ACCESS_COMPONENTS', 'IMPORT_DATA'])
    renderPage(baseComponent, user)
    expect(screen.queryByRole('tab', { name: /validation problems/i })).toBeNull()
    // Non-admin → hook gated disabled (no /portal/validation request).
    expect(mockedUseValidationProblems).toHaveBeenCalledWith(false)
  })

  it('does NOT render the tab for a non-IMPORT_DATA user even with adminMode on, and disables the fetch', () => {
    useAdminMode.setState({ enabled: true })
    mockedUseValidationProblems.mockReturnValue(validationResult([withProblems(['v1'])]))
    const user = makeUser(['ACCESS_COMPONENTS', 'CREATE_COMPONENTS'])
    renderPage(baseComponent, user)
    expect(screen.queryByRole('tab', { name: /validation problems/i })).toBeNull()
    expect(mockedUseValidationProblems).toHaveBeenCalledWith(false)
  })

  it('falls back to the General tab (no blank panel) when the selected Validation Problems tab disappears', async () => {
    // Regression (independent review P2): the Validation Problems tab is
    // conditional on hasProblems. If the admin selects it and hasProblems then
    // flips false (admin mode off / IMPORT_DATA lost / report refreshes clean),
    // the controlled Tabs `activeTab` still points at the now-removed tab and
    // the panel goes blank. The reset effect must move activeTab back to the
    // always-present 'general' tab. Here we drop hasProblems by flipping
    // adminMode off.
    //
    // `useAdminMode` is a Zustand store with a live subscription, so mutating it
    // in place re-renders the already-mounted tree — no `rerender()` (which would
    // replace the root and drop the QueryClientProvider, crashing
    // useOptimisticConflict with "No QueryClient set").
    useAdminMode.setState({ enabled: true })
    mockedUseValidationProblems.mockReturnValue(validationResult([withProblems(['v1', 'v2'])]))
    const user = makeUser(['ACCESS_COMPONENTS', 'IMPORT_DATA'])
    renderPage(baseComponent, user)

    // Select the conditional Validation Problems tab and confirm its content shows.
    const tab = screen.getByRole('tab', { name: /validation problems/i })
    await userEvent.setup().click(tab)
    await waitFor(() => expect(screen.getByText('v1')).toBeDefined())

    // hasProblems flips false: admin mode turned off. Mutate the store in place
    // (wrapped in act so the subscription-driven re-render + reset effect flush).
    act(() => {
      useAdminMode.setState({ enabled: false })
    })

    // The tab is gone …
    await waitFor(() =>
      expect(screen.queryByRole('tab', { name: /validation problems/i })).toBeNull(),
    )
    // … and the view falls back to General content — not a blank panel. The
    // General tab's content (the mocked GeneralTab) is visible, and the General
    // trigger is the selected tab.
    expect(screen.getByTestId('general-tab')).toBeDefined()
    expect(screen.getByRole('tab', { name: 'General' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    // No stale Validation-Problems content lingering.
    expect(screen.queryByText('v1')).toBeNull()
  })
})

describe('ComponentDetailPage — groupId/VCS-host Save gate', () => {
  const SAVE = { name: 'Save changes' } as const
  const user = makeUser(['ACCESS_COMPONENTS', 'CREATE_COMPONENTS'])
  const editable = { ...baseComponent, canEdit: true }

  function withMaven(groupPattern: string, artifactPattern: string): ComponentDetail {
    return {
      ...editable,
      configurations: [
        {
          ...baseComponent.configurations[0]!,
          mavenArtifacts: [
            { id: 'm1', groupPattern, artifactPattern, extension: null, classifier: null, sortOrder: 0 },
          ],
        },
      ],
    }
  }

  it('blocks Save when a maven Group ID lacks a supported prefix', () => {
    mockedUseSupportedGroups.mockReturnValue({ groups: ['com.acme'], isLoading: false })
    renderPage(withMaven('org.bad', 'svc'), user)
    const save = screen.getByRole('button', SAVE)
    expect(save).toBeDisabled()
    expect(save.parentElement).toHaveAttribute('title', 'Fix 1 distribution Group ID prefix before saving')
  })

  it('does NOT block on a half-filled maven row the request would drop (blank artifact)', () => {
    mockedUseSupportedGroups.mockReturnValue({ groups: ['com.acme'], isLoading: false })
    renderPage(withMaven('org.bad', ''), user)
    const save = screen.getByRole('button', SAVE)
    // Row is dropped by cleanMaven ⇒ not counted ⇒ the title falls back to the
    // dirty-gate reason, NOT the prefix reason.
    expect(save.parentElement).not.toHaveAttribute('title', 'Fix 1 distribution Group ID prefix before saving')
    expect(save.parentElement).toHaveAttribute('title', 'No changes to save')
  })

  it('blocks Save when a VCS entry host is not the ecosystem Bitbucket', () => {
    mockedUsePortalLinks.mockReturnValue({
      data: { jiraBaseUrl: null, gitBaseUrl: 'https://bitbucket.example.com', tcBaseUrl: null, dmsBaseUrl: null },
      isLoading: false,
      isError: false,
      error: null,
    } as unknown as ReturnType<typeof usePortalLinks>)
    const comp: ComponentDetail = {
      ...editable,
      configurations: [
        {
          ...baseComponent.configurations[0]!,
          vcsEntries: [{ id: 'e-1', name: 'main', vcsPath: 'ssh://git@github.com/r.git', sortOrder: 0 }],
        },
      ],
    }
    renderPage(comp, user)
    const save = screen.getByRole('button', SAVE)
    expect(save).toBeDisabled()
    expect(save.parentElement).toHaveAttribute('title', 'Fix 1 VCS host before saving')
  })
})
