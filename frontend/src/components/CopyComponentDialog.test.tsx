import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CopyComponentDialog } from './CopyComponentDialog'
import { ApiError } from '../lib/api'
import type { ComponentDetail } from '../lib/types'

const mockMutateAsync = vi.fn()
const mockUseComponent = vi.fn()
vi.mock('../hooks/useComponent', () => ({
  useComponent: (id: string) => mockUseComponent(id),
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

function makeSource(overrides: Partial<ComponentDetail> = {}): ComponentDetail {
  return {
    id: 'c-1',
    name: 'svc-alpha',
    displayName: 'Service Alpha',
    componentOwner: 'alice@example.com',
    productType: null,
    system: 'SYS1',
    clientCode: null,
    archived: false,
    solution: null,
    parentComponentName: null,
    version: 1,
    createdAt: null,
    updatedAt: null,
    labels: ['backend'],
    docs: [],
    artifactIds: [],
    securityGroups: [],
    teamcityProjects: [],
    configurations: [
      {
        id: 'cfg-base',
        versionRange: '(,0),[0,)',
        rowType: 'BASE',
        overriddenAttribute: null,
        isSyntheticBase: false,
        build: { buildSystem: 'GRADLE' },
        escrow: null,
        jira: null,
        vcsEntries: [],
        mavenArtifacts: [],
        fileUrlArtifacts: [],
        dockerImages: [],
        packages: [],
        requiredTools: [],
      },
    ],
    ...overrides,
  }
}

function dialogTree(onOpenChange: (open: boolean) => void) {
  return (
    <MemoryRouter>
      <CopyComponentDialog sourceId="c-1" open onOpenChange={onOpenChange} />
    </MemoryRouter>
  )
}

function renderDialog(onOpenChange = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = render(
    <QueryClientProvider client={queryClient}>{dialogTree(onOpenChange)}</QueryClientProvider>,
  )
  return { onOpenChange, view }
}

function loaded(source = makeSource()) {
  mockUseComponent.mockReturnValue({ data: source, isLoading: false, error: null })
}

beforeEach(() => {
  mockMutateAsync.mockReset()
  mockNavigate.mockReset()
  mockToast.mockReset()
  mockUseComponent.mockReset()
})

describe('CopyComponentDialog — source loading states', () => {
  it('disables Create while the source detail is loading', () => {
    mockUseComponent.mockReturnValue({ data: undefined, isLoading: true, error: null })
    renderDialog()
    expect(screen.getByRole('dialog')).toBeDefined()
    expect((screen.getByRole('button', { name: /^create$/i }) as HTMLButtonElement).disabled).toBe(
      true,
    )
  })

  it('shows an inline error and disables Create when the source fails to load', () => {
    mockUseComponent.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('boom'),
    })
    renderDialog()
    expect(screen.getByText(/failed to load/i)).toBeDefined()
    expect((screen.getByRole('button', { name: /^create$/i }) as HTMLButtonElement).disabled).toBe(
      true,
    )
  })

  it('requests the source detail by sourceId only while open', () => {
    loaded()
    renderDialog()
    expect(mockUseComponent).toHaveBeenCalledWith('c-1')
  })
})

describe('CopyComponentDialog — form prefill & hint', () => {
  it('prefills Display Name from the source and leaves Component Key empty', async () => {
    loaded()
    renderDialog()
    await waitFor(() => {
      expect((screen.getByLabelText(/display name/i) as HTMLInputElement).value).toBe(
        'Service Alpha',
      )
    })
    expect((screen.getByLabelText(/component key/i) as HTMLInputElement).value).toBe('')
  })

  it('renders the static included / excluded hint', () => {
    loaded()
    renderDialog()
    expect(screen.getByText(/excluded/i)).toBeDefined()
    expect(screen.getByText(/overrides/i)).toBeDefined()
    expect(screen.getByText(/vcs entries/i)).toBeDefined()
  })
})

describe('CopyComponentDialog — validation', () => {
  it('shows a required error when Component Key is empty', async () => {
    loaded()
    renderDialog()
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))
    await waitFor(() => expect(screen.getByText(/component key is required/i)).toBeDefined())
    expect(mockMutateAsync).not.toHaveBeenCalled()
  })

  it('rejects an invalid component key with the shared regex message', async () => {
    loaded()
    renderDialog()
    await userEvent.type(screen.getByLabelText(/component key/i), 'bad name!')
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))
    await waitFor(() =>
      expect(screen.getByText(/component key can only contain/i)).toBeDefined(),
    )
    expect(mockMutateAsync).not.toHaveBeenCalled()
  })
})

