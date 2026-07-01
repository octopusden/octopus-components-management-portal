import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OverrideRowEditor } from './OverrideRowEditor'
import type { FieldOverride } from '../../lib/types'

// ---------------------------------------------------------------------------
// Mock hooks — item D: the modal queues the create/update into the page-level
// override draft instead of an immediate POST/PATCH, and reads the effective
// (draft-applied) set for overlap detection. (Mock-prefixed names so Vitest's
// hoisted vi.mock factory may reference them.)
// ---------------------------------------------------------------------------

const mockQueueCreate = vi.fn()
const mockQueueUpdate = vi.fn()

// Mutable list of existing field-overrides for overlap-detection tests.
// Tests that need preset overrides assign to this array; the draft mock reads
// it lazily as the effective set.
let mockOverridesList: FieldOverride[] = []

vi.mock('./overridesDraft', () => ({
  useOverridesDraft: () => ({
    serverOverrides: mockOverridesList,
    effectiveOverrides: mockOverridesList,
    isLoading: false,
    isDirty: false,
    queueCreate: mockQueueCreate,
    queueUpdate: mockQueueUpdate,
    queueDelete: vi.fn(),
    reset: vi.fn(),
  }),
}))

const mockToast = vi.fn()
vi.mock('../../hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}))

// Stub the Radix Select so attribute selection works in jsdom.
// The real Select uses pointer-capture APIs that jsdom only partially stubs.
// This stub renders a native <select> so tests can use userEvent.selectOptions.
vi.mock('../ui/select', async () => {
  const React = await import('react')

  // Collect children options from SelectItem + SelectGroup + SelectLabel
  function collectOptions(children: React.ReactNode): Array<{ value: string; label: string }> {
    const opts: Array<{ value: string; label: string }> = []
    React.Children.forEach(children, (child) => {
      if (!child || typeof child !== 'object') return
      const el = child as React.ReactElement<{ value?: string; children?: React.ReactNode; label?: string }>
      const type = el.type as { displayName?: string } | undefined
      // Treat SelectItem (displayName set below) as an option entry
      if (type && type.displayName === 'SelectItem') {
        opts.push({ value: el.props.value ?? '', label: String(el.props.children ?? '') })
      } else if (el.props.children) {
        opts.push(...collectOptions(el.props.children))
      }
    })
    return opts
  }

  function Select({ value, onValueChange, children }: { value: string; onValueChange: (v: string) => void; children?: React.ReactNode }) {
    const opts = collectOptions(children)
    return (
      <select
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        data-testid="attr-select"
      >
        <option value="">Select attribute...</option>
        {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    )
  }

  function SelectItem({ value, children }: { value: string; children?: React.ReactNode }) {
    return <option value={value}>{children}</option>
  }
  SelectItem.displayName = 'SelectItem'

  const SelectGroup = ({ children }: { children?: React.ReactNode }) => <>{children}</>
  const SelectLabel = ({ children }: { children?: React.ReactNode }) => <optgroup label={String(children ?? '')} />
  const SelectTrigger = ({ children }: { children?: React.ReactNode }) => <>{children}</>
  const SelectContent = ({ children }: { children?: React.ReactNode }) => <>{children}</>
  const SelectValue = ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>

  return { Select, SelectItem, SelectGroup, SelectLabel, SelectTrigger, SelectContent, SelectValue }
})

// Field-config data source consumed by labelFor (attribute label overrides) —
// controllable per test, no network.
const mockUseAdminFieldConfig = vi.fn()
vi.mock('../../hooks/useAdminConfig', () => ({
  useFieldConfig: () => mockUseAdminFieldConfig(),
}))

beforeEach(() => {
  mockUseAdminFieldConfig.mockReturnValue({ data: undefined, isLoading: false, isError: false })
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderEditor(props: Partial<Parameters<typeof OverrideRowEditor>[0]> = {}) {
  const defaults = {
    open: true,
    onOpenChange: vi.fn(),
    mode: 'create' as const,
    ...props,
  }
  return render(<OverrideRowEditor {...defaults} />)
}

function makeScalarOverride(overrides: Partial<FieldOverride> = {}): FieldOverride {
  return {
    id: 'fo-1',
    overriddenAttribute: 'build.javaVersion',
    versionRange: '[11,12)',
    rowType: 'SCALAR_OVERRIDE',
    value: '11',
    markerChildren: null,
    createdAt: null,
    updatedAt: null,
    ...overrides,
  }
}

function makeMarkerOverride(overrides: Partial<FieldOverride> = {}): FieldOverride {
  return {
    id: 'fo-2',
    overriddenAttribute: 'distribution.maven',
    versionRange: '[1,2)',
    rowType: 'MARKER',
    value: null,
    markerChildren: {
      mavenArtifacts: [
        { groupPattern: 'org.example.alpha', artifactPattern: 'my-lib-*' },
      ],
    },
    createdAt: null,
    updatedAt: null,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests: create mode
// ---------------------------------------------------------------------------

describe('OverrideRowEditor — create mode', () => {
  beforeEach(() => {
    mockQueueCreate.mockReset()
    mockQueueUpdate.mockReset()
    mockToast.mockReset()
    mockOverridesList = []
  })

  it('renders with "Add Override" title', () => {
    renderEditor()
    expect(screen.getByText('Add Override')).toBeDefined()
  })

  it('defaults to Scalar type selected', () => {
    renderEditor()
    const scalarTab = screen.getByRole('tab', { name: /scalar/i })
    expect(scalarTab.getAttribute('data-state')).toBe('active')
    const markerTab = screen.getByRole('tab', { name: /marker/i })
    expect(markerTab.getAttribute('data-state')).toBe('inactive')
  })

  it('renders version range input empty by default in create mode (D5)', () => {
    renderEditor()
    const input = screen.getByLabelText('Version Range') as HTMLInputElement
    expect(input.value).toBe('')
  })

  it('selecting Marker type shows marker attribute list', async () => {
    renderEditor()
    await userEvent.click(screen.getByRole('tab', { name: /marker/i }))
    // The select stub renders all marker options
    const select = screen.getByTestId('attr-select') as HTMLSelectElement
    const optionValues = Array.from(select.options).map((o) => o.value)
    expect(optionValues).toContain('vcs.settings')
    expect(optionValues).toContain('distribution.maven')
    expect(optionValues).toContain('build.requiredTools')
    // Must NOT contain scalar paths
    expect(optionValues).not.toContain('build.javaVersion')
  })

  it('selecting Scalar type shows scalar attribute list grouped by aspect', async () => {
    renderEditor()
    const select = screen.getByTestId('attr-select') as HTMLSelectElement
    const optionValues = Array.from(select.options).map((o) => o.value)
    expect(optionValues).toContain('build.javaVersion')
    expect(optionValues).toContain('escrow.reusable')
    expect(optionValues).toContain('escrow.buildTask')
    expect(optionValues).toContain('jira.projectKey')
    // P-HotfixVersionFormat: CRS registers jira.hotfixVersionFormat as a
    // scalar override path (ConfigurationRowAccessors.kt); Portal must too.
    expect(optionValues).toContain('jira.hotfixVersionFormat')
  })

  it('selecting a string attribute renders an Input for value', async () => {
    renderEditor()
    const select = screen.getByTestId('attr-select') as HTMLSelectElement
    await userEvent.selectOptions(select, 'build.javaVersion')
    expect(screen.getByPlaceholderText('Value for Java Version')).toBeDefined()
  })

  it('shows the field-config label override in the attribute catalogue and value placeholder', async () => {
    mockUseAdminFieldConfig.mockReturnValue({
      data: { build: { projectVersion: { label: 'Example Label' } } },
      isLoading: false,
      isError: false,
    })
    renderEditor()
    const select = screen.getByTestId('attr-select') as HTMLSelectElement
    const optionFor = Array.from(select.options).find((o) => o.value === 'build.projectVersion')!
    expect(optionFor.textContent).toBe('Example Label')
    // Attributes without an override keep their hardcoded labels
    const javaOption = Array.from(select.options).find((o) => o.value === 'build.javaVersion')!
    expect(javaOption.textContent).toBe('Java Version')

    await userEvent.selectOptions(select, 'build.projectVersion')
    expect(screen.getByPlaceholderText('Value for Example Label')).toBeDefined()
  })

  it('selecting a boolean attribute renders a Switch, not a string Input', async () => {
    renderEditor()
    const select = screen.getByTestId('attr-select') as HTMLSelectElement
    await userEvent.selectOptions(select, 'build.deprecated')
    // Switch appears (role=switch), no scalar string input
    const switches = screen.getAllByRole('switch')
    expect(switches.length).toBeGreaterThan(0)
    expect(screen.queryByPlaceholderText('Value for Deprecated')).toBeNull()
  })

  it('selecting escrow.gradleIncludeTestConfigurations renders a Switch (boolean dispatch)', async () => {
    renderEditor()
    const select = screen.getByTestId('attr-select') as HTMLSelectElement
    await userEvent.selectOptions(select, 'escrow.gradleIncludeTestConfigurations')
    const switches = screen.getAllByRole('switch')
    expect(switches.length).toBeGreaterThan(0)
  })

  it('switching to Marker and selecting distribution.maven renders Maven child list editor', async () => {
    renderEditor()
    await userEvent.click(screen.getByRole('tab', { name: /marker/i }))
    const select = screen.getByTestId('attr-select') as HTMLSelectElement
    await userEvent.selectOptions(select, 'distribution.maven')
    expect(screen.getByRole('button', { name: /add artifact/i })).toBeDefined()
  })

  it('switching to Marker and selecting build.requiredTools renders comma-separated input', async () => {
    renderEditor()
    await userEvent.click(screen.getByRole('tab', { name: /marker/i }))
    const select = screen.getByTestId('attr-select') as HTMLSelectElement
    await userEvent.selectOptions(select, 'build.requiredTools')
    expect(screen.getByPlaceholderText('tool-a, tool-b')).toBeDefined()
  })

  it('switching to Marker and selecting vcs.settings renders VCS child list with Add Entry button', async () => {
    renderEditor()
    await userEvent.click(screen.getByRole('tab', { name: /marker/i }))
    const select = screen.getByTestId('attr-select') as HTMLSelectElement
    await userEvent.selectOptions(select, 'vcs.settings')
    expect(screen.getByRole('button', { name: /add entry/i })).toBeDefined()
  })

  it('switching to Marker and selecting distribution.docker renders Docker child list editor', async () => {
    renderEditor()
    await userEvent.click(screen.getByRole('tab', { name: /marker/i }))
    const select = screen.getByTestId('attr-select') as HTMLSelectElement
    await userEvent.selectOptions(select, 'distribution.docker')
    expect(screen.getByRole('button', { name: /add image/i })).toBeDefined()
  })

  it('switching to Marker and selecting distribution.packages renders Packages child list editor', async () => {
    renderEditor()
    await userEvent.click(screen.getByRole('tab', { name: /marker/i }))
    const select = screen.getByTestId('attr-select') as HTMLSelectElement
    await userEvent.selectOptions(select, 'distribution.packages')
    expect(screen.getByRole('button', { name: /add package/i })).toBeDefined()
  })

  it('switching to Marker and selecting distribution.fileUrl renders FileUrl child list editor', async () => {
    renderEditor()
    await userEvent.click(screen.getByRole('tab', { name: /marker/i }))
    const select = screen.getByTestId('attr-select') as HTMLSelectElement
    await userEvent.selectOptions(select, 'distribution.fileUrl')
    expect(screen.getByRole('button', { name: /add artifact/i })).toBeDefined()
  })

  it('queues a create with correct scalar string body on submit', async () => {
    renderEditor()
    const select = screen.getByTestId('attr-select') as HTMLSelectElement
    await userEvent.selectOptions(select, 'build.javaVersion')

    const versionInput = screen.getByLabelText('Version Range') as HTMLInputElement
    fireEvent.change(versionInput, { target: { value: '[11,12)' } })

    const valueInput = screen.getByPlaceholderText('Value for Java Version')
    await userEvent.type(valueInput, '11')

    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))

    await waitFor(() => {
      expect(mockQueueCreate).toHaveBeenCalledOnce()
      const body = mockQueueCreate.mock.calls[0]![0]
      expect(body.overriddenAttribute).toBe('build.javaVersion')
      expect(body.versionRange).toBe('[11,12)')
      expect(body.value).toBe('11')
      // Tagged-union invariant: markerChildren must be null
      expect(body.markerChildren).toBeNull()
    })
  })

  it('queues a create with correct marker body for requiredTools (deduped)', async () => {
    renderEditor()
    await userEvent.click(screen.getByRole('tab', { name: /marker/i }))
    const select = screen.getByTestId('attr-select') as HTMLSelectElement
    await userEvent.selectOptions(select, 'build.requiredTools')

    const toolsInput = screen.getByPlaceholderText('tool-a, tool-b')
    await userEvent.type(toolsInput, 'tool-a, tool-b, tool-a')

    fireEvent.change(screen.getByLabelText('Version Range'), { target: { value: '[1.0,2.0)' } })
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))

    await waitFor(() => {
      expect(mockQueueCreate).toHaveBeenCalledOnce()
      const body = mockQueueCreate.mock.calls[0]![0]
      expect(body.overriddenAttribute).toBe('build.requiredTools')
      // Tagged-union invariant: value null for marker
      expect(body.value).toBeNull()
      expect(body.markerChildren).not.toBeNull()
      // Duplicates deduped
      expect(body.markerChildren.requiredTools).toEqual(['tool-a', 'tool-b'])
    })
  })

  it('queues a create with boolean true value for boolean attribute', async () => {
    renderEditor()
    const select = screen.getByTestId('attr-select') as HTMLSelectElement
    await userEvent.selectOptions(select, 'build.deprecated')

    // Toggle the switch on
    const switches = screen.getAllByRole('switch')
    await userEvent.click(switches[0]!)

    fireEvent.change(screen.getByLabelText('Version Range'), { target: { value: '[1.0,2.0)' } })
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))

    await waitFor(() => {
      expect(mockQueueCreate).toHaveBeenCalledOnce()
      const body = mockQueueCreate.mock.calls[0]![0]
      expect(body.overriddenAttribute).toBe('build.deprecated')
      expect(body.value).toBe(true)
      expect(body.markerChildren).toBeNull()
    })
  })
})

