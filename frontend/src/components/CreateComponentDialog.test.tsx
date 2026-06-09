import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CreateComponentButton, CreateComponentDialog } from './CreateComponentDialog'
import { ApiError } from '../lib/api'
import type { ComponentDetail } from '../lib/types'

const mockMutateAsync = vi.fn()
const mockUseComponent = vi.fn()
vi.mock('../hooks/useComponent', () => ({
  useComponent: (id: string) => mockUseComponent(id),
  useCreateComponent: vi.fn(() => ({ mutateAsync: mockMutateAsync, isPending: false })),
}))

const mockNavigate = vi.fn()
vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

const mockToast = vi.fn()
vi.mock('../hooks/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }))

const mockLookupEmployee = vi.hoisted(() => vi.fn())

vi.mock('../hooks/useFieldOptions', () => ({
  useFieldOptions: vi.fn(() => ({ options: ['MAVEN', 'GRADLE'], isLoading: false })),
}))
vi.mock('../hooks/useOwners', () => ({
  useOwners: vi.fn(() => ({ data: ['alice', 'inactive-user'] })),
}))
vi.mock('../hooks/useEmployees', () => ({
  lookupEmployee: mockLookupEmployee,
  useEmployeeStatuses: vi.fn(() => ({ data: {} })),
}))
// Field-config drives which fields the create form renders. Default: no data →
// every field editable (preserves the pre-gating test expectations).
const mockUseFieldConfig = vi.fn(() => ({ data: undefined as unknown, isLoading: false, isError: false }))
vi.mock('../hooks/useAdminConfig', () => ({ useFieldConfig: () => mockUseFieldConfig() }))

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

function makeSource(overrides: Partial<ComponentDetail> = {}): ComponentDetail {
  return {
    id: 'c-1',
    name: 'svc-alpha',
    displayName: 'Service Alpha',
    componentOwner: 'alice',
    productType: null,
    system: 'SYS1',
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

function scratchDisabled() {
  mockUseComponent.mockReturnValue({ data: undefined, isLoading: false, error: null })
}

beforeEach(() => {
  mockMutateAsync.mockReset()
  mockNavigate.mockReset()
  mockToast.mockReset()
  mockLookupEmployee.mockReset()
  // Default: every queried person resolves as an exact active match, so tests
  // not about validation behave as before PR #79's commit-after-validation.
  mockLookupEmployee.mockImplementation(async (query: string) => [
    { username: query.trim(), active: true },
  ])
  mockUseComponent.mockReset()
  mockUseFieldConfig.mockReturnValue({ data: undefined, isLoading: false, isError: false })
  scratchDisabled()
})

async function openScratch() {
  await userEvent.click(screen.getByRole('button', { name: /new component/i }))
}

// PeopleInput commits a typed person only after the async directory lookup
// resolves (blur/Enter → validate → onChange). Blur the input and wait the
// validation out before submitting, otherwise the form still holds ''.
async function commitComponentOwner(owner = 'alice') {
  const input = screen.getByPlaceholderText('AD userkey')
  await userEvent.type(input, owner)
  fireEvent.blur(input)
  await waitFor(() => expect(mockLookupEmployee).toHaveBeenCalledWith(owner))
  await waitFor(() => expect(screen.queryByText('Validating person...')).toBeNull())
}

async function fillBaseFields(owner = 'alice') {
  await userEvent.type(screen.getByPlaceholderText('my-component'), 'widget')
  // displayName is optional for a non-explicit+external component (required only under the EE
  // gate); fill it here for completeness so the created payload carries a value.
  await userEvent.type(screen.getByLabelText(/display name/i), 'Widget')
  await userEvent.selectOptions(screen.getByLabelText(/build system/i), 'MAVEN')
  await commitComponentOwner(owner)
}

describe('CreateComponentDialog — scratch mode base', () => {
  it('opens and renders base fields without the gated block', async () => {
    renderWithProviders(<CreateComponentButton />)
    await openScratch()
    expect(screen.getByText('Create Component')).toBeDefined()
    expect(screen.getByPlaceholderText('my-component')).toBeDefined()
    expect(screen.getByLabelText(/build system/i)).toBeDefined()
    // Gated block hidden by default (external on, explicit off).
    expect(screen.queryByText(/required for explicit \+ external/i)).toBeNull()
  })

  it('validates the component key regex', async () => {
    renderWithProviders(<CreateComponentButton />)
    await openScratch()
    await userEvent.type(screen.getByPlaceholderText('my-component'), 'bad name!')
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))
    await waitFor(() => expect(screen.getByText(/component key can only contain/i)).toBeDefined())
    expect(mockMutateAsync).not.toHaveBeenCalled()
  })

  it('blocks submit when component owner is not found in the directory', async () => {
    mockLookupEmployee.mockResolvedValue([])
    renderWithProviders(<CreateComponentButton />)
    await openScratch()
    await userEvent.type(screen.getByPlaceholderText('my-component'), 'widget')
    await userEvent.selectOptions(screen.getByLabelText(/build system/i), 'MAVEN')
    const input = screen.getByPlaceholderText('AD userkey')
    await userEvent.type(input, 'asdfd')
    fireEvent.blur(input)

    await screen.findByText('Select an active person from the directory')
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))
    expect(mockMutateAsync).not.toHaveBeenCalled()
  })

  it('does not submit a stale active owner when the textbox is edited before revalidation', async () => {
    mockLookupEmployee.mockImplementation((query: string) => {
      if (query.trim() === 'alice') {
        return Promise.resolve([{ username: 'alice', active: true }])
      }
      return new Promise(() => undefined)
    })
    renderWithProviders(<CreateComponentButton />)
    await openScratch()
    await userEvent.type(screen.getByPlaceholderText('my-component'), 'widget')
    await userEvent.selectOptions(screen.getByLabelText(/build system/i), 'MAVEN')
    await commitComponentOwner('alice')

    const input = screen.getByPlaceholderText('AD userkey')
    await userEvent.clear(input)
    await userEvent.type(input, 'asdfd')
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))

    await waitFor(() => {
      expect(screen.getByText(/component owner is required/i)).toBeDefined()
    })
    expect(mockMutateAsync).not.toHaveBeenCalled()
  })

  it('submits a from-scratch payload and navigates', async () => {
    mockMutateAsync.mockResolvedValue({ id: 'comp-1', name: 'widget' })
    renderWithProviders(<CreateComponentButton />)
    await openScratch()
    await fillBaseFields()
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))
    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalled())
    const arg = mockMutateAsync.mock.calls[0]![0]
    expect(arg).toMatchObject({
      name: 'widget',
      baseConfiguration: { build: { buildSystem: 'MAVEN' } },
      archived: false,
      distributionExplicit: false,
      distributionExternal: true,
    })
    expect(mockNavigate).toHaveBeenCalledWith('/components/comp-1')
  })
})

