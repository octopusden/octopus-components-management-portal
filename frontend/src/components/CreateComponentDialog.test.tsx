import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CreateComponentButton } from './CreateComponentDialog'
import { ApiError } from '../lib/api'

const mockMutateAsync = vi.fn()
vi.mock('../hooks/useComponent', () => ({
  useCreateComponent: vi.fn(() => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  })),
}))

const mockNavigate = vi.fn()
vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

const mockToast = vi.fn()
vi.mock('../hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}))

const mockLookupEmployee = vi.hoisted(() => vi.fn())

// EnumSelect transitively pulls in useFieldOptions; stub it so the
// dialog's Build System select renders deterministically without hitting
// any /meta/* endpoint.
vi.mock('../hooks/useFieldOptions', () => ({
  useFieldOptions: vi.fn(() => ({
    options: ['MAVEN', 'GRADLE'],
    isLoading: false,
  })),
}))
vi.mock('../hooks/useOwners', () => ({
  useOwners: vi.fn(() => ({ data: ['alice', 'inactive-user'] })),
}))
vi.mock('../hooks/useEmployees', () => ({
  lookupEmployee: mockLookupEmployee,
}))

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

async function openDialog() {
  await userEvent.click(screen.getByRole('button', { name: /new component/i }))
}

async function fillComponentOwner(owner = 'alice') {
  const input = screen.getByPlaceholderText('owner@example.com')
  await userEvent.type(input, owner)
  fireEvent.blur(input)
  await waitFor(() => expect(mockLookupEmployee).toHaveBeenCalledWith(owner))
  await waitFor(() => expect(screen.queryByText('Validating person...')).toBeNull())
}

beforeEach(() => {
  mockMutateAsync.mockReset()
  mockNavigate.mockReset()
  mockToast.mockReset()
  mockLookupEmployee.mockReset()
  mockLookupEmployee.mockImplementation(async (query: string) => [
    { username: query.trim(), active: true },
  ])
})

describe('CreateComponentButton', () => {
  it('opens the dialog without crashing when New Component is clicked', async () => {
    renderWithProviders(<CreateComponentButton />)
    await openDialog()
    expect(screen.getByRole('dialog')).toBeDefined()
    expect(screen.getByText('Create Component')).toBeDefined()
  })

  it('renders the expected fields and drops the legacy Group ID + Product Type', async () => {
    renderWithProviders(<CreateComponentButton />)
    await openDialog()
    expect(screen.getByPlaceholderText('my-component')).toBeDefined()
    expect(screen.getByPlaceholderText('My Component')).toBeDefined()
    expect(screen.getByPlaceholderText('owner@example.com')).toBeDefined()
    expect(screen.getByLabelText(/build system/i)).toBeDefined()
    expect(screen.getByLabelText(/explicit/i)).toBeDefined()
    expect(screen.getByLabelText(/external/i)).toBeDefined()
    // R1 (aggregator/parentComponent decouple): Group ID is gone — a group is
    // migration-owned aggregator membership, never assigned via the create API.
    expect(screen.queryByLabelText(/group id/i)).toBeNull()
    // Product Type must be gone (legacy).
    expect(screen.queryByLabelText(/product type/i)).toBeNull()
  })
})

describe('CreateComponentDialog — validation', () => {
  it('shows a validation error for an invalid component key', async () => {
    renderWithProviders(<CreateComponentButton />)
    await openDialog()
    await userEvent.type(screen.getByPlaceholderText('my-component'), 'bad name!')
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))
    await waitFor(() =>
      expect(screen.getByText(/component key can only contain/i)).toBeDefined(),
    )
    expect(mockMutateAsync).not.toHaveBeenCalled()
  })

  it('shows a required error for buildSystem when submitted empty', async () => {
    renderWithProviders(<CreateComponentButton />)
    await openDialog()
    // Valid name so Zod doesn't short-circuit on `name`; buildSystem left empty.
    await userEvent.type(screen.getByPlaceholderText('my-component'), 'widget-svc')
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))
    await waitFor(() => {
      expect(screen.getByText(/build system is required/i)).toBeDefined()
    })
    // R1: there is no Group ID requirement anymore.
    expect(screen.queryByText(/group id is required/i)).toBeNull()
    expect(mockMutateAsync).not.toHaveBeenCalled()
  })

  it('shows a required error for component owner', async () => {
    renderWithProviders(<CreateComponentButton />)
    await openDialog()
    await userEvent.type(screen.getByPlaceholderText('my-component'), 'widget-svc')
    await userEvent.click(screen.getByRole('combobox'))
    await userEvent.click(screen.getByRole('option', { name: 'MAVEN' }))
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))
    await waitFor(() => {
      expect(screen.getByText(/component owner is required/i)).toBeDefined()
    })
    expect(mockMutateAsync).not.toHaveBeenCalled()
  })

  it('maps a CRS componentOwner 400 inline', async () => {
    mockMutateAsync.mockRejectedValue(
      new ApiError(
        400,
        'componentOwner is not an active employee',
        JSON.stringify({ errorMessage: 'componentOwner is not an active employee' }),
      ),
    )
    renderWithProviders(<CreateComponentButton />)
    await openDialog()
    await userEvent.type(screen.getByPlaceholderText('my-component'), 'widget-svc')
    await userEvent.click(screen.getByRole('combobox'))
    await userEvent.click(screen.getByRole('option', { name: 'MAVEN' }))
    await fillComponentOwner('inactive-user')
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))

    await waitFor(() => {
      expect(screen.getByText('is not an active employee')).toBeDefined()
    })
    expect(mockToast).not.toHaveBeenCalled()
  })

  it('blocks submit when component owner is not found in employee lookup', async () => {
    mockLookupEmployee.mockResolvedValue([])
    renderWithProviders(<CreateComponentButton />)
    await openDialog()
    await userEvent.type(screen.getByPlaceholderText('my-component'), 'widget-svc')
    await userEvent.click(screen.getByRole('combobox'))
    await userEvent.click(screen.getByRole('option', { name: 'MAVEN' }))
    const input = screen.getByPlaceholderText('owner@example.com')
    await userEvent.type(input, 'asdfd')
    fireEvent.blur(input)

    await screen.findByText('Select an active person from the directory')
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))
    expect(mockMutateAsync).not.toHaveBeenCalled()
  })

  it('does not submit a stale active owner when the textbox is edited before revalidation', async () => {
    mockLookupEmployee.mockImplementation((query: string) => {
      if (query.trim() === 'alice') {
        return Promise.resolve([{ username: 'alice', active: true }])
      }
      return new Promise(() => undefined)
    })
    renderWithProviders(<CreateComponentButton />)
    await openDialog()
    await userEvent.type(screen.getByPlaceholderText('my-component'), 'widget-svc')
    await userEvent.click(screen.getByRole('combobox'))
    await userEvent.click(screen.getByRole('option', { name: 'MAVEN' }))
    await fillComponentOwner('alice')

    const input = screen.getByPlaceholderText('owner@example.com')
    await userEvent.clear(input)
    await userEvent.type(input, 'asdfd')
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))

    await waitFor(() => {
      expect(screen.getByText(/component owner is required/i)).toBeDefined()
    })
    expect(mockMutateAsync).not.toHaveBeenCalled()
  })
})

