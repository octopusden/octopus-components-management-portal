import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { WhoCanEditPanel } from './WhoCanEditPanel'
import { TooltipProvider } from '../ui/tooltip'

// useComponentEditors is the only data dependency; mock it so each test pins the
// query state (data / loading / error) without touching the network.
const mockUseComponentEditors = vi.fn()
vi.mock('../../hooks/useComponentEditors', () => ({
  useComponentEditors: () => mockUseComponentEditors(),
}))

function renderPanel() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  // TooltipProvider mirrors the app-root provider (App.tsx) the tooltip needs.
  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WhoCanEditPanel componentId="comp-1" />
      </TooltipProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  mockUseComponentEditors.mockReset()
})

describe('WhoCanEditPanel', () => {
  it('renders the deduplicated owner + RMs + SCs list and the always-visible admin note', () => {
    mockUseComponentEditors.mockReturnValue({
      // alice appears as both owner and RM → must be deduped to a single entry.
      data: { componentOwner: 'alice', releaseManagers: ['alice', 'rm-1'], securityChampions: ['sc-1'] },
      isLoading: false,
      isError: false,
    })
    renderPanel()

    const panel = screen.getByTestId('who-can-edit')
    expect(panel.textContent).toContain('Who can edit this component')
    expect(panel.textContent).toContain('alice, rm-1, sc-1')
    // Admin access is always-visible text (not tooltip-only) so it survives on touch.
    expect(panel.textContent).toContain('Administrators can also edit any component.')
  })

  it('includes the owner\'s manager in the list (SYS-063)', () => {
    mockUseComponentEditors.mockReturnValue({
      data: {
        componentOwner: 'alice',
        releaseManagers: ['rm-1'],
        securityChampions: ['sc-1'],
        manager: 'mgr-1',
      },
      isLoading: false,
      isError: false,
    })
    renderPanel()

    const panel = screen.getByTestId('who-can-edit')
    expect(panel.textContent).toContain('alice, rm-1, sc-1, mgr-1')
  })

  it('dedupes the manager when they are already listed as owner/RM/SC', () => {
    mockUseComponentEditors.mockReturnValue({
      data: { componentOwner: 'alice', releaseManagers: ['rm-1'], securityChampions: [], manager: 'rm-1' },
      isLoading: false,
      isError: false,
    })
    renderPanel()

    expect(screen.getByTestId('who-can-edit').textContent).toContain('alice, rm-1')
  })

  it('shows a Loading… placeholder while the projection is in flight', () => {
    mockUseComponentEditors.mockReturnValue({ data: undefined, isLoading: true, isError: false })
    renderPanel()
    expect(screen.getByTestId('who-can-edit').textContent).toContain('Loading…')
  })

  it('shows "(no people assigned)" when the list is genuinely empty', () => {
    mockUseComponentEditors.mockReturnValue({
      data: { componentOwner: null, releaseManagers: [], securityChampions: [] },
      isLoading: false,
      isError: false,
    })
    renderPanel()
    expect(screen.getByTestId('who-can-edit').textContent).toContain('(no people assigned)')
  })

  it('shows an error message (not "(no people assigned)") when the fetch fails', () => {
    mockUseComponentEditors.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    renderPanel()
    const panel = screen.getByTestId('who-can-edit')
    expect(panel.textContent).toContain("Couldn't load the editor list")
    // The misleading empty-state copy must NOT appear on error.
    expect(panel.textContent).not.toContain('(no people assigned)')
  })

  it('exposes the panel as an aria region labelled by its heading', () => {
    mockUseComponentEditors.mockReturnValue({
      data: { componentOwner: 'alice', releaseManagers: [], securityChampions: [] },
      isLoading: false,
      isError: false,
    })
    renderPanel()
    expect(screen.getByRole('region', { name: 'Who can edit this component' })).toBeDefined()
  })
})
