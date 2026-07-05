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
  useFieldOptions: vi.fn(() => ({ options: ['MAVEN', 'GRADLE', 'BS2_0', 'PROVIDED'], isLoading: false })),
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
    await userEvent.click(screen.getByRole('button', { name: /Regular internal component/i }))
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
    await userEvent.click(screen.getByRole('button', { name: /^Solution$/i }))
    await clickNext()
    await userEvent.type(screen.getByPlaceholderText('my-component'), 'widget')
    await waitFor(() => expect(screen.getByText(/must contain "-solution"/i)).toBeDefined())
  })
})

describe('CreateComponentPage — scratch create flow', () => {
  it('walks the steps and POSTs a from-scratch payload, then navigates to the new component', async () => {
    renderWizard()
    // Profile: regular internal, implicit distribution (not gated).
    await userEvent.click(screen.getByRole('button', { name: /Regular internal component/i }))
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
    await userEvent.click(screen.getByRole('button', { name: /Regular internal component/i }))
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
    await userEvent.type(screen.getByLabelText(/^Jira task key/i), 'ABC-123')
    await userEvent.click(screen.getByRole('button', { name: /^create component$/i }))
    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1))
    // A 409 ownership conflict lands the user on the Build step (Produced
    // Artifacts lives there), not the Review step — the "Add one more groupId"
    // control is Build-specific.
    await waitFor(() => expect(screen.getByRole('button', { name: /Add one more groupId/i })).toBeDefined())
  })

  it('enforces the VCS Path rule for a VCS-requiring build system and marks the step invalid', async () => {
    renderWizard()
    await userEvent.click(screen.getByRole('button', { name: /Regular internal component/i }))
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
    await userEvent.click(screen.getByRole('button', { name: /Regular internal component/i }))
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
    await userEvent.click(screen.getByRole('button', { name: /^Solution$/i }))
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
