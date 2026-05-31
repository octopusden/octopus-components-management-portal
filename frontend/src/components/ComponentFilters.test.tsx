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

// Stub useAdminConfig so the indirect dependency chain (PeopleInput,
// other admin-driven UI under ComponentFilters' tree) does not reach
// for the network. Build System options no longer come from this hook
// directly — they go through useFieldOptions (mocked below), which
// internally consults admin field-config AND falls back to a CRS meta
// endpoint when admin is empty.
vi.mock('../hooks/useAdminConfig', () => ({
  useFieldConfig: vi.fn(),
  useUpdateFieldConfig: vi.fn(),
  useComponentDefaults: vi.fn(),
  useUpdateComponentDefaults: vi.fn(),
  useMigrateDefaults: vi.fn(),
}))

// Stub useFieldOptions — Build System / System dropdowns read their options
// here. The mock dispatches on fieldPath so per-field seeds don't collide;
// the default is an empty list (simulates "admin not configured AND meta
// endpoint empty") for any field that isn't explicitly seeded.
vi.mock('../hooks/useFieldOptions', () => ({
  useFieldOptions: vi.fn(),
}))

import { useFieldConfig } from '../hooks/useAdminConfig'
const mockUseFieldConfig = vi.mocked(useFieldConfig)

import { useFieldOptions } from '../hooks/useFieldOptions'
const mockUseFieldOptions = vi.mocked(useFieldOptions)

import type { FieldConfigEntry } from '../hooks/useFieldConfig'

// Per-fieldPath option seeds. Defaults to [] for any field not explicitly
// set; mockFieldOptions(field, opts) overrides for one field at a time.
const fieldOptionSeeds: Record<string, string[]> = {}
function applyFieldOptionsMock() {
  mockUseFieldOptions.mockImplementation((fieldPath: string) => ({
    options: fieldOptionSeeds[fieldPath] ?? [],
    isLoading: false,
  }))
}

function mockFieldOptions(fieldPath: string, options: string[]) {
  fieldOptionSeeds[fieldPath] = options
  applyFieldOptionsMock()
}

