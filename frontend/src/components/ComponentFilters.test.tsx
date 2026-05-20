import React from 'react'
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

// Stub useLabels — labels picker sources from /components/meta/labels.
// Default returns a deterministic vocabulary; individual tests that need
// to exercise loading / empty / no-match empty-states override via
// `mockUseLabels.mockReturnValue(…)` inside the test body.
vi.mock('../hooks/useLabels', () => ({
  useLabels: vi.fn(),
}))

import { useLabels } from '../hooks/useLabels'
const mockUseLabels = vi.mocked(useLabels)

function mockLabels(
  data: string[] | undefined = ['alpha', 'beta', 'gamma'],
  isLoading = false,
) {
  mockUseLabels.mockReturnValue({
    data,
    isLoading,
  } as unknown as ReturnType<typeof useLabels>)
}

// Stub useCurrentUser — My Components checkbox needs the current user.
vi.mock('../hooks/useCurrentUser', () => ({
  useCurrentUser: vi.fn(),
}))

// Stub useAdminConfig so useFieldConfigEntry (used by Build System select)
// returns a deterministic options list without hitting the network.
vi.mock('../hooks/useAdminConfig', () => ({
  useFieldConfig: vi.fn(),
  useUpdateFieldConfig: vi.fn(),
  useComponentDefaults: vi.fn(),
  useUpdateComponentDefaults: vi.fn(),
  useMigrateDefaults: vi.fn(),
}))

import { useFieldConfig } from '../hooks/useAdminConfig'
const mockUseFieldConfig = vi.mocked(useFieldConfig)

function mockFieldConfig(options: string[]) {
  mockUseFieldConfig.mockReturnValue({
    data: { fields: { buildSystem: { options } } },
    isLoading: false,
  } as unknown as ReturnType<typeof useFieldConfig>)
}

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
    mockLabels()
    mockCurrentUser('testuser')
    mockFieldConfig([])
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
    mockLabels()
    mockCurrentUser('testuser')
    mockFieldConfig([])
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
    mockLabels()
    mockFieldConfig([])
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
    mockLabels()
    mockCurrentUser('testuser')
    mockFieldConfig([])
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

describe('ComponentFilters Build System select (Wave 2)', () => {
  const onFilterChange = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockLabels()
    mockCurrentUser('testuser')
    mockFieldConfig(['GRADLE', 'MAVEN'])
  })

  it('renders a Build System dropdown', () => {
    render(<ComponentFilters filter={{}} onFilterChange={onFilterChange} />)
    expect(screen.getByRole('combobox', { name: /build system/i })).toBeDefined()
  })

  it('lists options sourced from field-config', async () => {
    render(<ComponentFilters filter={{}} onFilterChange={onFilterChange} />)
    await userEvent.click(screen.getByRole('combobox', { name: /build system/i }))
    expect(screen.getByRole('option', { name: 'GRADLE' })).toBeDefined()
    expect(screen.getByRole('option', { name: 'MAVEN' })).toBeDefined()
    expect(screen.getByRole('option', { name: /all build systems/i })).toBeDefined()
  })

  it('calls onFilterChange with buildSystem when an option is selected', async () => {
    render(<ComponentFilters filter={{}} onFilterChange={onFilterChange} />)
    await userEvent.click(screen.getByRole('combobox', { name: /build system/i }))
    await userEvent.click(screen.getByRole('option', { name: 'GRADLE' }))
    expect(onFilterChange).toHaveBeenCalledWith({ buildSystem: 'GRADLE' })
  })

  it('clears buildSystem when "All build systems" is selected', async () => {
    render(<ComponentFilters filter={{ buildSystem: 'MAVEN' }} onFilterChange={onFilterChange} />)
    await userEvent.click(screen.getByRole('combobox', { name: /build system/i }))
    await userEvent.click(screen.getByRole('option', { name: /all build systems/i }))
    expect(onFilterChange).toHaveBeenCalledWith({ buildSystem: undefined })
  })

  it('shows Clear filters when buildSystem is the only active filter', () => {
    render(<ComponentFilters filter={{ buildSystem: 'GRADLE', archived: false }} onFilterChange={onFilterChange} />)
    expect(screen.getByText('Clear filters')).toBeDefined()
  })

  it('renders only "All build systems" when field-config has no options', async () => {
    mockFieldConfig([])
    render(<ComponentFilters filter={{}} onFilterChange={onFilterChange} />)
    await userEvent.click(screen.getByRole('combobox', { name: /build system/i }))
    expect(screen.getByRole('option', { name: /all build systems/i })).toBeDefined()
    expect(screen.queryByRole('option', { name: 'GRADLE' })).toBeNull()
  })
})

