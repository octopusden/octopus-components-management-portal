import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { fireEvent } from '@testing-library/react'
import { ComponentFilters } from './ComponentFilters'

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
