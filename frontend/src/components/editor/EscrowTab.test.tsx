import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { EscrowTab } from './EscrowTab'
import { useEscrowSection } from './useEscrowSection'
import { TooltipProvider } from '../ui/tooltip'
import { fieldDescriptions } from '../../lib/fieldDescriptions'
import type { ComponentDetail } from '../../lib/types'
import type { FieldVisibility } from '../../hooks/useFieldConfig'

vi.mock('./FieldOverrideInline', () => ({
  FieldOverrideInline: ({ overriddenAttribute }: { overriddenAttribute: string }) => (
    <div data-testid={`field-override-inline-${overriddenAttribute}`} />
  ),
}))

// Control productType visibility per test; keep the pure resolvers real so the
// label-override tests exercise genuine resolution.
const mockUseFieldConfigEntry = vi.fn()
vi.mock('../../hooks/useFieldConfig', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../hooks/useFieldConfig')>()
  return {
    ...actual,
    useFieldConfigOptions: () => ({ options: [], isLoading: false }),
    useFieldConfigEntry: (fieldPath: string) => mockUseFieldConfigEntry(fieldPath),
  }
})

const mockUseAdminFieldConfig = vi.fn()
vi.mock('../../hooks/useAdminConfig', () => ({
  useFieldConfig: () => mockUseAdminFieldConfig(),
}))

function setFieldConfigData(data: unknown) {
  mockUseAdminFieldConfig.mockReturnValue({ data, isLoading: false, isError: false })
}
function makeEntry(visibility: FieldVisibility = 'editable') {
  return { entry: { visibility, required: false }, isLoading: false, isError: false }
}
let productTypeVis: FieldVisibility = 'editable'
function setProductTypeVisibility(vis: FieldVisibility) {
  productTypeVis = vis
  mockUseFieldConfigEntry.mockImplementation((path: string) =>
    path === 'component.productType' ? makeEntry(vis) : makeEntry('editable'),
  )
}

function baseComponent(overrides: Partial<ComponentDetail> = {}): ComponentDetail {
  return {
    id: 'c-1', name: 'my-component', displayName: 'My Component', componentOwner: 'alice',
    productType: 'TYPE_A', systems: [], clientCode: null, solution: false, parentComponentName: null,
    archived: false, version: 3, createdAt: null, updatedAt: null, labels: [], docs: [], artifactIds: [],
    securityGroups: [], teamcityProjects: [],
    configurations: [
      {
        id: 'cfg-1', versionRange: '(,0),[0,)', rowType: 'BASE', overriddenAttribute: null,
        isSyntheticBase: false, build: null,
        escrow: {
          providedDependencies: 'dep1, dep2', reusable: false, generation: 'G2', diskSpace: '5GB',
          additionalSources: null, gradleIncludeConfigurations: null, gradleExcludeConfigurations: null, gradleIncludeTestConfigurations: null,
        },
        jira: null, vcsEntries: [], mavenArtifacts: [], fileUrlArtifacts: [], dockerImages: [], packages: [], requiredTools: [],
      },
    ],
    ...overrides,
  }
}

const captured: { section?: ReturnType<typeof useEscrowSection> } = {}
function Harness({ component, canEdit = true }: { component: ComponentDetail; canEdit?: boolean }) {
  const section = useEscrowSection(component, { productType: productTypeVis })
  captured.section = section
  return (
    <TooltipProvider>
      <EscrowTab section={section} canEdit={canEdit} />
    </TooltipProvider>
  )
}
function renderTab(component: ComponentDetail, canEdit = true) {
  captured.section = undefined
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <Harness component={component} canEdit={canEdit} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  setProductTypeVisibility('editable')
  setFieldConfigData(undefined)
})

describe('EscrowTab productType render (§7.0/2c)', () => {
  it('renders Product Type label when visibility is editable', () => {
    setProductTypeVisibility('editable')
    renderTab(baseComponent({ productType: 'TYPE_A' }))
    expect(screen.getByText('Product Type')).toBeInTheDocument()
  })

  it('does NOT render Product Type when visibility is hidden', () => {
    setProductTypeVisibility('hidden')
    renderTab(baseComponent({ productType: 'TYPE_A' }))
    expect(screen.queryByText('Product Type')).toBeNull()
  })
})