describe('CreateComponentDialog — submit payload', () => {
  it('builds the payload with nested baseConfiguration.build.buildSystem and NO group (migration-owned)', async () => {
    mockMutateAsync.mockResolvedValue({ id: 'comp-1', name: 'widget' })
    renderWithProviders(<CreateComponentButton />)
    await openDialog()
    await userEvent.type(screen.getByPlaceholderText('my-component'), 'widget')

    // Pick a buildSystem via the EnumSelect combobox.
    await userEvent.click(screen.getByRole('combobox'))
    await userEvent.click(screen.getByRole('option', { name: 'MAVEN' }))
    await fillComponentOwner()

    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))

    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalled())
    const arg = mockMutateAsync.mock.calls[0]![0]
    expect(arg).toMatchObject({
      name: 'widget',
      baseConfiguration: { build: { buildSystem: 'MAVEN' } },
      // CRS PR #301: scalar `system` field. The Create dialog doesn't
      // expose it yet (deferred per the original plan); sends null.
      system: null,
      labels: [],
      docs: [],
      artifactIds: [],
      securityGroups: [],
      teamcityProjects: [],
      archived: false,
      distributionExplicit: false,
      distributionExternal: true,
    })
    // R1: no `group` is sent — group is migration-owned and ignored by the API.
    expect('group' in arg).toBe(false)
    // No stale fields from the previous schema.
    expect('productType' in arg).toBe(false)
  })

  it('sends the user-toggled checkbox values in the payload', async () => {
    mockMutateAsync.mockResolvedValue({ id: 'c', name: 'c' })
    renderWithProviders(<CreateComponentButton />)
    await openDialog()
    await userEvent.type(screen.getByPlaceholderText('my-component'), 'svc')
    await userEvent.click(screen.getByRole('combobox'))
    await userEvent.click(screen.getByRole('option', { name: 'GRADLE' }))
    await fillComponentOwner()

    // Flip both defaults: explicit on, external off.
    await userEvent.click(screen.getByLabelText(/explicit/i))
    await userEvent.click(screen.getByLabelText(/external/i))

    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))
    await waitFor(() =>
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          distributionExplicit: true,
          distributionExternal: false,
        }),
      ),
    )
  })

  it('navigates to the new component after successful creation', async () => {
    mockMutateAsync.mockResolvedValue({ id: 'comp-42', name: 'my-lib' })
    renderWithProviders(<CreateComponentButton />)
    await openDialog()
    await userEvent.type(screen.getByPlaceholderText('my-component'), 'my-lib')
    await userEvent.click(screen.getByRole('combobox'))
    await userEvent.click(screen.getByRole('option', { name: 'MAVEN' }))
    await fillComponentOwner()
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/components/comp-42'))
  })

  it('shows a 409 conflict toast with a descriptive message', async () => {
    mockMutateAsync.mockRejectedValue(new ApiError(409, 'component exists'))
    renderWithProviders(<CreateComponentButton />)
    await openDialog()
    await userEvent.type(screen.getByPlaceholderText('my-component'), 'duplicate-lib')
    await userEvent.click(screen.getByRole('combobox'))
    await userEvent.click(screen.getByRole('option', { name: 'MAVEN' }))
    await fillComponentOwner()
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ description: expect.stringContaining('already exists') }),
      ),
    )
  })

  it('shows a generic error toast for non-409 failures', async () => {
    mockMutateAsync.mockRejectedValue(new Error('network failure'))
    renderWithProviders(<CreateComponentButton />)
    await openDialog()
    await userEvent.type(screen.getByPlaceholderText('my-component'), 'some-lib')
    await userEvent.click(screen.getByRole('combobox'))
    await userEvent.click(screen.getByRole('option', { name: 'MAVEN' }))
    await fillComponentOwner()
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ description: 'network failure' }),
      ),
    )
  })

  it('resets the form and closes when Cancel is clicked', async () => {
    renderWithProviders(<CreateComponentButton />)
    await openDialog()
    await userEvent.type(screen.getByPlaceholderText('my-component'), 'temp-name')
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})
