import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { EscrowTab } from './EscrowTab'
import { TooltipProvider } from '../ui/tooltip'
import { fieldDescriptions } from '../../lib/fieldDescriptions'
import type { ComponentDetail } from '../../lib/types'

// Visible stub: each FieldOverrideInline renders a div tagged with the
// overriddenAttribute so coverage tests can assert per-field inline placement.
vi.mock('./FieldOverrideInline', () => ({
  FieldOverrideInline: ({ overriddenAttribute }: { overriddenAttribute: string }) => (
    <div data-testid={`field-override-inline-${overriddenAttribute}`} />
  ),
}))

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Control productType visibility per test
const mockUseFieldConfigEntry = vi.fn()
vi.mock('../../hooks/useFieldConfig', () => ({
  useFieldConfigOptions: () => ({ options: [], isLoading: false }),
  useFieldConfigEntry: (fieldPath: string) => mockUseFieldConfigEntry(fieldPath),
}))

function makeEntry(visibility: 'editable' | 'readonly' | 'hidden' = 'editable') {
  return { entry: { visibility, required: false }, isLoading: false, isError: false }
}

function setProductTypeVisibility(vis: 'editable' | 'readonly' | 'hidden') {
  mockUseFieldConfigEntry.mockImplementation((path: string) => {
    if (path === 'component.productType') return makeEntry(vis)
    return makeEntry('editable')
  })
}

// ── Fixture ───────────────────────────────────────────────────────────────────

