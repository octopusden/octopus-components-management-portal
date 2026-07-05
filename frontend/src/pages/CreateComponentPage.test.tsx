import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { CreateComponentPage } from './CreateComponentPage'
import { ApiError } from '../lib/api'
import { TooltipProvider } from '../components/ui/tooltip'
import type { ComponentDetail } from '../lib/types'

// ── mocks ───────────────────────────────────────────────────────────────────
const mockMutateAsync = vi.fn()
const mockUseComponent = vi.fn()
vi.mock('../hooks/useComponent', () => ({
  useComponent: (id: string) => mockUseComponent(id),
  useCreateComponent: vi.fn(() => ({ mutateAsync: mockMutateAsync, isPending: false })),
}))

vi.mock('../hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }))

const mockLookupEmployee = vi.hoisted(() => vi.fn())
vi.mock('../hooks/useFieldOptions', () => ({
  useFieldOptions: vi.fn((fieldPath: string) =>
    fieldPath === 'generation'
      ? { options: ['AUTO', 'MANUAL'], isLoading: false }
      : { options: ['MAVEN', 'GRADLE', 'BS2_0', 'PROVIDED'], isLoading: false },
  ),
}))
const mockUseSupportedGroups = vi.fn(() => ({ groups: [] as string[], isLoading: false }))
vi.mock('../hooks/useSupportedGroups', () => ({ useSupportedGroups: () => mockUseSupportedGroups() }))
const mockUsePortalLinks = vi.fn(() => ({ data: undefined as unknown }))
const mockUsePortalConfig = vi.fn(() => ({ data: { solutionKeyPatterns: ['-solution', 'dmp-bundle'] } as unknown }))
vi.mock('../hooks/useInfo', () => ({
  usePortalLinks: () => mockUsePortalLinks(),
  usePortalConfig: () => mockUsePortalConfig(),
}))
vi.mock('../hooks/useEmployees', () => ({
  lookupEmployee: mockLookupEmployee,
  useEmployeeStatuses: vi.fn(() => ({ data: {} })),
}))
const mockUseFieldConfig = vi.fn(() => ({ data: undefined as unknown, isLoading: false, isError: false }))
const COMPONENT_DEFAULTS_OK = {
  data: { vcs: { tag: '$module-$version' } } as unknown,
  isSuccess: true,
  isError: false,
  isLoading: false,
}
const mockUseComponentDefaults = vi.fn(() => COMPONENT_DEFAULTS_OK)
vi.mock('../hooks/useAdminConfig', () => ({
  useFieldConfig: () => mockUseFieldConfig(),
  useComponentDefaults: () => mockUseComponentDefaults(),
}))
const mockUseCurrentUser = vi.fn(() => ({ data: undefined as unknown, isLoading: false }))
vi.mock('../hooks/useCurrentUser', () => ({ useCurrentUser: () => mockUseCurrentUser() }))
// Layout pulls the nav shell + its own queries; stub to a passthrough.
vi.mock('../components/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'layout' }, children),
}))
// Expose the guard's `when` signal so a test can assert whether navigation would
// be blocked, without wiring up a real useBlocker round-trip.
vi.mock('../components/editor/UnsavedChangesGuard', () => ({
  UnsavedChangesGuard: ({ when }: { when: boolean }) =>
    React.createElement('div', { 'data-testid': 'unsaved-guard', 'data-when': String(when) }),
}))

function makeSource(overrides: Partial<ComponentDetail> = {}): ComponentDetail {
  return {
    id: 'c-1',
    name: 'svc-alpha',
    displayName: 'Service Alpha',
    componentOwner: 'alice',
    productType: null,
    systems: ['SYS1'],
    clientCode: null,
    archived: false,
    solution: null,
    parentComponentName: null,
    version: 1,
    createdAt: null,
    updatedAt: null,
    labels: ['backend'],
    docs: [],
    artifactIds: [],
    securityGroups: [],
    teamcityProjects: [],
    releaseManager: [],
    securityChampion: [],
    distributionExplicit: false,
    distributionExternal: true,
    configurations: [
      {
        id: 'cfg-base',
        versionRange: '(,0),[0,)',
        rowType: 'BASE',
        overriddenAttribute: null,
        isSyntheticBase: false,
        build: { buildSystem: 'GRADLE' },
        escrow: null,
        jira: null,
        vcsEntries: [],
        mavenArtifacts: [],
        fileUrlArtifacts: [],
        dockerImages: [],
        packages: [],
        requiredTools: [],
      },
    ],
    ...overrides,
  }
}

