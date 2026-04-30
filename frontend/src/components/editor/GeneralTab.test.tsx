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
vi.mock('../../hooks/useFieldConfig', () => ({
  useFieldConfigOptions: () => ({ options: [], isLoading: false }),
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

function Harness({ component }: { component: ComponentDetail }) {
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
  return <GeneralTab component={component} form={form} />
}

beforeEach(() => {
  // Default to admin so the established 7.1.5 tests don't need to opt-in.
  // Tests that care about permission gating override per-test below.
  mockUseCurrentUser.mockReturnValue({ data: ADMIN_USER, isLoading: false, isError: false })
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