function baseComponent(overrides: Partial<ComponentDetail> = {}): ComponentDetail {
  return {
    id: 'c-1',
    name: 'my-component',
    displayName: 'My Component',
    componentOwner: 'alice',
    productType: 'TYPE_A',
    systems: [],
    clientCode: null,
    solution: false,
    parentComponentName: null,
    archived: false,
    version: 3,
    createdAt: null,
    updatedAt: null,
    configurations: [
      {
        id: 'cfg-1',
        versionRange: '(,0),[0,)',
        rowType: 'BASE',
        overriddenAttribute: null,
        isSyntheticBase: false,
        build: null,
        escrow: {
          providedDependencies: 'dep1, dep2',
          reusable: false,
          generation: 'G2',
          diskSpace: '5GB',
          additionalSources: null,
          gradleIncludeConfigurations: null,
          gradleExcludeConfigurations: null,
          gradleIncludeTestConfigurations: null,
        },
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
  } as ComponentDetail
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  // TooltipProvider mirrors the app-root provider (App.tsx) required by the
  // FieldInfo description tooltips rendered next to the field labels.
  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>{ui}</TooltipProvider>
    </QueryClientProvider>,
  )
}

function makeToast() {
  return vi.fn()
}

function makeMutation(mutateAsyncFn = vi.fn().mockResolvedValue({})) {
  return {
    mutateAsync: mutateAsyncFn,
    mutate: vi.fn(),
    isPending: false,
    isError: false,
    isSuccess: false,
    isIdle: true,
    error: null,
    data: undefined,
    reset: vi.fn(),
    variables: undefined,
    context: undefined,
    failureCount: 0,
    failureReason: null,
    status: 'idle' as const,
    submittedAt: 0,
  } as unknown as Parameters<typeof EscrowTab>[0]['updateMutation']
}

beforeEach(() => {
  setProductTypeVisibility('editable')
})

// ── ProductType render tests ──────────────────────────────────────────────────

describe('EscrowTab productType render (§7.0/2c)', () => {
  it('renders Product Type label when visibility is editable', () => {
    setProductTypeVisibility('editable')
    const component = baseComponent({ productType: 'TYPE_A' })
    renderWithProviders(
      <EscrowTab component={component} updateMutation={makeMutation()} toast={makeToast()} canEdit={true} />
    )
    expect(screen.getByText(/product type/i)).toBeDefined()
  })

  it('does NOT render Product Type when visibility is hidden', () => {
    setProductTypeVisibility('hidden')
    const component = baseComponent({ productType: 'TYPE_A' })
    renderWithProviders(
      <EscrowTab component={component} updateMutation={makeMutation()} toast={makeToast()} canEdit={true} />
    )
    expect(screen.queryByText(/product type/i)).toBeNull()
  })

  it('renders Product Type label when visibility is readonly (control is disabled)', () => {
    setProductTypeVisibility('readonly')
    const component = baseComponent({ productType: 'TYPE_A' })
    renderWithProviders(
      <EscrowTab component={component} updateMutation={makeMutation()} toast={makeToast()} canEdit={true} />
    )
    // Label is visible; disabled state is on the underlying Radix Select trigger
    expect(screen.getByText(/product type/i)).toBeDefined()
  })
})

// ── Save handler: sends productType + baseConfiguration.escrow ────────────────

describe('EscrowTab save handler', () => {
  it('clicking Save sends both productType (top-level) and baseConfiguration.escrow', async () => {
    setProductTypeVisibility('editable')
    const mutateAsync = vi.fn().mockResolvedValue({})
    const component = baseComponent({ productType: 'TYPE_B', version: 5 })
    renderWithProviders(
      <EscrowTab component={component} updateMutation={makeMutation(mutateAsync)} toast={makeToast()} canEdit={true} />
    )

    const saveBtn = screen.getByRole('button', { name: /save escrow/i })
    fireEvent.click(saveBtn)

    // Wait for async handler
    await vi.waitFor(() => expect(mutateAsync).toHaveBeenCalledOnce())

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload = mutateAsync.mock.calls[0]![0] as any
    expect(payload.version).toBe(5)
    expect(payload.productType).toBe('TYPE_B')
    expect(payload.baseConfiguration).toBeDefined()
    expect(payload.baseConfiguration.escrow).toBeDefined()
  })

  it('hidden productType is NOT included in save payload', async () => {
    setProductTypeVisibility('hidden')
    const mutateAsync = vi.fn().mockResolvedValue({})
    const component = baseComponent({ productType: 'TYPE_A', version: 2 })
    renderWithProviders(
      <EscrowTab component={component} updateMutation={makeMutation(mutateAsync)} toast={makeToast()} canEdit={true} />
    )

    fireEvent.click(screen.getByRole('button', { name: /save escrow/i }))
    await vi.waitFor(() => expect(mutateAsync).toHaveBeenCalledOnce())

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload = mutateAsync.mock.calls[0]![0] as any
    // hidden → not in payload (undefined key)
    expect(Object.prototype.hasOwnProperty.call(payload, 'productType')).toBe(false)
    // baseConfiguration.escrow still present
    expect(payload.baseConfiguration.escrow).toBeDefined()
  })

  it('baseConfiguration.escrow is always sent regardless of productType visibility', async () => {
    setProductTypeVisibility('hidden')
    const mutateAsync = vi.fn().mockResolvedValue({})
    const component = baseComponent({ productType: 'TYPE_A' })
    renderWithProviders(
      <EscrowTab component={component} updateMutation={makeMutation(mutateAsync)} toast={makeToast()} canEdit={true} />
    )

    fireEvent.click(screen.getByRole('button', { name: /save escrow/i }))
    await vi.waitFor(() => expect(mutateAsync).toHaveBeenCalledOnce())

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((mutateAsync.mock.calls[0]![0] as any).baseConfiguration.escrow).toBeDefined()
  })
})

// ── New EscrowAspect fields (Wave B) ─────────────────────────────────────────

describe('EscrowTab new fields render', () => {
  it('renders Additional Sources input', () => {
    const component = baseComponent()
    renderWithProviders(
      <EscrowTab component={component} updateMutation={makeMutation()} toast={makeToast()} canEdit={true} />
    )
    expect(screen.getByText(/additional sources/i)).toBeDefined()
  })

  it('renders Gradle Include Configurations input', () => {
    const component = baseComponent()
    renderWithProviders(
      <EscrowTab component={component} updateMutation={makeMutation()} toast={makeToast()} canEdit={true} />
    )
    expect(screen.getByText(/gradle include configurations/i)).toBeDefined()
  })

  it('renders Gradle Exclude Configurations input', () => {
    const component = baseComponent()
    renderWithProviders(
      <EscrowTab component={component} updateMutation={makeMutation()} toast={makeToast()} canEdit={true} />
    )
    expect(screen.getByText(/gradle exclude configurations/i)).toBeDefined()
  })

  it('renders Gradle Include Test Configurations switch', () => {
    const component = baseComponent()
    renderWithProviders(
      <EscrowTab component={component} updateMutation={makeMutation()} toast={makeToast()} canEdit={true} />
    )
    expect(screen.getByText(/gradle include test configurations/i)).toBeDefined()
    expect(screen.getByRole('switch', { name: /gradle include test configurations/i })).toBeDefined()
  })

  it('initialises Additional Sources from fixture value', () => {
    const component = baseComponent()
    // Override escrow fixture to provide a value
    component.configurations![0]!.escrow!.additionalSources = 'src/extra'
    renderWithProviders(
      <EscrowTab component={component} updateMutation={makeMutation()} toast={makeToast()} canEdit={true} />
    )
    const input = screen.getByPlaceholderText(/additional source paths/i) as HTMLInputElement
    expect(input.value).toBe('src/extra')
  })

  it('initialises gradleIncludeTestConfigurations switch from fixture', () => {
    const component = baseComponent()
    component.configurations![0]!.escrow!.gradleIncludeTestConfigurations = true
    renderWithProviders(
      <EscrowTab component={component} updateMutation={makeMutation()} toast={makeToast()} canEdit={true} />
    )
    const sw = screen.getByRole('switch', { name: /gradle include test configurations/i }) as HTMLButtonElement
    expect(sw.getAttribute('data-state')).toBe('checked')
  })
})

describe('EscrowTab new fields save', () => {
  it('save propagates additionalSources value', async () => {
    setProductTypeVisibility('hidden')
    const mutateAsync = vi.fn().mockResolvedValue({})
    const component = baseComponent()
    component.configurations![0]!.escrow!.additionalSources = 'src/vendor'
    renderWithProviders(
      <EscrowTab component={component} updateMutation={makeMutation(mutateAsync)} toast={makeToast()} canEdit={true} />
    )

    fireEvent.click(screen.getByRole('button', { name: /save escrow/i }))
    await vi.waitFor(() => expect(mutateAsync).toHaveBeenCalledOnce())

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const escrow = (mutateAsync.mock.calls[0]![0] as any).baseConfiguration.escrow
    expect(escrow.additionalSources).toBe('src/vendor')
  })

  it('save sends null for additionalSources when input is blank', async () => {
    setProductTypeVisibility('hidden')
    const mutateAsync = vi.fn().mockResolvedValue({})
    const component = baseComponent()
    renderWithProviders(
      <EscrowTab component={component} updateMutation={makeMutation(mutateAsync)} toast={makeToast()} canEdit={true} />
    )

    fireEvent.click(screen.getByRole('button', { name: /save escrow/i }))
    await vi.waitFor(() => expect(mutateAsync).toHaveBeenCalledOnce())

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const escrow = (mutateAsync.mock.calls[0]![0] as any).baseConfiguration.escrow
    expect(escrow.additionalSources).toBeNull()
  })

  it('save propagates gradleIncludeConfigurations value', async () => {
    setProductTypeVisibility('hidden')
    const mutateAsync = vi.fn().mockResolvedValue({})
    const component = baseComponent()
    component.configurations![0]!.escrow!.gradleIncludeConfigurations = 'compile,runtimeClasspath'
    renderWithProviders(
      <EscrowTab component={component} updateMutation={makeMutation(mutateAsync)} toast={makeToast()} canEdit={true} />
    )

    fireEvent.click(screen.getByRole('button', { name: /save escrow/i }))
    await vi.waitFor(() => expect(mutateAsync).toHaveBeenCalledOnce())

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const escrow = (mutateAsync.mock.calls[0]![0] as any).baseConfiguration.escrow
    expect(escrow.gradleIncludeConfigurations).toBe('compile,runtimeClasspath')
  })

  it('save sends null for gradleExcludeConfigurations when blank', async () => {
    setProductTypeVisibility('hidden')
    const mutateAsync = vi.fn().mockResolvedValue({})
    const component = baseComponent()
    renderWithProviders(
      <EscrowTab component={component} updateMutation={makeMutation(mutateAsync)} toast={makeToast()} canEdit={true} />
    )

    fireEvent.click(screen.getByRole('button', { name: /save escrow/i }))
    await vi.waitFor(() => expect(mutateAsync).toHaveBeenCalledOnce())

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const escrow = (mutateAsync.mock.calls[0]![0] as any).baseConfiguration.escrow
    expect(escrow.gradleExcludeConfigurations).toBeNull()
  })

  it('Switch toggle flips gradleIncludeTestConfigurations in save payload', async () => {
    setProductTypeVisibility('hidden')
    const mutateAsync = vi.fn().mockResolvedValue({})
    const component = baseComponent()
    renderWithProviders(
      <EscrowTab component={component} updateMutation={makeMutation(mutateAsync)} toast={makeToast()} canEdit={true} />
    )

    // Default is false (null in fixture → false); toggle to true
    const sw = screen.getByRole('switch', { name: /gradle include test configurations/i })
    fireEvent.click(sw)

    fireEvent.click(screen.getByRole('button', { name: /save escrow/i }))
    await vi.waitFor(() => expect(mutateAsync).toHaveBeenCalledOnce())

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const escrow = (mutateAsync.mock.calls[0]![0] as any).baseConfiguration.escrow
    expect(escrow.gradleIncludeTestConfigurations).toBe(true)
  })
})

// ── Build-settings fields migrated from the Build tab ────────────────────────
// Build Tasks / System Properties / Deprecated / Required Project / Required
// Tools render (and save) here now; they stay `build.*` / row-level in the
// PATCH payload — only the UI placement moved.

describe('EscrowTab — migrated build settings render', () => {
  it('renders Build Tasks, System Properties, Deprecated, Required Project and Required Tools', () => {
    renderWithProviders(
      <EscrowTab component={baseComponent()} updateMutation={makeMutation()} toast={makeToast()} canEdit={true} />
    )
    expect(screen.getByText('Build Tasks')).toBeDefined()
    expect(screen.getByText('System Properties')).toBeDefined()
    expect(screen.getByText('Deprecated')).toBeDefined()
    expect(screen.getByText('Required Project')).toBeDefined()
    expect(screen.getByText('Required Tools')).toBeDefined()
  })

  it('initialises the migrated fields from the BASE row build aspect and requiredTools', () => {
    const component = baseComponent()
    component.configurations![0]!.build = {
      buildSystem: 'MAVEN',
      buildTasks: 'clean install',
      systemProperties: '-Dfoo=bar',
      deprecated: true,
      requiredProject: true,
    }
    component.configurations![0]!.requiredTools = ['tool-x', 'tool-y']
    renderWithProviders(
      <EscrowTab component={component} updateMutation={makeMutation()} toast={makeToast()} canEdit={true} />
    )
    expect((screen.getByPlaceholderText('clean install / assemble') as HTMLInputElement).value).toBe('clean install')
    expect((screen.getByPlaceholderText('-Dproperty=value') as HTMLTextAreaElement).value).toBe('-Dfoo=bar')
    expect(screen.getByRole('switch', { name: 'Deprecated' }).getAttribute('data-state')).toBe('checked')
    expect(screen.getByRole('switch', { name: 'Required Project' }).getAttribute('data-state')).toBe('checked')
    expect((screen.getByPlaceholderText('tool-a, tool-b') as HTMLInputElement).value).toBe('tool-x, tool-y')
  })
})

describe('EscrowTab — migrated build settings save', () => {
  it('sends the migrated scalars inside baseConfiguration.build and omits Build-tab-owned ones', async () => {
    setProductTypeVisibility('hidden')
    const mutateAsync = vi.fn().mockResolvedValue({})
    const component = baseComponent()
    component.configurations![0]!.build = {
      buildSystem: 'MAVEN',
      buildTasks: 'clean install',
      systemProperties: '-Dfoo=bar',
      deprecated: false,
      requiredProject: false,
    }
    renderWithProviders(
      <EscrowTab component={component} updateMutation={makeMutation(mutateAsync)} toast={makeToast()} canEdit={true} />
    )

    const tasksInput = screen.getByPlaceholderText('clean install / assemble')
    fireEvent.change(tasksInput, { target: { value: 'assemble' } })
    fireEvent.click(screen.getByRole('switch', { name: 'Deprecated' }))

    fireEvent.click(screen.getByRole('button', { name: /save escrow/i }))
    await vi.waitFor(() => expect(mutateAsync).toHaveBeenCalledOnce())

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload = mutateAsync.mock.calls[0]![0] as any
    expect(payload.baseConfiguration.escrow).toBeDefined()
    const build = payload.baseConfiguration.build
    expect(build.buildTasks).toBe('assemble')
    expect(build.systemProperties).toBe('-Dfoo=bar')
    expect(build.deprecated).toBe(true)
    expect(build.requiredProject).toBe(false)
    // Build-tab-owned scalars must be ABSENT (CRS PATCH = per-field ?.let,
    // absent = don't touch) so an Escrow save can never clobber them.
    expect('buildSystem' in build).toBe(false)
    expect('buildFilePath' in build).toBe(false)
    expect('javaVersion' in build).toBe(false)
    expect('mavenVersion' in build).toBe(false)
    expect('gradleVersion' in build).toBe(false)
    expect('projectVersion' in build).toBe(false)
  })

  it('sends null for cleared Build Tasks / System Properties', async () => {
    setProductTypeVisibility('hidden')
    const mutateAsync = vi.fn().mockResolvedValue({})
    const component = baseComponent()
    component.configurations![0]!.build = {
      buildSystem: 'MAVEN',
      buildTasks: 'clean install',
      systemProperties: '-Dfoo=bar',
    }
    renderWithProviders(
      <EscrowTab component={component} updateMutation={makeMutation(mutateAsync)} toast={makeToast()} canEdit={true} />
    )

    fireEvent.change(screen.getByPlaceholderText('clean install / assemble'), { target: { value: '' } })
    fireEvent.change(screen.getByPlaceholderText('-Dproperty=value'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: /save escrow/i }))
    await vi.waitFor(() => expect(mutateAsync).toHaveBeenCalledOnce())

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const build = (mutateAsync.mock.calls[0]![0] as any).baseConfiguration.build
    expect(build.buildTasks).toBeNull()
    expect(build.systemProperties).toBeNull()
  })

  it('saves requiredTools deduped at BASE-row level, not inside build', async () => {
    setProductTypeVisibility('hidden')
    const mutateAsync = vi.fn().mockResolvedValue({})
    const component = baseComponent()
    renderWithProviders(
      <EscrowTab component={component} updateMutation={makeMutation(mutateAsync)} toast={makeToast()} canEdit={true} />
    )

    fireEvent.change(screen.getByPlaceholderText('tool-a, tool-b'), {
      target: { value: 'tool-a, tool-b, tool-a' },
    })
    fireEvent.click(screen.getByRole('button', { name: /save escrow/i }))
    await vi.waitFor(() => expect(mutateAsync).toHaveBeenCalledOnce())

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload = mutateAsync.mock.calls[0]![0] as any
    expect(payload.baseConfiguration.requiredTools).toEqual(['tool-a', 'tool-b'])
    expect('requiredTools' in payload.baseConfiguration.build).toBe(false)
  })

  it('saves empty requiredTools array when input is cleared (explicit clear)', async () => {
    setProductTypeVisibility('hidden')
    const mutateAsync = vi.fn().mockResolvedValue({})
    const component = baseComponent()
    component.configurations![0]!.requiredTools = ['tool-x']
    renderWithProviders(
      <EscrowTab component={component} updateMutation={makeMutation(mutateAsync)} toast={makeToast()} canEdit={true} />
    )

    fireEvent.change(screen.getByPlaceholderText('tool-a, tool-b'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: /save escrow/i }))
    await vi.waitFor(() => expect(mutateAsync).toHaveBeenCalledOnce())

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((mutateAsync.mock.calls[0]![0] as any).baseConfiguration.requiredTools).toEqual([])
  })

  it('sends requiredTools: null and omits build entirely when no BASE row is loaded', async () => {
    setProductTypeVisibility('hidden')
    const mutateAsync = vi.fn().mockResolvedValue({})
    const component = baseComponent({ configurations: [] })
    renderWithProviders(
      <EscrowTab component={component} updateMutation={makeMutation(mutateAsync)} toast={makeToast()} canEdit={true} />
    )

    fireEvent.click(screen.getByRole('button', { name: /save escrow/i }))
    await vi.waitFor(() => expect(mutateAsync).toHaveBeenCalledOnce())

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const baseConfiguration = (mutateAsync.mock.calls[0]![0] as any).baseConfiguration
    expect(baseConfiguration.requiredTools).toBeNull()
    // Without a loaded BASE row the form state is all defaults — sending
    // build {deprecated:false, requiredProject:false, ...} would write
    // zero-values into the row the server auto-creates. Omit the aspect.
    expect('build' in baseConfiguration).toBe(false)
  })
})

