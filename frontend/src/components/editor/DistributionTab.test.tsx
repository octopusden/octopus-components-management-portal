import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { DistributionTab } from './DistributionTab'
import { useDistributionSection } from './useDistributionSection'
import { TooltipProvider } from '../ui/tooltip'
import { fieldDescriptions } from '../../lib/fieldDescriptions'
import type { ComponentDetail, ComponentConfiguration } from '../../lib/types'

vi.mock('./FieldOverrideInline', () => ({ FieldOverrideInline: () => null }))

vi.mock('../../hooks/useFieldConfig', () => ({
  useFieldConfigOptions: () => ({ options: [], isLoading: false }),
  useFieldConfigEntry: () => ({ entry: { visibility: 'editable', required: false }, isLoading: false, isError: false }),
  useFieldLabel: (_path: string, fallback: string) => fallback,
}))

function baseComponent(overrides: Partial<ComponentDetail> = {}): ComponentDetail {
  return {
    id: 'c-1', name: 'my-component', displayName: 'My Component', componentOwner: 'alice',
    system: null, productType: null, clientCode: null, solution: false, parentComponentName: null,
    archived: false, version: 3, createdAt: null, updatedAt: null, labels: [], docs: [], artifactIds: [],
    distributionExplicit: false, distributionExternal: false, securityGroups: [], teamcityProjects: [],
    configurations: [
      {
        id: 'cfg-1', versionRange: '(,0),[0,)', rowType: 'BASE', overriddenAttribute: null,
        isSyntheticBase: false, build: null, escrow: null, jira: null, vcsEntries: [],
        mavenArtifacts: [], fileUrlArtifacts: [], dockerImages: [], packages: [], requiredTools: [],
      },
    ],
    ...overrides,
  }
}

beforeEach(() => vi.clearAllMocks())

const captured: { section?: ReturnType<typeof useDistributionSection> } = {}
function Harness({ component, canEdit = true }: { component: ComponentDetail; canEdit?: boolean }) {
  const section = useDistributionSection(component)
  captured.section = section
  return (
    <TooltipProvider>
      <DistributionTab section={section} canEdit={canEdit} />
    </TooltipProvider>
  )
}
function renderTab(component: ComponentDetail, canEdit = true) {
  captured.section = undefined
  return render(<Harness component={component} canEdit={canEdit} />)
}

describe('DistributionTab — blank-row filter (slice payload)', () => {
  it('drops a freshly-added blank Maven row from the slice', () => {
    renderTab(baseComponent())
    fireEvent.click(screen.getAllByRole('button', { name: /^Add$/ })[0]!) // Maven Add
    expect(captured.section!.slice.request.baseConfiguration?.mavenArtifacts ?? []).toEqual([])
  })

  it('drops a freshly-added blank Docker row from the slice', () => {
    renderTab(baseComponent())
    fireEvent.click(screen.getAllByRole('button', { name: /^Add$/ })[2]!) // Docker Add
    expect(captured.section!.slice.request.baseConfiguration?.dockerImages ?? []).toEqual([])
  })

  it('preserves a Maven row when both required identity fields are populated', () => {
    renderTab(baseComponent())
    fireEvent.click(screen.getAllByRole('button', { name: /^Add$/ })[0]!)
    fireEvent.change(screen.getByPlaceholderText('org.example.alpha'), { target: { value: 'com.example' } })
    fireEvent.change(screen.getByPlaceholderText('my-component-*'), { target: { value: 'my-app' } })
    const maven = captured.section!.slice.request.baseConfiguration?.mavenArtifacts
    expect(maven).toHaveLength(1)
    expect(maven?.[0]?.groupPattern).toBe('com.example')
    expect(maven?.[0]?.artifactPattern).toBe('my-app')
  })

  it('puts securityGroups top-level (not inside baseConfiguration)', () => {
    renderTab(baseComponent())
    fireEvent.click(screen.getAllByRole('button', { name: /^Add$/ })[4]!) // Security Groups Add
    fireEvent.change(screen.getByPlaceholderText('my-security-group'), { target: { value: 'grp' } })
    expect(captured.section!.slice.request.securityGroups).toEqual([{ groupType: 'read', groupName: 'grp' }])
  })
})

describe('DistributionTab — canEdit gating', () => {
  it('disables every section Add button when canEdit is false', () => {
    renderTab(baseComponent(), false)
    const addButtons = screen.getAllByRole('button', { name: /^Add$/ })
    expect(addButtons.length).toBeGreaterThan(0)
    for (const btn of addButtons) expect(btn).toBeDisabled()
  })
})