// ---------------------------------------------------------------------------
// Tests: edit mode — scalar
// ---------------------------------------------------------------------------

describe('OverrideRowEditor — edit mode (scalar)', () => {
  beforeEach(() => {
    mockQueueCreate.mockReset()
    mockQueueUpdate.mockReset()
    mockToast.mockReset()
    mockOverridesList = []
  })

  it('renders "Edit Override" title', () => {
    renderEditor({ mode: 'edit', override: makeScalarOverride() })
    expect(screen.getByText('Edit Override')).toBeDefined()
  })

  it('shows the attribute as readonly text — no select', () => {
    renderEditor({ mode: 'edit', override: makeScalarOverride() })
    expect(screen.getByText('build.javaVersion')).toBeDefined()
    // No attribute select in edit mode
    expect(screen.queryByTestId('attr-select')).toBeNull()
  })

  it('pre-fills version range from existing override', () => {
    renderEditor({ mode: 'edit', override: makeScalarOverride() })
    const input = screen.getByLabelText('Version Range') as HTMLInputElement
    expect(input.value).toBe('[11,12)')
  })

  it('pre-fills string value from existing override', () => {
    renderEditor({ mode: 'edit', override: makeScalarOverride() })
    const valueInput = screen.getByPlaceholderText('Value for Java Version') as HTMLInputElement
    expect(valueInput.value).toBe('11')
  })

  it('pre-fills boolean switch state from existing boolean override', () => {
    const boolOverride = makeScalarOverride({
      overriddenAttribute: 'build.deprecated',
      value: true,
    })
    renderEditor({ mode: 'edit', override: boolOverride })
    const switches = screen.getAllByRole('switch')
    expect(switches[0]!.getAttribute('data-state')).toBe('checked')
  })

  it('does not render type picker in edit mode — attribute is locked', () => {
    renderEditor({ mode: 'edit', override: makeScalarOverride() })
    expect(screen.queryByRole('tab', { name: /scalar/i })).toBeNull()
    expect(screen.queryByRole('tab', { name: /marker/i })).toBeNull()
  })

  it('queues an update with correct body on submit', async () => {
    renderEditor({ mode: 'edit', override: makeScalarOverride() })

    const versionInput = screen.getByLabelText('Version Range') as HTMLInputElement
    fireEvent.change(versionInput, { target: { value: '[17,18)' } })

    const valueInput = screen.getByPlaceholderText('Value for Java Version')
    await userEvent.clear(valueInput)
    await userEvent.type(valueInput, '17')

    await userEvent.click(screen.getByRole('button', { name: /^update$/i }))

    await waitFor(() => {
      expect(mockQueueUpdate).toHaveBeenCalledOnce()
      expect(mockQueueUpdate.mock.calls[0]![0]).toBe('fo-1')
      const body = mockQueueUpdate.mock.calls[0]![1]
      expect(body.versionRange).toBe('[17,18)')
      expect(body.value).toBe('17')
      expect(body.markerChildren).toBeNull()
    })
  })
})