// Seed an admin field-config entry. The second arg is a partial
// FieldConfigEntry so individual cases can override visibility,
// filterable, or any future flag without growing positional args. The
// `field` arg names the field; ComponentFilters reads buildSystem and
// system from useFieldConfigEntry(...) for filterable gating.
//
// Shapes intentionally mirror the production paths the resolver walks:
//   - buildSystem → flat `data.fields.buildSystem` (matches BuildTab.tsx
//     and ComponentFilters.tsx, both bare 'buildSystem' paths).
//   - system     → sectioned `data.component.system` (matches CRS PR #301 singular shape, matches
//     GeneralTab.tsx + ComponentDetailPage.tsx + ComponentFilters.tsx,
//     all 'component.system' paths). useFieldOptions seeds against the
//     'component.system' fieldPath key for the same reason.
function mockFieldConfig(
  options: string[],
  entry: Partial<FieldConfigEntry> = {},
  field: 'buildSystem' | 'system' = 'buildSystem',
) {
  const data =
    field === 'buildSystem'
      ? { fields: { buildSystem: { options, ...entry } } }
      : { component: { system: { options, ...entry } } }
  mockUseFieldConfig.mockReturnValue({
    data,
    isLoading: false,
  } as unknown as ReturnType<typeof useFieldConfig>)
  // Keep field-options reachable from the new code path too —
  // ComponentFilters reads useFieldOptions(...) for both filters. The
  // seed key matches the production fieldPath each filter uses.
  const optionsKey = field === 'buildSystem' ? 'buildSystem' : 'component.system'
  mockFieldOptions(optionsKey, options)
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
    // vi.clearAllMocks wipes the per-field useFieldOptions implementation;
    // reset the seed map and re-install the dispatcher every test.
    for (const k of Object.keys(fieldOptionSeeds)) delete fieldOptionSeeds[k]
    applyFieldOptionsMock()
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
      <ComponentFilters filter={{ search: 'foo', system: ['ALFA'], archived: false }} onFilterChange={onFilterChange} />,
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
    // vi.clearAllMocks wipes the per-field useFieldOptions implementation;
    // reset the seed map and re-install the dispatcher every test.
    for (const k of Object.keys(fieldOptionSeeds)) delete fieldOptionSeeds[k]
    applyFieldOptionsMock()
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
    // vi.clearAllMocks wipes the per-field useFieldOptions implementation;
    // reset the seed map and re-install the dispatcher every test.
    for (const k of Object.keys(fieldOptionSeeds)) delete fieldOptionSeeds[k]
    applyFieldOptionsMock()
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

  it('checking My Components sets owner to a single-element array with currentUser.username', async () => {
    mockCurrentUser('alice')
    render(<ComponentFilters filter={{ archived: false }} onFilterChange={onFilterChange} />)
    const sw = screen.getByLabelText('My Components')
    await userEvent.click(sw)
    expect(onFilterChange).toHaveBeenCalledWith({ archived: false, owner: ['alice'] })
  })

  it('unchecking My Components clears owner', async () => {
    mockCurrentUser('alice')
    render(
      <ComponentFilters filter={{ archived: false, owner: ['alice'] }} onFilterChange={onFilterChange} />,
    )
    const sw = screen.getByLabelText('My Components')
    await userEvent.click(sw)
    expect(onFilterChange).toHaveBeenCalledWith({ archived: false, owner: undefined })
  })

  it('Owner picker trigger is disabled when My Components is checked', () => {
    mockCurrentUser('alice')
    render(
      <ComponentFilters filter={{ archived: false, owner: ['alice'] }} onFilterChange={onFilterChange} />,
    )
    const ownerTrigger = screen.getByRole('button', { name: /all owners|alice/i })
    expect((ownerTrigger as HTMLButtonElement).disabled).toBe(true)
  })

  it('Owner picker trigger is enabled when My Components is not checked', () => {
    mockCurrentUser('alice')
    render(<ComponentFilters filter={{ archived: false }} onFilterChange={onFilterChange} />)
    const ownerTrigger = screen.getByRole('button', { name: /all owners/i })
    expect((ownerTrigger as HTMLButtonElement).disabled).toBe(false)
  })

  it('My Components is NOT checked when owner array has multiple values, even if it includes the current user', () => {
    // Multi-select means "alice + bob" is no longer "only my components" —
    // the switch stays unchecked so it can be flipped on to reduce to ['alice'].
    mockCurrentUser('alice')
    render(
      <ComponentFilters
        filter={{ archived: false, owner: ['alice', 'bob'] }}
        onFilterChange={onFilterChange}
      />,
    )
    const sw = screen.getByLabelText('My Components') as HTMLButtonElement
    expect(sw.getAttribute('data-state')).toBe('unchecked')
  })
})

describe('ComponentFilters Owner multi-select (B7.1.1)', () => {
  const onFilterChange = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    // vi.clearAllMocks wipes the per-field useFieldOptions implementation;
    // reset the seed map and re-install the dispatcher every test.
    for (const k of Object.keys(fieldOptionSeeds)) delete fieldOptionSeeds[k]
    applyFieldOptionsMock()
    mockLabels()
    mockCurrentUser('testuser')
    mockFieldConfig([])
  })

  it('renders the owner picker trigger', () => {
    render(<ComponentFilters filter={{}} onFilterChange={onFilterChange} />)
    expect(screen.getByRole('button', { name: /all owners/i })).toBeDefined()
  })

  it('opens the picker and lists owners from /components/meta/owners', async () => {
    render(<ComponentFilters filter={{}} onFilterChange={onFilterChange} />)
    await userEvent.click(screen.getByRole('button', { name: /all owners/i }))
    expect(screen.getByRole('checkbox', { name: 'alice' })).toBeDefined()
    expect(screen.getByRole('checkbox', { name: 'bob' })).toBeDefined()
    expect(screen.getByRole('checkbox', { name: 'carol' })).toBeDefined()
  })

  it('calls onFilterChange with a single-element owner array when one is picked', async () => {
    render(<ComponentFilters filter={{}} onFilterChange={onFilterChange} />)
    await userEvent.click(screen.getByRole('button', { name: /all owners/i }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'bob' }))
    const lastCall = onFilterChange.mock.calls[onFilterChange.mock.calls.length - 1]![0]
    expect(lastCall.owner).toEqual(['bob'])
  })

  it('calls onFilterChange with both picked owners when two checkboxes are checked', async () => {
    function Harness() {
      const [filter, setFilter] = React.useState<{ owner?: string[] }>({})
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
    await userEvent.click(screen.getByRole('button', { name: /all owners/i }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'alice' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'bob' }))
    const lastCall = onFilterChange.mock.calls[onFilterChange.mock.calls.length - 1]![0]
    expect(lastCall.owner).toEqual(['alice', 'bob'])
  })

  it('Clear filters drops owner from the filter', async () => {
    render(
      <ComponentFilters
        filter={{ owner: ['alice'], archived: false }}
        onFilterChange={onFilterChange}
      />,
    )
    await userEvent.click(screen.getByText('Clear filters'))
    expect(onFilterChange).toHaveBeenCalledWith({ archived: false })
    const lastArg = onFilterChange.mock.calls[onFilterChange.mock.calls.length - 1]![0]
    expect(lastArg.owner).toBeUndefined()
  })

  it('shows Clear filters when owner is the only active filter', () => {
    render(
      <ComponentFilters
        filter={{ owner: ['alice'], archived: false }}
        onFilterChange={onFilterChange}
      />,
    )
    expect(screen.getByText('Clear filters')).toBeDefined()
  })
})