describe('DistributionTab field descriptions (FieldInfo)', () => {
  function populatedComponent(): ComponentDetail {
    return baseComponent({
      securityGroups: [{ id: 'sg-1', groupType: 'read', groupName: 'group-a' }],
      configurations: [
        {
          ...(baseComponent().configurations![0] as ComponentConfiguration),
          mavenArtifacts: [{ id: 'm-1', sortOrder: 0, groupPattern: 'com.example', artifactPattern: 'app-*', extension: null, classifier: null }],
          fileUrlArtifacts: [{ id: 'f-1', sortOrder: 0, url: 'https://example.com/a.zip', artifactId: null, classifier: null }],
          dockerImages: [{ id: 'd-1', sortOrder: 0, imageName: 'my-org/my-image', flavor: null }],
          packages: [{ id: 'p-1', sortOrder: 0, packageType: 'rpm', packageName: 'my-pkg' }],
        },
      ],
    })
  }

  const EXPECTED_PATHS = [
    'component.distributionExplicit', 'component.distributionExternal',
    'distribution.mavenArtifacts', 'distribution.fileUrlArtifacts', 'distribution.dockerImages',
    'distribution.packages', 'distribution.securityGroups',
    'distribution.maven.groupPattern', 'distribution.maven.artifactPattern', 'distribution.maven.extension', 'distribution.maven.classifier',
    'distribution.fileUrl.url', 'distribution.fileUrl.artifactId', 'distribution.fileUrl.classifier',
    'distribution.docker.imageName', 'distribution.docker.flavor',
    'distribution.package.type', 'distribution.package.name',
    'distribution.securityGroup.type', 'distribution.securityGroup.name',
  ]

  it('renders exactly one info icon per described field (one row per array)', () => {
    renderTab(populatedComponent())
    for (const path of EXPECTED_PATHS) {
      expect(document.querySelectorAll(`[data-field-path="${path}"]`), `info icon for ${path}`).toHaveLength(1)
    }
  })

  it('repeats per-row icons for every artifact row while section icons stay single', () => {
    const component = populatedComponent()
    const base = component.configurations![0] as ComponentConfiguration
    base.mavenArtifacts = [
      { id: 'm-1', sortOrder: 0, groupPattern: 'com.example', artifactPattern: 'app-*', extension: null, classifier: null },
      { id: 'm-2', sortOrder: 1, groupPattern: 'com.example.two', artifactPattern: 'lib-*', extension: null, classifier: null },
    ]
    renderTab(component)
    expect(document.querySelectorAll('[data-field-path="distribution.maven.groupPattern"]')).toHaveLength(2)
    expect(document.querySelectorAll('[data-field-path="distribution.mavenArtifacts"]')).toHaveLength(1)
  })

  it('opens the registry description for the Explicit toggle on focus', async () => {
    renderTab(baseComponent())
    const trigger = document.querySelector('[data-field-path="component.distributionExplicit"]') as HTMLElement
    act(() => trigger.focus())
    const tooltip = await screen.findByRole('tooltip')
    expect(tooltip).toHaveTextContent(fieldDescriptions['component.distributionExplicit']!)
  })
})

describe('DistributionTab — groupId supported-prefix validation', () => {
  function mavenComponent(groupPattern: string): ComponentDetail {
    const c = baseComponent()
    return {
      ...c,
      configurations: [
        {
          ...c.configurations[0]!,
          mavenArtifacts: [
            { id: 'm1', groupPattern, artifactPattern: 'svc', extension: null, classifier: null, sortOrder: 0 },
          ],
        },
      ],
    }
  }
  function renderWithSupported(component: ComponentDetail, supportedGroups: string[]) {
    function H() {
      const section = useDistributionSection(component)
      return (
        <TooltipProvider>
          <DistributionTab section={section} canEdit supportedGroups={supportedGroups} />
        </TooltipProvider>
      )
    }
    return render(<H />)
  }

  it('flags a maven Group ID without a supported prefix', () => {
    renderWithSupported(mavenComponent('org.bad'), ['com.openwaygroup'])
    expect(screen.getByText(/must start with a supported prefix/i)).toBeDefined()
  })

  it('shows no error when the Group ID is under a supported prefix', () => {
    renderWithSupported(mavenComponent('com.openwaygroup.svc'), ['com.openwaygroup'])
    expect(screen.queryByText(/must start with a supported prefix/i)).toBeNull()
  })
})