// ---------------------------------------------------------------------------
// Tests: edit mode — marker
// ---------------------------------------------------------------------------

describe('OverrideRowEditor — edit mode (marker)', () => {
  beforeEach(() => {
    mockQueueCreate.mockReset()
    mockQueueUpdate.mockReset()
    mockToast.mockReset()
    mockOverridesList = []
  })

  it('renders marker override attribute as readonly text — no select', () => {
    renderEditor({ mode: 'edit', override: makeMarkerOverride() })
    expect(screen.getByText('distribution.maven')).toBeDefined()
    expect(screen.queryByTestId('attr-select')).toBeNull()
  })

  it('pre-populates maven artifact rows from existing markerChildren', () => {
    renderEditor({ mode: 'edit', override: makeMarkerOverride() })
    expect((screen.getByDisplayValue('org.example.alpha') as HTMLInputElement).value).toBe('org.example.alpha')
    expect((screen.getByDisplayValue('my-lib-*') as HTMLInputElement).value).toBe('my-lib-*')
  })

  it('queues an update with markerChildren body on submit', async () => {
    renderEditor({ mode: 'edit', override: makeMarkerOverride() })

    await userEvent.click(screen.getByRole('button', { name: /^update$/i }))

    await waitFor(() => {
      expect(mockQueueUpdate).toHaveBeenCalledOnce()
      expect(mockQueueUpdate.mock.calls[0]![0]).toBe('fo-2')
      const body = mockQueueUpdate.mock.calls[0]![1]
      expect(body.value).toBeNull()
      expect(body.markerChildren).not.toBeNull()
      expect(body.markerChildren.mavenArtifacts).toHaveLength(1)
      expect(body.markerChildren.mavenArtifacts[0].groupPattern).toBe('org.example.alpha')
    })
  })

  it('can add a new maven artifact row', async () => {
    renderEditor({ mode: 'edit', override: makeMarkerOverride() })
    await userEvent.click(screen.getByRole('button', { name: /add artifact/i }))
    expect(screen.getByText('Artifact 2')).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Tests: all six markers are accessible in the select
// ---------------------------------------------------------------------------

describe('OverrideRowEditor — all six markers accessible', () => {
  it('marker dropdown contains all six marker paths', async () => {
    renderEditor()
    await userEvent.click(screen.getByRole('tab', { name: /marker/i }))
    const select = screen.getByTestId('attr-select') as HTMLSelectElement
    const optionValues = Array.from(select.options).map((o) => o.value)
    expect(optionValues).toContain('vcs.settings')
    expect(optionValues).toContain('distribution.maven')
    expect(optionValues).toContain('distribution.fileUrl')
    expect(optionValues).toContain('distribution.docker')
    expect(optionValues).toContain('distribution.packages')
    expect(optionValues).toContain('build.requiredTools')
  })
})

// ---------------------------------------------------------------------------
// Tests: marker child trim + blank-row filter (regression lock)
// ---------------------------------------------------------------------------
// Mirrors the DistributionTab + VcsTab cleaned-row pattern. A newly-added
// empty row in the modal must NOT reach the server as whitespace — required
// CRS fields would 400. Whitespace-only required fields are dropped; trim
// is applied to all string fields.

describe('OverrideRowEditor — marker child trim + blank-row filter', () => {
  beforeEach(() => {
    mockQueueCreate.mockReset()
    mockQueueUpdate.mockReset()
    mockToast.mockReset()
    mockOverridesList = []
  })

  it('vcs.settings: whitespace-only vcsPath row is dropped, surviving row is trimmed', async () => {
    // HTML5 `required` accepts `"   "` as non-empty, so the form-submit
    // gate does NOT catch whitespace-only required fields. Without the
    // trim+filter, that row reaches CRS as `vcsPath: "   "` and 400s.
    renderEditor()
    await userEvent.click(screen.getByRole('tab', { name: /marker/i }))
    const select = screen.getByTestId('attr-select') as HTMLSelectElement
    await userEvent.selectOptions(select, 'vcs.settings')

    // Row 1 — populate vcsPath with surrounding whitespace
    await userEvent.click(screen.getByRole('button', { name: /add entry/i }))
    const vcsPathInputs = await screen.findAllByPlaceholderText('ssh://git@...')
    await userEvent.type(vcsPathInputs[0]!, '  ssh://git@host/repo  ')

    // Row 2 — whitespace-only vcsPath (satisfies HTML5 required) → row dropped
    await userEvent.click(screen.getByRole('button', { name: /add entry/i }))
    const vcsPathInputs2 = await screen.findAllByPlaceholderText('ssh://git@...')
    await userEvent.type(vcsPathInputs2[1]!, '   ')

    fireEvent.change(screen.getByLabelText('Version Range'), { target: { value: '[1.0,2.0)' } })
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))

    await waitFor(() => {
      expect(mockQueueCreate).toHaveBeenCalledOnce()
      const body = mockQueueCreate.mock.calls[0]![0]
      expect(body.markerChildren.vcsEntries).toHaveLength(1)
      expect(body.markerChildren.vcsEntries[0].vcsPath).toBe('ssh://git@host/repo')
    })
  })

  it('distribution.maven: whitespace-only artifactPattern row is dropped, surviving row is trimmed', async () => {
    renderEditor()
    await userEvent.click(screen.getByRole('tab', { name: /marker/i }))
    const select = screen.getByTestId('attr-select') as HTMLSelectElement
    await userEvent.selectOptions(select, 'distribution.maven')

    // Row 1 — both patterns populated with surrounding whitespace
    await userEvent.click(screen.getByRole('button', { name: /add artifact/i }))
    const groupInputs = await screen.findAllByPlaceholderText('org.example.alpha')
    const artifactInputs = await screen.findAllByPlaceholderText('my-component-*')
    await userEvent.type(groupInputs[0]!, '  org.example.alpha  ')
    await userEvent.type(artifactInputs[0]!, '  my-lib-*  ')

    // Row 2 — groupPattern populated, artifactPattern whitespace-only
    // (satisfies HTML5 required) → row dropped by trim+filter
    await userEvent.click(screen.getByRole('button', { name: /add artifact/i }))
    const groupInputs2 = await screen.findAllByPlaceholderText('org.example.alpha')
    const artifactInputs2 = await screen.findAllByPlaceholderText('my-component-*')
    await userEvent.type(groupInputs2[1]!, 'org.example.beta')
    await userEvent.type(artifactInputs2[1]!, '   ')

    fireEvent.change(screen.getByLabelText('Version Range'), { target: { value: '[1.0,2.0)' } })
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))

    await waitFor(() => {
      expect(mockQueueCreate).toHaveBeenCalledOnce()
      const body = mockQueueCreate.mock.calls[0]![0]
      expect(body.markerChildren.mavenArtifacts).toHaveLength(1)
      expect(body.markerChildren.mavenArtifacts[0].groupPattern).toBe('org.example.alpha')
      expect(body.markerChildren.mavenArtifacts[0].artifactPattern).toBe('my-lib-*')
    })
  })
})

