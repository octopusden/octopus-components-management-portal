import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BuildTab } from './BuildTab'
import { TooltipProvider } from '../ui/tooltip'
import { fieldDescriptions } from '../../lib/fieldDescriptions'
import type { ComponentDetail, ComponentConfiguration } from '../../lib/types'
import type { UseMutationResult } from '@tanstack/react-query'
import type { ComponentUpdateRequest } from '../../hooks/useComponent'

// Visible stub: each FieldOverrideInline renders a div tagged with the
// overriddenAttribute so coverage tests can assert per-field inline placement.
// Empty <div> is functionally equivalent to null for the legacy save-path
// tests that don't query for these elements.
vi.mock('./FieldOverrideInline', () => ({
  FieldOverrideInline: ({ overriddenAttribute }: { overriddenAttribute: string }) => (
    <div data-testid={`field-override-inline-${overriddenAttribute}`} />
  ),
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
      data-testid={id ? `enum-select-${id}` : 'enum-select'}
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

function renderTab(component: ComponentDetail, mutateAsync = vi.fn(), canEdit = true) {
  const toast = vi.fn()
  const mutation = makeMutation(mutateAsync)
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const utils = render(
    <QueryClientProvider client={queryClient}>
      {/* TooltipProvider mirrors the app-root provider required by FieldInfo. */}
      <TooltipProvider>
        <BuildTab component={component} updateMutation={mutation} toast={toast} canEdit={canEdit} />
      </TooltipProvider>
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

    const mavenInput = getByPlaceholderText('Select Maven version')
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
    await userEvent.clear(getByPlaceholderText('Select Maven version'))
    await userEvent.click(getByText('Save Build'))

    const callArg = mutateFn.mock.calls[0]![0] as ComponentUpdateRequest
    expect(callArg.baseConfiguration?.build?.mavenVersion).toBeNull()
  })

  it('omits the Escrow-tab-migrated fields from the PATCH payload entirely', async () => {
    // Build Tasks / System Properties / Deprecated / Required Project /
    // Required Tools / Project Version render and save on the Escrow tab now.
    // CRS PATCH is per-field (?.let): keys ABSENT here = untouched, so a
    // Build save can never clobber what the Escrow tab owns.
    const mutateFn = vi.fn().mockResolvedValue({})
    const component = makeComponent({
      configurations: [
        makeBaseRow({
          build: { buildSystem: 'MAVEN', buildTasks: 'clean install', systemProperties: '-Dfoo=bar', deprecated: true, requiredProject: true, projectVersion: '1.2.3' },
          requiredTools: ['tool-x'],
        }),
      ],
    })

    const { getByText } = renderTab(component, mutateFn)
    await userEvent.click(getByText('Save Build'))

    expect(mutateFn).toHaveBeenCalledOnce()
    const callArg = mutateFn.mock.calls[0]![0] as ComponentUpdateRequest
    const build = callArg.baseConfiguration?.build as Record<string, unknown>
    expect('buildTasks' in build).toBe(false)
    expect('systemProperties' in build).toBe(false)
    expect('deprecated' in build).toBe(false)
    expect('requiredProject' in build).toBe(false)
    expect('projectVersion' in build).toBe(false)
    expect('requiredTools' in (callArg.baseConfiguration as Record<string, unknown>)).toBe(false)
  })
})

// ─── 3. Existing structure preserved ─────────────────────────────────────────
describe('BuildTab — existing structure preserved', () => {
  it('renders the build-toolchain controls', () => {
    const component = makeComponent({
      configurations: [
        makeBaseRow({
          build: { buildSystem: 'MAVEN', buildFilePath: 'pom.xml', javaVersion: '17' },
        }),
      ],
    })

    renderTab(component)

    expect(screen.getByText('Build System')).toBeDefined()
    expect(screen.getByText('Java Version')).toBeDefined()
    expect(screen.getByText('Maven Version')).toBeDefined()
    expect(screen.getByText('Save Build')).toBeDefined()
    // Gradle Version is hidden for a MAVEN-only component — see the
    // visibility describe below.
  })

  it('does NOT render the fields migrated to the Escrow tab', () => {
    renderTab(makeComponent())

    expect(screen.queryByText('Build Tasks')).toBeNull()
    expect(screen.queryByText('System Properties')).toBeNull()
    expect(screen.queryByText('Deprecated')).toBeNull()
    expect(screen.queryByText('Required Project')).toBeNull()
    expect(screen.queryByText('Required Tools')).toBeNull()
    expect(screen.queryByText('Project Version')).toBeNull()
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

    expect((screen.getByTestId('enum-select-build-buildSystem') as HTMLInputElement).value).toBe('GRADLE')
    expect((screen.getByPlaceholderText('pom.xml / build.gradle') as HTMLInputElement).value).toBe('build.gradle')
    expect((screen.getByPlaceholderText('Select Java version') as HTMLInputElement).value).toBe('21')
    expect((screen.getByPlaceholderText('8.6') as HTMLInputElement).value).toBe('8.6')
  })

  it('renders empty fields when component has no BASE row build aspect', () => {
    const component = makeComponent({
      configurations: [makeBaseRow({ build: null })],
    })

    renderTab(component)

    expect((screen.getByPlaceholderText('Select Java version') as HTMLInputElement).value).toBe('')
    expect((screen.getByPlaceholderText('pom.xml / build.gradle') as HTMLInputElement).value).toBe('')
  })
})

// ─── 3b. Maven/Gradle Version conditional visibility ─────────────────────────
// The tool-version input renders only when SOME version range builds with that
// tool: the BASE Build System (tracking the live, possibly unsaved selection)
// or any build.buildSystem override row. A range-override on the version field
// itself also keeps it visible (the inline-override list must stay reachable).
describe('BuildTab — Maven/Gradle Version visibility', () => {
  function makeOverrideRow(overrides: Partial<ComponentConfiguration>): ComponentConfiguration {
    return makeBaseRow({
      id: 'cfg-ovr-1',
      rowType: 'SCALAR_OVERRIDE',
      versionRange: '[1.0,2.0)',
      ...overrides,
    })
  }

  it('hides Maven Version when no range has buildSystem MAVEN', () => {
    const component = makeComponent({
      configurations: [makeBaseRow({ build: { buildSystem: 'GRADLE', gradleVersion: '8.6' } })],
    })
    renderTab(component)
    expect(screen.queryByText('Maven Version')).toBeNull()
    expect(screen.getByText('Gradle Version')).toBeDefined()
  })

  it('hides Gradle Version when no range has buildSystem GRADLE', () => {
    const component = makeComponent({
      configurations: [makeBaseRow({ build: { buildSystem: 'MAVEN', mavenVersion: '3.9.5' } })],
    })
    renderTab(component)
    expect(screen.queryByText('Gradle Version')).toBeNull()
    expect(screen.getByText('Maven Version')).toBeDefined()
  })

  it('hides both tool versions when the build aspect is absent', () => {
    const component = makeComponent({ configurations: [makeBaseRow({ build: null })] })
    renderTab(component)
    expect(screen.queryByText('Maven Version')).toBeNull()
    expect(screen.queryByText('Gradle Version')).toBeNull()
  })

  it('shows Maven Version when an override row pins buildSystem=MAVEN for some range', () => {
    const component = makeComponent({
      configurations: [
        makeBaseRow({ build: { buildSystem: 'GRADLE', gradleVersion: '8.6' } }),
        makeOverrideRow({ overriddenAttribute: 'build.buildSystem', build: { buildSystem: 'MAVEN' } }),
      ],
    })
    renderTab(component)
    expect(screen.getByText('Maven Version')).toBeDefined()
    expect(screen.getByText('Gradle Version')).toBeDefined()
  })

  it('keeps Gradle Version visible when build.gradleVersion itself is overridden in some range', () => {
    const component = makeComponent({
      configurations: [
        makeBaseRow({ build: { buildSystem: 'MAVEN', mavenVersion: '3.9.5' } }),
        makeOverrideRow({ overriddenAttribute: 'build.gradleVersion', build: { gradleVersion: '8.9' } }),
      ],
    })
    renderTab(component)
    expect(screen.getByText('Gradle Version')).toBeDefined()
  })

  it('reveals Maven Version live when Build System is switched to MAVEN', async () => {
    const component = makeComponent({
      configurations: [makeBaseRow({ build: { buildSystem: 'GRADLE' } })],
    })
    renderTab(component)
    expect(screen.queryByText('Maven Version')).toBeNull()

    const enumSelect = screen.getByTestId('enum-select-build-buildSystem') as HTMLInputElement
    await userEvent.clear(enumSelect)
    await userEvent.type(enumSelect, 'MAVEN')

    expect(screen.getByText('Maven Version')).toBeDefined()
    expect(screen.queryByText('Gradle Version')).toBeNull()
  })

  it('omits the hidden tool version from the PATCH payload', async () => {
    const mutateFn = vi.fn().mockResolvedValue({})
    const component = makeComponent({
      configurations: [
        makeBaseRow({ build: { buildSystem: 'GRADLE', gradleVersion: '8.6', mavenVersion: '3.9.5' } }),
      ],
    })
    const { getByText } = renderTab(component, mutateFn)
    await userEvent.click(getByText('Save Build'))

    const callArg = mutateFn.mock.calls[0]![0] as ComponentUpdateRequest
    const build = callArg.baseConfiguration?.build as Record<string, unknown>
    // Hidden ≠ cleared: the stale mavenVersion stays untouched server-side.
    expect('mavenVersion' in build).toBe(false)
    expect(build['gradleVersion']).toBe('8.6')
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

    const enumSelect = screen.getByTestId('enum-select-build-buildSystem') as HTMLInputElement
    await userEvent.clear(enumSelect)
    // Wrap the synchronous .blur() in act() so React flushes the setState
    // it triggers (setBuildSystemTouched) before the assertion runs and
    // before the test exits — otherwise React emits an act-warning even
    // though waitFor would have caught the state update.
    await act(async () => {
      enumSelect.blur()
    })

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
    const enumSelect = getByTestId('enum-select-build-buildSystem') as HTMLInputElement
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

// Dual-system fixture: BASE builds with MAVEN, one range overrides to GRADLE —
// so both tool-version inputs (and their inline overrides / info icons) render.
function makeDualSystemComponent() {
  return makeComponent({
    configurations: [
      makeBaseRow({ build: { buildSystem: 'MAVEN', mavenVersion: '3.9.5' } }),
      makeBaseRow({
        id: 'cfg-ovr-1',
        rowType: 'SCALAR_OVERRIDE',
        versionRange: '[1.0,2.0)',
        overriddenAttribute: 'build.buildSystem',
        build: { buildSystem: 'GRADLE' },
      }),
    ],
  })
}

describe('BuildTab — inline override coverage', () => {
  const overridablePaths = [
    'build.buildSystem',
    'build.buildFilePath',
    'build.javaVersion',
    'build.mavenVersion',
    'build.gradleVersion',
    // buildTasks / systemProperties / deprecated / requiredProject /
    // projectVersion inline overrides moved to the Escrow tab with their fields.
  ]

  it.each(overridablePaths)('renders FieldOverrideInline under %s', (path) => {
    renderTab(makeDualSystemComponent())
    expect(screen.getByTestId(`field-override-inline-${path}`)).toBeInTheDocument()
  })
})

describe('BuildTab field descriptions (FieldInfo)', () => {
  // Exact set of registry paths this tab must expose an info icon for.
  // (buildTasks / systemProperties / deprecated / requiredProject /
  // requiredTools / projectVersion moved to the Escrow tab.)
  const EXPECTED_PATHS = [
    'build.buildSystem',
    'build.buildFilePath',
    'build.javaVersion',
    'build.mavenVersion',
    'build.gradleVersion',
  ]

  it('renders exactly one info icon per described field', () => {
    renderTab(makeDualSystemComponent())
    for (const path of EXPECTED_PATHS) {
      expect(
        document.querySelectorAll(`[data-field-path="${path}"]`),
        `info icon for ${path}`,
      ).toHaveLength(1)
    }
  })

  it('opens the registry description for Build System on focus', async () => {
    renderTab(makeComponent())
    const trigger = document.querySelector('[data-field-path="build.buildSystem"]') as HTMLElement
    act(() => trigger.focus())
    const tooltip = await screen.findByRole('tooltip')
    expect(tooltip).toHaveTextContent(fieldDescriptions['build.buildSystem']!)
  })
})