describe('ComponentFilters labels multi-select', () => {
  const onFilterChange = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockLabels()
    mockCurrentUser('testuser')
    mockFieldConfig([])
  })

  it('opens the labels picker when the trigger is clicked', async () => {
    render(<ComponentFilters filter={{}} onFilterChange={onFilterChange} />)
    const trigger = screen.getByRole('button', { name: /all labels/i })
    await userEvent.click(trigger)
    // Once open, the option rows are rendered as checkboxes.
    expect(screen.getByRole('checkbox', { name: 'alpha' })).toBeDefined()
    expect(screen.getByRole('checkbox', { name: 'beta' })).toBeDefined()
    expect(screen.getByRole('checkbox', { name: 'gamma' })).toBeDefined()
  })

  it('calls onFilterChange with the picked labels (AND list) when two checkboxes are checked', async () => {
    // Stateful wrapper — the picker is controlled by `filter.labels`, so we
    // must persist updates between clicks for the second selection to extend
    // the first instead of replacing it.
    function Harness() {
      const [filter, setFilter] = React.useState<{ labels?: string[] }>({})
      return (
        <ComponentFilters
          filter={filter}
          onFilterChange={(f) => {
            onFilterChange(f)
            setFilter(f)
          }}
        />
      )
    }
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: /all labels/i }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'alpha' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'gamma' }))
    // Last call carries both selected labels.
    const lastCall = onFilterChange.mock.calls[onFilterChange.mock.calls.length - 1]![0]
    expect(lastCall.labels).toEqual(['alpha', 'gamma'])
  })

  it('Clear filters drops labels from the filter', async () => {
    render(
      <ComponentFilters
        filter={{ labels: ['alpha'], archived: false }}
        onFilterChange={onFilterChange}
      />,
    )
    await userEvent.click(screen.getByText('Clear filters'))
    expect(onFilterChange).toHaveBeenCalledWith({ archived: false })
    const lastArg = onFilterChange.mock.calls[onFilterChange.mock.calls.length - 1]![0]
    expect(lastArg.labels).toBeUndefined()
  })

  it('shows Clear filters when labels is the only active filter', () => {
    render(
      <ComponentFilters
        filter={{ labels: ['alpha'], archived: false }}
        onFilterChange={onFilterChange}
      />,
    )
    expect(screen.getByText('Clear filters')).toBeDefined()
  })

  it('ArrowDown / ArrowUp move focus between option rows (stops at last)', async () => {
    render(<ComponentFilters filter={{}} onFilterChange={onFilterChange} />)
    await userEvent.click(screen.getByRole('button', { name: /all labels/i }))

    const alpha = screen.getByRole('checkbox', { name: 'alpha' }) as HTMLInputElement
    const beta = screen.getByRole('checkbox', { name: 'beta' }) as HTMLInputElement
    const gamma = screen.getByRole('checkbox', { name: 'gamma' }) as HTMLInputElement

    // Seed focus on the first row (the test does not assert how the picker
    // initially places focus on open — only that ArrowUp/ArrowDown navigate
    // between rows once focus is inside the list).
    alpha.focus()
    expect(document.activeElement).toBe(alpha)

    await userEvent.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(beta)

    await userEvent.keyboard('{ArrowUp}')
    expect(document.activeElement).toBe(alpha)

    // From last row, ArrowDown stops at last (parity with native <select>).
    gamma.focus()
    await userEvent.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(gamma)
  })

  it('shows "Loading…" while useLabels is fetching', async () => {
    mockLabels(undefined, true)
    render(<ComponentFilters filter={{}} onFilterChange={onFilterChange} />)
    await userEvent.click(screen.getByRole('button', { name: /all labels/i }))
    expect(screen.getByText('Loading…')).toBeDefined()
    // No checkbox rows while loading.
    expect(screen.queryByRole('checkbox', { name: 'alpha' })).toBeNull()
  })

  it('shows "No labels available" when the vocabulary is empty', async () => {
    mockLabels([], false)
    render(<ComponentFilters filter={{}} onFilterChange={onFilterChange} />)
    await userEvent.click(screen.getByRole('button', { name: /all labels/i }))
    expect(screen.getByText('No labels available')).toBeDefined()
  })

  it('shows the "No matches for <query>" hint when search filters out every option', async () => {
    // Default mock (alpha/beta/gamma) is good — type a query no option contains.
    render(<ComponentFilters filter={{}} onFilterChange={onFilterChange} />)
    await userEvent.click(screen.getByRole('button', { name: /all labels/i }))

    const searchInput = screen.getByPlaceholderText('Search labels...')
    await userEvent.type(searchInput, 'zzz')

    expect(screen.getByText('No matches for "zzz"')).toBeDefined()
    // Crucially: the misleading "No labels available" must NOT appear here —
    // the vocabulary is non-empty, only the current query has no matches.
    expect(screen.queryByText('No labels available')).toBeNull()
  })
})