function renderWizard(initialEntry = '/components/new') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(
    [
      { path: '/components', element: <div data-testid="list-page" /> },
      { path: '/components/new', element: <CreateComponentPage /> },
      { path: '/components/:id', element: <div data-testid="detail-page" /> },
    ],
    { initialEntries: [initialEntry] },
  )
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <RouterProvider router={router} />
      </TooltipProvider>
    </QueryClientProvider>,
  )
}

async function commitOwner(owner = 'alice') {
  const input = screen.getByPlaceholderText('AD userkey')
  await userEvent.type(input, owner)
  fireEvent.blur(input)
  await waitFor(() => expect(mockLookupEmployee).toHaveBeenCalledWith(owner))
  await waitFor(() => expect(screen.queryByText('Validating person...')).toBeNull())
}

const clickNext = async () => userEvent.click(screen.getByRole('button', { name: /^next$/i }))

beforeEach(() => {
  mockMutateAsync.mockReset()
  mockMutateAsync.mockResolvedValue({ id: 'new-id', name: 'widget' })
  mockLookupEmployee.mockReset()
  mockLookupEmployee.mockImplementation(async (query: string) => [{ username: query.trim(), active: true }])
  mockUseComponent.mockReset()
  mockUseComponent.mockReturnValue({ data: undefined, isLoading: false, error: null })
  mockUseFieldConfig.mockReturnValue({ data: undefined, isLoading: false, isError: false })
  mockUseComponentDefaults.mockReturnValue(COMPONENT_DEFAULTS_OK)
  mockUseSupportedGroups.mockReturnValue({ groups: [], isLoading: false })
  mockUsePortalLinks.mockReturnValue({ data: undefined })
  mockUsePortalConfig.mockReturnValue({ data: { solutionKeyPatterns: ['-solution', 'dmp-bundle'] } })
  mockUseCurrentUser.mockReturnValue({ data: undefined, isLoading: false })
})

