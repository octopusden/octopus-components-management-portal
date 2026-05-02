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

describe('CreateComponentButton', () => {
  it('opens the dialog without crashing when New Component is clicked', async () => {
    renderWithProviders(<CreateComponentButton />)
    await openDialog()
    expect(screen.getByRole('dialog')).toBeDefined()
    expect(screen.getByText('Create Component')).toBeDefined()
  })

  it('renders all form fields inside the dialog', async () => {
    renderWithProviders(<CreateComponentButton />)
    await openDialog()
    expect(screen.getByPlaceholderText('my-component')).toBeDefined()
    expect(screen.getByPlaceholderText('My Component')).toBeDefined()
    expect(screen.getByPlaceholderText('owner@example.com')).toBeDefined()
    expect(screen.getByLabelText(/product type/i)).toBeDefined()
  })
})

describe('CreateComponentDialog — form submission', () => {
  beforeEach(() => {
    mockMutateAsync.mockReset()
    mockNavigate.mockReset()
    mockToast.mockReset()
  })

  it('shows a validation error for an invalid name', async () => {
    renderWithProviders(<CreateComponentButton />)
    await openDialog()
    await userEvent.type(screen.getByPlaceholderText('my-component'), 'bad name!')
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))
    await waitFor(() =>
      expect(screen.getByText(/name can only contain/i)).toBeDefined(),
    )
    expect(mockMutateAsync).not.toHaveBeenCalled()
  })

  it('navigates to the new component after successful creation', async () => {
    mockMutateAsync.mockResolvedValue({ id: 'comp-42', name: 'my-lib' })
    renderWithProviders(<CreateComponentButton />)
    await openDialog()
    await userEvent.type(screen.getByPlaceholderText('my-component'), 'my-lib')
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/components/comp-42'))
  })

  it('calls mutation with system as an array when comma-separated values are entered', async () => {
    mockMutateAsync.mockResolvedValue({ id: 'x', name: 'x' })
    renderWithProviders(<CreateComponentButton />)
    await openDialog()
    await userEvent.type(screen.getByPlaceholderText('my-component'), 'x')
    await userEvent.type(screen.getByPlaceholderText('SYSTEM1, SYSTEM2'), 'SYS1, SYS2')
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))
    await waitFor(() =>
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ system: ['SYS1', 'SYS2'] }),
      ),
    )
  })

  it('shows a 409 conflict toast with a descriptive message', async () => {
    mockMutateAsync.mockRejectedValue(new ApiError(409, 'component exists'))
    renderWithProviders(<CreateComponentButton />)
    await openDialog()
    await userEvent.type(screen.getByPlaceholderText('my-component'), 'duplicate-lib')
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