describe('CreateComponentDialog — field-config visibility gating', () => {
  it('removes a hidden field (displayName) from the create form', async () => {
    mockUseFieldConfig.mockReturnValue({
      data: { component: { displayName: { visibility: 'hidden' } } },
      isLoading: false,
      isError: false,
    })
    renderWithProviders(<CreateComponentButton />)
    await openScratch()
    // Required fields stay; the hidden field is gone.
    expect(screen.getByPlaceholderText('my-component')).toBeDefined()
    expect(screen.queryByLabelText(/display name/i)).toBeNull()
  })

  it('removes copyright from the gated block when field-config hides it', async () => {
    mockUseFieldConfig.mockReturnValue({
      data: { component: { copyright: { visibility: 'hidden' } } },
      isLoading: false,
      isError: false,
    })
    renderWithProviders(<CreateComponentButton />)
    await openScratch()
    await fillBaseFields()
    await userEvent.click(screen.getByLabelText(/explicit/i)) // → explicit+external gated block
    await waitFor(() => expect(screen.getByText(/required for explicit \+ external/i)).toBeDefined())
    // Copyright gone; the other gated fields remain.
    expect(screen.queryByLabelText(/copyright/i)).toBeNull()
    expect(screen.getByText(/release managers/i)).toBeDefined()
    expect(screen.getByText(/security champions/i)).toBeDefined()
  })
})

