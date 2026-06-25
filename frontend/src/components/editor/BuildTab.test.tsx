import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BuildTab } from './BuildTab'
import { useBuildSection } from './useBuildSection'
import { TooltipProvider } from '../ui/tooltip'
import { fieldDescriptions } from '../../lib/fieldDescriptions'
import type { ComponentDetail, ComponentConfiguration } from '../../lib/types'

// Visible stub for inline override placement assertions.
vi.mock('./FieldOverrideInline', () => ({
  FieldOverrideInline: ({ overriddenAttribute }: { overriddenAttribute: string }) => (
    <div data-testid={`field-override-inline-${overriddenAttribute}`} />
  ),
}))

// EnumSelect stub mirrors the real prop surface (id / aria-* / onBlur).
vi.mock('../ui/EnumSelect', () => ({
  EnumSelect: ({
    value, onValueChange, placeholder, id, onBlur,
  }: {
    value: string; onValueChange: (v: string) => void; placeholder?: string; id?: string; onBlur?: () => void
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

const mockUseAdminFieldConfig = vi.fn()
vi.mock('../../hooks/useAdminConfig', () => ({
  useFieldConfig: () => mockUseAdminFieldConfig(),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mockUseAdminFieldConfig.mockReturnValue({ data: undefined, isLoading: false, isError: false })
})

function makeBaseRow(overrides: Partial<ComponentConfiguration> = {}): ComponentConfiguration {
  return {
    id: 'cfg-1', versionRange: '(,0),[0,)', rowType: 'BASE', overriddenAttribute: null,
    isSyntheticBase: false, build: null, escrow: null, jira: null, vcsEntries: [],
    mavenArtifacts: [], fileUrlArtifacts: [], dockerImages: [], packages: [], requiredTools: [],
    ...overrides,
  }
}

function makeComponent(over: Partial<ComponentDetail> = {}): ComponentDetail {
  return {
    id: 'c1', name: 'comp', displayName: null, componentOwner: null, productType: null,
    system: null, clientCode: null, archived: false, solution: false, parentComponentName: null,
    version: 1, createdAt: null, updatedAt: null, labels: [], docs: [], artifactIds: [],
    securityGroups: [], teamcityProjects: [], configurations: [makeBaseRow()],
    ...over,
  }
}

// Harness: render the presentational BuildTab driven by a real useBuildSection;
// capture the live section so tests can inspect its slice after interactions.
const captured: { section?: ReturnType<typeof useBuildSection> } = {}
function Harness({ component, canEdit = true }: { component: ComponentDetail; canEdit?: boolean }) {
  const section = useBuildSection(component)
  captured.section = section
  return (
    <TooltipProvider>
      <BuildTab component={component} section={section} canEdit={canEdit} />
    </TooltipProvider>
  )
}
function renderTab(component: ComponentDetail, canEdit = true) {
  captured.section = undefined
  return render(<Harness component={component} canEdit={canEdit} />)
}

describe('BuildTab — slice (combined save)', () => {
  it('the section slice carries baseConfiguration.build with typed scalars', () => {
    renderTab(makeComponent({
      configurations: [makeBaseRow({ build: { buildSystem: 'GRADLE', javaVersion: '17', gradleVersion: '8.6' } })],
    }))
    const build = captured.section!.slice.request.baseConfiguration?.build
    expect(build?.buildSystem).toBe('GRADLE')
    expect(build?.javaVersion).toBe('17')
    expect(build?.gradleVersion).toBe('8.6')
  })

  it('clearing a string field surfaces null in the slice', async () => {
    renderTab(makeComponent({
      configurations: [makeBaseRow({ build: { buildSystem: 'GRADLE', gradleVersion: '8.6' } })],
    }))
    await userEvent.clear(screen.getByPlaceholderText('8.6'))
    expect(captured.section!.slice.request.baseConfiguration?.build?.gradleVersion).toBeNull()
  })

  it('omits the Escrow-migrated fields from the slice build payload', () => {
    renderTab(makeComponent({
      configurations: [makeBaseRow({ build: { buildSystem: 'GRADLE', buildTasks: 'assemble', deprecated: true } })],
    }))
    const build = captured.section!.slice.request.baseConfiguration?.build as Record<string, unknown>
    expect('buildTasks' in build).toBe(false)
    expect('deprecated' in build).toBe(false)
    expect('requiredProject' in build).toBe(false)
  })
})

describe('BuildTab — structure preserved', () => {
  it('renders the build-toolchain controls', () => {
    renderTab(makeComponent({ configurations: [makeBaseRow({ build: { buildSystem: 'GRADLE' } })] }))
    expect(screen.getByTestId('enum-select-build-buildSystem')).toBeDefined()
    expect(screen.getByPlaceholderText('pom.xml / build.gradle')).toBeDefined()
    expect(screen.getByTestId('enum-select-build-javaVersion')).toBeDefined()
  })

  it('does NOT render the fields migrated to the Escrow tab', () => {
    renderTab(makeComponent({ configurations: [makeBaseRow({ build: { buildSystem: 'GRADLE' } })] }))
    expect(screen.queryByText('Build Tasks')).toBeNull()
    expect(screen.queryByText('System Properties')).toBeNull()
  })

  it('populates fields from BASE row build aspect', () => {
    renderTab(makeComponent({
      configurations: [makeBaseRow({ build: { buildSystem: 'GRADLE', buildFilePath: 'build.gradle' } })],
    }))
    expect((screen.getByPlaceholderText('pom.xml / build.gradle') as HTMLInputElement).value).toBe('build.gradle')
  })
})

describe('BuildTab — Maven/Gradle Version visibility', () => {
  it('hides Maven Version when no range has buildSystem MAVEN', () => {
    renderTab(makeComponent({ configurations: [makeBaseRow({ build: { buildSystem: 'GRADLE' } })] }))
    expect(screen.queryByTestId('enum-select-build-mavenVersion')).toBeNull()
  })

  it('hides Gradle Version when no range has buildSystem GRADLE', () => {
    renderTab(makeComponent({ configurations: [makeBaseRow({ build: { buildSystem: 'MAVEN' } })] }))
    expect(screen.queryByPlaceholderText('8.6')).toBeNull()
  })

  it('shows Maven Version when an override row pins buildSystem=MAVEN for some range', () => {
    renderTab(makeComponent({
      configurations: [
        makeBaseRow({ build: { buildSystem: 'GRADLE' } }),
        makeBaseRow({ id: 'ov', rowType: 'SCALAR_OVERRIDE', overriddenAttribute: 'build.buildSystem', build: { buildSystem: 'MAVEN' } }),
      ],
    }))
    expect(screen.getByTestId('enum-select-build-mavenVersion')).toBeDefined()
  })

  it('reveals Maven Version live when Build System is switched to MAVEN', async () => {
    renderTab(makeComponent({ configurations: [makeBaseRow({ build: { buildSystem: 'GRADLE' } })] }))
    expect(screen.queryByTestId('enum-select-build-mavenVersion')).toBeNull()
    await userEvent.clear(screen.getByTestId('enum-select-build-buildSystem'))
    await userEvent.type(screen.getByTestId('enum-select-build-buildSystem'), 'MAVEN')
    expect(screen.getByTestId('enum-select-build-mavenVersion')).toBeDefined()
  })
})

describe('BuildTab — buildSystem required', () => {
  it('renders a `*` required marker next to the Build System label', () => {
    renderTab(makeComponent({ configurations: [makeBaseRow({ build: { buildSystem: 'GRADLE' } })] }))
    const label = screen.getByText('Build System').closest('label')
    expect(label?.textContent).toContain('*')
  })

  it('clearing buildSystem and blurring surfaces the inline required error + reports missing up', async () => {
    renderTab(makeComponent({ configurations: [makeBaseRow({ build: { buildSystem: 'GRADLE' } })] }))
    const select = screen.getByTestId('enum-select-build-buildSystem')
    await userEvent.clear(select)
    await userEvent.tab()
    expect(screen.getByText('Build System is required')).toBeDefined()
    expect(captured.section!.buildSystemMissing).toBe(true)
  })
})

describe('BuildTab — field-config label overrides', () => {
  it('renders the config label override instead of the hardcoded label', () => {
    mockUseAdminFieldConfig.mockReturnValue({
      data: { fields: { 'build.buildSystem': { label: 'Builder' } } },
      isLoading: false, isError: false,
    })
    renderTab(makeComponent({ configurations: [makeBaseRow({ build: { buildSystem: 'GRADLE' } })] }))
    expect(screen.getByText('Builder')).toBeDefined()
  })
})

describe('BuildTab — inline override coverage', () => {
  it('renders an inline override entry-point per build scalar', () => {
    renderTab(makeComponent({ configurations: [makeBaseRow({ build: { buildSystem: 'GRADLE' } })] }))
    expect(screen.getByTestId('field-override-inline-build.buildSystem')).toBeDefined()
    expect(screen.getByTestId('field-override-inline-build.buildFilePath')).toBeDefined()
    expect(screen.getByTestId('field-override-inline-build.javaVersion')).toBeDefined()
  })
})

describe('BuildTab field descriptions (FieldInfo)', () => {
  it('renders an info icon for Build System (registry description present)', () => {
    expect(fieldDescriptions['build.buildSystem']).toBeDefined()
    renderTab(makeComponent({ configurations: [makeBaseRow({ build: { buildSystem: 'GRADLE' } })] }))
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0)
  })
})
