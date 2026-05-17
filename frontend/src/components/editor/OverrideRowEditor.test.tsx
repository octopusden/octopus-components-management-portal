import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { OverrideRowEditor } from './OverrideRowEditor'
import type { FieldOverride } from '../../lib/types'

// jsdom does not implement ResizeObserver but Radix Switch uses it.
if (typeof window !== 'undefined' && !('ResizeObserver' in window)) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(window as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

// ---------------------------------------------------------------------------
// Mock hooks
// ---------------------------------------------------------------------------

const mockCreateMutateAsync = vi.fn()
const mockUpdateMutateAsync = vi.fn()

vi.mock('../../hooks/useComponent', () => ({
  useCreateFieldOverride: vi.fn(() => ({
    mutateAsync: mockCreateMutateAsync,
    isPending: false,
  })),
  useUpdateFieldOverride: vi.fn(() => ({
    mutateAsync: mockUpdateMutateAsync,
    isPending: false,
  })),
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderEditor(props: Partial<Parameters<typeof OverrideRowEditor>[0]> = {}) {
  const defaults = {
    open: true,
    onOpenChange: vi.fn(),
    componentId: 'c-1',
    mode: 'create' as const,
    ...props,
  }
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <OverrideRowEditor {...defaults} />
    </QueryClientProvider>,
  )
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
    mockCreateMutateAsync.mockReset()
    mockUpdateMutateAsync.mockReset()
    mockToast.mockReset()
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

  it('renders version range input with default value (,0),[0,)', () => {
    renderEditor()
    const input = screen.getByPlaceholderText('(,0),[0,)') as HTMLInputElement
    expect(input.value).toBe('(,0),[0,)')
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
    expect(optionValues).toContain('jira.projectKey')
  })

  it('selecting a string attribute renders an Input for value', async () => {
    renderEditor()
    const select = screen.getByTestId('attr-select') as HTMLSelectElement
    await userEvent.selectOptions(select, 'build.javaVersion')
    expect(screen.getByPlaceholderText('Value for Java Version')).toBeDefined()
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

  it('calls useCreateFieldOverride with correct scalar string body on submit', async () => {
    mockCreateMutateAsync.mockResolvedValue({})
    renderEditor()
    const select = screen.getByTestId('attr-select') as HTMLSelectElement
    await userEvent.selectOptions(select, 'build.javaVersion')

    const versionInput = screen.getByPlaceholderText('(,0),[0,)') as HTMLInputElement
    fireEvent.change(versionInput, { target: { value: '[11,12)' } })

    const valueInput = screen.getByPlaceholderText('Value for Java Version')
    await userEvent.type(valueInput, '11')

    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))

    await waitFor(() => {
      expect(mockCreateMutateAsync).toHaveBeenCalledOnce()
      const body = mockCreateMutateAsync.mock.calls[0]![0]
      expect(body.overriddenAttribute).toBe('build.javaVersion')
      expect(body.versionRange).toBe('[11,12)')
      expect(body.value).toBe('11')
      // Tagged-union invariant: markerChildren must be null
      expect(body.markerChildren).toBeNull()
    })
  })

  it('calls useCreateFieldOverride with correct marker body for requiredTools (deduped)', async () => {
    mockCreateMutateAsync.mockResolvedValue({})
    renderEditor()
    await userEvent.click(screen.getByRole('tab', { name: /marker/i }))
    const select = screen.getByTestId('attr-select') as HTMLSelectElement
    await userEvent.selectOptions(select, 'build.requiredTools')

    const toolsInput = screen.getByPlaceholderText('tool-a, tool-b')
    await userEvent.type(toolsInput, 'tool-a, tool-b, tool-a')

    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))

    await waitFor(() => {
      expect(mockCreateMutateAsync).toHaveBeenCalledOnce()
      const body = mockCreateMutateAsync.mock.calls[0]![0]
      expect(body.overriddenAttribute).toBe('build.requiredTools')
      // Tagged-union invariant: value null for marker
      expect(body.value).toBeNull()
      expect(body.markerChildren).not.toBeNull()
      // Duplicates deduped
      expect(body.markerChildren.requiredTools).toEqual(['tool-a', 'tool-b'])
    })
  })

  it('calls useCreateFieldOverride with boolean true value for boolean attribute', async () => {
    mockCreateMutateAsync.mockResolvedValue({})
    renderEditor()
    const select = screen.getByTestId('attr-select') as HTMLSelectElement
    await userEvent.selectOptions(select, 'build.deprecated')

    // Toggle the switch on
    const switches = screen.getAllByRole('switch')
    await userEvent.click(switches[0]!)

    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))

    await waitFor(() => {
      expect(mockCreateMutateAsync).toHaveBeenCalledOnce()
      const body = mockCreateMutateAsync.mock.calls[0]![0]
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
    mockCreateMutateAsync.mockReset()
    mockUpdateMutateAsync.mockReset()
    mockToast.mockReset()
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
    const input = screen.getByPlaceholderText('(,0),[0,)') as HTMLInputElement
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

  it('calls useUpdateFieldOverride with correct body on submit', async () => {
    mockUpdateMutateAsync.mockResolvedValue({})
    renderEditor({ mode: 'edit', override: makeScalarOverride() })

    const versionInput = screen.getByPlaceholderText('(,0),[0,)') as HTMLInputElement
    fireEvent.change(versionInput, { target: { value: '[17,18)' } })

    const valueInput = screen.getByPlaceholderText('Value for Java Version')
    await userEvent.clear(valueInput)
    await userEvent.type(valueInput, '17')

    await userEvent.click(screen.getByRole('button', { name: /^update$/i }))

    await waitFor(() => {
      expect(mockUpdateMutateAsync).toHaveBeenCalledOnce()
      const body = mockUpdateMutateAsync.mock.calls[0]![0]
      expect(body.overrideId).toBe('fo-1')
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
    mockCreateMutateAsync.mockReset()
    mockUpdateMutateAsync.mockReset()
    mockToast.mockReset()
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

  it('calls useUpdateFieldOverride with markerChildren body on submit', async () => {
    mockUpdateMutateAsync.mockResolvedValue({})
    renderEditor({ mode: 'edit', override: makeMarkerOverride() })

    await userEvent.click(screen.getByRole('button', { name: /^update$/i }))

    await waitFor(() => {
      expect(mockUpdateMutateAsync).toHaveBeenCalledOnce()
      const body = mockUpdateMutateAsync.mock.calls[0]![0]
      expect(body.overrideId).toBe('fo-2')
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
    mockCreateMutateAsync.mockReset()
    mockUpdateMutateAsync.mockReset()
    mockToast.mockReset()
  })

  it('vcs.settings: whitespace-only vcsPath row is dropped, surviving row is trimmed', async () => {
    // HTML5 `required` accepts `"   "` as non-empty, so the form-submit
    // gate does NOT catch whitespace-only required fields. Without the
    // trim+filter, that row reaches CRS as `vcsPath: "   "` and 400s.
    mockCreateMutateAsync.mockResolvedValue({})
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

    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))

    await waitFor(() => {
      expect(mockCreateMutateAsync).toHaveBeenCalledOnce()
      const body = mockCreateMutateAsync.mock.calls[0]![0]
      expect(body.markerChildren.vcsEntries).toHaveLength(1)
      expect(body.markerChildren.vcsEntries[0].vcsPath).toBe('ssh://git@host/repo')
    })
  })

  it('distribution.maven: whitespace-only artifactPattern row is dropped, surviving row is trimmed', async () => {
    mockCreateMutateAsync.mockResolvedValue({})
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

    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))

    await waitFor(() => {
      expect(mockCreateMutateAsync).toHaveBeenCalledOnce()
      const body = mockCreateMutateAsync.mock.calls[0]![0]
      expect(body.markerChildren.mavenArtifacts).toHaveLength(1)
      expect(body.markerChildren.mavenArtifacts[0].groupPattern).toBe('org.example.alpha')
      expect(body.markerChildren.mavenArtifacts[0].artifactPattern).toBe('my-lib-*')
    })
  })
})
