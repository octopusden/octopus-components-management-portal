import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { DockerImagesTab } from './DockerImagesTab'
import { useDistributionSection } from './useDistributionSection'
import { TooltipProvider } from '../ui/tooltip'
import type { ComponentDetail, ComponentConfiguration, FieldOverride } from '../../lib/types'

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
// Capture the props DockerImagesTab opens it with so we can assert the wiring.
type CapturedEditorProps = { open: boolean; mode: string; presetAttribute?: string; override?: FieldOverride; collapseMemberIds?: string[] }
let lastEditorProps: CapturedEditorProps | null = null
vi.mock('./OverrideRowEditor', () => ({
  OverrideRowEditor: (props: CapturedEditorProps) => {
    lastEditorProps = props
    return props.open ? <div data-testid="override-row-editor" /> : null
  },
}))

function dockerOverride(range: string, id = `fo-${range}`, imageName: string | null = 'acme/app'): FieldOverride {
  return {
    id,
    overriddenAttribute: 'distribution.docker',
    versionRange: range,
    rowType: 'MARKER',
    value: null,
    // `imageName: null` models an override that replaces the base list with
    // nothing (the empty-summary "Not specified" case).
    markerChildren: { dockerImages: imageName === null ? [] : [{ imageName, flavor: null }] },
    createdAt: null,
    updatedAt: null,
  }
}

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
  lastEditorProps = null
})

const captured: { section?: ReturnType<typeof useDistributionSection> } = {}
function Harness({ component, canEdit = true }: { component: ComponentDetail; canEdit?: boolean }) {
  const section = useDistributionSection(component)
  captured.section = section
  return (
    <TooltipProvider>
      <DockerImagesTab section={section} canEdit={canEdit} />
    </TooltipProvider>
  )
}
function renderTab(component: ComponentDetail, canEdit = true) {
  captured.section = undefined
  return render(<Harness component={component} canEdit={canEdit} />)
}

describe('DockerImagesTab — blank-row filter (slice payload)', () => {
  it('drops a freshly-added blank Docker row from the slice', () => {
    renderTab(baseComponent())
    fireEvent.click(screen.getAllByRole('button', { name: /^Add$/ })[0]!) // Docker Add (only Add button)
    expect(captured.section!.slice.request.baseConfiguration?.dockerImages ?? []).toEqual([])
  })
})

describe('DockerImagesTab — render', () => {
  function populatedComponent(): ComponentDetail {
    return baseComponent({
      configurations: [
        {
          ...(baseComponent().configurations![0] as ComponentConfiguration),
          dockerImages: [{ id: 'd-1', sortOrder: 0, imageName: 'my-org/my-image', flavor: null }],
        },
      ],
    })
  }

  it('gives the icon-only remove button an accessible name', () => {
    renderTab(populatedComponent())
    expect(screen.getByRole('button', { name: /Remove image/i })).toBeDefined()
  })

  it('renders the Image Name and Flavor fields for a docker row', () => {
    renderTab(populatedComponent())
    expect(screen.getByText('Image Name')).toBeDefined()
    expect(screen.getByText('Flavor')).toBeDefined()
    expect(screen.getByDisplayValue('my-org/my-image')).toBeDefined()
  })

  it('shows the empty state when there are no docker images', () => {
    renderTab(baseComponent())
    expect(screen.getByText('No Docker images.')).toBeDefined()
  })

  const EXPECTED_PATHS = [
    'distribution.dockerImages',
    'distribution.docker.imageName', 'distribution.docker.flavor',
  ]

  it('renders exactly one info icon per described field (one row per array)', () => {
    renderTab(populatedComponent())
    for (const path of EXPECTED_PATHS) {
      expect(document.querySelectorAll(`[data-field-path="${path}"]`), `info icon for ${path}`).toHaveLength(1)
    }
  })

  it('repeats per-row icons for every docker row while the section icon stays single', () => {
    const component = populatedComponent()
    const base = component.configurations![0] as ComponentConfiguration
    base.dockerImages = [
      { id: 'd-1', sortOrder: 0, imageName: 'my-org/one', flavor: null },
      { id: 'd-2', sortOrder: 1, imageName: 'my-org/two', flavor: null },
    ]
    renderTab(component)
    expect(document.querySelectorAll('[data-field-path="distribution.docker.imageName"]')).toHaveLength(2)
    expect(document.querySelectorAll('[data-field-path="distribution.dockerImages"]')).toHaveLength(1)
  })
})