describe('EscrowTab — slice (combined save)', () => {
  it('carries productType (top-level) + baseConfiguration.escrow', () => {
    setProductTypeVisibility('editable')
    renderTab(baseComponent({ productType: 'TYPE_B' }))
    expect(captured.section!.slice.request.productType).toBe('TYPE_B')
    expect(captured.section!.slice.request.baseConfiguration?.escrow?.generation).toBe('G2')
  })

  it('hidden productType is NOT in the slice', () => {
    setProductTypeVisibility('hidden')
    renderTab(baseComponent({ productType: 'TYPE_A' }))
    expect(Object.prototype.hasOwnProperty.call(captured.section!.slice.request, 'productType')).toBe(false)
  })

  it('always carries baseConfiguration.escrow regardless of productType visibility', () => {
    setProductTypeVisibility('hidden')
    renderTab(baseComponent({ productType: 'TYPE_A' }))
    expect(captured.section!.slice.request.baseConfiguration?.escrow).toBeDefined()
  })

  it("propagates additionalSources edits; blank → '' (CRS-A ''-clear)", async () => {
    renderTab(baseComponent())
    const input = screen.getByPlaceholderText('Additional source paths')
    fireEvent.change(input, { target: { value: 'src/extra' } })
    expect(captured.section!.slice.request.baseConfiguration?.escrow?.additionalSources).toBe('src/extra')
    fireEvent.change(input, { target: { value: '' } })
    expect(captured.section!.slice.request.baseConfiguration?.escrow?.additionalSources).toBe('')
  })

  it('sends migrated scalars inside baseConfiguration.build and omits Build-tab-owned ones', () => {
    renderTab(baseComponent({
      configurations: [
        {
          ...baseComponent().configurations![0]!,
          build: { buildSystem: 'GRADLE', buildTasks: 'assemble', deprecated: true, requiredProject: false, projectVersion: '1.0' },
        },
      ],
    }))
    const build = captured.section!.slice.request.baseConfiguration?.build as Record<string, unknown>
    expect(build.buildTasks).toBe('assemble')
    expect('buildSystem' in build).toBe(false)
    expect('javaVersion' in build).toBe(false)
  })

  it('requiredTools deduped at BASE-row level, not inside build', () => {
    renderTab(baseComponent({
      configurations: [{ ...baseComponent().configurations![0]!, requiredTools: ['a', 'b'] }],
    }))
    expect(captured.section!.slice.request.baseConfiguration?.requiredTools).toEqual(['a', 'b'])
  })

  it('sends requiredTools: null and omits build when no BASE row is loaded', () => {
    renderTab(baseComponent({ configurations: [] }))
    expect(captured.section!.slice.request.baseConfiguration?.requiredTools).toBeNull()
    expect('build' in (captured.section!.slice.request.baseConfiguration ?? {})).toBe(false)
  })
})

describe('EscrowTab new fields render', () => {
  it('renders Additional Sources / Gradle config inputs + the test-config switch', () => {
    renderTab(baseComponent())
    expect(screen.getByPlaceholderText('Additional source paths')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('e.g. compile,runtimeClasspath')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('e.g. testCompile,testRuntime')).toBeInTheDocument()
    expect(screen.getByText('Gradle Include Test Configurations')).toBeInTheDocument()
  })
})

describe('EscrowTab — migrated build settings render', () => {
  it('renders Build Tasks, System Properties, Deprecated, Required Project, Required Tools, Project Version', () => {
    renderTab(baseComponent())
    for (const label of ['Build Tasks', 'System Properties', 'Deprecated', 'Required Project', 'Required Tools', 'Project Version']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })
})

describe('EscrowTab — inline override coverage', () => {
  const overridablePaths = [
    'escrow.providedDependencies', 'escrow.reusable', 'escrow.generation', 'escrow.diskSpace',
    'escrow.additionalSources', 'escrow.gradleIncludeConfigurations', 'escrow.gradleExcludeConfigurations',
    'escrow.gradleIncludeTestConfigurations', 'escrow.buildTask',
    'build.buildTasks', 'build.systemProperties', 'build.deprecated', 'build.requiredProject', 'build.projectVersion',
  ]

  it.each(overridablePaths)('renders FieldOverrideInline under %s', (path) => {
    renderTab(baseComponent())
    expect(screen.getByTestId(`field-override-inline-${path}`)).toBeInTheDocument()
  })
})

describe('EscrowTab — field-config label overrides', () => {
  it('renders the config label override instead of the hardcoded label', () => {
    setFieldConfigData({ build: { projectVersion: { label: 'Example Label' } } })
    renderTab(baseComponent())
    expect(screen.getByText('Example Label')).toBeInTheDocument()
    expect(screen.queryByText('Project Version')).toBeNull()
  })

  it('falls back to hardcoded labels without config overrides', () => {
    renderTab(baseComponent())
    expect(screen.getByText('Project Version')).toBeInTheDocument()
  })
})

describe('EscrowTab field descriptions (FieldInfo)', () => {
  const EXPECTED_PATHS = [
    'component.productType', 'escrow.generation', 'escrow.diskSpace', 'escrow.reusable',
    'escrow.providedDependencies', 'escrow.additionalSources', 'escrow.gradleIncludeConfigurations',
    'escrow.gradleExcludeConfigurations', 'escrow.gradleIncludeTestConfigurations', 'escrow.buildTask',
    'build.buildTasks', 'build.systemProperties', 'build.deprecated', 'build.requiredProject', 'build.requiredTools', 'build.projectVersion',
  ]

  it('renders exactly one info icon per described field', () => {
    renderTab(baseComponent())
    for (const path of EXPECTED_PATHS) {
      expect(document.querySelectorAll(`[data-field-path="${path}"]`), `info icon for ${path}`).toHaveLength(1)
    }
  })

  it('opens the registry description for Generation on focus', async () => {
    renderTab(baseComponent())
    const trigger = document.querySelector('[data-field-path="escrow.generation"]') as HTMLElement
    act(() => trigger.focus())
    const tooltip = await screen.findByRole('tooltip')
    expect(tooltip).toHaveTextContent(fieldDescriptions['escrow.generation']!)
  })
})
