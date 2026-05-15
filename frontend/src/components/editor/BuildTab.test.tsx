import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BuildTab } from './BuildTab'
import type { ComponentDetail, ComponentConfiguration } from '../../lib/types'
import type { UseMutationResult } from '@tanstack/react-query'
import type { ComponentUpdateRequest } from '../../hooks/useComponent'

// Stub FieldOverrideInline so tests don't need the overrides API
vi.mock('./FieldOverrideInline', () => ({
  FieldOverrideInline: () => null,
}))

// Stub EnumSelect to avoid field-config fetch
vi.mock('../ui/EnumSelect', () => ({
  EnumSelect: ({ value, onValueChange, placeholder }: { value: string; onValueChange: (v: string) => void; placeholder?: string }) => (
    <input
      data-testid="enum-select"
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
      placeholder={placeholder}
    />
  ),
}))

function makeBaseRow(overrides: Partial<ComponentConfiguration> = {}): ComponentConfiguration {
  return {
    id: 'cfg-1',
    versionRange: '(,0),[0,)',
    rowType: 'BASE',
    overriddenAttribute: null,
    isSyntheticBase: false,
    build: null,
    escrow: null,
    jira: null,
    vcsEntries: [],
    mavenArtifacts: [],
    fileUrlArtifacts: [],
    dockerImages: [],
    packages: [],
    requiredTools: [],
    ...overrides,
  }
}

function makeComponent(overrides: Partial<ComponentDetail> = {}): ComponentDetail {
  return {
    id: 'c-1',
    name: 'my-component',
    displayName: 'My Component',
    componentOwner: 'alice',
    productType: '',
    systems: [],
    clientCode: null,
    solution: false,
    parentComponentName: null,
    archived: false,
    version: 5,
    createdAt: null,
    updatedAt: null,
    configurations: [makeBaseRow()],
    ...overrides,
  } as ComponentDetail
}

function makeMutation(mutateFn = vi.fn()) {
  return {
    mutateAsync: mutateFn,
    isPending: false,
    isError: false,
    isSuccess: false,
    error: null,
    data: undefined,
    variables: undefined,
    status: 'idle',
    reset: vi.fn(),
    mutate: vi.fn(),
    context: undefined,
    failureCount: 0,
    failureReason: null,
    isIdle: true,
    isPaused: false,
    submittedAt: 0,
  } as unknown as UseMutationResult<ComponentDetail, Error, ComponentUpdateRequest>
}

function renderTab(component: ComponentDetail, mutateAsync = vi.fn()) {
  const toast = vi.fn()
  const mutation = makeMutation(mutateAsync)
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <BuildTab component={component} updateMutation={mutation} toast={toast} />
    </QueryClientProvider>
  )
  return { toast, mutateAsync, ...utils }
}

// ─── 1. Save path ─────────────────────────────────────────────────────────────
describe('BuildTab — save path', () => {
  it('sends baseConfiguration.build with typed scalars on save', async () => {
    const mutateFn = vi.fn().mockResolvedValue({})
    const component = makeComponent({
      configurations: [
        makeBaseRow({
          build: { buildSystem: 'GRADLE', buildFilePath: 'build.gradle', javaVersion: '17', gradleVersion: '8.5', deprecated: false },
        }),
      ],
    })

    const { getByPlaceholderText, getByText } = renderTab(component, mutateFn)

    const gradleInput = getByPlaceholderText('8.6')
    await userEvent.clear(gradleInput)
    await userEvent.type(gradleInput, '8.6')

    await userEvent.click(getByText('Save Build'))

    expect(mutateFn).toHaveBeenCalledOnce()
    const callArg = mutateFn.mock.calls[0]![0] as ComponentUpdateRequest
    expect(callArg.baseConfiguration?.build?.gradleVersion).toBe('8.6')
    expect(callArg.baseConfiguration?.build?.buildSystem).toBe('GRADLE')
    expect(callArg.baseConfiguration?.build?.javaVersion).toBe('17')
  })

  it('sends null for cleared string fields', async () => {
    const mutateFn = vi.fn().mockResolvedValue({})
    const component = makeComponent({
      configurations: [
        makeBaseRow({
          build: { buildSystem: 'GRADLE', gradleVersion: '8.5' },
        }),
      ],
    })

    const { getByPlaceholderText, getByText } = renderTab(component, mutateFn)

    const gradleInput = getByPlaceholderText('8.6')
    await userEvent.clear(gradleInput)

    await userEvent.click(getByText('Save Build'))

    expect(mutateFn).toHaveBeenCalledOnce()
    const callArg = mutateFn.mock.calls[0]![0] as ComponentUpdateRequest
    expect(callArg.baseConfiguration?.build?.gradleVersion).toBeNull()
  })

  it('does not include legacy buildConfiguration key', async () => {
    const mutateFn = vi.fn().mockResolvedValue({})
    const component = makeComponent()

    const { getByText } = renderTab(component, mutateFn)
    await userEvent.click(getByText('Save Build'))

    expect(mutateFn).toHaveBeenCalledOnce()
    const callArg = mutateFn.mock.calls[0]![0] as Record<string, unknown>
    expect(callArg['buildConfiguration']).toBeUndefined()
  })
})

