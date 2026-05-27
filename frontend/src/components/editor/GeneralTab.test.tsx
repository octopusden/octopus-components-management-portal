import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { GeneralTab, type GeneralFormValues } from './GeneralTab'
import type { ComponentDetail } from '../../lib/types'

// Stub the live data sources behind the embedded ui pickers so this file stays
// focused on the GeneralTab rendering contract for 7.1.5 (parentComponentName
// editable) and downstream tests for owner/enum/field-overrides remain isolated.
vi.mock('../../hooks/useOwners', () => ({
  useOwners: () => ({ data: [] }),
}))
vi.mock('../../hooks/useComponents', () => ({
  useComponents: vi.fn(() => ({ data: { content: [], totalElements: 0 } })),
}))

// Dictionary hooks behind the multi-select swap (ui-swift-sloth §4). Default
// to small in-memory dictionaries so the popovers render their checkbox lists.
// Tests that need empty dictionaries can override per-test.
const mockUseSystemsDictionary = vi.fn(() => ({ data: ['SYS1', 'SYS2'], isLoading: false, isError: false }))
const mockUseLabelsDictionary = vi.fn(() => ({ data: ['backend', 'internal', 'frontend'], isLoading: false, isError: false }))
vi.mock('../../hooks/useSystemsDictionary', () => ({
  useSystemsDictionary: () => mockUseSystemsDictionary(),
}))
vi.mock('../../hooks/useLabelsDictionary', () => ({
  useLabelsDictionary: () => mockUseLabelsDictionary(),
}))

// Supported-groups hook for the editor group-key prefix gate. Default to a
// permissive list; tests that exercise the disallowed-prefix path override.
const mockUseSupportedGroups = vi.fn(() => ({
  data: ['org.example', 'com.example'],
  isLoading: false,
  isError: false,
}))
vi.mock('../../hooks/useSupportedGroups', () => ({
  useSupportedGroups: () => mockUseSupportedGroups(),
}))

// useFieldConfigEntry mock — controls visibility-gating per test.
// Default: all fields 'editable'. Tests can override per field via mockReturnValue.
const mockUseFieldConfigEntry = vi.fn()
vi.mock('../../hooks/useFieldConfig', () => ({
  useFieldConfigOptions: () => ({ options: [], isLoading: false }),
  useFieldConfigEntry: (fieldPath: string) => mockUseFieldConfigEntry(fieldPath),
}))

// Render a queryable marker so tests can assert presence/absence per attribute.
vi.mock('./FieldOverrideInline', () => ({
  FieldOverrideInline: ({ overriddenAttribute }: { overriddenAttribute: string }) => (
    <span data-testid={`field-override-inline-${overriddenAttribute}`} />
  ),
}))

// Stub useCurrentUser so each test pins the role/permission set under test.
// The 7.1.4 rename surface depends on the JWT-derived RENAME_COMPONENTS
// permission: ROLE_ADMIN holds it; ROLE_COMPONENTS_REGISTRY_EDITOR / VIEWER do not.
const mockUseCurrentUser = vi.fn()
vi.mock('../../hooks/useCurrentUser', () => ({
  useCurrentUser: () => mockUseCurrentUser(),
}))

function baseComponent(overrides: Partial<ComponentDetail> = {}): ComponentDetail {
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
    version: 0,
    createdAt: null,
    updatedAt: null,
    ...overrides,
  } as ComponentDetail
}

/** Returns an entry object with the given visibility (defaults to editable). */
function makeEntry(visibility: 'editable' | 'readonly' | 'hidden' = 'editable') {
  return { entry: { visibility, required: false }, isLoading: false, isError: false }
}

/** Default mock: all fields editable. */
function setAllEditable() {
  mockUseFieldConfigEntry.mockImplementation(() => makeEntry('editable'))
}

function Harness({ component, formRef }: { component: ComponentDetail; formRef?: React.MutableRefObject<ReturnType<typeof useForm<GeneralFormValues>> | null> }) {
  const form = useForm<GeneralFormValues>({
    defaultValues: {
      name: component.name,
      displayName: component.displayName ?? '',
      componentOwner: component.componentOwner ?? '',
      productType: component.productType ?? '',
      // ui-swift-sloth §4: form values for system + labels are arrays.
      system: component.systems ?? [],
      labels: component.labels ?? [],
      clientCode: component.clientCode ?? '',
      solution: component.solution ?? false,
      archived: component.archived,
      parentComponentName: component.parentComponentName ?? '',
      groupId: component.group?.groupKey ?? '',
      groupIsFake: component.group?.isFake ?? false,
      releaseManager: component.releaseManager ?? '',
      securityChampion: component.securityChampion ?? '',
      copyright: component.copyright ?? '',
      releasesInDefaultBranch: component.releasesInDefaultBranch ?? false,
      teamcityProjects: (component.teamcityProjects ?? []).map((tc) => ({ projectId: tc.projectId })),
      docs: (component.docs ?? []).map((d) => ({
        docComponentKey: d.docComponentKey,
        majorVersion: d.majorVersion ?? '',
      })),
      artifactIds: (component.artifactIds ?? []).map((a) => ({
        groupPattern: a.groupPattern,
        artifactPattern: a.artifactPattern,
      })),
    },
  })
  if (formRef) formRef.current = form
  return <GeneralTab component={component} form={form} />
}

