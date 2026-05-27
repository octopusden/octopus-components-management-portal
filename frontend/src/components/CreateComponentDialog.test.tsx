import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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

vi.mock('../hooks/useFieldConfig', () => ({
  useFieldConfigEntry: vi.fn(),
}))

vi.mock('../hooks/useSupportedGroups', () => ({
  useSupportedGroups: vi.fn(),
}))

// EnumSelect transitively pulls in useFieldOptions; stub it so the
// dialog's Build System select renders deterministically without hitting
// any /meta/* endpoint.
vi.mock('../hooks/useFieldOptions', () => ({
  useFieldOptions: vi.fn(() => ({
    options: ['MAVEN', 'GRADLE'],
    isLoading: false,
  })),
}))

import { useFieldConfigEntry } from '../hooks/useFieldConfig'
import { useSupportedGroups } from '../hooks/useSupportedGroups'
const mockUseFieldConfigEntry = vi.mocked(useFieldConfigEntry)
const mockUseSupportedGroups = vi.mocked(useSupportedGroups)

// Plumbing: tests need a different field-config response per `fieldPath`.
// Default both groupId and buildSystem to an editable, non-required entry
// with the example parent prefix as the groupId default. Individual tests
// override `mockUseFieldConfigEntry.mockImplementation` when they need
// loading / error / empty-defaultValue variants.
function setDefaultFieldConfigMock(opts?: {
  groupIdDefault?: string
  groupIdLoading?: boolean
  groupIdError?: boolean
}) {
  const groupIdDefault = opts?.groupIdDefault ?? 'com.example'
  const groupIdLoading = opts?.groupIdLoading ?? false
  const groupIdError = opts?.groupIdError ?? false
  mockUseFieldConfigEntry.mockImplementation((path: string) => {
    if (path === 'component.groupId') {
      return {
        entry: { visibility: 'editable', required: true, defaultValue: groupIdDefault },
        isLoading: groupIdLoading,
        isError: groupIdError,
      }
    }
    // Anything else (buildSystem, etc.) — neutral defaults.
    return {
      entry: { visibility: 'editable', required: false },
      isLoading: false,
      isError: false,
    }
  })
}

function setDefaultSupportedGroupsMock(prefixes: string[] = ['com.example']) {
  // Cast through unknown — the real hook return shape is the TanStack Query
  // `UseQueryResult`; we only need the four fields the dialog reads.
  mockUseSupportedGroups.mockReturnValue({
    data: prefixes,
    isLoading: false,
    isError: false,
    error: null,
  } as unknown as ReturnType<typeof useSupportedGroups>)
}

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

beforeEach(() => {
  mockMutateAsync.mockReset()
  mockNavigate.mockReset()
  mockToast.mockReset()
  mockUseFieldConfigEntry.mockReset()
  mockUseSupportedGroups.mockReset()
  setDefaultFieldConfigMock()
  setDefaultSupportedGroupsMock()
})