describe('CreateComponentPage — scratch profile gate', () => {
  it('opens on the Profile step and blocks Next until a profile is chosen', async () => {
    renderWizard()
    expect(screen.getByText('Create component')).toBeDefined()
    expect(screen.getByText('Choose component profile')).toBeDefined()
    // Next is disabled with no profile selected.
    expect((screen.getByRole('button', { name: /^next$/i }) as HTMLButtonElement).disabled).toBe(true)
    await userEvent.click(screen.getByRole('radio', { name: /Regular internal component/i }))
    // Regular profiles ask the explicit-distribution question.
    expect(screen.getByText('Has explicit distribution?')).toBeDefined()
    expect((screen.getByRole('button', { name: /^next$/i }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('cannot bypass the Profile gate via the stepper — Create stays disabled with no profile chosen', async () => {
    renderWizard()
    // No profile selected. Jump straight to the Review step via the stepper.
    await userEvent.click(screen.getByRole('button', { name: /Review & create/i }))
    // Even after entering a valid Jira task key, Create must stay disabled while
    // the scratch profile is unchosen (and required fields are empty).
    await userEvent.type(screen.getByLabelText(/Jira task key/i), 'ABC-1')
    expect(
      (screen.getByRole('button', { name: /^create component$/i }) as HTMLButtonElement).disabled,
    ).toBe(true)
    expect(mockMutateAsync).not.toHaveBeenCalled()
  })

  it('a solution key that lacks "-solution" is rejected for the Solution profile', async () => {
    renderWizard()
    await userEvent.click(screen.getByRole('radio', { name: /^Solution$/i }))
    await clickNext()
    await userEvent.type(screen.getByPlaceholderText('my-component'), 'widget')
    await waitFor(() => expect(screen.getByText(/must contain "-solution"/i)).toBeDefined())
  })
})

describe('CreateComponentPage — scratch create flow', () => {
  it('walks the steps and POSTs a from-scratch payload, then navigates to the new component', async () => {
    renderWizard()
    // Profile: regular internal, implicit distribution (not gated).
    await userEvent.click(screen.getByRole('radio', { name: /Regular internal component/i }))
    await clickNext()

    // General
    await userEvent.type(screen.getByPlaceholderText('my-component'), 'widget')
    await commitOwner('alice')
    await clickNext()

    // Build — PROVIDED is VCS-exempt, keeping the flow minimal.
    await userEvent.selectOptions(screen.getByLabelText(/^Build System/i), 'PROVIDED')
    await clickNext()

    // VCS — note only, nothing required.
    expect(screen.getByText(/No VCS root required for PROVIDED/i)).toBeDefined()
    await clickNext()

    // Jira
    await userEvent.type(screen.getByLabelText(/^Jira Project Key/i), 'WIDG')
    await clickNext()

    // Distribution — not gated, Docker only.
    await clickNext()

    // Escrow — Generation only; optional, nothing required.
    await clickNext()

    // Review — Jira task key required.
    const createBtn = screen.getByRole('button', { name: /^create component$/i })
    expect((createBtn as HTMLButtonElement).disabled).toBe(true)
    await userEvent.type(screen.getByLabelText(/^Jira task key/i), 'ABC-123')
    expect((createBtn as HTMLButtonElement).disabled).toBe(false)
    await userEvent.click(createBtn)

    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1))
    const payload = mockMutateAsync.mock.calls[0]![0]
    expect(payload.name).toBe('widget')
    expect(payload.baseConfiguration.build.buildSystem).toBe('PROVIDED')
    expect(payload.distributionExternal).toBe(false)
    expect(payload.distributionExplicit).toBe(false)
    expect(payload.solution).toBe(false)
    expect(payload.jiraTaskKey).toBe('ABC-123')
    await waitFor(() => expect(screen.getByTestId('detail-page')).toBeDefined())
  })

  it('routes a save-time 409 Produced-Artifacts conflict to the Build step', async () => {
    mockMutateAsync.mockRejectedValueOnce(
      new ApiError(409, 'conflict', JSON.stringify({ errorMessage: 'artifactIds: already owned by another component' })),
    )
    renderWizard()
    await userEvent.click(screen.getByRole('radio', { name: /Regular internal component/i }))
    await clickNext()
    await userEvent.type(screen.getByPlaceholderText('my-component'), 'widget')
    await commitOwner('alice')
    await clickNext()
    await userEvent.selectOptions(screen.getByLabelText(/^Build System/i), 'PROVIDED')
    await clickNext()
    await clickNext() // VCS note
    await userEvent.type(screen.getByLabelText(/^Jira Project Key/i), 'WIDG')
    await clickNext()
    await clickNext() // Distribution
    await clickNext() // Escrow
    await userEvent.type(screen.getByLabelText(/^Jira task key/i), 'ABC-123')
    await userEvent.click(screen.getByRole('button', { name: /^create component$/i }))
    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1))
    // A 409 ownership conflict lands the user on the Build step (Produced
    // Artifacts lives there), not the Review step — the "Add one more groupId"
    // control is Build-specific.
    await waitFor(() => expect(screen.getByRole('button', { name: /Add one more groupId/i })).toBeDefined())
  })

  it('marks the current step invalid (not active) after a save-time conflict routes to it', async () => {
    // Regression guard for the rail's invalid-over-active precedence: a step can be
    // both current AND invalid once a Create attempt fails (here a 409 routes to
    // Build). `data-status` must read "invalid", not "active", or the error is
    // invisible to CSS/AT while the user sits on the offending step.
    mockMutateAsync.mockRejectedValueOnce(
      new ApiError(409, 'conflict', JSON.stringify({ errorMessage: 'artifactIds: already owned by another component' })),
    )
    renderWizard()
    await userEvent.click(screen.getByRole('radio', { name: /Regular internal component/i }))
    await clickNext()
    await userEvent.type(screen.getByPlaceholderText('my-component'), 'widget')
    await commitOwner('alice')
    await clickNext()
    await userEvent.selectOptions(screen.getByLabelText(/^Build System/i), 'PROVIDED')
    await clickNext()
    await clickNext() // VCS note
    await userEvent.type(screen.getByLabelText(/^Jira Project Key/i), 'WIDG')
    await clickNext()
    await clickNext() // Distribution
    await clickNext() // Escrow
    await userEvent.type(screen.getByLabelText(/^Jira task key/i), 'ABC-123')
    await userEvent.click(screen.getByRole('button', { name: /^create component$/i }))
    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1))
    const buildStep = await screen.findByRole('button', { name: 'Build' })
    // Prove the conflict actually routed TO Build (it is the current step) AND that
    // the current+invalid step reads "invalid", not "active" — the whole point of
    // the precedence. Without the aria-current check the guard would pass even if
    // the UI stayed elsewhere while merely flagging Build invalid.
    await waitFor(() => expect(buildStep).toHaveAttribute('aria-current', 'step'))
    expect(buildStep.getAttribute('data-status')).toBe('invalid')
  })

  it('enforces the VCS Path rule for a VCS-requiring build system and marks the step invalid', async () => {
    renderWizard()
    await userEvent.click(screen.getByRole('radio', { name: /Regular internal component/i }))
    await clickNext()
    await userEvent.type(screen.getByPlaceholderText('my-component'), 'widget')
    await commitOwner('alice')
    await clickNext()
    await userEvent.selectOptions(screen.getByLabelText(/^Build System/i), 'MAVEN')
    await clickNext()
    // VCS step for MAVEN shows the required VCS Path field; empty → step invalid.
    expect(screen.getByLabelText(/^VCS Path/i)).toBeDefined()
    expect((screen.getByRole('button', { name: /^next$/i }) as HTMLButtonElement).disabled).toBe(true)
    await userEvent.type(screen.getByLabelText(/^VCS Path/i), 'ssh://git@host/proj/repo.git')
    await waitFor(() =>
      expect((screen.getByRole('button', { name: /^next$/i }) as HTMLButtonElement).disabled).toBe(false),
    )
  })
})

