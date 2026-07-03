import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect } from 'react'
import { ComponentDetailPage } from './ComponentDetailPage'
import type { User } from '@/lib/auth'
import type { ComponentDetail } from '@/lib/types'

// Mock only data hooks + the heavy/non-section tabs. CRITICALLY: BuildTab,
// VcsTab, DistributionTab, JiraTab, EscrowTab stay REAL so their section hooks
// run and contribute slices to the ONE combined PATCH — that is what this suite
// exercises (the whole point of Phase 3b).
vi.mock('../hooks/useCurrentUser', () => ({ useCurrentUser: vi.fn() }))
vi.mock('../hooks/useComponent', () => ({
  useComponent: vi.fn(),
  useUpdateComponent: vi.fn(),
  useDeleteComponent: vi.fn(),
  // item D: the page wrapper seeds OverridesDraftProvider from this; no overrides here.
  useFieldOverrides: vi.fn(() => ({ data: [] })),
}))
vi.mock('../hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock('../components/AppFooter', () => ({ AppFooter: () => <footer>footer</footer> }))
vi.mock('../hooks/useInfo', () => ({
  usePortalLinks: () => ({ data: undefined }),
  usePortalConfig: () => ({ data: undefined }),
  useCrsInfo: vi.fn(),
  usePortalInfo: () => ({ data: undefined }),
}))
// The always-rendered header labels editor calls useLabelsDictionary; mock it so
// the page test never fires a real api.get('/components/meta/labels/dictionary').
vi.mock('../hooks/useLabelsDictionary', () => ({
  useLabelsDictionary: () => ({ data: [], isLoading: false }),
}))
// Field-config: editable for everything (no network).
vi.mock('../hooks/useFieldConfig', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../hooks/useFieldConfig')>()
  return {
    ...actual,
    useFieldConfigEntry: () => ({ entry: { visibility: 'editable', required: false }, isLoading: false, isError: false }),
    useFieldConfigOptions: () => ({ options: [], isLoading: false }),
  }
})
vi.mock('../hooks/useAdminConfig', () => ({
  useFieldConfig: () => ({ data: undefined, isLoading: false, isError: false }),
}))
// GeneralTab stubbed (heavy deps) but real export of GENERAL_TAB_FIELDS kept.
vi.mock('../components/editor/GeneralTab', async () => {
  const actual = await vi.importActual<typeof import('../components/editor/GeneralTab')>('../components/editor/GeneralTab')
  return {
    ...actual,
    GeneralTab: vi.fn(({ component, form }) => {
      // Mirrors the real GeneralTab: hydrates server→form ONLY while mounted
      // (the inactive tab is unmounted by Radix Tabs). This is exactly the P1-1
      // hazard — if you navigate A→B from a non-General tab, GeneralTab never
      // mounts for B, so any hydration that lived only here would miss B.
      useEffect(() => {
        form.setValue('system', component.system ?? '')
        form.setValue('displayName', component.displayName ?? '')
        form.setValue('name', component.name)
        form.setValue('componentOwner', component.componentOwner ?? '')
        form.setValue('parentComponentName', component.parentComponentName ?? '')
      }, [component, form])
      return (
        <div>
          <button
            data-testid="edit-display-name"
            onClick={() => form.setValue('displayName', 'New General Name', { shouldDirty: true })}
          >
            edit general
          </button>
          <span data-testid="form-name">{form.watch('name')}</span>
          <span data-testid="form-owner">{form.watch('componentOwner')}</span>
        </div>
      )
    }),
  }
})
vi.mock('../components/editor/MiscTab', async () => {
  const actual = await vi.importActual<typeof import('../components/editor/MiscTab')>('../components/editor/MiscTab')
  return { ...actual, MiscTab: () => <div data-testid="misc-tab" /> }
})
vi.mock('../components/editor/FieldOverrideInline', () => ({ FieldOverrideInline: () => null }))
vi.mock('../components/editor/FieldOverrides', () => ({ FieldOverrides: () => <div /> }))
vi.mock('../components/editor/ComponentHistoryTab', () => ({ ComponentHistoryTab: () => <div /> }))
vi.mock('../components/editor/ConfigurationsTab', () => ({ ConfigurationsTab: () => <div /> }))
vi.mock('../components/editor/AsCodeTab', () => ({ AsCodeTab: () => <div /> }))
vi.mock('../components/editor/WhoCanEditPanel', () => ({ WhoCanEditPanel: () => <div /> }))
vi.mock('../components/CreateComponentDialog', () => ({ CreateComponentDialog: () => null }))
vi.mock('../hooks/useValidationProblems', () => ({
  useValidationProblems: () => ({ byComponent: new Map(), isLoading: false }),
}))
// EnumSelect → plain input so Build/Escrow selects need no field-option network.
vi.mock('../components/ui/EnumSelect', () => ({
  EnumSelect: ({ value, onValueChange, id, placeholder }: { value: string; onValueChange: (v: string) => void; id?: string; placeholder?: string }) => (
    <input id={id} data-testid={id ? `enum-${id}` : 'enum'} value={value} placeholder={placeholder} onChange={(e) => onValueChange(e.target.value)} />
  ),
}))

