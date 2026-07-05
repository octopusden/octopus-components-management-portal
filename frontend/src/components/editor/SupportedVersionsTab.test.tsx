import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SupportedVersionsTab } from './SupportedVersionsTab'

const mockUpdate = vi.fn()
let mockData: { all: boolean; ranges: string[]; warnings: string[] } | undefined

vi.mock('../../hooks/useComponent', () => ({
  useSupportedVersions: () => ({ data: mockData, isLoading: mockData === undefined }),
  useUpdateSupportedVersions: () => ({ mutate: mockUpdate, isPending: false }),
}))

function renderTab(canEdit = true) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <SupportedVersionsTab componentId="c-1" canEdit={canEdit} />
    </QueryClientProvider>,
  )
}

describe('SupportedVersionsTab', () => {
  beforeEach(() => {
    mockUpdate.mockReset()
    mockData = undefined
  })

  it('shows "All versions" when coverage is unbounded', () => {
    mockData = { all: true, ranges: [], warnings: [] }
    renderTab()
    expect(screen.getByText('All versions')).toBeDefined()
  })

  it('lists the supported ranges (numeric order) when bounded', () => {
    mockData = { all: false, ranges: ['[2.0,)', '[1.0,2.0)'], warnings: [] }
    renderTab()
    const items = screen.getByLabelText('Supported version ranges').querySelectorAll('code')
    expect(Array.from(items).map((c) => c.textContent)).toEqual(['[1.0,2.0)', '[2.0,)'])
  })

  it('PUTs the full set with the new range appended on add', async () => {
    mockData = { all: false, ranges: ['[1.0,2.0)'], warnings: [] }
    renderTab()
    fireEvent.change(screen.getByLabelText('New supported version range'), { target: { value: '[2.0,)' } })
    await userEvent.click(screen.getByRole('button', { name: /add range/i }))
    expect(mockUpdate).toHaveBeenCalledTimes(1)
    expect(mockUpdate.mock.calls[0]?.[0]).toEqual({ ranges: ['[1.0,2.0)', '[2.0,)'] })
  })

  it('allows an OVERLAPPING range on add (no client disjoint requirement — server merges)', async () => {
    // ADR-018 redesign: coverage is stored merged, so overlapping/adjacent input is valid — the
    // client must NOT reject it; the server collapses it into the canonical union.
    mockData = { all: false, ranges: ['[1.0,2.0)'], warnings: [] }
    renderTab()
    fireEvent.change(screen.getByLabelText('New supported version range'), { target: { value: '[1.5,3.0)' } })
    expect(screen.getByRole('button', { name: /add range/i })).not.toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: /add range/i }))
    expect(mockUpdate).toHaveBeenCalledTimes(1)
    expect(mockUpdate.mock.calls[0]?.[0]).toEqual({ ranges: ['[1.0,2.0)', '[1.5,3.0)'] })
  })

  it('rejects an all-versions range on add — live error, Add disabled, no PUT', async () => {
    mockData = { all: false, ranges: ['[1.0,2.0)'], warnings: [] }
    renderTab()
    fireEvent.change(screen.getByLabelText('New supported version range'), { target: { value: '(,)' } })
    await waitFor(() => expect(screen.getByText(/all-versions default/i)).toBeDefined())
    expect(screen.getByRole('button', { name: /add range/i })).toBeDisabled()
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('rejects a COMPOSITE all-versions range like (,),[1.0,2.0) (sentinel inside a composite)', async () => {
    mockData = { all: false, ranges: [], warnings: [] }
    renderTab()
    fireEvent.change(screen.getByLabelText('New supported version range'), { target: { value: '(,),[1.0,2.0)' } })
    await waitFor(() => expect(screen.getByText(/all-versions default/i)).toBeDefined())
    expect(screen.getByRole('button', { name: /add range/i })).toBeDisabled()
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('all-versions → bounded: adding a range from all-versions PUTs {ranges:[range]}', async () => {
    mockData = { all: true, ranges: [], warnings: [] }
    renderTab()
    fireEvent.change(screen.getByLabelText('New supported version range'), { target: { value: '[2.0,)' } })
    await userEvent.click(screen.getByRole('button', { name: /add range/i }))
    expect(mockUpdate).toHaveBeenCalledTimes(1)
    expect(mockUpdate.mock.calls[0]?.[0]).toEqual({ ranges: ['[2.0,)'] })
  })

  it('PUTs the set without the removed range on delete (still ≥1 range left — no dialog)', async () => {
    mockData = { all: false, ranges: ['[1.0,2.0)', '[2.0,)'], warnings: [] }
    renderTab()
    await userEvent.click(screen.getByRole('button', { name: 'Remove supported range [2.0,)' }))
    expect(mockUpdate).toHaveBeenCalledWith({ ranges: ['[1.0,2.0)'] }, expect.anything())
  })

  // Cutover blocker: removing the ONLY remaining range canonically collapses to
  // all=true server-side (empty ranges ⇒ all). That silent widen-to-ALL on a
  // single misclick is the defect — deleting the last range must require an
  // explicit confirmation and must NEVER silently PUT ranges:[].
  it('deleting the LAST remaining range opens a confirmation dialog and does not PUT', async () => {
    mockData = { all: false, ranges: ['[1.0,2.0)'], warnings: [] }
    renderTab()
    await userEvent.click(screen.getByRole('button', { name: 'Remove supported range [1.0,2.0)' }))
    // Nothing sent yet — the widen is gated behind an explicit confirmation.
    expect(mockUpdate).not.toHaveBeenCalled()
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/only supported range/i)).toBeDefined()
    expect(within(dialog).getByText(/sets coverage to/i)).toBeDefined()
  })

  it('confirming the widen dialog PUTs {all:true} (explicit intent, never a silent ranges:[])', async () => {
    mockData = { all: false, ranges: ['[1.0,2.0)'], warnings: [] }
    renderTab()
    await userEvent.click(screen.getByRole('button', { name: 'Remove supported range [1.0,2.0)' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: /widen to all versions/i }))
    expect(mockUpdate).toHaveBeenCalledTimes(1)
    expect(mockUpdate.mock.calls[0]?.[0]).toEqual({ all: true })
  })

  it('cancelling the widen dialog keeps the range and makes no PUT', async () => {
    mockData = { all: false, ranges: ['[1.0,2.0)'], warnings: [] }
    renderTab()
    await userEvent.click(screen.getByRole('button', { name: 'Remove supported range [1.0,2.0)' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: /cancel/i }))
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(screen.getByText('[1.0,2.0)')).toBeDefined()
  })

  it('PUTs {all:true} via "Set to all versions"', async () => {
    mockData = { all: false, ranges: ['[1.0,2.0)'], warnings: [] }
    renderTab()
    await userEvent.click(screen.getByRole('button', { name: /set to all versions/i }))
    expect(mockUpdate).toHaveBeenCalledWith({ all: true }, expect.anything())
  })

  it('surfaces V1/V5 warnings from the API', () => {
    mockData = { all: false, ranges: ['[1.0,2.0)'], warnings: ['Override X is outside supported'] }
    renderTab()
    expect(screen.getByText('Override X is outside supported')).toBeDefined()
  })

  it('hides edit controls when canEdit is false', () => {
    mockData = { all: false, ranges: ['[1.0,2.0)'], warnings: [] }
    renderTab(false)
    expect(screen.queryByLabelText('New supported version range')).toBeNull()
    expect(screen.queryByRole('button', { name: /add range/i })).toBeNull()
  })

  it('renders the lifecycle teaser (future, non-interactive) with the three states for everyone', () => {
    // ADR-018 deferred item: the lifecycle layer has a structural home here, shown read-only as a
    // "coming soon" teaser — visible regardless of edit rights, and not wired to any control.
    mockData = { all: true, ranges: [], warnings: [] }
    renderTab(false)
    const teaser = screen.getByLabelText('Version lifecycle (coming soon)')
    expect(teaser).toBeDefined()
    expect(screen.getByText('Active development')).toBeDefined()
    expect(screen.getByText('On maintenance')).toBeDefined()
    expect(screen.getByText('Archived')).toBeDefined()
    expect(screen.getByText(/coming soon/i)).toBeDefined()
    // It is a teaser, not a control: no buttons/inputs inside it.
    expect(teaser.querySelector('button')).toBeNull()
    expect(teaser.querySelector('input')).toBeNull()
  })
})
