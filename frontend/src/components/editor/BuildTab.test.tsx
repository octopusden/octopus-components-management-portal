import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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

// Stub EnumSelect to avoid field-config fetch. The stub mirrors the props
// surface real EnumSelect now exposes (id / aria-required / aria-invalid /
// aria-describedby) so BuildTab can wire its required marker and inline
// error without bumping into the stub.
vi.mock('../ui/EnumSelect', () => ({
  EnumSelect: ({
    value,
    onValueChange,
    placeholder,
    id,
    onBlur,
  }: {
    value: string
    onValueChange: (v: string) => void
    placeholder?: string
    id?: string
    onBlur?: () => void
  }) => (
    <input
      id={id}
      data-testid="enum-select"
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
      onBlur={() => onBlur?.()}
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
    // ui-swift-sloth §5: handleSave now blocks empty buildSystem with a 400
    // pre-empt; seed a value so this test still exercises the wire-shape
    // assertion that it actually cares about.
    const component = makeComponent({
      configurations: [makeBaseRow({ build: { buildSystem: 'MAVEN' } })],
    })

    const { getByText } = renderTab(component, mutateFn)
    await userEvent.click(getByText('Save Build'))

    expect(mutateFn).toHaveBeenCalledOnce()
    const callArg = mutateFn.mock.calls[0]![0] as Record<string, unknown>
    expect(callArg['buildConfiguration']).toBeUndefined()
  })

  it('sends mavenVersion in build payload', async () => {
    const mutateFn = vi.fn().mockResolvedValue({})
    const component = makeComponent({
      configurations: [
        makeBaseRow({
          build: { buildSystem: 'MAVEN', mavenVersion: '3.9.5' },
        }),
      ],
    })

    const { getByPlaceholderText, getByText } = renderTab(component, mutateFn)

    const mavenInput = getByPlaceholderText('3.9.6')
    await userEvent.clear(mavenInput)
    await userEvent.type(mavenInput, '3.9.8')

    await userEvent.click(getByText('Save Build'))

    expect(mutateFn).toHaveBeenCalledOnce()
    const callArg = mutateFn.mock.calls[0]![0] as ComponentUpdateRequest
    expect(callArg.baseConfiguration?.build?.mavenVersion).toBe('3.9.8')
  })

  it('sends null for mavenVersion when cleared', async () => {
    const mutateFn = vi.fn().mockResolvedValue({})
    const component = makeComponent({
      configurations: [
        makeBaseRow({
          build: { buildSystem: 'MAVEN', mavenVersion: '3.9.5' },
        }),
      ],
    })

    const { getByPlaceholderText, getByText } = renderTab(component, mutateFn)
    await userEvent.clear(getByPlaceholderText('3.9.6'))
    await userEvent.click(getByText('Save Build'))

    const callArg = mutateFn.mock.calls[0]![0] as ComponentUpdateRequest
    expect(callArg.baseConfiguration?.build?.mavenVersion).toBeNull()
  })

  it('sends buildSystemVersion in build payload', async () => {
    const mutateFn = vi.fn().mockResolvedValue({})
    const component = makeComponent({
      configurations: [
        makeBaseRow({
          build: { buildSystem: 'MAVEN', buildSystemVersion: '3.8.0' },
        }),
      ],
    })

    const { getByPlaceholderText, getByText } = renderTab(component, mutateFn)

    const input = getByPlaceholderText('e.g. 3.9.6')
    await userEvent.clear(input)
    await userEvent.type(input, '3.9.0')

    await userEvent.click(getByText('Save Build'))

    const callArg = mutateFn.mock.calls[0]![0] as ComponentUpdateRequest
    expect(callArg.baseConfiguration?.build?.buildSystemVersion).toBe('3.9.0')
  })

  it('sends null for buildSystemVersion when cleared', async () => {
    const mutateFn = vi.fn().mockResolvedValue({})
    const component = makeComponent({
      configurations: [
        makeBaseRow({ build: { buildSystem: 'MAVEN', buildSystemVersion: '3.8.0' } }),
      ],
    })

    const { getByPlaceholderText, getByText } = renderTab(component, mutateFn)
    await userEvent.clear(getByPlaceholderText('e.g. 3.9.6'))
    await userEvent.click(getByText('Save Build'))

    const callArg = mutateFn.mock.calls[0]![0] as ComponentUpdateRequest
    expect(callArg.baseConfiguration?.build?.buildSystemVersion).toBeNull()
  })

  it('sends projectVersion in build payload', async () => {
    const mutateFn = vi.fn().mockResolvedValue({})
    const component = makeComponent({
      configurations: [
        makeBaseRow({ build: { buildSystem: 'MAVEN', projectVersion: '1.2.3' } }),
      ],
    })

    const { getByPlaceholderText, getByText } = renderTab(component, mutateFn)

    const input = getByPlaceholderText('1.0.0')
    await userEvent.clear(input)
    await userEvent.type(input, '2.0.0')

    await userEvent.click(getByText('Save Build'))

    const callArg = mutateFn.mock.calls[0]![0] as ComponentUpdateRequest
    expect(callArg.baseConfiguration?.build?.projectVersion).toBe('2.0.0')
  })

  it('sends null for projectVersion when cleared', async () => {
    const mutateFn = vi.fn().mockResolvedValue({})
    const component = makeComponent({
      configurations: [
        makeBaseRow({ build: { buildSystem: 'MAVEN', projectVersion: '1.0.0' } }),
      ],
    })

    const { getByPlaceholderText, getByText } = renderTab(component, mutateFn)
    await userEvent.clear(getByPlaceholderText('1.0.0'))
    await userEvent.click(getByText('Save Build'))

    const callArg = mutateFn.mock.calls[0]![0] as ComponentUpdateRequest
    expect(callArg.baseConfiguration?.build?.projectVersion).toBeNull()
  })

  it('sends buildTasks in build payload', async () => {
    const mutateFn = vi.fn().mockResolvedValue({})
    const component = makeComponent({
      configurations: [
        makeBaseRow({ build: { buildSystem: 'MAVEN', buildTasks: 'clean install' } }),
      ],
    })

    const { getByPlaceholderText, getByText } = renderTab(component, mutateFn)

    const input = getByPlaceholderText('clean install / assemble')
    await userEvent.clear(input)
    await userEvent.type(input, 'assemble')

    await userEvent.click(getByText('Save Build'))

    const callArg = mutateFn.mock.calls[0]![0] as ComponentUpdateRequest
    expect(callArg.baseConfiguration?.build?.buildTasks).toBe('assemble')
  })

  it('sends null for buildTasks when cleared', async () => {
    const mutateFn = vi.fn().mockResolvedValue({})
    const component = makeComponent({
      configurations: [
        makeBaseRow({ build: { buildSystem: 'MAVEN', buildTasks: 'clean install' } }),
      ],
    })

    const { getByPlaceholderText, getByText } = renderTab(component, mutateFn)
    await userEvent.clear(getByPlaceholderText('clean install / assemble'))
    await userEvent.click(getByText('Save Build'))

    const callArg = mutateFn.mock.calls[0]![0] as ComponentUpdateRequest
    expect(callArg.baseConfiguration?.build?.buildTasks).toBeNull()
  })

  it('sends systemProperties in build payload', async () => {
    const mutateFn = vi.fn().mockResolvedValue({})
    const component = makeComponent({
      configurations: [
        makeBaseRow({ build: { buildSystem: 'MAVEN', systemProperties: '-Dfoo=bar' } }),
      ],
    })

    const { getByPlaceholderText, getByText } = renderTab(component, mutateFn)

    const textarea = getByPlaceholderText('-Dproperty=value')
    await userEvent.clear(textarea)
    await userEvent.type(textarea, '-Dbaz=qux')

    await userEvent.click(getByText('Save Build'))

    const callArg = mutateFn.mock.calls[0]![0] as ComponentUpdateRequest
    expect(callArg.baseConfiguration?.build?.systemProperties).toBe('-Dbaz=qux')
  })

  it('sends null for systemProperties when cleared', async () => {
    const mutateFn = vi.fn().mockResolvedValue({})
    const component = makeComponent({
      configurations: [
        makeBaseRow({ build: { buildSystem: 'MAVEN', systemProperties: '-Dfoo=bar' } }),
      ],
    })

    const { getByPlaceholderText, getByText } = renderTab(component, mutateFn)
    await userEvent.clear(getByPlaceholderText('-Dproperty=value'))
    await userEvent.click(getByText('Save Build'))

    const callArg = mutateFn.mock.calls[0]![0] as ComponentUpdateRequest
    expect(callArg.baseConfiguration?.build?.systemProperties).toBeNull()
  })

  it('sends requiredProject boolean in build payload', async () => {
    const mutateFn = vi.fn().mockResolvedValue({})
    const component = makeComponent({
      configurations: [
        makeBaseRow({ build: { buildSystem: 'MAVEN', requiredProject: false } }),
      ],
    })

    const { getByLabelText, getByText } = renderTab(component, mutateFn)
    await userEvent.click(getByLabelText('Required Project'))
    await userEvent.click(getByText('Save Build'))

    const callArg = mutateFn.mock.calls[0]![0] as ComponentUpdateRequest
    expect(callArg.baseConfiguration?.build?.requiredProject).toBe(true)
  })
})

