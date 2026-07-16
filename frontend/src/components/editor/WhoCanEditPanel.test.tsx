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

/** One row per distinct person: `username` plus its exact, ordered role labels. */
function entryRows(): { username: string; roles: string[] }[] {
  return screen.getAllByTestId('editor-entry').map((row) => {
    const badges = Array.from(row.querySelectorAll('[data-variant]')).map((b) => b.textContent)
    const username = row.textContent!.replace(badges.join(''), '')
    return { username, roles: badges as string[] }
  })
}

beforeEach(() => {
  mockUseComponentEditors.mockReset()
})

describe('WhoCanEditPanel', () => {
  it('renders one row per person, each tagged with its role(s), and the always-visible admin note', () => {
    mockUseComponentEditors.mockReturnValue({
      // alice appears as both owner and RM → one row, two role badges.
      data: {
        componentOwner: 'alice',
        releaseManagers: ['alice', 'rm-1'],
        securityChampions: ['sc-1'],
        manager: null,
      },
      isLoading: false,
      isError: false,
    })
    renderPanel()

    const panel = screen.getByTestId('who-can-edit')
    expect(panel.textContent).toContain('Who can edit this component')
    expect(entryRows()).toEqual([
      { username: 'alice', roles: ['Owner', 'Release manager'] },
      { username: 'rm-1', roles: ['Release manager'] },
      { username: 'sc-1', roles: ['Security champion'] },
    ])
    // Admin access is always-visible text (not tooltip-only) so it survives on touch.
    expect(panel.textContent).toContain('Administrators can also edit any component.')
  })

  it("tags the owner's manager with its own role (SYS-064)", () => {
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

    expect(entryRows()).toEqual([
      { username: 'alice', roles: ['Owner'] },
      { username: 'rm-1', roles: ['Release manager'] },
      { username: 'sc-1', roles: ['Security champion'] },
      { username: 'mgr-1', roles: ["Owner's manager"] },
    ])
  })

  it('merges the manager into one row (with both role badges) when already listed as owner/RM/SC', () => {
    mockUseComponentEditors.mockReturnValue({
      data: { componentOwner: 'alice', releaseManagers: ['rm-1'], securityChampions: [], manager: 'rm-1' },
      isLoading: false,
      isError: false,
    })
    renderPanel()

    expect(entryRows()).toEqual([
      { username: 'alice', roles: ['Owner'] },
      { username: 'rm-1', roles: ['Release manager', "Owner's manager"] },
    ])
  })

  it('dedupes case- and whitespace-variant names to a single row (matches backend trim+lowercase rule)', () => {
    mockUseComponentEditors.mockReturnValue({
      // Same person spelled 3 ways across owner / RM / manager — CRS's canEditComponent
      // matches trimmed + case-insensitive, so the panel must not show 3 rows.
      data: { componentOwner: 'Alice', releaseManagers: [' alice '], securityChampions: [], manager: 'ALICE' },
      isLoading: false,
      isError: false,
    })
    renderPanel()

    // Exactly one row; display casing is the FIRST occurrence ("Alice", from componentOwner).
    expect(entryRows()).toEqual([{ username: 'Alice', roles: ['Owner', 'Release manager', "Owner's manager"] }])
  })

  it('shows a Loading… placeholder while the projection is in flight', () => {
    mockUseComponentEditors.mockReturnValue({ data: undefined, isLoading: true, isError: false })
    renderPanel()
    expect(screen.getByTestId('who-can-edit').textContent).toContain('Loading…')
  })

  it('shows "(no people assigned)" when the list is genuinely empty', () => {
    mockUseComponentEditors.mockReturnValue({
      data: { componentOwner: null, releaseManagers: [], securityChampions: [], manager: null },
      isLoading: false,
      isError: false,
    })
    renderPanel()
    expect(screen.getByTestId('who-can-edit').textContent).toContain('(no people assigned)')
    expect(screen.queryAllByTestId('editor-entry')).toHaveLength(0)
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
      data: { componentOwner: 'alice', releaseManagers: [], securityChampions: [], manager: null },
      isLoading: false,
      isError: false,
    })
    renderPanel()
    expect(screen.getByRole('region', { name: 'Who can edit this component' })).toBeDefined()
  })
})