beforeEach(() => {
  // Default to admin so the established 7.1.5 tests don't need to opt-in.
  // Tests that care about permission gating override per-test below.
  mockUseCurrentUser.mockReturnValue({ data: ADMIN_USER, isLoading: false, isError: false })
  // Default: all fields editable
  setAllEditable()
})

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

// User shape mirrors /auth/me — `roles` is an array of {name, permissions}.
// hasPermission flattens the per-role permission lists. RENAME_COMPONENTS is
// granted to ROLE_ADMIN only (per CRS application-common.yml octopus-security.roles).
const ADMIN_USER = {
  username: 'alice',
  roles: [
    {
      name: 'ROLE_ADMIN',
      permissions: [
        'ACCESS_COMPONENTS',
        'EDIT_COMPONENTS',
        'ARCHIVE_COMPONENTS',
        'RENAME_COMPONENTS',
        'DELETE_COMPONENTS',
        'IMPORT_DATA',
        'ACCESS_AUDIT',
      ],
    },
  ],
  groups: [],
}
const EDITOR_USER = {
  username: 'bob',
  roles: [
    {
      name: 'ROLE_COMPONENTS_REGISTRY_EDITOR',
      permissions: ['ACCESS_COMPONENTS', 'EDIT_COMPONENTS', 'ACCESS_AUDIT'],
    },
  ],
  groups: [],
}

describe('GeneralTab parentComponentName (B7.1.5)', () => {
  it('renders parentComponentName as a labelled editable input pre-filled with current value', () => {
    const component = baseComponent({ parentComponentName: 'platform-core' })
    renderWithProviders(<Harness component={component} />)

    const input = screen.getByLabelText(/parent component/i) as HTMLInputElement
    expect(input).toBeDefined()
    expect(input.tagName.toLowerCase()).toBe('input')
    expect(input.value).toBe('platform-core')
  })

  it('renders parentComponentName as an empty input when the component has no parent', () => {
    const component = baseComponent({ parentComponentName: null })
    renderWithProviders(<Harness component={component} />)

    const input = screen.getByLabelText(/parent component/i) as HTMLInputElement
    expect(input).toBeDefined()
    expect(input.value).toBe('')
  })

  it('lets the user type a new value and surfaces it via the form', async () => {
    const component = baseComponent({ parentComponentName: 'old-parent' })
    renderWithProviders(<Harness component={component} />)

    const input = screen.getByLabelText(/parent component/i) as HTMLInputElement
    await userEvent.clear(input)
    await userEvent.type(input, 'new-parent')

    await waitFor(() => expect(input.value).toBe('new-parent'))
  })
})

describe('GeneralTab rename (B7.1.4)', () => {
  it('admin with RENAME_COMPONENTS sees an editable Name input pre-filled with the current name', () => {
    mockUseCurrentUser.mockReturnValue({ data: ADMIN_USER, isLoading: false, isError: false })
    const component = baseComponent({ name: 'orig-name' })
    renderWithProviders(<Harness component={component} />)

    const input = screen.getByLabelText(/^component key$/i) as HTMLInputElement
    expect(input).toBeDefined()
    expect(input.disabled).toBe(false)
    expect(input.value).toBe('orig-name')
  })

  it('editor without RENAME_COMPONENTS sees the Name input disabled with explanatory hint', () => {
    mockUseCurrentUser.mockReturnValue({ data: EDITOR_USER, isLoading: false, isError: false })
    const component = baseComponent({ name: 'orig-name' })
    renderWithProviders(<Harness component={component} />)

    const input = screen.getByLabelText(/^component key$/i) as HTMLInputElement
    expect(input).toBeDefined()
    expect(input.disabled).toBe(true)
    expect(input.value).toBe('orig-name')
    // The disabled hint should mention RENAME_COMPONENTS so the user understands
    // why the field is locked rather than treating "disabled" as "read-only forever".
    expect(screen.getByText(/RENAME_COMPONENTS/i)).toBeDefined()
  })

  it('admin can edit the Name input and the form picks up the new value', async () => {
    mockUseCurrentUser.mockReturnValue({ data: ADMIN_USER, isLoading: false, isError: false })
    const component = baseComponent({ name: 'orig-name' })
    renderWithProviders(<Harness component={component} />)

    const input = screen.getByLabelText(/^component key$/i) as HTMLInputElement
    await userEvent.clear(input)
    await userEvent.type(input, 'renamed-component')

    await waitFor(() => expect(input.value).toBe('renamed-component'))
  })

  it('viewer (no permissions beyond ACCESS_COMPONENTS) cannot edit Name', () => {
    mockUseCurrentUser.mockReturnValue({
      data: {
        username: 'carol',
        roles: [{ name: 'ROLE_COMPONENTS_REGISTRY_VIEWER', permissions: ['ACCESS_COMPONENTS', 'ACCESS_AUDIT'] }],
        groups: [],
      },
      isLoading: false,
      isError: false,
    })
    const component = baseComponent({ name: 'orig-name' })
    renderWithProviders(<Harness component={component} />)

    const input = screen.getByLabelText(/^component key$/i) as HTMLInputElement
    expect(input.disabled).toBe(true)
  })
})