describe('ComponentFilters Build System multi-select', () => {
  const onFilterChange = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    // vi.clearAllMocks wipes the per-field useFieldOptions implementation;
    // reset the seed map and re-install the dispatcher every test.
    for (const k of Object.keys(fieldOptionSeeds)) delete fieldOptionSeeds[k]
    applyFieldOptionsMock()
    mockLabels()
    mockCurrentUser('testuser')
    mockFieldConfig(['GRADLE', 'MAVEN'])
  })

  it('renders a Build System picker trigger', () => {
    render(<ComponentFilters filter={{}} onFilterChange={onFilterChange} />)
    expect(screen.getByRole('button', { name: /all build systems/i })).toBeDefined()
  })

  it('opens the picker and lists options sourced from field-config', async () => {
    render(<ComponentFilters filter={{}} onFilterChange={onFilterChange} />)
    await userEvent.click(screen.getByRole('button', { name: /all build systems/i }))
    expect(screen.getByRole('checkbox', { name: 'GRADLE' })).toBeDefined()
    expect(screen.getByRole('checkbox', { name: 'MAVEN' })).toBeDefined()
  })

  it('calls onFilterChange with a single-element buildSystem array when one option is picked', async () => {
    render(<ComponentFilters filter={{}} onFilterChange={onFilterChange} />)
    await userEvent.click(screen.getByRole('button', { name: /all build systems/i }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'GRADLE' }))
    const lastCall = onFilterChange.mock.calls[onFilterChange.mock.calls.length - 1]![0]
    expect(lastCall.buildSystem).toEqual(['GRADLE'])
  })

  it('calls onFilterChange with both picked build systems when two checkboxes are checked', async () => {
    // Stateful wrapper — the picker is controlled by filter.buildSystem, so we
    // must persist updates between clicks for the second selection to extend
    // the first instead of replacing it.
    function Harness() {
      const [filter, setFilter] = React.useState<{ buildSystem?: string[] }>({})
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
    await userEvent.click(screen.getByRole('button', { name: /all build systems/i }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'GRADLE' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'MAVEN' }))
    const lastCall = onFilterChange.mock.calls[onFilterChange.mock.calls.length - 1]![0]
    expect(lastCall.buildSystem).toEqual(['GRADLE', 'MAVEN'])
  })

  it('Clear filters drops buildSystem from the filter', async () => {
    render(
      <ComponentFilters
        filter={{ buildSystem: ['GRADLE'], archived: false }}
        onFilterChange={onFilterChange}
      />,
    )
    await userEvent.click(screen.getByText('Clear filters'))
    expect(onFilterChange).toHaveBeenCalledWith({ archived: false })
    const lastArg = onFilterChange.mock.calls[onFilterChange.mock.calls.length - 1]![0]
    expect(lastArg.buildSystem).toBeUndefined()
  })

  it('shows Clear filters when buildSystem is the only active filter', () => {
    render(
      <ComponentFilters
        filter={{ buildSystem: ['GRADLE'], archived: false }}
        onFilterChange={onFilterChange}
      />,
    )
    expect(screen.getByText('Clear filters')).toBeDefined()
  })

  it('shows "No build systems available" when field-config has no options', async () => {
    mockFieldConfig([])
    render(<ComponentFilters filter={{}} onFilterChange={onFilterChange} />)
    await userEvent.click(screen.getByRole('button', { name: /all build systems/i }))
    expect(screen.getByText('No build systems available')).toBeDefined()
    expect(screen.queryByRole('checkbox', { name: 'GRADLE' })).toBeNull()
  })

  it('renders build system options from the meta-endpoint fallback when admin field-config is empty', async () => {
    // Simulate the production scenario the fix targets: admin has not seeded
    // any explicit options, but useFieldOptions consults
    // /components/meta/build-systems and returns the CRS enum. The dropdown
    // must surface those options regardless of admin field-config state.
    mockFieldOptions('buildSystem', ['GRADLE', 'MAVEN'])
    render(<ComponentFilters filter={{}} onFilterChange={onFilterChange} />)
    await userEvent.click(screen.getByRole('button', { name: /all build systems/i }))
    expect(screen.getByRole('checkbox', { name: 'GRADLE' })).toBeDefined()
    expect(screen.getByRole('checkbox', { name: 'MAVEN' })).toBeDefined()
  })

  it('does NOT render the Build System control when admin field-config marks it filterable: false', () => {
    // `filterable` is the list-page opt-out knob. Distinct from
    // `visibility`, which only describes editor-form behavior — admins
    // may want one without the other.
    mockFieldConfig(['GRADLE', 'MAVEN'], { filterable: false })
    render(<ComponentFilters filter={{}} onFilterChange={onFilterChange} />)
    expect(screen.queryByRole('button', { name: /all build systems/i })).toBeNull()
  })

  it('renders the Build System control when filterable is undefined (default true)', () => {
    // Regression guard: the default semantic is "show the filter".
    // Only an explicit filterable: false hides it. If the default ever
    // flips silently, this case turns red.
    mockFieldConfig(['GRADLE', 'MAVEN']) // no entry overrides — filterable is undefined
    render(<ComponentFilters filter={{}} onFilterChange={onFilterChange} />)
    expect(screen.getByRole('button', { name: /all build systems/i })).toBeDefined()
  })

  it('renders the Build System control even when visibility=hidden (visibility is form-only)', () => {
    // visibility is form-level; it must NOT govern the filter bar. This
    // case explicitly pins that contract — flip-side of the filterable
    // case above.
    mockFieldConfig(['GRADLE', 'MAVEN'], { visibility: 'hidden' })
    render(<ComponentFilters filter={{}} onFilterChange={onFilterChange} />)
    expect(screen.getByRole('button', { name: /all build systems/i })).toBeDefined()
  })
})

