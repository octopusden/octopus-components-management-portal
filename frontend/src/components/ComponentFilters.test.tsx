import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { fireEvent } from '@testing-library/react'
import { ComponentFilters } from './ComponentFilters'

// Stub useOwners — the owner dropdown sources its values from
// /components/meta/owners. Tests pin a deterministic owner list so the
// behaviour is independent of network state.
vi.mock('../hooks/useOwners', () => ({
  useOwners: () => ({ data: ['alice', 'bob', 'carol'], isLoading: false }),
}))

describe('ComponentFilters', () => {
  const onFilterChange = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders search input', () => {
    render(<ComponentFilters filter={{}} onFilterChange={onFilterChange} />)
    expect(screen.getByPlaceholderText('Search components...')).toBeDefined()
  })

  it('calls onFilterChange with search after debounce', async () => {
    vi.useFakeTimers()

    render(<ComponentFilters filter={{}} onFilterChange={onFilterChange} />)

    const input = screen.getByPlaceholderText('Search components...')
    fireEvent.change(input, { target: { value: 'mycomp' } })

    expect(onFilterChange).not.toHaveBeenCalled()

    act(() => { vi.advanceTimersByTime(300) })

    expect(onFilterChange).toHaveBeenCalledWith({ search: 'mycomp' })

    vi.useRealTimers()
  })

  it('shows archived toggle cycling through states', async () => {
    const { rerender } = render(
      <ComponentFilters filter={{}} onFilterChange={onFilterChange} />,
    )

    // Initial: 'All'
    expect(screen.getByRole('button', { name: 'All' })).toBeDefined()

    // Click once → archived: true
    await userEvent.click(screen.getByRole('button', { name: 'All' }))
    expect(onFilterChange).toHaveBeenCalledWith({ archived: true })

    rerender(<ComponentFilters filter={{ archived: true }} onFilterChange={onFilterChange} />)
    expect(screen.getByRole('button', { name: 'Archived only' })).toBeDefined()

    // Click again → archived: false
    await userEvent.click(screen.getByRole('button', { name: 'Archived only' }))
    expect(onFilterChange).toHaveBeenCalledWith({ archived: false })

    rerender(<ComponentFilters filter={{ archived: false }} onFilterChange={onFilterChange} />)
    expect(screen.getByRole('button', { name: 'Active only' })).toBeDefined()

    // Click again → archived: undefined
    await userEvent.click(screen.getByRole('button', { name: 'Active only' }))
    expect(onFilterChange).toHaveBeenCalledWith({ archived: undefined })
  })

  it('shows Clear filters button only when filters are active', () => {
    const { rerender } = render(
      <ComponentFilters filter={{}} onFilterChange={onFilterChange} />,
    )
    expect(screen.queryByText('Clear filters')).toBeNull()

    rerender(<ComponentFilters filter={{ search: 'foo' }} onFilterChange={onFilterChange} />)
    expect(screen.getByText('Clear filters')).toBeDefined()
  })

  it('resets all filters when Clear filters is clicked', async () => {
    render(
      <ComponentFilters filter={{ search: 'foo', system: 'ALFA' }} onFilterChange={onFilterChange} />,
    )

    await userEvent.click(screen.getByText('Clear filters'))

    expect(onFilterChange).toHaveBeenCalledWith({})
  })
})

describe('ComponentFilters owner dropdown (B7.1.1)', () => {
  const onFilterChange = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders an owner dropdown with the values from /components/meta/owners', async () => {
    render(<ComponentFilters filter={{}} onFilterChange={onFilterChange} />)

    // The dropdown surfaces a placeholder until a value is picked. We click
    // the trigger to open the listbox and assert the seeded owners appear.
    const trigger = screen.getByRole('combobox', { name: /owner/i })
    expect(trigger).toBeDefined()

    await userEvent.click(trigger)

    expect(screen.getByRole('option', { name: 'alice' })).toBeDefined()
    expect(screen.getByRole('option', { name: 'bob' })).toBeDefined()
    expect(screen.getByRole('option', { name: 'carol' })).toBeDefined()
    // "All owners" sentinel — preserves the existing system/productType pattern.
    expect(screen.getByRole('option', { name: /all owners/i })).toBeDefined()
  })

  it('calls onFilterChange with owner when a value is picked', async () => {
    render(<ComponentFilters filter={{}} onFilterChange={onFilterChange} />)

    await userEvent.click(screen.getByRole('combobox', { name: /owner/i }))
    await userEvent.click(screen.getByRole('option', { name: 'bob' }))

    expect(onFilterChange).toHaveBeenCalledWith({ owner: 'bob' })
  })

  it('clears owner when "All owners" is picked', async () => {
    render(<ComponentFilters filter={{ owner: 'alice' }} onFilterChange={onFilterChange} />)

    await userEvent.click(screen.getByRole('combobox', { name: /owner/i }))
    await userEvent.click(screen.getByRole('option', { name: /all owners/i }))

    expect(onFilterChange).toHaveBeenCalledWith({ owner: undefined })
  })

  it('shows Clear filters when owner is the only active filter', () => {
    render(<ComponentFilters filter={{ owner: 'alice' }} onFilterChange={onFilterChange} />)
    expect(screen.getByText('Clear filters')).toBeDefined()
  })
})