// ---------------------------------------------------------------------------
// Tests: full marker submit body for the remaining three markers
// ---------------------------------------------------------------------------
// Per plan item P1-8: the existing requiredTools test pinned the wire body
// shape end-to-end; vcs.settings + distribution.maven gained that coverage
// in the trim+filter regression-lock above; this block fills in the
// remaining three markers (fileUrl, docker, packages) so any future
// markerChildren contract drift fails a unit test, not e2e.

describe('OverrideRowEditor — full submit body for fileUrl/docker/packages markers', () => {
  beforeEach(() => {
    mockQueueCreate.mockReset()
    mockQueueUpdate.mockReset()
    mockToast.mockReset()
    mockOverridesList = []
  })

  it('queues a create with correct marker body for distribution.fileUrl', async () => {
    renderEditor()
    await userEvent.click(screen.getByRole('tab', { name: /marker/i }))
    const select = screen.getByTestId('attr-select') as HTMLSelectElement
    await userEvent.selectOptions(select, 'distribution.fileUrl')

    // FileUrl section's Add button is labeled "Add Artifact" (same as Maven),
    // but only one marker card is rendered at a time, so this is unambiguous.
    await userEvent.click(screen.getByRole('button', { name: /add artifact/i }))
    const urlInputs = await screen.findAllByPlaceholderText('https://artifacts.example.com/...')
    await userEvent.type(urlInputs[0]!, 'https://example.com/dist.tar.gz')

    fireEvent.change(screen.getByLabelText('Version Range'), { target: { value: '[1.0,2.0)' } })
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))

    await waitFor(() => {
      expect(mockQueueCreate).toHaveBeenCalledOnce()
      const body = mockQueueCreate.mock.calls[0]![0]
      expect(body.overriddenAttribute).toBe('distribution.fileUrl')
      expect(body.value).toBeNull()
      expect(body.markerChildren.fileUrlArtifacts).toEqual([
        { url: 'https://example.com/dist.tar.gz', artifactId: null, classifier: null },
      ])
    })
  })

  it('queues a create with correct marker body for distribution.docker', async () => {
    renderEditor()
    await userEvent.click(screen.getByRole('tab', { name: /marker/i }))
    const select = screen.getByTestId('attr-select') as HTMLSelectElement
    await userEvent.selectOptions(select, 'distribution.docker')

    await userEvent.click(screen.getByRole('button', { name: /add image/i }))
    const imageInputs = await screen.findAllByPlaceholderText('my-org/my-image')
    await userEvent.type(imageInputs[0]!, 'my-org/svc')

    fireEvent.change(screen.getByLabelText('Version Range'), { target: { value: '[1.0,2.0)' } })
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))

    await waitFor(() => {
      expect(mockQueueCreate).toHaveBeenCalledOnce()
      const body = mockQueueCreate.mock.calls[0]![0]
      expect(body.overriddenAttribute).toBe('distribution.docker')
      expect(body.value).toBeNull()
      expect(body.markerChildren.dockerImages).toEqual([
        { imageName: 'my-org/svc', flavor: null },
      ])
    })
  })

  it('queues a create with correct marker body for distribution.packages', async () => {
    renderEditor()
    await userEvent.click(screen.getByRole('tab', { name: /marker/i }))
    const select = screen.getByTestId('attr-select') as HTMLSelectElement
    await userEvent.selectOptions(select, 'distribution.packages')

    await userEvent.click(screen.getByRole('button', { name: /add package/i }))
    const typeInputs = await screen.findAllByPlaceholderText('rpm')
    const nameInputs = await screen.findAllByPlaceholderText('my-package')
    await userEvent.type(typeInputs[0]!, 'rpm')
    await userEvent.type(nameInputs[0]!, 'my-svc')

    fireEvent.change(screen.getByLabelText('Version Range'), { target: { value: '[1.0,2.0)' } })
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))

    await waitFor(() => {
      expect(mockQueueCreate).toHaveBeenCalledOnce()
      const body = mockQueueCreate.mock.calls[0]![0]
      expect(body.overriddenAttribute).toBe('distribution.packages')
      expect(body.value).toBeNull()
      expect(body.markerChildren.packages).toEqual([
        { packageType: 'rpm', packageName: 'my-svc' },
      ])
    })
  })
})