describe('ComponentFilters labels multi-select', () => {
  const onFilterChange = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    // vi.clearAllMocks wipes the per-field useFieldOptions implementation;
    // reset the seed map and re-install the dispatcher every test.
    for (const k of Object.keys(fieldOptionSeeds)) delete fieldOptionSeeds[k]
    applyFieldOptionsMock()
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

  it('ArrowDown walks the search-filtered subset (skips hidden options)', async () => {
    // The picker's `filtered` list is what the user actually sees, so the
    // ArrowDown handler must derive next/prev from `filtered`, not from
    // the underlying `options`. With vocabulary [apple, banana, apricot]
    // and search "ap", the visible list narrows to [apple, apricot] —
    // ArrowDown from apple must jump to apricot (the next visible row),
    // NOT to banana (which is no longer rendered). The previous
    // index-keyed refs implementation would have routed to banana's
    // stale slot.
    mockLabels(['apple', 'banana', 'apricot'])
    render(<ComponentFilters filter={{}} onFilterChange={onFilterChange} />)
    await userEvent.click(screen.getByRole('button', { name: /all labels/i }))

    const searchInput = screen.getByPlaceholderText('Search labels...')
    await userEvent.type(searchInput, 'ap')

    const apple = screen.getByRole('checkbox', { name: 'apple' }) as HTMLInputElement
    const apricot = screen.getByRole('checkbox', { name: 'apricot' }) as HTMLInputElement
    // banana does not contain 'ap' — filtered out entirely.
    expect(screen.queryByRole('checkbox', { name: 'banana' })).toBeNull()

    apple.focus()
    expect(document.activeElement).toBe(apple)

    await userEvent.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(apricot)
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

describe('ComponentFilters System multi-select', () => {
  const onFilterChange = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    for (const k of Object.keys(fieldOptionSeeds)) delete fieldOptionSeeds[k]
    applyFieldOptionsMock()
    mockLabels()
    mockCurrentUser('testuser')
    // Seed the system field with ALFA/BRAVO/CHARLIE so the picker has
    // a deterministic vocabulary to drive interactions. The fieldPath
    // is 'component.system' (sectioned) to match the production code.
    mockFieldOptions('component.system', ['ALFA', 'BRAVO', 'CHARLIE'])
  })

  it('renders a System picker trigger', () => {
    render(<ComponentFilters filter={{}} onFilterChange={onFilterChange} />)
    expect(screen.getByRole('button', { name: /all systems/i })).toBeDefined()
  })

  it('opens the picker and lists options sourced from useFieldOptions', async () => {
    render(<ComponentFilters filter={{}} onFilterChange={onFilterChange} />)
    await userEvent.click(screen.getByRole('button', { name: /all systems/i }))
    expect(screen.getByRole('checkbox', { name: 'ALFA' })).toBeDefined()
    expect(screen.getByRole('checkbox', { name: 'BRAVO' })).toBeDefined()
    expect(screen.getByRole('checkbox', { name: 'CHARLIE' })).toBeDefined()
  })

  it('calls onFilterChange with a single-element system array when one option is picked', async () => {
    render(<ComponentFilters filter={{}} onFilterChange={onFilterChange} />)
    await userEvent.click(screen.getByRole('button', { name: /all systems/i }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'ALFA' }))
    const lastCall = onFilterChange.mock.calls[onFilterChange.mock.calls.length - 1]![0]
    expect(lastCall.system).toEqual(['ALFA'])
  })

  it('calls onFilterChange with both picked systems when two checkboxes are checked', async () => {
    // Stateful wrapper so the picker's controlled state persists across clicks.
    function Harness() {
      const [filter, setFilter] = React.useState<{ system?: string[] }>({})
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
    await userEvent.click(screen.getByRole('button', { name: /all systems/i }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'ALFA' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'BRAVO' }))
    const lastCall = onFilterChange.mock.calls[onFilterChange.mock.calls.length - 1]![0]
    expect(lastCall.system).toEqual(['ALFA', 'BRAVO'])
  })

  it('Clear filters drops system from the filter', async () => {
    render(
      <ComponentFilters
        filter={{ system: ['ALFA'], archived: false }}
        onFilterChange={onFilterChange}
      />,
    )
    await userEvent.click(screen.getByText('Clear filters'))
    expect(onFilterChange).toHaveBeenCalledWith({ archived: false })
    const lastArg = onFilterChange.mock.calls[onFilterChange.mock.calls.length - 1]![0]
    expect(lastArg.system).toBeUndefined()
  })

  it('shows Clear filters when system is the only active filter', () => {
    render(
      <ComponentFilters
        filter={{ system: ['ALFA'], archived: false }}
        onFilterChange={onFilterChange}
      />,
    )
    expect(screen.getByText('Clear filters')).toBeDefined()
  })

  it('does NOT render the System control when admin field-config marks it filterable: false', () => {
    mockFieldConfig(['ALFA', 'BRAVO'], { filterable: false }, 'system')
    render(<ComponentFilters filter={{}} onFilterChange={onFilterChange} />)
    expect(screen.queryByRole('button', { name: /all systems/i })).toBeNull()
  })

  it('renders the System control when filterable is undefined (default true)', () => {
    // Regression guard mirroring the buildSystem case — the default
    // semantic is "show the filter"; only explicit filterable: false hides.
    mockFieldConfig(['ALFA', 'BRAVO'], {}, 'system')
    render(<ComponentFilters filter={{}} onFilterChange={onFilterChange} />)
    expect(screen.getByRole('button', { name: /all systems/i })).toBeDefined()
  })

  it('renders the System control even when visibility=hidden (visibility is form-only)', () => {
    mockFieldConfig(['ALFA', 'BRAVO'], { visibility: 'hidden' }, 'system')
    render(<ComponentFilters filter={{}} onFilterChange={onFilterChange} />)
    expect(screen.getByRole('button', { name: /all systems/i })).toBeDefined()
  })

  it('reads filterable from the sectioned {component:{system}} field-config shape (CRS PR #301)', () => {
    // Locks in the cross-surface field-config path contract: GeneralTab,
    // ComponentDetailPage, and the filter bar all resolve "system" via
    // the sectioned path component.system (singular per CRS PR #301).
    // Writing the sectioned shape directly (bypassing the helper)
    // protects against a regression where someone "fixes" the filter to
    // look up a flat key — admin edits would silently stop applying to
    // one surface but not the other.
    mockUseFieldConfig.mockReturnValue({
      data: { component: { system: { filterable: false } } },
      isLoading: false,
    } as unknown as ReturnType<typeof useFieldConfig>)
    render(<ComponentFilters filter={{}} onFilterChange={onFilterChange} />)
    expect(screen.queryByRole('button', { name: /all systems/i })).toBeNull()
  })
})

describe('ComponentFilters extended search (items 5 / 10)', () => {
  const onFilterChange = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    for (const k of Object.keys(fieldOptionSeeds)) delete fieldOptionSeeds[k]
    applyFieldOptionsMock()
    mockLabels()
    mockCurrentUser('testuser')
    mockFieldConfig([])
  })

  it('renders an "Extended search" toggle button', () => {
    render(<ComponentFilters filter={{ archived: false }} onFilterChange={onFilterChange} />)
    expect(screen.getByRole('button', { name: /extended search/i })).toBeDefined()
  })

  it('extended controls are hidden until the toggle is clicked', async () => {
    render(<ComponentFilters filter={{ archived: false }} onFilterChange={onFilterChange} />)
    // Collapsed by default — no extended control in the DOM.
    expect(screen.queryByLabelText('Client code')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: /extended search/i }))
    // Default field-config has no `searchable` entries, so each new field
    // falls back to DEFAULT_SEARCHABILITY = 'Extended' and shows in the row.
    expect(screen.getByLabelText('Client code')).toBeDefined()
    expect(screen.getByLabelText('Jira project key')).toBeDefined()
    expect(screen.getByLabelText('VCS path')).toBeDefined()
    expect(screen.getByLabelText('Production branch')).toBeDefined()
    expect(screen.getByLabelText('Parent component')).toBeDefined()
    expect(screen.getByLabelText('Group key')).toBeDefined()
    expect(screen.getByLabelText('Solution')).toBeDefined()
    expect(screen.getByLabelText('Jira technical')).toBeDefined()
    expect(screen.getByLabelText('Can be parent')).toBeDefined()
  })

  it('typing in an extended text filter calls onFilterChange after debounce', () => {
    vi.useFakeTimers()
    // Preset clientCode so extended search auto-opens (no toggle click needed,
    // which keeps fake timers and userEvent from interfering).
    render(
      <ComponentFilters
        filter={{ archived: false, clientCode: 'X' }}
        onFilterChange={onFilterChange}
      />,
    )
    const input = screen.getByLabelText('Client code')
    fireEvent.change(input, { target: { value: 'ACME' } })
    expect(onFilterChange).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(300) })
    expect(onFilterChange).toHaveBeenCalledWith(
      expect.objectContaining({ clientCode: 'ACME' }),
    )
    vi.useRealTimers()
  })

  it('selecting "Yes" on the Can-be-parent tri-state emits canBeParent: true', async () => {
    render(<ComponentFilters filter={{ archived: false }} onFilterChange={onFilterChange} />)
    await userEvent.click(screen.getByRole('button', { name: /extended search/i }))
    const select = screen.getByLabelText('Can be parent')
    fireEvent.change(select, { target: { value: 'true' } })
    expect(onFilterChange).toHaveBeenCalledWith(
      expect.objectContaining({ canBeParent: true }),
    )
  })

  it('selecting "Any" on a tri-state clears the boolean back to undefined', async () => {
    render(
      <ComponentFilters
        filter={{ archived: false, jiraTechnical: true }}
        onFilterChange={onFilterChange}
      />,
    )
    // jiraTechnical preset → row auto-opens.
    const select = screen.getByLabelText('Jira technical')
    fireEvent.change(select, { target: { value: '' } })
    const lastArg = onFilterChange.mock.calls[onFilterChange.mock.calls.length - 1]![0]
    expect(lastArg.jiraTechnical).toBeUndefined()
  })

  it('hides an extended control whose field is configured searchable: None', async () => {
    mockUseFieldConfig.mockReturnValue({
      data: { component: { clientCode: { searchable: 'None' } } },
      isLoading: false,
    } as unknown as ReturnType<typeof useFieldConfig>)
    render(<ComponentFilters filter={{ archived: false }} onFilterChange={onFilterChange} />)
    await userEvent.click(screen.getByRole('button', { name: /extended search/i }))
    expect(screen.queryByLabelText('Client code')).toBeNull()
    // A sibling extended field with no override still shows.
    expect(screen.getByLabelText('Jira project key')).toBeDefined()
  })

  it('auto-opens extended search when an extended filter is already active', () => {
    render(
      <ComponentFilters
        filter={{ archived: false, vcsPath: 'repo/x' }}
        onFilterChange={onFilterChange}
      />,
    )
    // No click — vcsPath being set forces the row open so a shared URL does
    // not hide its own active filter.
    expect(screen.getByLabelText('VCS path')).toBeDefined()
  })

  it('counts an active extended filter toward Clear filters and clears it', async () => {
    render(
      <ComponentFilters
        filter={{ archived: false, groupKey: 'org.acme' }}
        onFilterChange={onFilterChange}
      />,
    )
    expect(screen.getByText('Clear filters')).toBeDefined()
    await userEvent.click(screen.getByText('Clear filters'))
    expect(onFilterChange).toHaveBeenCalledWith({ archived: false })
  })

  it('renders a searchable:Main extended field in the always-visible bar (no toggle needed)', () => {
    mockUseFieldConfig.mockReturnValue({
      data: { component: { clientCode: { searchable: 'Main' } } },
      isLoading: false,
    } as unknown as ReturnType<typeof useFieldConfig>)
    render(<ComponentFilters filter={{ archived: false }} onFilterChange={onFilterChange} />)
    // Promoted to Main → visible without opening the Extended search panel.
    expect(screen.getByLabelText('Client code')).toBeDefined()
    // The toggle still exists for the remaining Extended-placed fields.
    expect(screen.getByRole('button', { name: /extended search/i })).toBeDefined()
  })

  it('owner searchable:None hides the owner picker AND the My Components shortcut', () => {
    mockUseFieldConfig.mockReturnValue({
      data: { component: { componentOwner: { searchable: 'None' } } },
      isLoading: false,
    } as unknown as ReturnType<typeof useFieldConfig>)
    render(<ComponentFilters filter={{ archived: false }} onFilterChange={onFilterChange} />)
    expect(screen.queryByRole('button', { name: /all owners/i })).toBeNull()
    expect(screen.queryByLabelText('My Components')).toBeNull()
    // A sibling classic filter with no override still renders (default Main).
    expect(screen.getByRole('button', { name: /all systems/i })).toBeDefined()
  })

  it('a classic filter set searchable:Extended moves into the toggle-gated row', async () => {
    mockUseFieldConfig.mockReturnValue({
      data: { component: { system: { searchable: 'Extended' } } },
      isLoading: false,
    } as unknown as ReturnType<typeof useFieldConfig>)
    render(<ComponentFilters filter={{ archived: false }} onFilterChange={onFilterChange} />)
    // System is no longer in the always-visible bar...
    expect(screen.queryByRole('button', { name: /all systems/i })).toBeNull()
    // ...it appears once Extended search is opened.
    await userEvent.click(screen.getByRole('button', { name: /extended search/i }))
    expect(screen.getByRole('button', { name: /all systems/i })).toBeDefined()
  })

  it('labels searchable:None hides the labels filter entirely', () => {
    mockUseFieldConfig.mockReturnValue({
      data: { component: { labels: { searchable: 'None' } } },
      isLoading: false,
    } as unknown as ReturnType<typeof useFieldConfig>)
    render(<ComponentFilters filter={{ archived: false }} onFilterChange={onFilterChange} />)
    expect(screen.queryByRole('button', { name: /all labels/i })).toBeNull()
  })

  it('owner searchable:Extended moves BOTH the owner picker and My Components into the toggle row', async () => {
    mockUseFieldConfig.mockReturnValue({
      data: { component: { componentOwner: { searchable: 'Extended' } } },
      isLoading: false,
    } as unknown as ReturnType<typeof useFieldConfig>)
    render(<ComponentFilters filter={{ archived: false }} onFilterChange={onFilterChange} />)
    // Collapsed: neither the owner picker nor the My Components shortcut sits in
    // the always-visible bar — My Components follows the owner field's placement.
    expect(screen.queryByRole('button', { name: /all owners/i })).toBeNull()
    expect(screen.queryByLabelText('My Components')).toBeNull()
    // Opening Extended search reveals both together.
    await userEvent.click(screen.getByRole('button', { name: /extended search/i }))
    expect(screen.getByRole('button', { name: /all owners/i })).toBeDefined()
    expect(screen.getByLabelText('My Components')).toBeDefined()
  })
})