// ── Visibility-gating (§7.0/2c critical contract) ─────────────────────────────

describe('GeneralTab visibility-gating', () => {
  it('clientCode hidden → input NOT rendered', () => {
    mockUseFieldConfigEntry.mockImplementation((path: string) => {
      if (path === 'component.clientCode') return makeEntry('hidden')
      return makeEntry('editable')
    })
    const component = baseComponent({ clientCode: 'ACME' })
    renderWithProviders(<Harness component={component} />)

    expect(screen.queryByLabelText(/client code/i)).toBeNull()
  })

  it('clientCode readonly → input rendered disabled', () => {
    mockUseFieldConfigEntry.mockImplementation((path: string) => {
      if (path === 'component.clientCode') return makeEntry('readonly')
      return makeEntry('editable')
    })
    const component = baseComponent({ clientCode: 'ACME' })
    renderWithProviders(<Harness component={component} />)

    const input = screen.getByLabelText(/client code/i) as HTMLInputElement
    expect(input.disabled).toBe(true)
  })

  it('clientCode editable → input rendered enabled', () => {
    setAllEditable()
    const component = baseComponent({ clientCode: 'ACME' })
    renderWithProviders(<Harness component={component} />)

    const input = screen.getByLabelText(/client code/i) as HTMLInputElement
    expect(input.disabled).toBe(false)
  })

  it('system hidden → System(s) multi-select NOT rendered', () => {
    mockUseFieldConfigEntry.mockImplementation((path: string) => {
      if (path === 'component.systems') return makeEntry('hidden')
      return makeEntry('editable')
    })
    const component = baseComponent({ systems: ['SYS1'] })
    renderWithProviders(<Harness component={component} />)

    expect(screen.queryByText(/system\(s\)/i)).toBeNull()
  })

  it('system readonly → System(s) multi-select rendered disabled', () => {
    mockUseFieldConfigEntry.mockImplementation((path: string) => {
      if (path === 'component.systems') return makeEntry('readonly')
      return makeEntry('editable')
    })
    const component = baseComponent({ systems: ['SYS1'] })
    renderWithProviders(<Harness component={component} />)

    // MultiSelectFilter renders the trigger via <Button>. Use the row's
    // accessible name from the Label htmlFor="component-system" target.
    const trigger = screen.getByRole('button', { name: /system\(s\)/i })
    expect(trigger).toHaveProperty('disabled', true)
  })

  it('componentOwner hidden → Ownership section NOT rendered', () => {
    mockUseFieldConfigEntry.mockImplementation((path: string) => {
      if (path === 'component.componentOwner') return makeEntry('hidden')
      return makeEntry('editable')
    })
    const component = baseComponent({ componentOwner: 'alice' })
    renderWithProviders(<Harness component={component} />)

    expect(screen.queryByLabelText(/component owner/i)).toBeNull()
  })

  it('displayName hidden → Display Name input NOT rendered', () => {
    mockUseFieldConfigEntry.mockImplementation((path: string) => {
      if (path === 'component.displayName') return makeEntry('hidden')
      return makeEntry('editable')
    })
    const component = baseComponent({ displayName: 'Test' })
    renderWithProviders(<Harness component={component} />)

    expect(screen.queryByLabelText(/display name/i)).toBeNull()
  })

  it('productType EnumSelect is NOT rendered in GeneralTab (migrated to EscrowTab)', () => {
    setAllEditable()
    const component = baseComponent({ productType: 'TYPE_A' })
    renderWithProviders(<Harness component={component} />)

    // productType should not appear in GeneralTab at all
    expect(screen.queryByText(/product type/i)).toBeNull()
  })
})