describe('CreateComponentButton', () => {
  it('opens the dialog without crashing when New Component is clicked', async () => {
    renderWithProviders(<CreateComponentButton />)
    await openDialog()
    expect(screen.getByRole('dialog')).toBeDefined()
    expect(screen.getByText('Create Component')).toBeDefined()
  })

  it('renders the expected fields and drops the legacy Product Type', async () => {
    renderWithProviders(<CreateComponentButton />)
    await openDialog()
    expect(screen.getByPlaceholderText('my-component')).toBeDefined()
    expect(screen.getByPlaceholderText('My Component')).toBeDefined()
    expect(screen.getByPlaceholderText('owner@example.com')).toBeDefined()
    expect(screen.getByLabelText(/group id/i)).toBeDefined()
    expect(screen.getByLabelText(/build system/i)).toBeDefined()
    expect(screen.getByLabelText(/explicit/i)).toBeDefined()
    expect(screen.getByLabelText(/external/i)).toBeDefined()
    // Product Type must be gone.
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

  it('shows required errors for buildSystem and groupId when the form is submitted empty', async () => {
    // Empty defaultValue → no auto-suggest fires from the watcher, so
    // groupId can stay empty and trigger its required error.
    setDefaultFieldConfigMock({ groupIdDefault: '' })
    renderWithProviders(<CreateComponentButton />)
    await openDialog()
    // Need a valid name so the only remaining required errors are for
    // groupId and buildSystem (otherwise Zod short-circuits on `name`).
    await userEvent.type(screen.getByPlaceholderText('my-component'), 'widget-svc')
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))
    await waitFor(() => {
      expect(screen.getByText(/group id is required/i)).toBeDefined()
      expect(screen.getByText(/build system is required/i)).toBeDefined()
    })
    expect(mockMutateAsync).not.toHaveBeenCalled()
  })

  it('rejects a groupId that does not start with an allowed prefix', async () => {
    setDefaultSupportedGroupsMock(['com.example'])
    renderWithProviders(<CreateComponentButton />)
    await openDialog()
    await userEvent.type(screen.getByPlaceholderText('my-component'), 'widget')
    const groupId = screen.getByLabelText(/group id/i) as HTMLInputElement
    await userEvent.clear(groupId)
    await userEvent.type(groupId, 'com.disallowed.foo')
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))
    await waitFor(() =>
      expect(screen.getByText(/must start with one of: com\.example/i)).toBeDefined(),
    )
    expect(mockMutateAsync).not.toHaveBeenCalled()
  })

  it('rejects groupId with uppercase / underscore / hyphen (PR #44 review — tightened to match suggestGroupId output)', async () => {
    // suggestGroupId only emits lowercase letters, digits, and dots — it
    // collapses uppercase / underscore / hyphen runs into a dot. The
    // pattern regex was previously [a-zA-Z0-9._-]+, which accepted shapes
    // the helper would never produce, leading to drift between
    // auto-suggested groupIds and manually-typed ones. The tightened
    // regex `^[a-z0-9.]+$` matches the helper's output exactly and gives
    // users a deterministic validation message.
    setDefaultSupportedGroupsMock(['org.example'])
    renderWithProviders(<CreateComponentButton />)
    await openDialog()
    await userEvent.type(screen.getByPlaceholderText('my-component'), 'widget')
    const groupId = screen.getByLabelText(/group id/i) as HTMLInputElement

    // Uppercase rejected.
    await userEvent.clear(groupId)
    await userEvent.type(groupId, 'Org.Example.foo')
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))
    await waitFor(() =>
      expect(screen.getByText(/lowercase letters, digits, and dots/i)).toBeDefined(),
    )
    expect(mockMutateAsync).not.toHaveBeenCalled()

    // Underscore rejected.
    await userEvent.clear(groupId)
    await userEvent.type(groupId, 'org.example.my_lib')
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))
    await waitFor(() =>
      expect(screen.getByText(/lowercase letters, digits, and dots/i)).toBeDefined(),
    )
    expect(mockMutateAsync).not.toHaveBeenCalled()

    // Hyphen rejected.
    await userEvent.clear(groupId)
    await userEvent.type(groupId, 'org.example.my-lib')
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))
    await waitFor(() =>
      expect(screen.getByText(/lowercase letters, digits, and dots/i)).toBeDefined(),
    )
    expect(mockMutateAsync).not.toHaveBeenCalled()
  })

  it('enforces the dot boundary when matching the allowed prefix', async () => {
    setDefaultSupportedGroupsMock(['com.example'])
    renderWithProviders(<CreateComponentButton />)
    await openDialog()
    await userEvent.type(screen.getByPlaceholderText('my-component'), 'widget')
    const groupId = screen.getByLabelText(/group id/i) as HTMLInputElement
    await userEvent.clear(groupId)
    // No boundary dot: must NOT pass.
    await userEvent.type(groupId, 'com.exampleextra.foo')
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))
    await waitFor(() =>
      expect(screen.getByText(/must start with one of: com\.example/i)).toBeDefined(),
    )
  })
})