describe('DockerImagesTab — per-range variants (issue #146)', () => {
  function dockerSection() {
    return within(screen.getByTestId('docker-images-section'))
  }

  it('shows a per-range count and variant row for an existing docker override', () => {
    mockEffective = [dockerOverride('[1,2)')]
    renderTab(baseComponent())
    expect(dockerSection().getByText(/Per-range overrides \(1\)/)).toBeDefined()
    expect(dockerSection().getByText('[1,2)')).toBeDefined()
  })

  it('opens the editor in create mode locked to the path on "Add override"', () => {
    renderTab(baseComponent())
    fireEvent.click(dockerSection().getByRole('button', { name: /add override/i }))
    expect(lastEditorProps).toMatchObject({ open: true, mode: 'create', presetAttribute: 'distribution.docker' })
  })

  it('opens the editor in edit mode with the override on "Edit"', () => {
    mockEffective = [dockerOverride('[1,2)', 'fo-x')]
    renderTab(baseComponent())
    fireEvent.click(dockerSection().getByRole('button', { name: /edit override/i }))
    expect(lastEditorProps).toMatchObject({ open: true, mode: 'edit' })
    expect(lastEditorProps!.override?.id).toBe('fo-x')
  })

  it('queues a delete of the override id on "Delete"', () => {
    mockEffective = [dockerOverride('[1,2)', 'fo-x')]
    renderTab(baseComponent())
    fireEvent.click(dockerSection().getByRole('button', { name: /delete override/i }))
    expect(mockQueueDelete).toHaveBeenCalledWith('fo-x')
  })

  it('disables per-range add/edit/delete when canEdit is false', () => {
    mockEffective = [dockerOverride('[1,2)', 'fo-x')]
    renderTab(baseComponent(), false)
    expect(dockerSection().getByRole('button', { name: /add override/i })).toBeDisabled()
    expect(dockerSection().getByRole('button', { name: /edit override/i })).toBeDisabled()
    expect(dockerSection().getByRole('button', { name: /delete override/i })).toBeDisabled()
  })
})

describe('DockerImagesTab — coalesced per-range overrides', () => {
  function dockerSection() {
    return within(screen.getByTestId('docker-images-section'))
  }

  // The 3DSecure QA shape: three contiguous ranges, each an empty-image override.
  const emptyContiguous = () => [
    dockerOverride('(,1.0.107)', 'fo-a', null),
    dockerOverride('[1.0.107,1.2.471)', 'fo-b', null),
    dockerOverride('[1.2.471,1.2.474)', 'fo-c', null),
  ]

  it('coalesces contiguous same-value overrides into one row spanning the union range', () => {
    mockEffective = emptyContiguous()
    renderTab(baseComponent())
    expect(dockerSection().getAllByTestId('dist-per-range-row')).toHaveLength(1)
    expect(dockerSection().getByText('(,1.2.474)')).toBeDefined()
    // Count badge + block header both reflect the coalesced group count.
    expect(dockerSection().getByText(/Per-range overrides \(1\)/)).toBeDefined()
    expect(dockerSection().getByText(/^1 per-range$/)).toBeDefined()
  })

  it('shows "Not specified" when the coalesced override has no image', () => {
    mockEffective = emptyContiguous()
    renderTab(baseComponent())
    expect(dockerSection().getByText('Not specified')).toBeDefined()
  })

  it('does NOT coalesce contiguous ranges whose images differ', () => {
    mockEffective = [
      dockerOverride('(,1.0.107)', 'fo-a', 'acme/one'),
      dockerOverride('[1.0.107,1.2.471)', 'fo-b', 'acme/two'),
    ]
    renderTab(baseComponent())
    expect(dockerSection().getAllByTestId('dist-per-range-row')).toHaveLength(2)
  })

  it('editing a coalesced group opens the merged range and passes the extra member ids to collapse', () => {
    mockEffective = emptyContiguous()
    renderTab(baseComponent())
    fireEvent.click(dockerSection().getByRole('button', { name: /edit override \(,1\.2\.474\)/i }))
    expect(lastEditorProps).toMatchObject({ open: true, mode: 'edit' })
    expect(lastEditorProps!.override?.id).toBe('fo-a') // representative = lowest range
    expect(lastEditorProps!.override?.versionRange).toBe('(,1.2.474)')
    expect(lastEditorProps!.collapseMemberIds).toEqual(['fo-b', 'fo-c'])
  })

  it('deleting a coalesced group queues a delete for every member', () => {
    mockEffective = emptyContiguous()
    renderTab(baseComponent())
    fireEvent.click(dockerSection().getByRole('button', { name: /delete override \(,1\.2\.474\)/i }))
    expect(mockQueueDelete).toHaveBeenCalledWith('fo-a')
    expect(mockQueueDelete).toHaveBeenCalledWith('fo-b')
    expect(mockQueueDelete).toHaveBeenCalledWith('fo-c')
    expect(mockQueueDelete).toHaveBeenCalledTimes(3)
  })
})