describe('CreateComponentPage — Produced Artifacts rows', () => {
  it('gates "Add one more groupId" on a filled Group ID', async () => {
    renderWizard()
    await userEvent.click(screen.getByRole('radio', { name: /Regular internal component/i }))
    await clickNext()
    await userEvent.type(screen.getByPlaceholderText('my-component'), 'widget')
    await commitOwner('alice')
    await clickNext()
    const addBtn = screen.getByRole('button', { name: /Add one more groupId/i })
    expect((addBtn as HTMLButtonElement).disabled).toBe(true)
    await userEvent.type(screen.getByLabelText('Group ID 1'), 'com.example.foo')
    await waitFor(() => expect((addBtn as HTMLButtonElement).disabled).toBe(false))
    await userEvent.click(addBtn)
    expect(screen.getByLabelText('Group ID 2')).toBeDefined()
  })
})

describe('CreateComponentPage — Solution profile gates the distribution coordinate', () => {
  it('offers the Maven/Package coordinate when explicit+external (Solution)', async () => {
    renderWizard()
    await userEvent.click(screen.getByRole('radio', { name: /^Solution$/i }))
    await clickNext()
    await userEvent.type(screen.getByPlaceholderText('my-component'), 'my-solution')
    await commitOwner('alice')
    // Display Name is required for an explicit+external component.
    await userEvent.type(screen.getByLabelText(/^Display Name/i), 'My Solution')
    // Jump straight to Distribution via the stepper.
    await userEvent.click(screen.getByRole('button', { name: /^Distribution$/i }))
    expect(screen.getByText('Distribution coordinate')).toBeDefined()
    expect(screen.getByRole('option', { name: 'Maven GAV' })).toBeDefined()
  })
})