describe('CreateComponentDialog — groupId auto-suggest', () => {
  it('auto-fills the groupId from the field-config defaultValue when typing the name', async () => {
    setDefaultFieldConfigMock({ groupIdDefault: 'org.example.parent' })
    renderWithProviders(<CreateComponentButton />)
    await openDialog()
    await userEvent.type(screen.getByPlaceholderText('my-component'), 'widget-svc')
    const groupId = screen.getByLabelText(/group id/i) as HTMLInputElement
    await waitFor(() =>
      expect(groupId.value).toBe('org.example.parent.widget.svc'),
    )
  })

  it('lowercases an uppercase-configured parent so the auto-suggested value passes the Zod regex (PR #44 review)', async () => {
    // Admin configured the field-config defaultValue with mixed-case
    // (helper docstring "parent passed through unchanged"). The tightened
    // GROUP_ID_PATTERN rejects uppercase, so without the call-site
    // lowercase normalisation the auto-suggested value would fail Zod
    // and the user couldn't submit a value they never typed.
    setDefaultFieldConfigMock({ groupIdDefault: 'Org.Example.Parent' })
    renderWithProviders(<CreateComponentButton />)
    await openDialog()
    await userEvent.type(screen.getByPlaceholderText('my-component'), 'widget-svc')
    const groupId = screen.getByLabelText(/group id/i) as HTMLInputElement
    await waitFor(() => expect(groupId.value).toBe('org.example.parent.widget.svc'))
    // The auto-suggested value satisfies the regex — no inline error.
    expect(screen.queryByText(/lowercase letters, digits, and dots/i)).toBeNull()
  })

  it('stops auto-suggesting once the user edits groupId manually', async () => {
    renderWithProviders(<CreateComponentButton />)
    await openDialog()
    await userEvent.type(screen.getByPlaceholderText('my-component'), 'foo')
    const groupId = screen.getByLabelText(/group id/i) as HTMLInputElement
    await waitFor(() => expect(groupId.value).toBe('com.example.foo'))

    // User overrides the auto-suggested value.
    await userEvent.clear(groupId)
    await userEvent.type(groupId, 'com.example.custom')
    expect(groupId.value).toBe('com.example.custom')

    // Further name edits must NOT clobber the manual value.
    await userEvent.type(screen.getByPlaceholderText('my-component'), '-extra')
    expect(groupId.value).toBe('com.example.custom')
  })

  it('resumes auto-suggesting after the user blurs an empty groupId', async () => {
    renderWithProviders(<CreateComponentButton />)
    await openDialog()
    await userEvent.type(screen.getByPlaceholderText('my-component'), 'foo')
    const groupId = screen.getByLabelText(/group id/i) as HTMLInputElement
    await waitFor(() => expect(groupId.value).toBe('com.example.foo'))

    // Manual edit then full clear + blur → ref resets.
    await userEvent.clear(groupId)
    await userEvent.type(groupId, 'com.example.custom')
    await userEvent.clear(groupId)
    await userEvent.tab() // blur

    // Resumes suggesting on next name edit.
    await userEvent.type(screen.getByPlaceholderText('my-component'), '-bar')
    await waitFor(() => expect(groupId.value).toBe('com.example.foo.bar'))
  })

  it('does NOT auto-suggest when the field-config defaultValue is empty', async () => {
    setDefaultFieldConfigMock({ groupIdDefault: '' })
    renderWithProviders(<CreateComponentButton />)
    await openDialog()
    await userEvent.type(screen.getByPlaceholderText('my-component'), 'foo')
    const groupId = screen.getByLabelText(/group id/i) as HTMLInputElement
    // Stays empty — user must type the full groupId.
    expect(groupId.value).toBe('')
  })
})