// ── system-field-hidden → undefined (not []) ──────────────────────────────────
// The actual save-payload filtering lives in ComponentDetailPage.tsx, but we
// verify the form value contract: when system is hidden the field is still
// registered (setValue called with original value) but the save handler is
// responsible for mapping it to undefined. This test verifies the form renders
// the expected structure so the page-level filter can operate correctly.
describe('GeneralTab system field hidden → form value contract', () => {
  it('when system is hidden, the form still initialises system from component.systems array (page filters to undefined on save)', () => {
    mockUseFieldConfigEntry.mockImplementation((path: string) => {
      if (path === 'component.systems') return makeEntry('hidden')
      return makeEntry('editable')
    })
    const formRef = React.createRef<ReturnType<typeof useForm<GeneralFormValues>> | null>() as React.MutableRefObject<ReturnType<typeof useForm<GeneralFormValues>> | null>
    const component = baseComponent({ systems: ['SYS1', 'SYS2'] })
    renderWithProviders(<Harness component={component} formRef={formRef} />)

    // Multi-select not rendered (hidden)
    expect(screen.queryByText(/system\(s\)/i)).toBeNull()
    // But form value is set from component (page logic uses this to build array for save)
    const val = formRef.current?.getValues('system')
    // ui-swift-sloth §4: array stays unchanged through hydration.
    expect(val).toEqual(['SYS1', 'SYS2'])
  })
})

describe('GeneralTab SYS-039 fields (Wave 2 PR-G)', () => {
  it('groupId editable → input rendered with current value', () => {
    setAllEditable()
    const component = baseComponent({ group: { groupKey: 'org.example.alpha', isFake: false, role: 'MEMBER' } })
    renderWithProviders(<Harness component={component} />)

    const input = screen.getByLabelText(/group key/i) as HTMLInputElement
    expect(input).toBeDefined()
    expect(input.value).toBe('org.example.alpha')
    expect(input.disabled).toBe(false)
  })

  it('groupId hidden → input NOT rendered', () => {
    mockUseFieldConfigEntry.mockImplementation((path: string) => {
      if (path === 'component.groupId') return makeEntry('hidden')
      return makeEntry('editable')
    })
    const component = baseComponent({ group: { groupKey: 'org.example.alpha', isFake: false, role: 'MEMBER' } })
    renderWithProviders(<Harness component={component} />)

    expect(screen.queryByLabelText(/group key/i)).toBeNull()
  })

  it('releaseManager editable → PeopleInput rendered (Label text present, not Input)', () => {
    setAllEditable()
    const component = baseComponent({ releaseManager: 'rm-user' })
    renderWithProviders(<Harness component={component} />)

    // Editable path renders PeopleInput (custom widget). The <Label htmlFor>
    // does not bind to a single Input id, so fall back to text presence.
    expect(screen.getByText(/release manager/i)).toBeDefined()
  })

  it('releaseManager readonly → input rendered disabled', () => {
    mockUseFieldConfigEntry.mockImplementation((path: string) => {
      if (path === 'component.releaseManager') return makeEntry('readonly')
      return makeEntry('editable')
    })
    const component = baseComponent({ releaseManager: 'rm-user' })
    renderWithProviders(<Harness component={component} />)

    const input = screen.getByLabelText(/release manager/i) as HTMLInputElement
    expect(input.disabled).toBe(true)
  })

  it('securityChampion hidden → input NOT rendered', () => {
    mockUseFieldConfigEntry.mockImplementation((path: string) => {
      if (path === 'component.securityChampion') return makeEntry('hidden')
      return makeEntry('editable')
    })
    const component = baseComponent({ securityChampion: 'sc-user' })
    renderWithProviders(<Harness component={component} />)

    expect(screen.queryByLabelText(/security champion/i)).toBeNull()
  })

  it('copyright editable → input rendered with current value', () => {
    setAllEditable()
    const component = baseComponent({ copyright: '(c) 2026 Acme Inc.' })
    renderWithProviders(<Harness component={component} />)

    const input = screen.getByLabelText(/copyright/i) as HTMLInputElement
    expect(input.value).toBe('(c) 2026 Acme Inc.')
  })

  it('releasesInDefaultBranch hidden → switch NOT rendered', () => {
    mockUseFieldConfigEntry.mockImplementation((path: string) => {
      if (path === 'component.releasesInDefaultBranch') return makeEntry('hidden')
      return makeEntry('editable')
    })
    const component = baseComponent({ releasesInDefaultBranch: true })
    renderWithProviders(<Harness component={component} />)

    expect(screen.queryByLabelText(/releases in default branch/i)).toBeNull()
  })

  it('labels editable → chips UX renders one badge per stored label (task #9)', () => {
    setAllEditable()
    const component = baseComponent({ labels: ['backend', 'internal'] })
    renderWithProviders(<Harness component={component} />)

    // The chips primitive renders each value as a Badge plus an aria-
    // labelled remove button. Two labels stored → two remove buttons.
    expect(screen.getByRole('button', { name: /^remove backend$/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /^remove internal$/i })).toBeDefined()
  })

  it('labels readonly → × buttons + add control disabled (task #9 integration)', () => {
    // Parity with the System readonly test: when field-config marks labels
    // readonly, both the per-chip × buttons and the add control must be
    // disabled. The integration path matters — ChipsInput's `disabled`
    // unit test covers the prop, but the GeneralTab gate that wires
    // `labelsEntry.visibility === 'readonly'` to that prop is what we're
    // pinning here.
    mockUseFieldConfigEntry.mockImplementation((path: string) => {
      if (path === 'component.labels') return makeEntry('readonly')
      return makeEntry('editable')
    })
    const component = baseComponent({ labels: ['backend'] })
    renderWithProviders(<Harness component={component} />)

    const removeBackend = screen.getByRole('button', { name: /^remove backend$/i }) as HTMLButtonElement
    expect(removeBackend.disabled).toBe(true)
    const addControl = screen.getByLabelText(/^add label$/i) as HTMLSelectElement
    expect(addControl.disabled).toBe(true)
  })

  it('all SYS-039 entries hidden → none of the SYS-039 controls render', () => {
    mockUseFieldConfigEntry.mockImplementation((path: string) => {
      if (
        path === 'component.groupId' ||
        path === 'component.releaseManager' ||
        path === 'component.securityChampion' ||
        path === 'component.copyright' ||
        path === 'component.releasesInDefaultBranch' ||
        path === 'component.labels'
      ) {
        return makeEntry('hidden')
      }
      return makeEntry('editable')
    })
    const component = baseComponent({
      group: { groupKey: 'org.example', isFake: false, role: 'MEMBER' },
      releaseManager: 'rm',
      securityChampion: 'sc',
      copyright: '(c)',
      releasesInDefaultBranch: true,
      labels: ['x'],
    })
    renderWithProviders(<Harness component={component} />)

    expect(screen.queryByLabelText(/group key/i)).toBeNull()
    expect(screen.queryByLabelText(/release manager/i)).toBeNull()
    expect(screen.queryByLabelText(/security champion/i)).toBeNull()
    expect(screen.queryByLabelText(/copyright/i)).toBeNull()
    expect(screen.queryByLabelText(/releases in default branch/i)).toBeNull()
    // labels — hidden hides both the <Label> and the multi-select.
    expect(screen.queryByText(/^labels$/i)).toBeNull()
  })
})

