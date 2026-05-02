import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
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
// permission: ROLE_ADMIN holds it; ROLE_REGISTRY_EDITOR / VIEWER do not.
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
    system: [],
    clientCode: null,
    solution: false,
    parentComponentName: null,
    archived: false,
    metadata: {},
    version: 0,
    createdAt: null,
    updatedAt: null,
    versions: [],
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
      system: component.system.join(', '),
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
      name: 'ROLE_REGISTRY_EDITOR',
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
        roles: [{ name: 'ROLE_REGISTRY_VIEWER', permissions: ['ACCESS_COMPONENTS', 'ACCESS_AUDIT'] }],
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
      if (path === 'component.system') return makeEntry('hidden')
      return makeEntry('editable')
    })
    const component = baseComponent({ system: ['SYS1'] })
    renderWithProviders(<Harness component={component} />)

    expect(screen.queryByLabelText(/system\(s\)/i)).toBeNull()
  })

  it('system readonly → System(s) input rendered disabled', () => {
    mockUseFieldConfigEntry.mockImplementation((path: string) => {
      if (path === 'component.system') return makeEntry('readonly')
      return makeEntry('editable')
    })
    const component = baseComponent({ system: ['SYS1'] })
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
    const component = baseComponent({ productType: 'KERNEL' })
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
      if (path === 'component.system') return makeEntry('hidden')
      return makeEntry('editable')
    })
    const formRef = React.createRef<ReturnType<typeof useForm<GeneralFormValues>> | null>() as React.MutableRefObject<ReturnType<typeof useForm<GeneralFormValues>> | null>
    const component = baseComponent({ system: ['SYS1', 'SYS2'] })
    renderWithProviders(<Harness component={component} formRef={formRef} />)

    // Input not rendered (hidden)
    expect(screen.queryByLabelText(/system\(s\)/i)).toBeNull()
    // But form value is set from component (page logic uses this to build array for save)
    const val = formRef.current?.getValues('system')
    // The form still has the joined string — page layer maps to undefined when hidden
    expect(val).toBe('SYS1, SYS2')
  })
})