import { useCurrentUser } from '../hooks/useCurrentUser'
import { useComponent, useUpdateComponent, useDeleteComponent } from '../hooks/useComponent'
import { TooltipProvider } from '../components/ui/tooltip'
import { ApiError } from '../lib/api'

const baseComponent: ComponentDetail = {
  id: 'comp-1', name: 'my-component', displayName: 'My Component', componentOwner: 'alice',
  productType: null, system: 'SYS1', clientCode: null, archived: false, solution: false,
  parentComponentName: null, version: 9, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-02T00:00:00Z',
  labels: [], docs: [], artifactIds: [], securityGroups: [], teamcityProjects: [],
  canEdit: true,
  configurations: [
    {
      id: 'cfg-1', versionRange: '(,0),[0,)', rowType: 'BASE', overriddenAttribute: null, isSyntheticBase: false,
      build: { buildSystem: 'GRADLE', javaVersion: '17' }, escrow: null, jira: { projectKey: 'PROJ' },
      vcsEntries: [], mavenArtifacts: [], fileUrlArtifacts: [], dockerImages: [], packages: [], requiredTools: [],
    },
  ],
}

const idleMutation = {
  mutate: vi.fn(), mutateAsync: vi.fn(() => Promise.resolve()), reset: vi.fn(),
  isPending: false, isSuccess: false, isError: false, isIdle: true, data: undefined, error: null,
  status: 'idle' as const, variables: undefined, submittedAt: 0, failureCount: 0, failureReason: null,
  isPaused: false, context: undefined,
}

function makeUser(): User {
  return { username: 'u', roles: [{ name: 'R', permissions: ['ACCESS_COMPONENTS', 'CREATE_COMPONENTS'] }], groups: [] }
}

function renderPage(component: ComponentDetail, mutateAsync = vi.fn(() => Promise.resolve())) {
  vi.mocked(useCurrentUser).mockReturnValue({ data: makeUser(), isLoading: false, isError: false, error: null, refetch: vi.fn() } as unknown as ReturnType<typeof useCurrentUser>)
  vi.mocked(useComponent).mockReturnValue({ data: component, isLoading: false, error: null } as unknown as ReturnType<typeof useComponent>)
  vi.mocked(useUpdateComponent).mockReturnValue({ ...idleMutation, mutateAsync } as unknown as ReturnType<typeof useUpdateComponent>)
  vi.mocked(useDeleteComponent).mockReturnValue({ ...idleMutation } as unknown as ReturnType<typeof useDeleteComponent>)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(
    [
      { path: '/components', element: <div data-testid="list-page" /> },
      { path: '/components/:id', element: <ComponentDetailPage /> },
    ],
    { initialEntries: ['/components/comp-1'] },
  )
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <RouterProvider router={router} />
      </TooltipProvider>
    </QueryClientProvider>,
  )
}

async function openTab(name: RegExp) {
  await userEvent.setup().click(screen.getByRole('tab', { name }))
}

beforeEach(() => vi.clearAllMocks())