describe('CopyComponentDialog — submit', () => {
  it('submits buildCopyRequest output: new key, copied fields, archived:false, no unique fields', async () => {
    mockMutateAsync.mockResolvedValue({ id: 'comp-9', name: 'svc-beta' })
    loaded()
    renderDialog()
    await userEvent.type(screen.getByLabelText(/component key/i), 'svc-beta')
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))

    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalled())
    const arg = mockMutateAsync.mock.calls[0]![0]
    expect(arg).toMatchObject({
      name: 'svc-beta',
      displayName: 'Service Alpha',
      componentOwner: 'alice@example.com',
      system: 'SYS1',
      labels: ['backend'],
      archived: false,
      artifactIds: [],
      teamcityProjects: [],
      baseConfiguration: { build: { buildSystem: 'GRADLE' } },
    })
    expect('group' in arg).toBe(false)
  })

  it('sends the edited Display Name instead of the source one', async () => {
    mockMutateAsync.mockResolvedValue({ id: 'comp-9', name: 'svc-beta' })
    loaded()
    renderDialog()
    await userEvent.type(screen.getByLabelText(/component key/i), 'svc-beta')
    const displayName = screen.getByLabelText(/display name/i)
    await userEvent.clear(displayName)
    await userEvent.type(displayName, 'Service Beta')
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))
    await waitFor(() =>
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ displayName: 'Service Beta' }),
      ),
    )
  })

  it('navigates to the new component and closes on success', async () => {
    mockMutateAsync.mockResolvedValue({ id: 'comp-9', name: 'svc-beta' })
    loaded()
    const { onOpenChange } = renderDialog()
    await userEvent.type(screen.getByLabelText(/component key/i), 'svc-beta')
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/components/comp-9'))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringContaining('created') }),
    )
  })

  it('shows the duplicate-name toast on 409', async () => {
    mockMutateAsync.mockRejectedValue(new ApiError(409, 'conflict'))
    loaded()
    renderDialog()
    await userEvent.type(screen.getByLabelText(/component key/i), 'svc-alpha')
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ description: expect.stringContaining('already exists') }),
      ),
    )
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('shows a generic destructive toast for other failures', async () => {
    mockMutateAsync.mockRejectedValue(new Error('network failure'))
    loaded()
    renderDialog()
    await userEvent.type(screen.getByLabelText(/component key/i), 'svc-beta')
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ description: 'network failure', variant: 'destructive' }),
      ),
    )
  })

  it('closes via Cancel', async () => {
    loaded()
    const { onOpenChange } = renderDialog()
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})

describe('CopyComponentDialog — background refetch must not clobber user input', () => {
  it('preserves typed Component Key and edited Display Name when a fresh source object arrives', async () => {
    loaded()
    const { onOpenChange, view } = renderDialog()

    await userEvent.type(screen.getByLabelText(/component key/i), 'svc-beta')
    const displayName = screen.getByLabelText(/display name/i)
    await userEvent.clear(displayName)
    await userEvent.type(displayName, 'Edited Name')

    // Simulate a React Query background refetch: same data, NEW object identity.
    loaded(makeSource())
    view.rerender(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        {dialogTree(onOpenChange)}
      </QueryClientProvider>,
    )

    expect((screen.getByLabelText(/component key/i) as HTMLInputElement).value).toBe('svc-beta')
    expect((screen.getByLabelText(/display name/i) as HTMLInputElement).value).toBe('Edited Name')
  })

  it('still updates an untouched Display Name from the refreshed source', async () => {
    loaded()
    const { onOpenChange, view } = renderDialog()
    await waitFor(() =>
      expect((screen.getByLabelText(/display name/i) as HTMLInputElement).value).toBe(
        'Service Alpha',
      ),
    )

    loaded(makeSource({ displayName: 'Renamed Upstream' }))
    view.rerender(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        {dialogTree(onOpenChange)}
      </QueryClientProvider>,
    )

    await waitFor(() =>
      expect((screen.getByLabelText(/display name/i) as HTMLInputElement).value).toBe(
        'Renamed Upstream',
      ),
    )
  })
})
