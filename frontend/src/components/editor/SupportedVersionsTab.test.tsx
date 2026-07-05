import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { SupportedVersionsResponse } from '../../lib/types'
import { SupportedVersionsTab } from './SupportedVersionsTab'
import { useSupportedVersionsSection } from './useSupportedVersionsSection'

// The tab is presentational — it renders a SupportedVersionsSection draft. Drive
// it through the REAL section hook (with the data/mutation hooks mocked) so the
// add/remove/set-all interactions exercise the actual draft behaviour, and assert
// that NO PUT fires from the tab (persist is deferred to the page's Save).
let mockData: SupportedVersionsResponse | undefined
const mockMutateAsync = vi.fn(() => Promise.resolve(mockData as SupportedVersionsResponse))

vi.mock('../../hooks/useComponent', () => ({
  useSupportedVersions: () => ({ data: mockData, isLoading: mockData === undefined }),
  useUpdateSupportedVersions: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
}))

function Harness({ canEdit }: { canEdit: boolean }) {
  const section = useSupportedVersionsSection('c-1')
  return <SupportedVersionsTab section={section} canEdit={canEdit} />
}

function renderTab(canEdit = true) {
  return render(<Harness canEdit={canEdit} />)
}

describe('SupportedVersionsTab', () => {
  beforeEach(() => {
    mockMutateAsync.mockReset()
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

  it('appends the new range to the draft on add (no PUT — deferred to Save)', async () => {
    mockData = { all: false, ranges: ['[1.0,2.0)'], warnings: [] }
    renderTab()
    fireEvent.change(screen.getByLabelText('New supported version range'), { target: { value: '[2.0,)' } })
    await userEvent.click(screen.getByRole('button', { name: /add range/i }))
    const items = screen.getByLabelText('Supported version ranges').querySelectorAll('code')
    expect(Array.from(items).map((c) => c.textContent)).toEqual(['[1.0,2.0)', '[2.0,)'])
    expect(mockMutateAsync).not.toHaveBeenCalled()
  })

  it('allows an OVERLAPPING range on add (no client disjoint requirement — server merges)', async () => {
    // ADR-018 redesign: coverage is stored merged, so overlapping/adjacent input is valid — the
    // client must NOT reject it; the server collapses it into the canonical union on save.
    mockData = { all: false, ranges: ['[1.0,2.0)'], warnings: [] }
    renderTab()
    fireEvent.change(screen.getByLabelText('New supported version range'), { target: { value: '[1.5,3.0)' } })
    expect(screen.getByRole('button', { name: /add range/i })).not.toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: /add range/i }))
    const items = screen.getByLabelText('Supported version ranges').querySelectorAll('code')
    expect(Array.from(items).map((c) => c.textContent)).toEqual(['[1.0,2.0)', '[1.5,3.0)'])
  })

  it('rejects an all-versions range on add — live error, Add disabled, no draft change', async () => {
    mockData = { all: false, ranges: ['[1.0,2.0)'], warnings: [] }
    renderTab()
    fireEvent.change(screen.getByLabelText('New supported version range'), { target: { value: '(,)' } })
    await waitFor(() => expect(screen.getByText(/all-versions default/i)).toBeDefined())
    expect(screen.getByRole('button', { name: /add range/i })).toBeDisabled()
  })

  it('rejects a COMPOSITE all-versions range like (,),[1.0,2.0) (sentinel inside a composite)', async () => {
    mockData = { all: false, ranges: [], warnings: [] }
    renderTab()
    fireEvent.change(screen.getByLabelText('New supported version range'), { target: { value: '(,),[1.0,2.0)' } })
    await waitFor(() => expect(screen.getByText(/all-versions default/i)).toBeDefined())
    expect(screen.getByRole('button', { name: /add range/i })).toBeDisabled()
  })

  it('all-versions → bounded: adding a range from all-versions shows the single bounded range', async () => {
    mockData = { all: true, ranges: [], warnings: [] }
    renderTab()
    fireEvent.change(screen.getByLabelText('New supported version range'), { target: { value: '[2.0,)' } })
    await userEvent.click(screen.getByRole('button', { name: /add range/i }))
    const items = screen.getByLabelText('Supported version ranges').querySelectorAll('code')
    expect(Array.from(items).map((c) => c.textContent)).toEqual(['[2.0,)'])
  })

  it('removes a range from the draft on delete when ≥1 remains (no dialog, no PUT)', async () => {
    mockData = { all: false, ranges: ['[1.0,2.0)', '[2.0,)'], warnings: [] }
    renderTab()
    await userEvent.click(screen.getByRole('button', { name: 'Remove supported range [2.0,)' }))
    const items = screen.getByLabelText('Supported version ranges').querySelectorAll('code')
    expect(Array.from(items).map((c) => c.textContent)).toEqual(['[1.0,2.0)'])
    expect(mockMutateAsync).not.toHaveBeenCalled()
  })

  // Cutover blocker: removing the ONLY remaining range would empty coverage,
  // which is all-versions. That silent widen-to-ALL on a single misclick is the
  // defect — deleting the last range must require an explicit confirmation and
  // must never silently drop coverage to []. In the draft flow nothing is PUT
  // until Save, so the confirmation gates the intent, not the network.
  it('deleting the LAST remaining range opens a confirmation dialog and stages nothing yet', async () => {
    mockData = { all: false, ranges: ['[1.0,2.0)'], warnings: [] }
    renderTab()
    await userEvent.click(screen.getByRole('button', { name: 'Remove supported range [1.0,2.0)' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/only supported range/i)).toBeDefined()
    expect(within(dialog).getByText(/sets coverage to/i)).toBeDefined()
    // Range still shown, nothing PUT.
    expect(screen.getByText('[1.0,2.0)')).toBeDefined()
    expect(mockMutateAsync).not.toHaveBeenCalled()
  })

  it('confirming the widen dialog flips the draft to All versions (explicit intent, no PUT)', async () => {
    mockData = { all: false, ranges: ['[1.0,2.0)'], warnings: [] }
    renderTab()
    await userEvent.click(screen.getByRole('button', { name: 'Remove supported range [1.0,2.0)' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: /widen to all versions/i }))
    expect(screen.getByText('All versions')).toBeDefined()
    expect(mockMutateAsync).not.toHaveBeenCalled()
  })

  it('cancelling the widen dialog keeps the range and stages nothing', async () => {
    mockData = { all: false, ranges: ['[1.0,2.0)'], warnings: [] }
    renderTab()
    await userEvent.click(screen.getByRole('button', { name: 'Remove supported range [1.0,2.0)' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: /cancel/i }))
    expect(screen.getByText('[1.0,2.0)')).toBeDefined()
    expect(mockMutateAsync).not.toHaveBeenCalled()
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
