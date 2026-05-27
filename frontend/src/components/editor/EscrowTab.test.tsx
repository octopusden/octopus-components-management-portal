import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { EscrowTab } from './EscrowTab'
import type { ComponentDetail } from '../../lib/types'

// Stub FieldOverrideInline so it doesn't trigger real hook calls in unit tests
vi.mock('./FieldOverrideInline', () => ({
  FieldOverrideInline: () => null,
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
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
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
      <EscrowTab component={component} updateMutation={makeMutation()} toast={makeToast()} />
    )
    expect(screen.getByText(/product type/i)).toBeDefined()
  })

  it('does NOT render Product Type when visibility is hidden', () => {
    setProductTypeVisibility('hidden')
    const component = baseComponent({ productType: 'TYPE_A' })
    renderWithProviders(
      <EscrowTab component={component} updateMutation={makeMutation()} toast={makeToast()} />
    )
    expect(screen.queryByText(/product type/i)).toBeNull()
  })

  it('renders Product Type label when visibility is readonly (control is disabled)', () => {
    setProductTypeVisibility('readonly')
    const component = baseComponent({ productType: 'TYPE_A' })
    renderWithProviders(
      <EscrowTab component={component} updateMutation={makeMutation()} toast={makeToast()} />
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
      <EscrowTab component={component} updateMutation={makeMutation(mutateAsync)} toast={makeToast()} />
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
      <EscrowTab component={component} updateMutation={makeMutation(mutateAsync)} toast={makeToast()} />
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
      <EscrowTab component={component} updateMutation={makeMutation(mutateAsync)} toast={makeToast()} />
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
      <EscrowTab component={component} updateMutation={makeMutation()} toast={makeToast()} />
    )
    expect(screen.getByText(/additional sources/i)).toBeDefined()
  })

  it('renders Gradle Include Configurations input', () => {
    const component = baseComponent()
    renderWithProviders(
      <EscrowTab component={component} updateMutation={makeMutation()} toast={makeToast()} />
    )
    expect(screen.getByText(/gradle include configurations/i)).toBeDefined()
  })

  it('renders Gradle Exclude Configurations input', () => {
    const component = baseComponent()
    renderWithProviders(
      <EscrowTab component={component} updateMutation={makeMutation()} toast={makeToast()} />
    )
    expect(screen.getByText(/gradle exclude configurations/i)).toBeDefined()
  })

  it('renders Gradle Include Test Configurations switch', () => {
    const component = baseComponent()
    renderWithProviders(
      <EscrowTab component={component} updateMutation={makeMutation()} toast={makeToast()} />
    )
    expect(screen.getByText(/gradle include test configurations/i)).toBeDefined()
    expect(screen.getByRole('switch', { name: /gradle include test configurations/i })).toBeDefined()
  })

  it('initialises Additional Sources from fixture value', () => {
    const component = baseComponent()
    // Override escrow fixture to provide a value
    component.configurations![0]!.escrow!.additionalSources = 'src/extra'
    renderWithProviders(
      <EscrowTab component={component} updateMutation={makeMutation()} toast={makeToast()} />
    )
    const input = screen.getByPlaceholderText(/additional source paths/i) as HTMLInputElement
    expect(input.value).toBe('src/extra')
  })

  it('initialises gradleIncludeTestConfigurations switch from fixture', () => {
    const component = baseComponent()
    component.configurations![0]!.escrow!.gradleIncludeTestConfigurations = true
    renderWithProviders(
      <EscrowTab component={component} updateMutation={makeMutation()} toast={makeToast()} />
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
      <EscrowTab component={component} updateMutation={makeMutation(mutateAsync)} toast={makeToast()} />
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
      <EscrowTab component={component} updateMutation={makeMutation(mutateAsync)} toast={makeToast()} />
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
      <EscrowTab component={component} updateMutation={makeMutation(mutateAsync)} toast={makeToast()} />
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
      <EscrowTab component={component} updateMutation={makeMutation(mutateAsync)} toast={makeToast()} />
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
      <EscrowTab component={component} updateMutation={makeMutation(mutateAsync)} toast={makeToast()} />
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
