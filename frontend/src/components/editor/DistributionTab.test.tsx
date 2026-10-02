import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { DistributionTab } from './DistributionTab'
import type { SupportedVersionsState } from './useSupportedVersionsSection'
import { api, ApiError } from '../../lib/api'
import type { DistributionPreviewResponse } from '../../hooks/useDistributionPreview'
import { useDistributionSection } from './useDistributionSection'
import { TooltipProvider } from '../ui/tooltip'
import type { ComponentDetail, ComponentConfiguration, FieldOverride } from '../../lib/types'

// The preview runs the REAL useDistributionPreview; only the network is mocked.
vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api')
  return { ...actual, api: { ...actual.api, post: vi.fn() } }
})
const mockPost = vi.mocked(api).post

function WithQuery({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

vi.mock('./FieldOverrideInline', () => ({ FieldOverrideInline: () => null }))

// Per-range distribution overrides ride the shared page-level draft. Mock it so
// tests can seed effective overrides and spy on queued deletes without a provider.
let mockEffective: FieldOverride[] = []
const mockQueueDelete = vi.fn()
vi.mock('./overridesDraft', () => ({
  useOverridesDraft: () => ({
    serverOverrides: mockEffective,
    effectiveOverrides: mockEffective,
    isLoading: false,
    isDirty: false,
    queueCreate: vi.fn(),
    queueUpdate: vi.fn(),
    queueDelete: mockQueueDelete,
    reset: vi.fn(),
  }),
}))

// Stub the modal — its internals are covered by OverrideRowEditor.test.tsx.
vi.mock('./OverrideRowEditor', () => ({
  OverrideRowEditor: (props: { open: boolean; mode: string; presetAttribute?: string; override?: FieldOverride }) =>
    props.open ? <div data-testid="override-row-editor" /> : null,
}))

vi.mock('../../hooks/useFieldConfig', () => ({
  useFieldConfigOptions: () => ({ options: [], isLoading: false }),
  useFieldConfigEntry: () => ({ entry: { visibility: 'editable', required: false }, isLoading: false, isError: false }),
  useFieldLabel: (_path: string, fallback: string) => fallback,
}))

function baseComponent(overrides: Partial<ComponentDetail> = {}): ComponentDetail {
  return {
    id: 'c-1', name: 'my-component', displayName: 'My Component', componentOwner: 'alice',
    systems: [], productType: null, clientCode: null, solution: false, parentComponentName: null,
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

beforeEach(() => {
  vi.clearAllMocks()
  mockEffective = []
  mockQueueDelete.mockReset()
})

const captured: { section?: ReturnType<typeof useDistributionSection> } = {}
function Harness({ component, canEdit = true, supportedVersions }: { component: ComponentDetail; canEdit?: boolean; supportedVersions?: SupportedVersionsState | null }) {
  const section = useDistributionSection(component)
  captured.section = section
  return (
    <TooltipProvider>
      <DistributionTab componentId={component.id} section={section} canEdit={canEdit} supportedVersions={supportedVersions} />
    </TooltipProvider>
  )
}
function renderTab(component: ComponentDetail, canEdit = true, supportedVersions?: SupportedVersionsState | null) {
  captured.section = undefined
  return render(<Harness component={component} canEdit={canEdit} supportedVersions={supportedVersions} />, { wrapper: WithQuery })
}

describe('DistributionTab — blank-row filter (slice payload)', () => {
  it('drops a freshly-added blank Maven row from the slice', () => {
    renderTab(baseComponent())
    fireEvent.click(screen.getAllByRole('button', { name: /^Add$/ })[0]!) // Maven Add
    expect(captured.section!.slice.request.baseConfiguration?.mavenArtifacts ?? []).toEqual([])
  })

  it('preserves a Maven row when both required identity fields are populated', () => {
    renderTab(baseComponent())
    fireEvent.click(screen.getAllByRole('button', { name: /^Add$/ })[0]!)
    fireEvent.change(screen.getByPlaceholderText('org.example.alpha'), { target: { value: 'com.example' } })
    fireEvent.change(screen.getByPlaceholderText('my-component'), { target: { value: 'my-app' } })
    const maven = captured.section!.slice.request.baseConfiguration?.mavenArtifacts
    expect(maven).toHaveLength(1)
    expect(maven?.[0]?.groupPattern).toBe('com.example')
    expect(maven?.[0]?.artifactPattern).toBe('my-app')
  })

  it('puts securityGroups top-level (not inside baseConfiguration)', () => {
    renderTab(baseComponent())
    fireEvent.click(screen.getAllByRole('button', { name: /^Add$/ })[3]!) // Security Groups Add
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
    'distribution.mavenArtifacts', 'distribution.fileUrlArtifacts',
    'distribution.packages', 'distribution.securityGroups',
    'distribution.maven.groupPattern', 'distribution.maven.artifactPattern', 'distribution.maven.extension', 'distribution.maven.classifier',
    'distribution.fileUrl.url', 'distribution.fileUrl.artifactId', 'distribution.fileUrl.classifier',
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

  it('no longer renders the Explicit / External toggle info icons (moved to General)', () => {
    renderTab(populatedComponent())
    expect(document.querySelectorAll('[data-field-path="component.distributionExplicit"]')).toHaveLength(0)
    expect(document.querySelectorAll('[data-field-path="component.distributionExternal"]')).toHaveLength(0)
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
          <DistributionTab componentId={component.id} section={section} canEdit supportedGroups={supportedGroups} />
        </TooltipProvider>
      )
    }
    return render(<H />, { wrapper: WithQuery })
  }

  it('flags a maven Group ID without a supported prefix', () => {
    renderWithSupported(mavenComponent('org.bad'), ['com.acme'])
    expect(screen.getByText(/must start with a supported prefix/i)).toBeDefined()
  })

  it('shows no error when the Group ID is under a supported prefix', () => {
    renderWithSupported(mavenComponent('com.acme.svc'), ['com.acme'])
    expect(screen.queryByText(/must start with a supported prefix/i)).toBeNull()
  })
})

describe('DistributionTab — version preview', () => {
  function marker(attr: string, range: string, children: FieldOverride['markerChildren'], id = `${attr}${range}`): FieldOverride {
    return { id, overriddenAttribute: attr, versionRange: range, rowType: 'MARKER', value: null, markerChildren: children, createdAt: null, updatedAt: null }
  }
  function populated(): ComponentDetail {
    const c = baseComponent()
    return {
      ...c,
      configurations: [
        {
          ...c.configurations[0]!,
          mavenArtifacts: [{ id: 'm1', groupPattern: 'org.example', artifactPattern: 'base-art', extension: null, classifier: null, sortOrder: 0 }],
          packages: [{ id: 'p1', packageType: 'rpm', packageName: 'base-pkg', sortOrder: 0 }],
        },
      ],
    }
  }
  const path = (attribute: string, source: 'BASE' | 'OVERRIDE' | 'CONFLICT', matchedRanges: string[] = [], unevaluableRanges: string[] = []) =>
    ({ attribute, source, matchedRanges, unevaluableRanges })
  function respond(paths: DistributionPreviewResponse['paths'], supported = true) {
    mockPost.mockResolvedValue({ version: '1.5', supported, paths } satisfies DistributionPreviewResponse)
  }
  const allBase = () => [
    path('distribution.maven', 'BASE'), path('distribution.fileUrl', 'BASE'),
    path('distribution.docker', 'BASE'), path('distribution.packages', 'BASE'),
  ]
  const enter = (v: string) => fireEvent.change(screen.getByLabelText('Preview version'), { target: { value: v } })
  const verdict = (attr: string) => screen.findByTestId(`dist-preview-${attr}`)

  it.each(['', '   '])('issues no request and shows nothing for blank input %j', async (v) => {
    renderTab(populated())
    enter(v)
    await new Promise((r) => setTimeout(r, 450))
    expect(mockPost).not.toHaveBeenCalled()
    expect(screen.queryByTestId('dist-preview-status')).toBeNull()
    expect(screen.queryByTestId('dist-preview-distribution.maven')).toBeNull()
  })

  it('sends only the settled version, with the override and supported-version drafts', async () => {
    const ov = marker('distribution.maven', '[1.0,2.0)', { mavenArtifacts: [{ groupPattern: 'org.example', artifactPattern: 'ov-art' }] }, 'draft-1')
    mockEffective = [ov]
    respond(allBase())
    renderTab(populated(), true, { all: false, ranges: ['[1.0,3.0)'] })
    enter('1')
    enter('1.')
    enter(' 1.5 ')
    expect(screen.getByTestId('dist-preview-status').textContent).toMatch(/resolving/i)
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1))
    expect(mockPost).toHaveBeenCalledWith('/components/c-1/distribution/preview', {
      version: '1.5',
      fieldOverrides: [{ overriddenAttribute: 'distribution.maven', versionRange: '[1.0,2.0)', markerChildren: ov.markerChildren }],
      supportedVersions: { all: false, ranges: ['[1.0,3.0)'] },
    })
  })

  it('follows the override draft', async () => {
    respond(allBase())
    const { rerender } = renderTab(populated())
    enter('1.5')
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1))
    mockEffective = [marker('distribution.maven', '[1.0,2.0)', { mavenArtifacts: [] }, 'draft-2')]
    rerender(<Harness component={populated()} />)
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(2))
    expect(mockPost.mock.calls[1]![1]).toMatchObject({
      fieldOverrides: [{ overriddenAttribute: 'distribution.maven', versionRange: '[1.0,2.0)' }],
    })
  })

  it('waits for the supported-versions draft before requesting', async () => {
    respond(allBase())
    renderTab(populated(), true, null)
    enter('1.5')
    await new Promise((r) => setTimeout(r, 450))
    expect(mockPost).not.toHaveBeenCalled()
  })

  it('attributes an overridden path to its range and an untouched path to the component level', async () => {
    mockEffective = [marker('distribution.maven', '[1.0,2.0)', { mavenArtifacts: [{ groupPattern: 'org.example', artifactPattern: 'ov-art' }] })]
    respond([path('distribution.maven', 'OVERRIDE', ['[1.0,2.0)']), path('distribution.packages', 'BASE'), path('distribution.docker', 'BASE')])
    renderTab(populated())
    enter('1.5')
    const maven = await verdict('distribution.maven')
    expect(maven.textContent).toContain('org.example:ov-art')
    expect(maven.textContent).toContain('[1.0,2.0)')
    const pkgs = await verdict('distribution.packages')
    expect(pkgs.textContent).toContain('rpm base-pkg')
    expect(pkgs.textContent).toMatch(/component level/i)
  })

  it('states that nothing is published for an empty override, attributed to its range', async () => {
    mockEffective = [marker('distribution.packages', '[1.0,2.0)', { packages: [] })]
    respond([path('distribution.packages', 'OVERRIDE', ['[1.0,2.0)'])])
    renderTab(populated())
    enter('1.5')
    const pkgs = await verdict('distribution.packages')
    expect(pkgs.textContent).toMatch(/nothing is published/i)
    expect(pkgs.textContent).toContain('[1.0,2.0)')
    expect(pkgs.textContent).not.toContain('base-pkg')
  })

  it('reports the Docker verdict in one line', async () => {
    mockEffective = [marker('distribution.docker', '[1.0,2.0)', { dockerImages: [{ imageName: 'img' }] })]
    respond([path('distribution.docker', 'OVERRIDE', ['[1.0,2.0)'])])
    renderTab(populated())
    enter('1.5')
    expect((await screen.findByTestId('dist-preview-docker')).textContent).toMatch(/Docker images.*\[1\.0,2\.0\)/)
  })

  it('reports the Docker base list at the component level', async () => {
    respond(allBase())
    renderTab(populated())
    enter('1.5')
    expect((await screen.findByTestId('dist-preview-docker')).textContent).toMatch(/Docker images.*component level/i)
  })

  it('states the component has no configuration for an unsupported version', async () => {
    respond([], false)
    renderTab(populated())
    enter('9.0')
    await waitFor(() => expect(screen.getByTestId('dist-preview-status').textContent).toMatch(/no configuration/i))
    expect(screen.queryByTestId('dist-preview-distribution.maven')).toBeNull()
    expect(screen.queryByTestId('dist-preview-docker')).toBeNull()
  })

  it('reports an unparseable version as invalid input', async () => {
    mockPost.mockRejectedValue(new ApiError(400, 'bad version'))
    renderTab(populated())
    enter('abc')
    await waitFor(() => expect(screen.getByTestId('dist-preview-status').textContent).toMatch(/not a valid version/i))
    expect(screen.getByLabelText('Preview version')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByTestId('dist-preview-distribution.maven')).toBeNull()
  })

  it.each([401, 403, 500])('reports the preview unavailable on a %i', async (status) => {
    mockPost.mockRejectedValue(new ApiError(status, 'nope'))
    renderTab(populated())
    enter('1.5')
    await waitFor(() => expect(screen.getByTestId('dist-preview-status').textContent).toMatch(/unavailable/i))
    expect(screen.queryByTestId('dist-preview-distribution.maven')).toBeNull()
  })

  it('names overlapping ranges as a data conflict', async () => {
    mockEffective = [
      marker('distribution.maven', '[1.0,2.0)', { mavenArtifacts: [] }),
      marker('distribution.maven', '[1.2,3.0)', { mavenArtifacts: [] }),
    ]
    respond([path('distribution.maven', 'CONFLICT', ['[1.0,2.0)', '[1.2,3.0)'])])
    renderTab(populated())
    enter('1.5')
    const maven = await verdict('distribution.maven')
    expect(maven.textContent).toMatch(/conflict/i)
    expect(maven.textContent).toContain('[1.0,2.0)')
    expect(maven.textContent).toContain('[1.2,3.0)')
    expect(screen.queryByText('In effect')).toBeNull()
  })

  it('warns when an override range could not be evaluated', async () => {
    mockEffective = [marker('distribution.maven', 'garbage', { mavenArtifacts: [] })]
    respond([path('distribution.maven', 'BASE', [], ['garbage'])])
    renderTab(populated())
    enter('1.5')
    const maven = await verdict('distribution.maven')
    expect(maven.textContent).toContain('garbage')
    expect(maven.textContent).toMatch(/ignored.*incomplete/i)
  })

  it('shows base lists and marks no row when the component has no per-range overrides', async () => {
    respond(allBase())
    renderTab(populated())
    enter('1.5')
    expect((await verdict('distribution.maven')).textContent).toContain('org.example:base-art')
    expect(screen.queryByText('In effect')).toBeNull()
  })

  it('keeps the preview usable without edit rights', async () => {
    respond(allBase())
    renderTab(populated(), false)
    expect(screen.getByLabelText('Preview version')).not.toBeDisabled()
    enter('1.5')
    expect((await verdict('distribution.maven')).textContent).toMatch(/component level/i)
    for (const btn of screen.getAllByRole('button', { name: /^Add$/ })) expect(btn).toBeDisabled()
  })

  it('clears the attribution and marking when the version is cleared', async () => {
    mockEffective = [marker('distribution.maven', '[1.0,2.0)', { mavenArtifacts: [] })]
    respond([path('distribution.maven', 'OVERRIDE', ['[1.0,2.0)'])])
    renderTab(populated())
    enter('1.5')
    await verdict('distribution.maven')
    enter('')
    expect(screen.queryByTestId('dist-preview-distribution.maven')).toBeNull()
    expect(screen.queryByTestId('dist-preview-status')).toBeNull()
    expect(screen.queryByText('In effect')).toBeNull()
  })
})