describe('CreateComponentPage — dialog shell + vertical stepper', () => {
  it('presents the wizard inside a dialog with the vertical stepper subtitles', () => {
    renderWizard()
    expect(screen.getByRole('dialog')).toBeDefined()
    // Vertical rail shows each step's one-line subtitle.
    expect(screen.getByText('Identity & ownership')).toBeDefined()
    expect(screen.getByText('Build system & artifacts')).toBeDefined()
    expect(screen.getByText('Summary & save')).toBeDefined()
    // Footer position indicator.
    expect(screen.getByText(/step 1 of 8/i)).toBeDefined()
  })

  it('closing the dialog navigates back to the components list', async () => {
    renderWizard()
    // Fresh scratch load: no profile chosen and the form is pristine, so the
    // unsaved-changes guard is inactive and the close goes straight through.
    await userEvent.click(screen.getByRole('button', { name: /close/i }))
    await waitFor(() => expect(screen.getByTestId('list-page')).toBeDefined())
  })
})

describe('CreateComponentPage — deferred (non-eager) validation', () => {
  it('does not flag an unvisited step as invalid on load', async () => {
    renderWizard()
    await userEvent.click(screen.getByRole('radio', { name: /Regular internal component/i }))
    // General has empty required fields, but the user has not visited it yet, so
    // the rail must not show it as invalid on first load.
    expect(screen.getByRole('button', { name: 'General' }).getAttribute('data-status')).not.toBe('invalid')
  })

  it('marks a step invalid only after it has been visited and left', async () => {
    renderWizard()
    await userEvent.click(screen.getByRole('radio', { name: /Regular internal component/i }))
    await clickNext() // enter General (now the active step)
    // The current step is never shown invalid while you are on it.
    expect(screen.getByRole('button', { name: 'General' }).getAttribute('data-status')).toBe('active')
    // Jump away via the rail, leaving General incomplete → now it shows invalid.
    await userEvent.click(screen.getByRole('button', { name: 'Build' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'General' }).getAttribute('data-status')).toBe('invalid'),
    )
  })

  it('marks a visited, valid step as done in the rail', async () => {
    renderWizard()
    await userEvent.click(screen.getByRole('radio', { name: /Regular internal component/i }))
    await clickNext() // Profile is now visited, valid, and no longer current.
    expect(screen.getByRole('button', { name: 'Profile' }).getAttribute('data-status')).toBe('done')
  })
})

describe('CreateComponentPage — stepper status is announced', () => {
  it('exposes invalid and done state in each rail step accessible description', async () => {
    renderWizard()
    await userEvent.click(screen.getByRole('radio', { name: /Regular internal component/i }))
    await clickNext() // Profile → General; Profile is now done.
    expect(screen.getByRole('button', { name: 'Profile' })).toHaveAccessibleDescription(/completed/i)
    // Leave General incomplete → it must announce the error state, not just color it.
    await userEvent.click(screen.getByRole('button', { name: 'Build' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'General' })).toHaveAccessibleDescription(/errors|invalid/i),
    )
  })
})

describe('CreateComponentPage — profile radio semantics', () => {
  it('exposes the profile tiles as a single-choice radio group', async () => {
    renderWizard()
    expect(screen.getByRole('radiogroup', { name: /component profile/i })).toBeDefined()
    const internal = screen.getByRole('radio', { name: /Regular internal component/i })
    expect(internal.getAttribute('aria-checked')).toBe('false')
    await userEvent.click(internal)
    expect(internal.getAttribute('aria-checked')).toBe('true')
    // The explicit-distribution answer is its own radio group for Regular profiles.
    expect(screen.getByRole('radiogroup', { name: /explicit distribution/i })).toBeDefined()
    expect(screen.getByRole('radio', { name: 'No' }).getAttribute('aria-checked')).toBe('true')
  })

  it('moves the selection with arrow keys', async () => {
    renderWizard()
    const external = screen.getByRole('radio', { name: /Regular external component/i })
    await userEvent.click(external)
    external.focus()
    await userEvent.keyboard('{ArrowDown}')
    // Arrow advances to the next profile (Regular internal is last in PROFILE_META).
    await waitFor(() =>
      expect(
        screen.getByRole('radio', { name: /Regular internal component/i }).getAttribute('aria-checked'),
      ).toBe('true'),
    )
  })

  it('carries keyboard focus to the newly selected profile on arrow keys', async () => {
    renderWizard()
    const external = screen.getByRole('radio', { name: /Regular external component/i })
    await userEvent.click(external)
    external.focus()
    expect(external).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}')
    const internal = screen.getByRole('radio', { name: /Regular internal component/i })
    await waitFor(() => expect(internal).toHaveAttribute('aria-checked', 'true'))
    // Roving-tabindex: focus must follow the selection to the next profile, not
    // stay stranded on the previous (now tabIndex=-1) radio.
    expect(internal).toHaveFocus()
  })
})