describe('GeneralTab TC link restoration fields (Portal PR-3)', () => {
  it('teamcityProjects entry: input populated with projectId from server', () => {
    setAllEditable()
    const component = baseComponent({
      teamcityProjects: [
        {
          id: 'tc-1',
          projectId: 'MyProject_Build',
          projectUrl: 'https://teamcity.example.com/project/MyProject_Build',
          sortOrder: 0,
        },
      ],
    })
    renderWithProviders(<Harness component={component} />)

    // Wave B: list editor with placeholder-keyed inputs (no aria-label per row).
    const inputs = screen.getAllByPlaceholderText('MyProject_Build') as HTMLInputElement[]
    expect(inputs.length).toBe(1)
    expect(inputs[0]!.value).toBe('MyProject_Build')
    expect(inputs[0]!.disabled).toBe(false)
  })

  it('teamcityProjects entry: server projectUrl rendered as static text (not editable)', () => {
    setAllEditable()
    const component = baseComponent({
      teamcityProjects: [
        {
          id: 'tc-1',
          projectId: 'MyProject_Build',
          projectUrl: 'https://teamcity.example.com/project/MyProject_Build',
          sortOrder: 0,
        },
      ],
    })
    renderWithProviders(<Harness component={component} />)

    // schema-v2 TeamcityProjectRequest has only projectId; the URL is
    // server-derived and shown as readonly text under the projectId input.
    const urlText = screen.getByText(/URL:.*teamcity\.example\.com\/project\/MyProject_Build/)
    expect(urlText).toBeDefined()
  })

  it('teamcityProjectId hidden → input NOT rendered AND entire TC section absent', () => {
    mockUseFieldConfigEntry.mockImplementation((path: string) => {
      if (path === 'component.teamcityProjectId') return makeEntry('hidden')
      return makeEntry('editable')
    })
    const component = baseComponent({
      teamcityProjects: [
        {
          id: 'tc-1',
          projectId: 'X',
          projectUrl: 'https://teamcity.example.com/project/X',
          sortOrder: 0,
        },
      ],
    })
    const { container } = renderWithProviders(<Harness component={component} />)

    // With the && guard, hiding either field hides the entire section.
    expect(screen.queryByLabelText(/tc project id/i)).toBeNull()
    expect(screen.queryByLabelText(/tc project url/i)).toBeNull()
    expect(container.querySelector('[data-testid="section-teamcity"]')).toBeNull()
  })

  it('teamcityProjectUrl hidden → entire TC section NOT rendered', () => {
    mockUseFieldConfigEntry.mockImplementation((path: string) => {
      if (path === 'component.teamcityProjectUrl') return makeEntry('hidden')
      return makeEntry('editable')
    })
    const component = baseComponent({
      teamcityProjects: [
        {
          id: 'tc-1',
          projectId: 'X',
          projectUrl: 'https://teamcity.example.com/project/X',
          sortOrder: 0,
        },
      ],
    })
    const { container } = renderWithProviders(<Harness component={component} />)

    // Hiding the URL field alone must suppress the whole section (pair logic).
    expect(screen.queryByLabelText(/tc project id/i)).toBeNull()
    expect(screen.queryByLabelText(/tc project url/i)).toBeNull()
    expect(container.querySelector('[data-testid="section-teamcity"]')).toBeNull()
  })

  it('both TC fields hidden → entire TeamCity section NOT rendered', () => {
    mockUseFieldConfigEntry.mockImplementation((path: string) => {
      if (
        path === 'component.teamcityProjectId' ||
        path === 'component.teamcityProjectUrl'
      ) {
        return makeEntry('hidden')
      }
      return makeEntry('editable')
    })
    const component = baseComponent({
      teamcityProjects: [
        {
          id: 'tc-1',
          projectId: 'X',
          projectUrl: 'https://teamcity.example.com/project/X',
          sortOrder: 0,
        },
      ],
    })
    const { container } = renderWithProviders(<Harness component={component} />)

    expect(screen.queryByLabelText(/tc project id/i)).toBeNull()
    expect(screen.queryByLabelText(/tc project url/i)).toBeNull()
    expect(container.querySelector('[data-testid="section-teamcity"]')).toBeNull()
  })

  it('schema-v2: server projectUrl rendered as readonly text next to its row', () => {
    setAllEditable()
    const component = baseComponent({
      teamcityProjects: [
        {
          id: 'tc-1',
          projectId: 'X',
          projectUrl: 'https://teamcity.example.com/project/X',
          sortOrder: 0,
        },
      ],
    })
    renderWithProviders(<Harness component={component} />)
    // URL is server-derived (TeamcityProjectRequest carries only projectId),
    // so it's surfaced as static text below the input, not as an editable field.
    expect(screen.getByText(/URL:.*teamcity\.example\.com\/project\/X/)).toBeDefined()
  })

  it('Add TC project appends a row whose projectId input populates the form', async () => {
    setAllEditable()
    const component = baseComponent()
    const formRef = React.createRef<ReturnType<typeof useForm<GeneralFormValues>> | null>() as React.MutableRefObject<ReturnType<typeof useForm<GeneralFormValues>> | null>
    renderWithProviders(<Harness component={component} formRef={formRef} />)

    // Append a row, then type into its projectId input. The new row gets
    // an empty value via append({ projectId: '' }) and is the only TC row.
    await userEvent.click(screen.getByRole('button', { name: /add tc project/i }))

    const inputs = screen.getAllByPlaceholderText('MyProject_Build') as HTMLInputElement[]
    expect(inputs.length).toBe(1)
    await userEvent.type(inputs[0]!, 'MyProject_Build')

    const values = formRef.current!.getValues()
    expect(values.teamcityProjects).toEqual([{ projectId: 'MyProject_Build' }])
  })
})