// ─── 2. Required Tools section ────────────────────────────────────────────────
describe('BuildTab — Required Tools read-only section', () => {
  it('renders tool name badges when requiredTools is non-empty', () => {
    const component = makeComponent({
      configurations: [
        makeBaseRow({
          requiredTools: ['my-tool', 'another-tool'],
        }),
      ],
    })

    renderTab(component)

    expect(screen.getByText('my-tool')).toBeDefined()
    expect(screen.getByText('another-tool')).toBeDefined()
  })

  it('does NOT render Required Tools section when requiredTools is empty', () => {
    const component = makeComponent({
      configurations: [makeBaseRow({ requiredTools: [] })],
    })

    renderTab(component)

    expect(screen.queryByText(/Required Tools/i)).toBeNull()
  })
})

// ─── 3. Existing structure preserved ─────────────────────────────────────────
describe('BuildTab — existing structure preserved', () => {
  it('renders Build System, Java Version, Deprecated controls', () => {
    const component = makeComponent({
      configurations: [
        makeBaseRow({
          build: { buildSystem: 'MAVEN', buildFilePath: 'pom.xml', javaVersion: '17', deprecated: false },
        }),
      ],
    })

    renderTab(component)

    expect(screen.getByText('Build System')).toBeDefined()
    expect(screen.getByText('Java Version')).toBeDefined()
    expect(screen.getByText('Deprecated')).toBeDefined()
    expect(screen.getByText('Gradle Version')).toBeDefined()
    expect(screen.getByText('Save Build')).toBeDefined()
  })

  it('populates fields from BASE row build aspect', () => {
    const component = makeComponent({
      configurations: [
        makeBaseRow({
          build: { buildSystem: 'GRADLE', buildFilePath: 'build.gradle', javaVersion: '21', gradleVersion: '8.6', deprecated: false },
        }),
      ],
    })

    renderTab(component)

    expect((screen.getByTestId('enum-select') as HTMLInputElement).value).toBe('GRADLE')
    expect((screen.getByPlaceholderText('pom.xml / build.gradle') as HTMLInputElement).value).toBe('build.gradle')
    expect((screen.getByPlaceholderText('1.8 / 11 / 17 / 21') as HTMLInputElement).value).toBe('21')
    expect((screen.getByPlaceholderText('8.6') as HTMLInputElement).value).toBe('8.6')
  })

  it('renders empty fields when component has no BASE row build aspect', () => {
    const component = makeComponent({
      configurations: [makeBaseRow({ build: null })],
    })

    renderTab(component)

    expect((screen.getByPlaceholderText('8.6') as HTMLInputElement).value).toBe('')
    expect((screen.getByPlaceholderText('1.8 / 11 / 17 / 21') as HTMLInputElement).value).toBe('')
  })
})