describe('CreateComponentPage — client code (external only)', () => {
  it('shows the Client Code field only for external profiles', async () => {
    renderWizard()
    await userEvent.click(screen.getByRole('radio', { name: /Regular internal component/i }))
    await clickNext() // General step
    expect(screen.queryByLabelText('Client Code')).toBeNull()
    // Switch to an external profile → the field appears.
    await userEvent.click(screen.getByRole('button', { name: 'Profile' }))
    await userEvent.click(screen.getByRole('radio', { name: /Regular external component/i }))
    await userEvent.click(screen.getByRole('button', { name: 'General' }))
    expect(screen.getByLabelText('Client Code')).toBeDefined()
  })

  it('seeds Client Code from the source in clone mode', () => {
    mockUseComponent.mockReturnValue({
      data: makeSource({ distributionExternal: true, clientCode: 'CL1' }),
      isLoading: false,
      error: null,
    })
    renderWizard('/components/new?from=c-1')
    expect((screen.getByLabelText('Client Code') as HTMLInputElement).value).toBe('CL1')
  })
})

describe('CreateComponentPage — clone re-enter affordances', () => {
  it('shows a re-enter pill on the unique Component Key field in clone mode', async () => {
    mockUseComponent.mockReturnValue({ data: makeSource(), isLoading: false, error: null })
    renderWizard('/components/new?from=c-1')
    // Clone opens on General, where the Component Key must be re-entered.
    // The banner uses lowercase "(re-enter)"; the field pill is the exact "Re-enter".
    expect(screen.getAllByText('Re-enter').length).toBeGreaterThan(0)
  })

  it('associates the Re-enter pill with its input via aria-describedby', async () => {
    mockUseComponent.mockReturnValue({ data: makeSource(), isLoading: false, error: null })
    renderWizard('/components/new?from=c-1')
    // The Component Key input's accessible description includes the pill text.
    expect(screen.getByPlaceholderText('my-component')).toHaveAccessibleDescription(/re-enter/i)
  })
})

describe('CreateComponentPage — clone unsaved-changes guard', () => {
  it('engages the guard when only the profile changed (no RHF field is dirty)', async () => {
    // Source derives regular-external + explicit=true; its distribution flags
    // (external=true, explicit=true) are the clone defaults and the Component Key
    // starts cleared.
    mockUseComponent.mockReturnValue({
      data: makeSource({ distributionExternal: true, distributionExplicit: true, solution: null }),
      isLoading: false,
      error: null,
    })
    renderWizard('/components/new?from=c-1')
    // Nothing touched yet → the guard is inactive.
    expect(screen.getByTestId('unsaved-guard').getAttribute('data-when')).toBe('false')
    // Switch the (editable) clone profile regular-external → Solution. The derived
    // distribution flags stay equal to the defaults and the name stays cleared, so
    // RHF's isDirty never flips — but the submitted `solution` flag changed, so the
    // guard must still block navigation away.
    await userEvent.click(screen.getByRole('button', { name: 'Profile' }))
    await userEvent.click(screen.getByRole('radio', { name: /^Solution$/i }))
    await waitFor(() =>
      expect(screen.getByTestId('unsaved-guard').getAttribute('data-when')).toBe('true'),
    )
  })

  it('does not engage the guard when late portal-config changes the derived clone profile', async () => {
    // solutionKeyPatterns arrive only after mount; until then a solution source
    // derives 'solution', and once the bundle pattern loads it re-derives to
    // 'dmp-bundle'. That re-derivation must not read as a user profile change.
    let patternsLoaded = false
    mockUsePortalConfig.mockImplementation(() => ({
      data: patternsLoaded ? { solutionKeyPatterns: ['-solution', 'dmp-bundle'] } : undefined,
    }))
    mockUseComponent.mockReturnValue({
      data: makeSource({
        solution: true,
        name: 'acme-dmp-bundle',
        distributionExternal: true,
        distributionExplicit: true,
      }),
      isLoading: false,
      error: null,
    })
    renderWizard('/components/new?from=c-1')
    expect(screen.getByTestId('unsaved-guard').getAttribute('data-when')).toBe('false')
    // Patterns load; force a re-render without touching the profile.
    patternsLoaded = true
    await userEvent.click(screen.getByRole('button', { name: 'Build' }))
    await waitFor(() =>
      expect(screen.getByTestId('unsaved-guard').getAttribute('data-when')).toBe('false'),
    )
  })
})