describe('CreateComponentDialog — explicit+external gated block', () => {
  async function makeGated() {
    renderWithProviders(<CreateComponentButton />)
    await openScratch()
    await fillBaseFields()
    // external already on; toggle explicit on → gated.
    await userEvent.click(screen.getByLabelText(/explicit/i))
    await waitFor(() => expect(screen.getByText(/required for explicit \+ external/i)).toBeDefined())
  }

  it('shows the gated block when both explicit and external are checked', async () => {
    await makeGated()
    expect(screen.getByText(/release managers/i)).toBeDefined()
    expect(screen.getByText(/security champions/i)).toBeDefined()
    expect(screen.getByLabelText(/^distribution coordinate/i)).toBeDefined()
  })

  it('blocks submit on empty RM / SC / coordinate but NOT on empty copyright', async () => {
    await makeGated()
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))
    await waitFor(() => expect(screen.getByText(/at least one release manager/i)).toBeDefined())
    expect(screen.getByText(/at least one security champion/i)).toBeDefined()
    expect(screen.getByText(/group id is required/i)).toBeDefined()
    // copyright has no client-side required error
    expect(screen.queryByText(/copyright is required/i)).toBeNull()
    expect(mockMutateAsync).not.toHaveBeenCalled()
  })

  it('switching coordinate type from maven to docker drops the stale maven fields from the payload', async () => {
    mockMutateAsync.mockResolvedValue({ id: 'comp-2', name: 'widget' })
    await makeGated()
    // Fill maven first
    await userEvent.type(screen.getByLabelText('Group ID'), 'org.acme')
    await userEvent.type(screen.getByLabelText('Artifact ID'), 'svc')
    // Switch to docker
    await userEvent.selectOptions(screen.getByLabelText(/^distribution coordinate/i), 'docker')
    await userEvent.type(screen.getByLabelText('Image name'), 'acme/svc')
    // Fill people so validation passes
    await userEvent.type(
      screen.getAllByPlaceholderText('Add person')[0]!,
      'rm-bob',
    )
    await userEvent.type(screen.getAllByPlaceholderText('Add person')[1]!, 'sc-bob')
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))
    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalled())
    const base = mockMutateAsync.mock.calls[0]![0].baseConfiguration
    expect(base.dockerImages).toEqual([{ imageName: 'acme/svc', flavor: null }])
    expect('mavenArtifacts' in base).toBe(false)
  })

  it('packageType offers only DEB and RPM', async () => {
    await makeGated()
    await userEvent.selectOptions(screen.getByLabelText(/^distribution coordinate/i), 'package')
    const typeSelect = screen.getByLabelText('Package type') as HTMLSelectElement
    const values = Array.from(typeSelect.options).map((o) => o.value)
    expect(values).toEqual(['DEB', 'RPM'])
  })
})

