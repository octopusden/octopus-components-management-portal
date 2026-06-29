import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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

  it('rejects an all-versions range on add (use Set to all versions)', async () => {
    mockData = { all: false, ranges: ['[1.0,2.0)'], warnings: [] }
    renderTab()
    fireEvent.change(screen.getByLabelText('New supported version range'), { target: { value: '(,)' } })
    await userEvent.click(screen.getByRole('button', { name: /add range/i }))
    expect(mockUpdate).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.getByText(/all-versions default/i)).toBeDefined())
  })

  it('PUTs the set without the removed range on delete', async () => {
    mockData = { all: false, ranges: ['[1.0,2.0)', '[2.0,)'], warnings: [] }
    renderTab()
    await userEvent.click(screen.getByRole('button', { name: 'Remove supported range [2.0,)' }))
    expect(mockUpdate).toHaveBeenCalledWith({ ranges: ['[1.0,2.0)'] }, expect.anything())
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
})
