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

// Stub useCurrentUser — My Components checkbox needs the current user.
vi.mock('../hooks/useCurrentUser', () => ({
  useCurrentUser: vi.fn(),
}))

import { useCurrentUser } from '../hooks/useCurrentUser'
const mockUseCurrentUser = vi.mocked(useCurrentUser)

function mockCurrentUser(username: string | null) {
  mockUseCurrentUser.mockReturnValue({
    data: username ? { username, roles: [], groups: [] } : undefined,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useCurrentUser>)
}

describe('ComponentFilters', () => {
  const onFilterChange = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockCurrentUser('testuser')
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

  it('shows Clear filters button only when filters are active', () => {
    const { rerender } = render(
      <ComponentFilters filter={{ archived: false }} onFilterChange={onFilterChange} />,
    )
    // archived: false is the default — should NOT show Clear filters
    expect(screen.queryByText('Clear filters')).toBeNull()

    rerender(<ComponentFilters filter={{ search: 'foo', archived: false }} onFilterChange={onFilterChange} />)
    expect(screen.getByText('Clear filters')).toBeDefined()
  })

  it('resets all filters when Clear filters is clicked', async () => {
    render(
      <ComponentFilters filter={{ search: 'foo', system: 'ALFA', archived: false }} onFilterChange={onFilterChange} />,
    )

    await userEvent.click(screen.getByText('Clear filters'))

    // Clear resets to default: archived: false
    expect(onFilterChange).toHaveBeenCalledWith({ archived: false })
  })
})

describe('ComponentFilters archived filter (§7.0/2e)', () => {
  const onFilterChange = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockCurrentUser('testuser')
  })

  it('default filter archived=false shows "Show archived components" button', () => {
    render(<ComponentFilters filter={{ archived: false }} onFilterChange={onFilterChange} />)
    expect(screen.getByRole('button', { name: 'Show archived components' })).toBeDefined()
  })

  it('clicking "Show archived components" toggles archived to undefined', async () => {
    render(<ComponentFilters filter={{ archived: false }} onFilterChange={onFilterChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Show archived components' }))
    expect(onFilterChange).toHaveBeenCalledWith({ archived: undefined })
  })

  it('filter archived=undefined shows "Hide archived components" button', () => {
    render(<ComponentFilters filter={{ archived: undefined }} onFilterChange={onFilterChange} />)
    expect(screen.getByRole('button', { name: 'Hide archived components' })).toBeDefined()
  })

  it('clicking "Hide archived components" toggles archived back to false', async () => {
    render(<ComponentFilters filter={{ archived: undefined }} onFilterChange={onFilterChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Hide archived components' }))
    expect(onFilterChange).toHaveBeenCalledWith({ archived: false })
  })

  it('hasActiveFilters does not count archived=false as an active filter', () => {
    render(<ComponentFilters filter={{ archived: false }} onFilterChange={onFilterChange} />)
    // No "Clear filters" when only the default archived:false is set
    expect(screen.queryByText('Clear filters')).toBeNull()
  })

  it('hasActiveFilters counts archived=undefined as an active filter', () => {
    render(<ComponentFilters filter={{ archived: undefined }} onFilterChange={onFilterChange} />)
    expect(screen.getByText('Clear filters')).toBeDefined()
  })
})

describe('ComponentFilters My Components (§7.0/2e)', () => {
  const onFilterChange = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders My Components switch', () => {
    mockCurrentUser('alice')
    render(<ComponentFilters filter={{ archived: false }} onFilterChange={onFilterChange} />)
    expect(screen.getByLabelText('My Components')).toBeDefined()
  })

  it('switch is disabled when currentUser is null', () => {
    mockCurrentUser(null)
    render(<ComponentFilters filter={{ archived: false }} onFilterChange={onFilterChange} />)
    const sw = screen.getByLabelText('My Components') as HTMLButtonElement
    expect(sw.disabled).toBe(true)
  })

  it('checking My Components sets owner to currentUser.username', async () => {
    mockCurrentUser('alice')
    render(<ComponentFilters filter={{ archived: false }} onFilterChange={onFilterChange} />)
    const sw = screen.getByLabelText('My Components')
    await userEvent.click(sw)
    expect(onFilterChange).toHaveBeenCalledWith({ archived: false, owner: 'alice' })
  })

  it('unchecking My Components clears owner', async () => {
    mockCurrentUser('alice')
    render(
      <ComponentFilters filter={{ archived: false, owner: 'alice' }} onFilterChange={onFilterChange} />,
    )
    const sw = screen.getByLabelText('My Components')
    await userEvent.click(sw)
    expect(onFilterChange).toHaveBeenCalledWith({ archived: false, owner: undefined })
  })

  it('Owner dropdown is disabled when My Components is checked', () => {
    mockCurrentUser('alice')
    render(
      <ComponentFilters filter={{ archived: false, owner: 'alice' }} onFilterChange={onFilterChange} />,
    )
    const ownerTrigger = screen.getByRole('combobox', { name: /owner/i })
    expect(ownerTrigger.hasAttribute('disabled') || ownerTrigger.getAttribute('aria-disabled') === 'true' || ownerTrigger.getAttribute('data-disabled') !== null).toBe(true)
  })

  it('Owner dropdown is enabled when My Components is not checked', () => {
    mockCurrentUser('alice')
    render(<ComponentFilters filter={{ archived: false }} onFilterChange={onFilterChange} />)
    const ownerTrigger = screen.getByRole('combobox', { name: /owner/i })
    expect(ownerTrigger.getAttribute('data-disabled')).toBeNull()
  })
})

describe('ComponentFilters owner dropdown (B7.1.1)', () => {
  const onFilterChange = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockCurrentUser('testuser')
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
    render(<ComponentFilters filter={{ owner: 'alice', archived: false }} onFilterChange={onFilterChange} />)
    expect(screen.getByText('Clear filters')).toBeDefined()
  })
})