// ── Server-side 400 inline error display (S3.1a) ──────────────────────────────
// When ComponentDetailPage catches a 400 it calls form.setError for fields in
// GENERAL_TAB_FIELDS. The GeneralTab must render those errors inline next to
// the relevant input.

describe('GeneralTab server error display (S3.1a)', () => {
  it('setError("componentOwner") renders the message inline below the field', async () => {
    setAllEditable()
    const formRef = React.createRef<ReturnType<typeof useForm<GeneralFormValues>> | null>() as React.MutableRefObject<ReturnType<typeof useForm<GeneralFormValues>> | null>
    renderWithProviders(<Harness component={baseComponent()} formRef={formRef} />)

    await act(async () => {
      formRef.current?.setError('componentOwner', { type: 'server', message: 'must not be blank' })
    })

    await waitFor(() => {
      expect(screen.getByText('must not be blank')).toBeDefined()
    })
  })

  it('setError("name") renders the message and suppresses the rename hint', async () => {
    setAllEditable()
    const formRef = React.createRef<ReturnType<typeof useForm<GeneralFormValues>> | null>() as React.MutableRefObject<ReturnType<typeof useForm<GeneralFormValues>> | null>
    renderWithProviders(<Harness component={baseComponent({ name: 'x' })} formRef={formRef} />)

    await act(async () => {
      formRef.current?.setError('name', { type: 'server', message: 'must not be blank' })
    })

    await waitFor(() => {
      expect(screen.getByText('must not be blank')).toBeDefined()
      // Rename hint must not appear alongside the error
      expect(screen.queryByText(/canonical identifier/i)).toBeNull()
    })
  })

  it('setError("system") renders the message under the multi-select', async () => {
    setAllEditable()
    const formRef = React.createRef<ReturnType<typeof useForm<GeneralFormValues>> | null>() as React.MutableRefObject<ReturnType<typeof useForm<GeneralFormValues>> | null>
    renderWithProviders(<Harness component={baseComponent({ systems: ['SYS1'] })} formRef={formRef} />)

    await act(async () => {
      formRef.current?.setError('system', { type: 'server', message: 'must not be null' })
    })

    await waitFor(() => {
      expect(screen.getByText('must not be null')).toBeDefined()
    })
  })
})

