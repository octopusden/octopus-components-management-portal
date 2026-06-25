import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CommandPalette } from './CommandPalette'
import { TooltipProvider } from './ui/tooltip'
import { useUiOverlay } from '@/lib/uiOverlayStore'
import { useAdminMode } from '@/lib/adminModeStore'
import type { User } from '../lib/auth'
import type { ComponentSummary } from '../lib/types'

// --- navigation spy ---------------------------------------------------------
const mockNavigate = vi.fn()
vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

// --- current user -----------------------------------------------------------
vi.mock('@/hooks/useCurrentUser', () => ({ useCurrentUser: vi.fn() }))
import { useCurrentUser } from '@/hooks/useCurrentUser'
const mockedUseCurrentUser = vi.mocked(useCurrentUser)

// --- component search --------------------------------------------------------
const mockUseComponents = vi.fn()
vi.mock('@/hooks/useComponents', () => ({
  useComponents: (args: unknown) => mockUseComponents(args),
}))

// CreateComponentDialog pulls in a large dependency graph; stub it to a sentinel
// so the "New Component" action can be asserted without mounting the real form.
vi.mock('./CreateComponentDialog', () => ({
  CreateComponentDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="create-dialog" /> : null,
}))

const ADMIN: User = {
  username: 'alice',
  roles: [
    {
      name: 'ROLE_F1_ADMIN',
      permissions: ['ACCESS_COMPONENTS', 'ACCESS_AUDIT', 'IMPORT_DATA', 'CREATE_COMPONENTS'],
    },
  ],
  groups: [],
}

const VIEWER: User = {
  username: 'carol',
  roles: [{ name: 'ROLE_VIEWER', permissions: ['ACCESS_COMPONENTS'] }],
  groups: [],
}

function mockUser(user: User | undefined) {
  mockedUseCurrentUser.mockReturnValue({
    data: user,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useCurrentUser>)
}

function mockSearch(content: ComponentSummary[], isFetching = false) {
  mockUseComponents.mockReturnValue({ data: { content }, isFetching })
}

function renderPalette() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <MemoryRouter initialEntries={['/components']}>
          <CommandPalette />
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  useUiOverlay.setState({ paletteOpen: true, shortcutsOpen: false })
  useAdminMode.setState({ enabled: true })
  mockUser(ADMIN)
  mockSearch([])
})

describe('CommandPalette — sections + gating', () => {
  it('renders Go-to entries gated on permission (admin sees all)', () => {
    renderPalette()
    expect(screen.getByText('Components')).toBeInTheDocument()
    expect(screen.getByText('Audit')).toBeInTheDocument()
    expect(screen.getByText('Health')).toBeInTheDocument()
  })

  it('hides Audit and Health for a viewer (no ACCESS_AUDIT / not admin)', () => {
    mockUser(VIEWER)
    useAdminMode.setState({ enabled: false })
    renderPalette()
    expect(screen.getByText('Components')).toBeInTheDocument()
    expect(screen.queryByText('Audit')).not.toBeInTheDocument()
    expect(screen.queryByText('Health')).not.toBeInTheDocument()
  })

  it('hides Health when adminMode is off even for an IMPORT_DATA holder', () => {
    useAdminMode.setState({ enabled: false })
    renderPalette()
    expect(screen.queryByText('Health')).not.toBeInTheDocument()
  })

  it('hides the New Component action without CREATE_COMPONENTS', () => {
    mockUser(VIEWER)
    renderPalette()
    expect(screen.queryByText('New Component')).not.toBeInTheDocument()
  })

  it('shows the With-problems filter only for admins', () => {
    renderPalette()
    expect(screen.getByText('With problems')).toBeInTheDocument()
  })

  it('hides the With-problems filter for non-admins', () => {
    useAdminMode.setState({ enabled: false })
    mockUser(VIEWER)
    renderPalette()
    expect(screen.queryByText('With problems')).not.toBeInTheDocument()
  })

  it('renders the RM / SC presets disabled (Phase 1b)', () => {
    renderPalette()
    const rm = screen.getByText('I am Release Manager').closest('[cmdk-item]')
    expect(rm).toHaveAttribute('aria-disabled', 'true')
  })
})

describe('CommandPalette — navigation', () => {
  it('navigates to /audit on selecting the Audit entry', async () => {
    const user = userEvent.setup()
    renderPalette()
    await user.click(screen.getByText('Audit'))
    expect(mockNavigate).toHaveBeenCalledWith('/audit')
  })

  it('Filter > My Components navigates to /components?owner=…&preset=mine (Phase 1 serialization)', async () => {
    const user = userEvent.setup()
    renderPalette()
    await user.click(screen.getByText('My Components'))
    const arg = mockNavigate.mock.calls[0]![0] as string
    const params = new URL(arg, 'http://x').searchParams
    expect(params.get('owner')).toBe('alice')
    expect(params.get('preset')).toBe('mine')
  })

  it('Filter > With problems navigates with the problems preset and no filter footprint', async () => {
    const user = userEvent.setup()
    renderPalette()
    await user.click(screen.getByText('With problems'))
    const arg = mockNavigate.mock.calls[0]![0] as string
    const params = new URL(arg, 'http://x').searchParams
    expect(params.get('preset')).toBe('problems')
    expect(params.get('owner')).toBeNull()
  })

  it('opens the create dialog on New Component', async () => {
    const user = userEvent.setup()
    renderPalette()
    await user.click(screen.getByText('New Component'))
    expect(await screen.findByTestId('create-dialog')).toBeInTheDocument()
  })
})

describe('CommandPalette — component search', () => {
  it('does not query CRS until the user types (enabled=false)', () => {
    renderPalette()
    expect(mockUseComponents).toHaveBeenCalled()
    const arg = mockUseComponents.mock.calls[0]![0] as { enabled: boolean }
    expect(arg.enabled).toBe(false)
  })

  it('debounces the search query then passes it to useComponents', async () => {
    const user = userEvent.setup()
    renderPalette()
    await user.type(screen.getByPlaceholderText(/Search components/i), 'pay')
    await waitFor(() => {
      const lastArg = mockUseComponents.mock.calls.at(-1)![0] as {
        enabled: boolean
        filter: { search?: string }
      }
      expect(lastArg.enabled).toBe(true)
      expect(lastArg.filter.search).toBe('pay')
    })
  })

  it('clears the typed query when the palette closes (no stale results on reopen)', async () => {
    const user = userEvent.setup()
    renderPalette()
    const input = screen.getByPlaceholderText(/Search components/i) as HTMLInputElement
    await user.type(input, 'pay')
    expect(input.value).toBe('pay')
    // Close via Esc, then reopen by flipping the store flag (as ⌘K would).
    await user.keyboard('{Escape}')
    useUiOverlay.setState({ paletteOpen: true })
    const reopened = await screen.findByPlaceholderText(/Search components/i)
    expect((reopened as HTMLInputElement).value).toBe('')
  })

  it('navigates to the component detail on selecting a result', async () => {
    const user = userEvent.setup()
    mockSearch([
      {
        id: 'svc-1',
        name: 'svc-one',
        displayName: 'Service One',
        componentOwner: null,
        system: null,
        productType: null,
        archived: false,
        updatedAt: null,
        labels: [],
      },
    ])
    renderPalette()
    await user.type(screen.getByPlaceholderText(/Search components/i), 'svc')
    const item = await screen.findByText('svc-one')
    await user.click(item)
    expect(mockNavigate).toHaveBeenCalledWith('/components/svc-1')
  })
})