describe('CreateComponentDialog — copy mode (sourceId)', () => {
  function loaded(source = makeSource()) {
    mockUseComponent.mockReturnValue({ data: source, isLoading: false, error: null })
  }

  function renderCopy(onOpenChange = vi.fn()) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const view = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <CreateComponentDialog sourceId="c-1" open onOpenChange={onOpenChange} />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    return { onOpenChange, view }
  }

  it('shows the Create Similar title and Included/Excluded hint', () => {
    loaded()
    renderCopy()
    expect(screen.getByText('Create Similar Component')).toBeDefined()
    expect(screen.getByText(/excluded/i)).toBeDefined()
  })

  it('does NOT prefill displayName from the source (unique); prefills buildSystem / owner; key stays empty', async () => {
    loaded()
    renderCopy()
    // displayName is UNIQUE, so copy mode must NOT prefill it — the user supplies a fresh one.
    await waitFor(() =>
      expect((screen.getByLabelText(/display name/i) as HTMLInputElement).value).toBe(''),
    )
    expect((screen.getByLabelText(/component key/i) as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText(/build system/i) as HTMLSelectElement).value).toBe('GRADLE')
    expect((screen.getByPlaceholderText('AD userkey') as HTMLInputElement).value).toBe('alice')
  })

  it('source loading disables Create; source error shows InlineError', () => {
    mockUseComponent.mockReturnValue({ data: undefined, isLoading: true, error: null })
    const { view } = renderCopy()
    expect((screen.getByRole('button', { name: /^create$/i }) as HTMLButtonElement).disabled).toBe(true)
    mockUseComponent.mockReturnValue({ data: undefined, isLoading: false, error: new Error('boom') })
    view.rerender(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <CreateComponentDialog sourceId="c-1" open onOpenChange={vi.fn()} />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(screen.getByText(/failed to load/i)).toBeDefined()
  })

  it('keeps typed key + edited display name across a background source refetch', async () => {
    loaded()
    const { onOpenChange, view } = renderCopy()
    await userEvent.type(screen.getByLabelText(/component key/i), 'svc-beta')
    const dn = screen.getByLabelText(/display name/i)
    await userEvent.clear(dn)
    await userEvent.type(dn, 'Edited Name')
    // fresh source object identity (refetch)
    loaded(makeSource())
    view.rerender(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <CreateComponentDialog sourceId="c-1" open onOpenChange={onOpenChange} />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect((screen.getByLabelText(/component key/i) as HTMLInputElement).value).toBe('svc-beta')
    expect((screen.getByLabelText(/display name/i) as HTMLInputElement).value).toBe('Edited Name')
  })

  it('explicit+external source with empty RM/SC blocks submit (the original 400 case)', async () => {
    loaded(makeSource({ distributionExplicit: true, distributionExternal: true, releaseManager: [], securityChampion: [] }))
    renderCopy()
    await waitFor(() => expect(screen.getByText(/required for explicit \+ external/i)).toBeDefined())
    await userEvent.type(screen.getByLabelText(/component key/i), 'svc-clone')
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))
    await waitFor(() => expect(screen.getByText(/at least one release manager/i)).toBeDefined())
    expect(mockMutateAsync).not.toHaveBeenCalled()
  })

  it('maps a server 400 distribution error inline at the coordinate block', async () => {
    mockMutateAsync.mockRejectedValue(
      new ApiError(
        400,
        'distribution: ...',
        JSON.stringify({
          errorMessage:
            "distribution: an explicit+external component must define at least one distribution coordinate (component 'X')",
        }),
      ),
    )
    loaded(
      makeSource({
        distributionExplicit: true,
        distributionExternal: true,
        releaseManager: ['rm-a'],
        securityChampion: ['sc-a'],
      }),
    )
    renderCopy()
    await userEvent.type(screen.getByLabelText(/component key/i), 'svc-clone')
    await userEvent.type(screen.getByLabelText(/display name/i), 'Svc Clone')
    await userEvent.type(screen.getByLabelText('Group ID'), 'org.acme')
    await userEvent.type(screen.getByLabelText('Artifact ID'), 'svc')
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))
    await waitFor(() => expect(screen.getByText(/must define at least one distribution coordinate/i)).toBeDefined())
    expect(mockToast).not.toHaveBeenCalled()
  })

  it('409 shows the duplicate-name toast', async () => {
    mockMutateAsync.mockRejectedValue(new ApiError(409, 'conflict'))
    loaded()
    renderCopy()
    await userEvent.type(screen.getByLabelText(/component key/i), 'svc-alpha')
    await userEvent.type(screen.getByLabelText(/display name/i), 'Svc Alpha')
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ description: expect.stringContaining('already exists') }),
      ),
    )
  })

  it('submits buildCreateRequest output and navigates on success', async () => {
    mockMutateAsync.mockResolvedValue({ id: 'comp-9', name: 'svc-clone' })
    loaded()
    const { onOpenChange } = renderCopy()
    await userEvent.type(screen.getByLabelText(/component key/i), 'svc-clone')
    await userEvent.type(screen.getByLabelText(/display name/i), 'Svc Clone')
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/components/comp-9'))
    const arg = mockMutateAsync.mock.calls[0]![0]
    expect(arg).toMatchObject({ name: 'svc-clone', labels: ['backend'], baseConfiguration: { build: { buildSystem: 'GRADLE' } } })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