// ---------------------------------------------------------------------------
// FieldOverride catalogue gating — schema-v2 contract.
//
// CRS schema-v2 only accepts overriddenAttribute strings that map to
// SCALAR_ATTRIBUTE_PATHS (build.*, escrow.*, jira.* — config-row scalars)
// or to one of the six marker names. Component-level fields like
// componentOwner, system, clientCode live on the top-level ComponentDetail
// row, not on component_configurations rows, so POST /field-overrides with
// those attributes returns 400. We must not surface those override buttons.
// ---------------------------------------------------------------------------

describe('GeneralTab — FieldOverrideInline gating (schema-v2 contract)', () => {
  it.each(['componentOwner', 'system', 'clientCode'])(
    'does not render FieldOverrideInline for component-level field %s',
    (attribute) => {
      renderWithProviders(<Harness component={baseComponent()} />)
      expect(
        screen.queryByTestId(`field-override-inline-${attribute}`),
      ).toBeNull()
    },
  )
})

// ---------------------------------------------------------------------------
// ui-swift-sloth §4: system + labels multi-select swap.
// ---------------------------------------------------------------------------

describe('GeneralTab — system + labels multi-select (ui-swift-sloth §4)', () => {
  it('hydrates system multi-select from component.systems and untick narrows the array', async () => {
    setAllEditable()
    const formRef = React.createRef<ReturnType<typeof useForm<GeneralFormValues>> | null>() as React.MutableRefObject<ReturnType<typeof useForm<GeneralFormValues>> | null>
    const component = baseComponent({ systems: ['SYS1', 'SYS2'] })
    renderWithProviders(<Harness component={component} formRef={formRef} />)

    // Open the system multi-select via its Button trigger (labelled by the
    // outer "System(s)" label).
    const trigger = screen.getByRole('button', { name: /system\(s\)/i })
    await userEvent.click(trigger)

    // Both options should be checked initially.
    const sys1 = screen.getByRole('checkbox', { name: 'SYS1' }) as HTMLInputElement
    expect(sys1.checked).toBe(true)
    await userEvent.click(sys1)

    await waitFor(() => {
      expect(formRef.current?.getValues('system')).toEqual(['SYS2'])
    })
  })

  it('hydrates labels chips from component.labels and clicking × removes the chip (task #9)', async () => {
    setAllEditable()
    const formRef = React.createRef<ReturnType<typeof useForm<GeneralFormValues>> | null>() as React.MutableRefObject<ReturnType<typeof useForm<GeneralFormValues>> | null>
    const component = baseComponent({ labels: ['backend', 'internal'] })
    renderWithProviders(<Harness component={component} formRef={formRef} />)

    const removeBackend = screen.getByRole('button', { name: /^remove backend$/i })
    await userEvent.click(removeBackend)

    await waitFor(() => {
      expect(formRef.current?.getValues('labels')).toEqual(['internal'])
    })
  })

  it('picking a label from the add control appends to form value (task #9)', async () => {
    setAllEditable()
    const formRef = React.createRef<ReturnType<typeof useForm<GeneralFormValues>> | null>() as React.MutableRefObject<ReturnType<typeof useForm<GeneralFormValues>> | null>
    const component = baseComponent({ labels: ['backend'] })
    renderWithProviders(<Harness component={component} formRef={formRef} />)

    const addControl = screen.getByLabelText(/^add label$/i) as HTMLSelectElement
    await userEvent.selectOptions(addControl, 'frontend')

    await waitFor(() => {
      expect(formRef.current?.getValues('labels')).toEqual(['backend', 'frontend'])
    })
  })

  it('renders an inline error below the System multi-select when form.setError("system") fires (PR #44 P2 systems)', async () => {
    // ComponentDetailPage.handleSave is the source of truth for the
    // "systems is required" guard, but the error needs to surface in
    // GeneralTab's render tree — otherwise the user clicks Save, the page
    // returns early, and the UI gives no visible feedback.
    setAllEditable()
    const formRef = React.createRef<ReturnType<typeof useForm<GeneralFormValues>> | null>() as React.MutableRefObject<ReturnType<typeof useForm<GeneralFormValues>> | null>
    renderWithProviders(<Harness component={baseComponent({ systems: ['SYS1'] })} formRef={formRef} />)

    await act(async () => {
      formRef.current?.setError('system', { type: 'required', message: 'At least one system is required' })
    })

    await waitFor(() => {
      expect(screen.getByText(/at least one system is required/i)).toBeDefined()
    })
  })
})