describe('OverrideRowEditor — D5 closed-range enforcement', () => {
  beforeEach(() => {
    mockQueueCreate.mockReset()
    mockQueueUpdate.mockReset()
    mockToast.mockReset()
    mockOverridesList = []
  })

  it('does not call createMutation when version range is empty', async () => {
    renderEditor()
    const select = screen.getByTestId('attr-select') as HTMLSelectElement
    await userEvent.selectOptions(select, 'build.javaVersion')
    const valueInput = screen.getByPlaceholderText('Value for Java Version')
    await userEvent.type(valueInput, '11')
    // Range left empty — submit should be blocked
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))
    expect(mockQueueCreate).not.toHaveBeenCalled()
  })

  it('queues a create for an open-upper range [2.0,) (ADR-018: from-X-onward overrides are first-class)', async () => {
    renderEditor()
    const select = screen.getByTestId('attr-select') as HTMLSelectElement
    await userEvent.selectOptions(select, 'build.javaVersion')
    fireEvent.change(screen.getByLabelText('Version Range'), { target: { value: '[2.0,)' } })
    const valueInput = screen.getByPlaceholderText('Value for Java Version')
    await userEvent.type(valueInput, '17')
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))
    expect(mockQueueCreate).toHaveBeenCalledTimes(1)
    expect(mockQueueCreate.mock.calls[0]?.[0]).toMatchObject({ versionRange: '[2.0,)' })
  })

  it('does not queue a create for an all-versions range (,) and renders a base-default error', async () => {
    renderEditor()
    const select = screen.getByTestId('attr-select') as HTMLSelectElement
    await userEvent.selectOptions(select, 'build.javaVersion')
    fireEvent.change(screen.getByLabelText('Version Range'), { target: { value: '(,)' } })
    const valueInput = screen.getByPlaceholderText('Value for Java Version')
    await userEvent.type(valueInput, '17')
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))
    expect(mockQueueCreate).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(screen.getByText(/base default/i)).toBeDefined()
    })
  })

  it('renders inline error when range is syntactically invalid', async () => {
    renderEditor()
    fireEvent.change(screen.getByLabelText('Version Range'), { target: { value: 'garbage' } })
    await waitFor(() => {
      expect(screen.getByText(/invalid version range syntax/i)).toBeDefined()
    })
  })
})