// ─── 2. Required Tools editable section ──────────────────────────────────────
describe('BuildTab — Required Tools editable section', () => {
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

  it('renders Required Tools input field always', () => {
    const component = makeComponent({
      configurations: [makeBaseRow({ requiredTools: [] })],
    })

    renderTab(component)

    expect(screen.getByText('Required Tools')).toBeDefined()
    expect(screen.getByPlaceholderText('tool-a, tool-b')).toBeDefined()
  })

  it('saves requiredTools as array at BASE row level, not inside build', async () => {
    const mutateFn = vi.fn().mockResolvedValue({})
    const component = makeComponent({
      configurations: [makeBaseRow({ build: { buildSystem: 'MAVEN' }, requiredTools: [] })],
    })

    const { getByPlaceholderText, getByText } = renderTab(component, mutateFn)

    const input = getByPlaceholderText('tool-a, tool-b')
    await userEvent.type(input, 'tool-a, tool-b, tool-a')

    await userEvent.click(getByText('Save Build'))

    expect(mutateFn).toHaveBeenCalledOnce()
    const callArg = mutateFn.mock.calls[0]![0] as ComponentUpdateRequest
    // deduplicated array at baseConfiguration level
    expect(callArg.baseConfiguration?.requiredTools).toEqual(['tool-a', 'tool-b'])
    // not inside build
    expect((callArg.baseConfiguration?.build as Record<string, unknown> | undefined | null)?.['requiredTools']).toBeUndefined()
  })

  it('saves empty array when requiredTools input is blank', async () => {
    const mutateFn = vi.fn().mockResolvedValue({})
    const component = makeComponent({
      configurations: [makeBaseRow({ build: { buildSystem: 'MAVEN' }, requiredTools: ['tool-x'] })],
    })

    const { getByPlaceholderText, getByText } = renderTab(component, mutateFn)
    await userEvent.clear(getByPlaceholderText('tool-a, tool-b'))
    await userEvent.click(getByText('Save Build'))

    const callArg = mutateFn.mock.calls[0]![0] as ComponentUpdateRequest
    expect(callArg.baseConfiguration?.requiredTools).toEqual([])
  })

  it('populates input from existing requiredTools', () => {
    const component = makeComponent({
      configurations: [makeBaseRow({ requiredTools: ['tool-x', 'tool-y'] })],
    })

    renderTab(component)

    const input = screen.getByPlaceholderText('tool-a, tool-b') as HTMLInputElement
    expect(input.value).toBe('tool-x, tool-y')
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

  it('renders new Wave B controls', () => {
    renderTab(makeComponent())

    expect(screen.getByText('Build System Version')).toBeDefined()
    expect(screen.getByText('Maven Version')).toBeDefined()
    expect(screen.getByText('Project Version')).toBeDefined()
    expect(screen.getByText('Build Tasks')).toBeDefined()
    expect(screen.getByText('System Properties')).toBeDefined()
    expect(screen.getByText('Required Project')).toBeDefined()
    expect(screen.getByText('Required Tools')).toBeDefined()
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
    expect((screen.getByPlaceholderText('3.9.6') as HTMLInputElement).value).toBe('')
    expect((screen.getByPlaceholderText('e.g. 3.9.6') as HTMLInputElement).value).toBe('')
  })
})

// ─── 4. ui-swift-sloth §5 — buildSystem required UX ───────────────────────────
describe('BuildTab — buildSystem required (ui-swift-sloth §5)', () => {
  it('renders a `*` required marker next to the Build System label', () => {
    renderTab(makeComponent({ configurations: [makeBaseRow({ build: { buildSystem: '' } })] }))
    const label = screen.getByText('Build System')
    // The required marker is text content "*" inside the same <Label>.
    expect(label.textContent).toContain('*')
  })

  it('clearing buildSystem and blurring surfaces the inline required error', async () => {
    const component = makeComponent({
      configurations: [makeBaseRow({ build: { buildSystem: 'MAVEN' } })],
    })
    renderTab(component)

    const enumSelect = screen.getByTestId('enum-select') as HTMLInputElement
    await userEvent.clear(enumSelect)
    enumSelect.blur()

    await waitFor(() => {
      expect(screen.getByText(/build system is required/i)).toBeDefined()
    })
  })

  it('clicking Save with empty buildSystem shows the error and does NOT call mutate', async () => {
    const mutateFn = vi.fn()
    const component = makeComponent({
      configurations: [makeBaseRow({ build: { buildSystem: '' } })],
    })
    const { getByText } = renderTab(component, mutateFn)

    await userEvent.click(getByText('Save Build'))

    // Inline error surfaces deterministically even though the user never
    // interacted with the field (the touched-on-blur flag is not the only
    // gate — handleSave also runs the guard).
    expect(screen.getByText(/build system is required/i)).toBeDefined()
    expect(mutateFn).not.toHaveBeenCalled()
  })

  it('selecting a buildSystem value clears the error and Save succeeds', async () => {
    const mutateFn = vi.fn().mockResolvedValue({})
    const component = makeComponent({
      configurations: [makeBaseRow({ build: { buildSystem: '' } })],
    })
    const { getByText, getByTestId } = renderTab(component, mutateFn)

    // Trigger the empty-save error first.
    await userEvent.click(getByText('Save Build'))
    expect(screen.getByText(/build system is required/i)).toBeDefined()

    // Now type a value; once selected the error disappears and Save runs.
    const enumSelect = getByTestId('enum-select') as HTMLInputElement
    await userEvent.type(enumSelect, 'MAVEN')
    await userEvent.click(getByText('Save Build'))

    expect(screen.queryByText(/build system is required/i)).toBeNull()
    expect(mutateFn).toHaveBeenCalled()
    const callArg = mutateFn.mock.calls.at(-1)![0] as { baseConfiguration?: { build?: { buildSystem?: string | null } } }
    expect(callArg.baseConfiguration?.build?.buildSystem).toBe('MAVEN')
  })

  it('Save button stays clickable (not disabled) even with empty buildSystem', () => {
    const component = makeComponent({
      configurations: [makeBaseRow({ build: { buildSystem: '' } })],
    })
    renderTab(component)
    const saveBtn = screen.getByRole('button', { name: /save build/i }) as HTMLButtonElement
    expect(saveBtn.disabled).toBe(false)
  })
})