describe('EscrowTab — inline override coverage', () => {
  const overridablePaths = [
    'escrow.providedDependencies',
    'escrow.reusable',
    'escrow.generation',
    'escrow.diskSpace',
    'escrow.additionalSources',
    'escrow.gradleIncludeConfigurations',
    'escrow.gradleExcludeConfigurations',
    'escrow.gradleIncludeTestConfigurations',
    'escrow.buildTask',
    // migrated from the Build tab — attribute paths stay build.*
    'build.buildTasks',
    'build.systemProperties',
    'build.deprecated',
    'build.requiredProject',
  ]

  it.each(overridablePaths)('renders FieldOverrideInline under %s', (path) => {
    renderWithProviders(
      <EscrowTab component={baseComponent()} updateMutation={makeMutation()} toast={makeToast()} canEdit={true} />
    )
    expect(screen.getByTestId(`field-override-inline-${path}`)).toBeInTheDocument()
  })
})

describe('EscrowTab field descriptions (FieldInfo)', () => {
  // Exact set of registry paths this tab must expose an info icon for.
  // productType keeps its component.* field-config path even though it
  // renders on the Escrow tab (§7.0/2c migration).
  const EXPECTED_PATHS = [
    'component.productType',
    'escrow.generation',
    'escrow.diskSpace',
    'escrow.reusable',
    'escrow.providedDependencies',
    'escrow.additionalSources',
    'escrow.gradleIncludeConfigurations',
    'escrow.gradleExcludeConfigurations',
    'escrow.gradleIncludeTestConfigurations',
    'escrow.buildTask',
    // migrated from the Build tab — registry description paths stay build.*
    'build.buildTasks',
    'build.systemProperties',
    'build.deprecated',
    'build.requiredProject',
    'build.requiredTools',
  ]

  it('renders exactly one info icon per described field', () => {
    renderWithProviders(
      <EscrowTab component={baseComponent()} updateMutation={makeMutation()} toast={makeToast()} canEdit={true} />
    )
    for (const path of EXPECTED_PATHS) {
      expect(
        document.querySelectorAll(`[data-field-path="${path}"]`),
        `info icon for ${path}`,
      ).toHaveLength(1)
    }
  })

  it('opens the registry description for Generation on focus', async () => {
    renderWithProviders(
      <EscrowTab component={baseComponent()} updateMutation={makeMutation()} toast={makeToast()} canEdit={true} />
    )
    const trigger = document.querySelector('[data-field-path="escrow.generation"]') as HTMLElement
    act(() => trigger.focus())
    const tooltip = await screen.findByRole('tooltip')
    expect(tooltip).toHaveTextContent(fieldDescriptions['escrow.generation']!)
  })
})