describe('OverrideRowEditor — overlap detection (pre-save)', () => {
  beforeEach(() => {
    mockQueueCreate.mockReset()
    mockQueueUpdate.mockReset()
    mockToast.mockReset()
    mockOverridesList = []
  })

  it('surfaces inline error when entered range overlaps a sibling on the same attribute', async () => {
    mockOverridesList = [
      {
        id: 'existing-1',
        overriddenAttribute: 'build.javaVersion',
        versionRange: '[1.0.107,)',
        rowType: 'SCALAR_OVERRIDE',
        value: '17',
        markerChildren: null,
        createdAt: null,
        updatedAt: null,
      },
    ]
    renderEditor()
    const select = screen.getByTestId('attr-select') as HTMLSelectElement
    await userEvent.selectOptions(select, 'build.javaVersion')
    fireEvent.change(screen.getByLabelText('Version Range'), { target: { value: '[1.0,2.0]' } })
    await waitFor(() => {
      expect(screen.getByText(/overlaps with existing override \[1\.0\.107,\)/i)).toBeDefined()
    })
  })

  it('does not call createMutation when overlap is present', async () => {
    mockOverridesList = [
      {
        id: 'existing-1',
        overriddenAttribute: 'build.javaVersion',
        versionRange: '[1.0.107,)',
        rowType: 'SCALAR_OVERRIDE',
        value: '17',
        markerChildren: null,
        createdAt: null,
        updatedAt: null,
      },
    ]
    renderEditor()
    const select = screen.getByTestId('attr-select') as HTMLSelectElement
    await userEvent.selectOptions(select, 'build.javaVersion')
    fireEvent.change(screen.getByLabelText('Version Range'), { target: { value: '[1.0,2.0]' } })
    const valueInput = screen.getByPlaceholderText('Value for Java Version')
    await userEvent.type(valueInput, '11')
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))
    expect(mockQueueCreate).not.toHaveBeenCalled()
  })

  it('ignores existing overrides on a different attribute', async () => {
    mockOverridesList = [
      {
        id: 'existing-1',
        overriddenAttribute: 'jira.releaseVersionFormat',
        versionRange: '[1.0,2.0)',
        rowType: 'SCALAR_OVERRIDE',
        value: 'x',
        markerChildren: null,
        createdAt: null,
        updatedAt: null,
      },
    ]
    renderEditor()
    const select = screen.getByTestId('attr-select') as HTMLSelectElement
    await userEvent.selectOptions(select, 'build.javaVersion')
    fireEvent.change(screen.getByLabelText('Version Range'), { target: { value: '[1.0,2.0]' } })
    expect(screen.queryByText(/overlaps with existing override/i)).toBeNull()
  })

  it('excludes the row being edited from the overlap walk', async () => {
    const existing: FieldOverride = {
      id: 'fo-edit',
      overriddenAttribute: 'build.javaVersion',
      versionRange: '[1.0,2.0)',
      rowType: 'SCALAR_OVERRIDE',
      value: '11',
      markerChildren: null,
      createdAt: null,
      updatedAt: null,
    }
    mockOverridesList = [existing]
    renderEditor({ mode: 'edit', override: existing })
    // Range unchanged → must not trigger overlap with self.
    expect(screen.queryByText(/overlaps with existing override/i)).toBeNull()
  })

  it('labels a semantically-equal duplicate distinctly from a partial overlap', async () => {
    mockOverridesList = [
      {
        id: 'existing-1',
        overriddenAttribute: 'build.javaVersion',
        versionRange: '[1.0,2.0)',
        rowType: 'SCALAR_OVERRIDE',
        value: '17',
        markerChildren: null,
        createdAt: null,
        updatedAt: null,
      },
    ]
    renderEditor()
    const select = screen.getByTestId('attr-select') as HTMLSelectElement
    await userEvent.selectOptions(select, 'build.javaVersion')
    // Trailing-zero-equal to the existing override — duplicate, not overlap.
    fireEvent.change(screen.getByLabelText('Version Range'), { target: { value: '[1,2)' } })
    await waitFor(() => {
      expect(screen.getByText(/semantically equal to existing override \[1\.0,2\.0\)/i)).toBeInTheDocument()
    })
    expect(screen.queryByText(/overlaps with existing override/i)).toBeNull()
  })

  it('rejects a range that fully contains an existing override (containment)', async () => {
    mockOverridesList = [
      {
        id: 'existing-1',
        overriddenAttribute: 'build.javaVersion',
        versionRange: '[1.0,2.0]',
        rowType: 'SCALAR_OVERRIDE',
        value: '17',
        markerChildren: null,
        createdAt: null,
        updatedAt: null,
      },
    ]
    renderEditor()
    const select = screen.getByTestId('attr-select') as HTMLSelectElement
    await userEvent.selectOptions(select, 'build.javaVersion')
    // [0,3.0] strictly contains the existing [1.0,2.0] → conflict.
    fireEvent.change(screen.getByLabelText('Version Range'), { target: { value: '[0,3.0]' } })
    await waitFor(() => {
      expect(screen.getByText(/overlaps with existing override \[1\.0,2\.0\]/i)).toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// Tests: presetAttribute (distribution per-range entry from the Distribution tab)
// ---------------------------------------------------------------------------

describe('OverrideRowEditor — presetAttribute (create, locked marker path)', () => {
  beforeEach(() => {
    mockQueueCreate.mockReset()
    mockQueueUpdate.mockReset()
    mockToast.mockReset()
    mockOverridesList = []
  })

  it('locks the attribute to the preset: no type tabs, no attribute select, path shown read-only', () => {
    renderEditor({ mode: 'create', presetAttribute: 'distribution.docker' })
    // The scalar/marker type picker is suppressed — the preset implies marker.
    expect(screen.queryByRole('tab', { name: /scalar/i })).toBeNull()
    // No editable attribute picker.
    expect(screen.queryByTestId('attr-select')).toBeNull()
    // Path shown read-only, and the docker child editor is rendered (its Add Image button).
    expect(screen.getByText('distribution.docker')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add image/i })).toBeInTheDocument()
  })

  it('queues a create carrying the preset attribute + marker children', async () => {
    const user = userEvent.setup()
    renderEditor({ mode: 'create', presetAttribute: 'distribution.docker' })
    await user.click(screen.getByRole('button', { name: /add image/i }))
    fireEvent.change(screen.getByPlaceholderText('my-org/my-image'), { target: { value: 'acme/app' } })
    fireEvent.change(screen.getByLabelText('Version Range'), { target: { value: '[1,2)' } })
    await user.click(screen.getByRole('button', { name: /^create$/i }))
    expect(mockQueueCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        overriddenAttribute: 'distribution.docker',
        versionRange: '[1,2)',
        markerChildren: { dockerImages: [{ imageName: 'acme/app', flavor: null }] },
      }),
    )
  })
})