describe('CreateComponentDialog — Submit gating', () => {
  it('disables Submit and shows a loading hint while useSupportedGroups is loading', async () => {
    mockUseSupportedGroups.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    } as unknown as ReturnType<typeof useSupportedGroups>)
    renderWithProviders(<CreateComponentButton />)
    await openDialog()
    const submit = screen.getByRole('button', { name: /^create$/i }) as HTMLButtonElement
    expect(submit.disabled).toBe(true)
    expect(screen.getByText(/loading allowed groups/i)).toBeDefined()
  })

  it('disables Submit and surfaces an error when useSupportedGroups errored', async () => {
    mockUseSupportedGroups.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('boom'),
    } as unknown as ReturnType<typeof useSupportedGroups>)
    renderWithProviders(<CreateComponentButton />)
    await openDialog()
    const submit = screen.getByRole('button', { name: /^create$/i }) as HTMLButtonElement
    expect(submit.disabled).toBe(true)
    expect(screen.getByText(/failed to load allowed groups/i)).toBeDefined()
  })

  it('disables Submit while useFieldConfigEntry(component.groupId) is loading', async () => {
    setDefaultFieldConfigMock({ groupIdLoading: true })
    renderWithProviders(<CreateComponentButton />)
    await openDialog()
    const submit = screen.getByRole('button', { name: /^create$/i }) as HTMLButtonElement
    expect(submit.disabled).toBe(true)
  })

  it('disables Submit and surfaces an error when useFieldConfigEntry errored', async () => {
    setDefaultFieldConfigMock({ groupIdError: true })
    renderWithProviders(<CreateComponentButton />)
    await openDialog()
    const submit = screen.getByRole('button', { name: /^create$/i }) as HTMLButtonElement
    expect(submit.disabled).toBe(true)
    expect(screen.getByText(/failed to load default group configuration/i)).toBeDefined()
  })

  it('disables Submit while the entered groupId fails the prefix check', async () => {
    // Mirrors the on-screen inline error — the button must NOT look clickable
    // when clicking it would silently no-op via onSubmit's early return.
    setDefaultSupportedGroupsMock(['com.example'])
    renderWithProviders(<CreateComponentButton />)
    await openDialog()
    await userEvent.type(screen.getByPlaceholderText('my-component'), 'svc')
    const groupId = screen.getByLabelText(/group id/i) as HTMLInputElement
    await userEvent.clear(groupId)
    await userEvent.type(groupId, 'com.disallowed.foo')
    const submit = screen.getByRole('button', { name: /^create$/i }) as HTMLButtonElement
    await waitFor(() => expect(submit.disabled).toBe(true))
  })
})

describe('CreateComponentDialog — submit payload', () => {
  it('builds the payload with nested baseConfiguration.build.buildSystem and group.groupKey', async () => {
    mockMutateAsync.mockResolvedValue({ id: 'comp-1', name: 'widget' })
    renderWithProviders(<CreateComponentButton />)
    await openDialog()
    await userEvent.type(screen.getByPlaceholderText('my-component'), 'widget')
    // groupId auto-fills to 'com.example.widget' via the default mock.

    // Pick a buildSystem via the EnumSelect combobox.
    await userEvent.click(screen.getByRole('combobox'))
    await userEvent.click(screen.getByRole('option', { name: 'MAVEN' }))

    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))

    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalled())
    const arg = mockMutateAsync.mock.calls[0]![0]
    expect(arg).toMatchObject({
      name: 'widget',
      group: { groupKey: 'com.example.widget', isFake: false },
      baseConfiguration: { build: { buildSystem: 'MAVEN' } },
      systems: [],
      labels: [],
      docs: [],
      artifactIds: [],
      securityGroups: [],
      teamcityProjects: [],
      archived: false,
      distributionExplicit: false,
      distributionExternal: true,
    })
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