// ---------------------------------------------------------------------------
// ui-swift-sloth §3.5: Group Key required + disallowed-prefix.
// ---------------------------------------------------------------------------

describe('GeneralTab — group key required marker + inline error (ui-swift-sloth §3.5)', () => {
  it('renders a `*` required marker next to the Group Key label', () => {
    setAllEditable()
    renderWithProviders(<Harness component={baseComponent({ group: { groupKey: 'org.example.alpha', isFake: false, role: 'MEMBER' } })} />)
    // The Group Key label contains a text "*". Looking up via the label's
    // accessible name keeps the assertion robust to surrounding markup.
    const label = screen.getByText(/group key/i)
    expect(label.textContent).toContain('*')
  })

  it('clearing Group Key on blur surfaces an inline required error', async () => {
    setAllEditable()
    const component = baseComponent({ group: { groupKey: 'org.example.alpha', isFake: false, role: 'MEMBER' } })
    renderWithProviders(<Harness component={component} />)

    const input = screen.getByLabelText(/group key/i) as HTMLInputElement
    await userEvent.clear(input)
    // Wrap the synchronous .blur() in act() so React flushes the
    // setGroupIdTouched(true) state update before assertion / teardown
    // — silences the "not wrapped in act(...)" warning that otherwise
    // fires on the synchronous DOM-blur path.
    await act(async () => {
      input.blur()
    })

    await waitFor(() => {
      expect(screen.getByText(/group key is required/i)).toBeDefined()
    })
  })

  it('legacy non-matching groupKey does NOT show the prefix error before the user touches the field (PR #44 review)', () => {
    // Admins reconfigured the supported-prefix list mid-life. A component
    // with stored groupKey 'old.corp.foo' hits the editor: we must not blare
    // a red error on mount, because the user hasn't touched the field and
    // the save guard correctly lets unrelated changes through.
    setAllEditable()
    mockUseSupportedGroups.mockReturnValue({
      data: ['com.example'],
      isLoading: false,
      isError: false,
    })
    const component = baseComponent({
      group: { groupKey: 'old.legacy.example', isFake: false, role: 'MEMBER' },
    })
    renderWithProviders(<Harness component={component} />)

    // No "must start with" red text on the untouched field.
    expect(screen.queryByText(/must start with/i)).toBeNull()
  })

  it('entering a disallowed-prefix value surfaces an inline error', async () => {
    setAllEditable()
    mockUseSupportedGroups.mockReturnValue({
      data: ['com.example'],
      isLoading: false,
      isError: false,
    })
    const component = baseComponent({ group: { groupKey: 'com.example.alpha', isFake: false, role: 'MEMBER' } })
    renderWithProviders(<Harness component={component} />)

    const input = screen.getByLabelText(/group key/i) as HTMLInputElement
    await userEvent.clear(input)
    await userEvent.type(input, 'com.someoneelse.foo')

    await waitFor(() => {
      // The inline error mentions the allowed prefix list so the user can
      // recover without bouncing to docs.
      expect(screen.getByText(/must start with/i)).toBeDefined()
    })
  })
})
