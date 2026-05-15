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

// useFieldConfigEntry mock — controls visibility-gating per test.
// Default: all fields 'editable'. Tests can override per field via mockReturnValue.
const mockUseFieldConfigEntry = vi.fn()
vi.mock('../../hooks/useFieldConfig', () => ({
  useFieldConfigOptions: () => ({ options: [], isLoading: false }),
  useFieldConfigEntry: (fieldPath: string) => mockUseFieldConfigEntry(fieldPath),
}))

vi.mock('./FieldOverrideInline', () => ({
  FieldOverrideInline: () => null,
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
  return { entry: { visibility, required: false }, isLoading: false }
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
      system: (component.systems ?? []).join(', '),
      clientCode: component.clientCode ?? '',
      solution: component.solution ?? false,
      archived: component.archived,
      parentComponentName: component.parentComponentName ?? '',
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

    const input = screen.getByLabelText(/^name$/i) as HTMLInputElement
    expect(input).toBeDefined()
    expect(input.disabled).toBe(false)
    expect(input.value).toBe('orig-name')
  })

  it('editor without RENAME_COMPONENTS sees the Name input disabled with explanatory hint', () => {
    mockUseCurrentUser.mockReturnValue({ data: EDITOR_USER, isLoading: false, isError: false })
    const component = baseComponent({ name: 'orig-name' })
    renderWithProviders(<Harness component={component} />)

    const input = screen.getByLabelText(/^name$/i) as HTMLInputElement
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

    const input = screen.getByLabelText(/^name$/i) as HTMLInputElement
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

    const input = screen.getByLabelText(/^name$/i) as HTMLInputElement
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

  it('system hidden → System(s) input NOT rendered', () => {
    mockUseFieldConfigEntry.mockImplementation((path: string) => {
      if (path === 'component.systems') return makeEntry('hidden')
      return makeEntry('editable')
    })
    const component = baseComponent({ systems: ['SYS1'] })
    renderWithProviders(<Harness component={component} />)

    expect(screen.queryByLabelText(/system\(s\)/i)).toBeNull()
  })

  it('system readonly → System(s) input rendered disabled', () => {
    mockUseFieldConfigEntry.mockImplementation((path: string) => {
      if (path === 'component.systems') return makeEntry('readonly')
      return makeEntry('editable')
    })
    const component = baseComponent({ systems: ['SYS1'] })
    renderWithProviders(<Harness component={component} />)

    const input = screen.getByLabelText(/system\(s\)/i) as HTMLInputElement
    expect(input.disabled).toBe(true)
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
  it('when system is hidden, the form still initialises system from component.system join (page filters to undefined on save)', () => {
    mockUseFieldConfigEntry.mockImplementation((path: string) => {
      if (path === 'component.systems') return makeEntry('hidden')
      return makeEntry('editable')
    })
    const formRef = React.createRef<ReturnType<typeof useForm<GeneralFormValues>> | null>() as React.MutableRefObject<ReturnType<typeof useForm<GeneralFormValues>> | null>
    const component = baseComponent({ systems: ['SYS1', 'SYS2'] })
    renderWithProviders(<Harness component={component} formRef={formRef} />)

    // Input not rendered (hidden)
    expect(screen.queryByLabelText(/system\(s\)/i)).toBeNull()
    // But form value is set from component (page logic uses this to build array for save)
    const val = formRef.current?.getValues('system')
    // The form still has the joined string — page layer maps to undefined when hidden
    expect(val).toBe('SYS1, SYS2')
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

  it('labels editable → input rendered with comma-joined value', () => {
    setAllEditable()
    const component = baseComponent({ labels: ['backend', 'internal'] })
    renderWithProviders(<Harness component={component} />)

    const input = screen.getByLabelText(/^labels$/i) as HTMLInputElement
    expect(input.value).toBe('backend, internal')
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
    expect(screen.queryByLabelText(/^labels$/i)).toBeNull()
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

  it('setError("system") renders the message instead of the hint text', async () => {
    setAllEditable()
    const formRef = React.createRef<ReturnType<typeof useForm<GeneralFormValues>> | null>() as React.MutableRefObject<ReturnType<typeof useForm<GeneralFormValues>> | null>
    renderWithProviders(<Harness component={baseComponent({ systems: ['S1'] })} formRef={formRef} />)

    await act(async () => {
      formRef.current?.setError('system', { type: 'server', message: 'must not be null' })
    })

    await waitFor(() => {
      expect(screen.getByText('must not be null')).toBeDefined()
      expect(screen.queryByText(/comma-separated list/i)).toBeNull()
    })
  })
})