describe('CreateComponentPage — Escrow step', () => {
  it('exposes an Escrow step whose Generation field defaults to the component-defaults value (scratch)', async () => {
    mockUseComponentDefaults.mockReturnValue({
      ...COMPONENT_DEFAULTS_OK,
      data: { vcs: { tag: '$module-$version' }, escrow: { generation: 'AUTO' } },
    })
    renderWizard()
    await userEvent.click(screen.getByRole('radio', { name: /Regular internal component/i }))
    // The Escrow step is present in the rail (between Distribution and Review).
    await userEvent.click(screen.getByRole('button', { name: 'Escrow' }))
    const select = screen.getByLabelText(/^Generation/i) as HTMLSelectElement
    expect(select.value).toBe('AUTO')
    // Its options come from the escrow-generation vocabulary.
    expect(screen.getByRole('option', { name: 'MANUAL' })).toBeDefined()
  })

  it('is reachable via Next after Distribution and before Review', async () => {
    renderWizard()
    await userEvent.click(screen.getByRole('radio', { name: /Regular internal component/i }))
    await clickNext() // General
    await userEvent.type(screen.getByPlaceholderText('my-component'), 'widget')
    await commitOwner('alice')
    await clickNext() // Build
    await userEvent.selectOptions(screen.getByLabelText(/^Build System/i), 'PROVIDED')
    await clickNext() // VCS note
    await clickNext() // Jira
    await userEvent.type(screen.getByLabelText(/^Jira Project Key/i), 'WIDG')
    await clickNext() // Distribution
    await clickNext() // Escrow — the Generation field is shown here
    expect(screen.getByLabelText(/^Generation/i)).toBeDefined()
    // Next from Escrow lands on Review (Create button).
    await clickNext()
    expect(screen.getByRole('button', { name: /^create component$/i })).toBeDefined()
  })

  it('seeds the Escrow Generation from the source base row in clone mode', async () => {
    mockUseComponent.mockReturnValue({
      data: makeSource({
        configurations: [
          {
            id: 'cfg-base',
            versionRange: '(,0),[0,)',
            rowType: 'BASE',
            overriddenAttribute: null,
            isSyntheticBase: false,
            build: { buildSystem: 'GRADLE' },
            escrow: { generation: 'MANUAL' },
            jira: null,
            vcsEntries: [],
            mavenArtifacts: [],
            fileUrlArtifacts: [],
            dockerImages: [],
            packages: [],
            requiredTools: [],
          },
        ],
      }),
      isLoading: false,
      error: null,
    })
    renderWizard('/components/new?from=c-1')
    await userEvent.click(screen.getByRole('button', { name: 'Escrow' }))
    expect((screen.getByLabelText(/^Generation/i) as HTMLSelectElement).value).toBe('MANUAL')
  })
})

describe('CreateComponentPage — clone mode', () => {
  it('prefills from the source, skips the Profile step and shows the Included/Excluded banner', async () => {
    mockUseComponent.mockReturnValue({ data: makeSource(), isLoading: false, error: null })
    renderWizard('/components/new?from=c-1')

    expect(screen.getByText('Clone svc-alpha')).toBeDefined()
    // No Profile step in clone.
    expect(screen.queryByText('Choose component profile')).toBeNull()
    expect(screen.getByText(/Excluded \(re-enter\):/i)).toBeDefined()
    // Component Key (unique) is cleared, not copied.
    expect((screen.getByPlaceholderText('my-component') as HTMLInputElement).value).toBe('')
    // Owner is prefilled from the source.
    expect((screen.getByPlaceholderText('AD userkey') as HTMLInputElement).value).toBe('alice')
  })
})