describe('ComponentDetailPage — combined PATCH (Phase 3b)', () => {
  it('fires ONE PATCH with a single version, merging General + Build slices', async () => {
    const mutateAsync = vi.fn(() => Promise.resolve())
    renderPage(baseComponent, mutateAsync)

    // Edit General (display name) via the stub.
    fireEvent.click(screen.getByTestId('edit-display-name'))
    // Edit Build (java version) via the real BuildTab.
    await openTab(/^Build/)
    const java = screen.getByTestId('enum-build-javaVersion')
    fireEvent.change(java, { target: { value: '21' } })

    // Save changes → Review dialog → Confirm.
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))
    const confirm = await screen.findByRole('button', { name: /^confirm$/i })
    fireEvent.click(confirm)

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledOnce())
    const body = (mutateAsync.mock.calls[0] as unknown as [Record<string, unknown>])[0]
    // ONE version, from the page snapshot.
    expect(body.version).toBe(9)
    // General slice merged.
    expect(body.displayName).toBe('New General Name')
    // Build slice merged into baseConfiguration.build (java edit + preserved buildSystem).
    const bc = body.baseConfiguration as { build?: Record<string, unknown> }
    expect(bc.build?.javaVersion).toBe('21')
    expect(bc.build?.buildSystem).toBe('GRADLE')
  })

  it('does not clobber a Build edit when General is also edited (no reset-loop)', async () => {
    const mutateAsync = vi.fn(() => Promise.resolve())
    renderPage(baseComponent, mutateAsync)

    // Edit Build first.
    await openTab(/^Build/)
    fireEvent.change(screen.getByTestId('enum-build-javaVersion'), { target: { value: '21' } })
    // Then edit General.
    await openTab(/^General/)
    fireEvent.click(screen.getByTestId('edit-display-name'))

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))
    fireEvent.click(await screen.findByRole('button', { name: /^confirm$/i }))

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledOnce())
    const body = (mutateAsync.mock.calls[0] as unknown as [{ baseConfiguration?: { build?: Record<string, unknown> }; displayName?: string }])[0]
    // Both edits survived into the single body.
    expect(body.displayName).toBe('New General Name')
    expect(body.baseConfiguration?.build?.javaVersion).toBe('21')
  })

  it('survives section unmount: edit Build, switch to VCS and back, edit persists', async () => {
    // Radix Tabs unmount inactive TabsContent. Because the draft lives in
    // page-level section hooks (not in the tab components' own useState),
    // switching away and back must NOT lose the Build edit.
    renderPage(baseComponent)
    await openTab(/^Build/)
    fireEvent.change(screen.getByTestId('enum-build-javaVersion'), { target: { value: '21' } })
    await openTab(/^VCS/)
    // Build content is now unmounted (its input is gone from the DOM).
    expect(screen.queryByTestId('enum-build-javaVersion')).toBeNull()
    await openTab(/^Build/)
    // On remount the input shows the still-held draft value, not the server '17'.
    expect((screen.getByTestId('enum-build-javaVersion') as HTMLInputElement).value).toBe('21')
    // And the dirty bar is still showing unsaved.
    expect(screen.getByText('Unsaved changes')).toBeDefined()
  })

  it('Build + Escrow both writing baseConfiguration.build merge (neither dropped)', async () => {
    // Build and Escrow are NOT disjoint subtrees — both contribute to
    // baseConfiguration.build (Build: buildSystem/versions; Escrow: buildTasks/
    // deprecated/…). The composer must DEEP-merge, not Object.assign whole
    // subtrees. Edit one field in each, assert the single PATCH carries BOTH.
    const mutateAsync = vi.fn(() => Promise.resolve())
    renderPage(baseComponent, mutateAsync)

    await openTab(/^Build/)
    fireEvent.change(screen.getByTestId('enum-build-javaVersion'), { target: { value: '21' } })
    await openTab(/^Escrow/)
    fireEvent.change(screen.getByPlaceholderText('clean install / assemble'), { target: { value: 'assemble' } })

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))
    fireEvent.click(await screen.findByRole('button', { name: /^confirm$/i }))

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledOnce())
    const body = (mutateAsync.mock.calls[0] as unknown as [{ baseConfiguration?: { build?: Record<string, unknown> } }])[0]
    const build = body.baseConfiguration?.build
    // Build's edit + Escrow's edit + Build's preserved buildSystem all present.
    expect(build?.javaVersion).toBe('21') // Build slice
    expect(build?.buildTasks).toBe('assemble') // Escrow slice
    expect(build?.buildSystem).toBe('GRADLE') // Build slice (preserved)
  })

  it('Review dialog lists changed fields old → new', async () => {
    renderPage(baseComponent)
    await openTab(/^Build/)
    fireEvent.change(screen.getByTestId('enum-build-javaVersion'), { target: { value: '21' } })
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/Java Version/)).toBeDefined()
    expect(within(dialog).getByText('17')).toBeDefined()
    expect(within(dialog).getByText('21')).toBeDefined()
  })

  // P1-3: required Build System guard must be wired into the page Save path.
  // Clearing the required Build System then Save must NOT open Review / fire a
  // PATCH; it must switch to Build and surface the inline required error.
  it('blocks Save + Review when the required Build System is cleared (P1-3)', async () => {
    const mutateAsync = vi.fn(() => Promise.resolve())
    renderPage(baseComponent, mutateAsync)
    await openTab(/^Build/)
    // Clear the required Build System (also makes the section dirty → Save shown).
    fireEvent.change(screen.getByTestId('enum-build-buildSystem'), { target: { value: '' } })
    await waitFor(() => expect(screen.getByText('Unsaved changes')).toBeDefined())

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

    // Review must NOT open and no PATCH fires.
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(mutateAsync).not.toHaveBeenCalled()
    // Stays on / switches to Build and surfaces the inline required error.
    await waitFor(() => expect(screen.getByRole('tab', { name: /^Build/ })).toHaveAttribute('aria-current', 'page'))
    expect(screen.getByText(/Build System is required/i)).toBeDefined()
  })

  it('Review dialog flags a cleared build scalar as a no-op', async () => {
    renderPage(baseComponent)
    await openTab(/^Build/)
    fireEvent.change(screen.getByTestId('enum-build-javaVersion'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('(clearing not supported)')).toBeDefined()
  })

  it('Discard reverts a Build edit and clears the dirty bar', async () => {
    renderPage(baseComponent)
    await openTab(/^Build/)
    const java = screen.getByTestId('enum-build-javaVersion') as HTMLInputElement
    fireEvent.change(java, { target: { value: '21' } })
    await waitFor(() => expect(screen.getByText('Unsaved changes')).toBeDefined())
    fireEvent.click(screen.getByRole('button', { name: /discard/i }))
    await waitFor(() => expect(screen.getByText('All changes saved')).toBeDefined())
    expect((screen.getByTestId('enum-build-javaVersion') as HTMLInputElement).value).toBe('17')
  })

  it('shows the dirty bar only after a real edit', async () => {
    renderPage(baseComponent)
    expect(screen.getByText('All changes saved')).toBeDefined()
    fireEvent.click(screen.getByTestId('edit-display-name'))
    await waitFor(() => expect(screen.getByText('Unsaved changes')).toBeDefined())
  })

  it('renders the completeness % in the header subline', () => {
    renderPage(baseComponent)
    // name + displayName + owner + jira projectKey + buildSystem present (5/6) → 83%.
    expect(screen.getByText(/Profile 83% complete/)).toBeDefined()
  })

  it('subline shows Owner and Version', () => {
    renderPage(baseComponent)
    expect(screen.getByText(/Owner alice/)).toBeDefined()
    expect(screen.getByText(/Version 9/)).toBeDefined()
  })

  it('closes the review dialog on a 409 conflict (no re-confirm loop)', async () => {
    const mutateAsync = vi.fn(() =>
      Promise.reject(new ApiError(409, 'conflict', JSON.stringify({ errorCode: 'OPTIMISTIC_LOCK', errorMessage: 'stale' }))),
    )
    renderPage(baseComponent, mutateAsync)
    await openTab(/^Build/)
    fireEvent.change(screen.getByTestId('enum-build-javaVersion'), { target: { value: '21' } })
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))
    fireEvent.click(await screen.findByRole('button', { name: /^confirm$/i }))
    // After the 409, the Review dialog must be gone (the bar still shows dirty).
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByText('Unsaved changes')).toBeDefined()
  })

  it('a 400 on a section field switches to that section and closes the dialog', async () => {
    const mutateAsync = vi.fn(() =>
      Promise.reject(new ApiError(400, 'bad', JSON.stringify({ errorMessage: 'jiraProjectKey: invalid' }))),
    )
    renderPage(baseComponent, mutateAsync)
    await openTab(/^Build/)
    fireEvent.change(screen.getByTestId('enum-build-javaVersion'), { target: { value: '21' } })
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))
    fireEvent.click(await screen.findByRole('button', { name: /^confirm$/i }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    // Switched to the Jira section (the offending field's owner).
    await waitFor(() => expect(screen.getByRole('tab', { name: /^Jira/ })).toHaveAttribute('aria-current', 'page'))
  })

  // NOTE on acceptance #3 (a successful save re-seeds the snapshot AND clears
  // dirty — no phantom dirty): the post-save re-seed lives in the section
  // snapshot engine and is verified at the hook level in useBuildSection.test.ts
  // ("clears dirty when the saved component arrives matching the draft"). It
  // can't be driven here because the data router memoises the route element, so
  // re-rendering the page tree does not re-invoke ComponentDetailPage with the
  // updated useComponent mock (only navigation / react-query updates do). #1
  // (no clobber on a sibling query update) is likewise hook-tested.

  // Acceptance #2: Discard restores the unified snapshot across BOTH the RHF
  // General fields and a section hook (not just one section).
  it('Discard restores every section — General (RHF) and Build — to the server snapshot', async () => {
    renderPage(baseComponent)

    // Edit General (RHF displayName via the stub) and Build (section hook).
    fireEvent.click(screen.getByTestId('edit-display-name'))
    await openTab(/^Build/)
    fireEvent.change(screen.getByTestId('enum-build-javaVersion'), { target: { value: '21' } })
    await waitFor(() => expect(screen.getByText('Unsaved changes')).toBeDefined())

    fireEvent.click(screen.getByRole('button', { name: /discard/i }))
    await waitFor(() => expect(screen.getByText('All changes saved')).toBeDefined())

    // Build reverted to the server value.
    expect((screen.getByTestId('enum-build-javaVersion') as HTMLInputElement).value).toBe('17')
    // And no dirty remains anywhere (General RHF reverted too — otherwise the bar
    // would still read "Unsaved changes").
    expect(screen.queryByText('Unsaved changes')).toBeNull()
  })

  // Acceptance #4: navigating to a DIFFERENT component id starts a FRESH draft —
  // no draft/dirty leakage from the previous component, even if the previous one
  // was dirty when we left.
  it('navigating to a different component id starts a fresh, clean draft (no leak)', async () => {
    // comp-2 has a different java version + display name so a leak is detectable.
    const compTwo: ComponentDetail = {
      ...baseComponent,
      id: 'comp-2',
      name: 'other-component',
      displayName: 'Other Component',
      version: 3,
      configurations: [
        {
          id: 'cfg-2', versionRange: '(,0),[0,)', rowType: 'BASE', overriddenAttribute: null, isSyntheticBase: false,
          build: { buildSystem: 'MAVEN', javaVersion: '11' }, escrow: null, jira: { projectKey: 'OTHER' },
          vcsEntries: [], mavenArtifacts: [], fileUrlArtifacts: [], dockerImages: [], packages: [], requiredTools: [],
        },
      ],
    }
    // useComponent resolves per-id so navigation swaps the data.
    vi.mocked(useComponent).mockImplementation(
      ((wanted: string) =>
        ({ data: wanted === 'comp-2' ? compTwo : baseComponent, isLoading: false, error: null }) as unknown) as typeof useComponent,
    )
    vi.mocked(useCurrentUser).mockReturnValue({ data: makeUser(), isLoading: false, isError: false, error: null, refetch: vi.fn() } as unknown as ReturnType<typeof useCurrentUser>)
    vi.mocked(useUpdateComponent).mockReturnValue({ ...idleMutation } as unknown as ReturnType<typeof useUpdateComponent>)
    vi.mocked(useDeleteComponent).mockReturnValue({ ...idleMutation } as unknown as ReturnType<typeof useDeleteComponent>)

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const router = createMemoryRouter(
      [
        { path: '/components', element: <div data-testid="list-page" /> },
        { path: '/components/:id', element: <ComponentDetailPage /> },
      ],
      { initialEntries: ['/components/comp-1'] },
    )
    render(
      <QueryClientProvider client={client}>
        <TooltipProvider>
          <RouterProvider router={router} />
        </TooltipProvider>
      </QueryClientProvider>,
    )

    // Dirty comp-1's Build draft.
    await openTab(/^Build/)
    fireEvent.change(screen.getByTestId('enum-build-javaVersion'), { target: { value: '99' } })
    await waitFor(() => expect(screen.getByText('Unsaved changes')).toBeDefined())

    // Navigate to comp-2. The UnsavedChangesGuard blocks (dirty) and shows the
    // confirm dialog; the user confirms "Leave without saving".
    void router.navigate('/components/comp-2')
    const leave = await screen.findByRole('button', { name: /leave without saving/i })
    fireEvent.click(leave)

    // comp-2 renders with ITS data, CLEAN — no leak of comp-1's '99'.
    await waitFor(() => expect(screen.getByText('other-component')).toBeDefined())
    await openTab(/^Build/)
    expect((screen.getByTestId('enum-build-javaVersion') as HTMLInputElement).value).toBe('11')
    expect(screen.getByText('All changes saved')).toBeDefined()
    expect(screen.queryByText('Unsaved changes')).toBeNull()
  })

  // P1-1: the General/Misc RHF form must re-hydrate on component-id change even
  // when GeneralTab is UNMOUNTED at navigation time. Navigate A→B while sitting
  // on the Build tab (General never mounts for A's tail or B's head until we open
  // it) — General must show B's name/owner, the bar must be clean, and the
  // would-be PATCH must NOT carry A's name (no spurious rename B→A).
  it('re-hydrates the RHF form on id change when navigating from a non-General tab (P1-1)', async () => {
    const compTwo: ComponentDetail = {
      ...baseComponent,
      id: 'comp-2',
      name: 'other-component',
      displayName: 'Other Component',
      componentOwner: 'bob',
      version: 3,
      configurations: [
        {
          id: 'cfg-2', versionRange: '(,0),[0,)', rowType: 'BASE', overriddenAttribute: null, isSyntheticBase: false,
          build: { buildSystem: 'MAVEN', javaVersion: '11' }, escrow: null, jira: { projectKey: 'OTHER' },
          vcsEntries: [], mavenArtifacts: [], fileUrlArtifacts: [], dockerImages: [], packages: [], requiredTools: [],
        },
      ],
    }
    const patchSpy = vi.fn(() => Promise.resolve())
    vi.mocked(useComponent).mockImplementation(
      ((wanted: string) =>
        ({ data: wanted === 'comp-2' ? compTwo : baseComponent, isLoading: false, error: null }) as unknown) as typeof useComponent,
    )
    vi.mocked(useCurrentUser).mockReturnValue({ data: makeUser(), isLoading: false, isError: false, error: null, refetch: vi.fn() } as unknown as ReturnType<typeof useCurrentUser>)
    vi.mocked(useUpdateComponent).mockReturnValue({ ...idleMutation, mutateAsync: patchSpy } as unknown as ReturnType<typeof useUpdateComponent>)
    vi.mocked(useDeleteComponent).mockReturnValue({ ...idleMutation } as unknown as ReturnType<typeof useDeleteComponent>)

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const router = createMemoryRouter(
      [
        { path: '/components', element: <div data-testid="list-page" /> },
        { path: '/components/:id', element: <ComponentDetailPage /> },
      ],
      { initialEntries: ['/components/comp-1'] },
    )
    render(
      <QueryClientProvider client={client}>
        <TooltipProvider>
          <RouterProvider router={router} />
        </TooltipProvider>
      </QueryClientProvider>,
    )

    // Move OFF General to Build so GeneralTab is unmounted, then navigate A→B.
    // (No edit — a clean navigation; the only risk is the page form keeping A's
    // identity fields because GeneralTab's mount-effect never ran for B.)
    await openTab(/^Build/)
    await router.navigate('/components/comp-2')
    await waitFor(() => expect(screen.getByText('other-component')).toBeDefined())

    // The bar must be clean — a stale A-name in the form would build a patch with
    // name:'my-component' against B and read dirty.
    expect(screen.getByText('All changes saved')).toBeDefined()
    expect(screen.queryByText('Unsaved changes')).toBeNull()

    // Open General: it must show B's identity, not A's leaked values.
    await openTab(/^General/)
    expect(screen.getByTestId('form-name').textContent).toBe('other-component')
    expect(screen.getByTestId('form-owner').textContent).toBe('bob')

    // And a save would NOT propose renaming B→A.
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))
    // Bar is clean, so Save is a no-op (review won't open / nothing to confirm).
    expect(screen.queryByRole('button', { name: /^confirm$/i })).toBeNull()
    expect(patchSpy).not.toHaveBeenCalled()
  })
})
