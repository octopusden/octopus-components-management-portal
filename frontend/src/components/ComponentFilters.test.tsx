import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, within, waitFor } from '@testing-library/react'
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

// Stub the four in-use meta hooks (SYS-046) backing the extended-search
// multi-selects. Default to an empty vocabulary; `metaState` is hoisted so the
// vi.mock factories can read it, and a test can seed options for a pick
// interaction by assigning to it. Plain factories (not vi.fn) so they survive
// the per-describe vi.clearAllMocks() without needing re-installation.
const metaState = vi.hoisted(() => ({
  clientCodes: [] as string[],
  jiraProjectKeys: [] as string[],
  parentComponentNames: [] as string[],
  groupKeys: [] as string[],
}))
vi.mock('../hooks/useClientCodes', () => ({
  useClientCodes: () => ({ data: metaState.clientCodes, isLoading: false }),
}))
vi.mock('../hooks/useJiraProjectKeys', () => ({
  useJiraProjectKeys: () => ({ data: metaState.jiraProjectKeys, isLoading: false }),
}))
vi.mock('../hooks/useParentComponentNames', () => ({
  useParentComponentNames: () => ({ data: metaState.parentComponentNames, isLoading: false }),
}))
vi.mock('../hooks/useGroupKeys', () => ({
  useGroupKeys: () => ({ data: metaState.groupKeys, isLoading: false }),
}))

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
    expect(screen.getByPlaceholderText('Filter by key or name…')).toBeDefined()
  })

  it('calls onFilterChange with search after debounce', async () => {
    vi.useFakeTimers()

    render(<ComponentFilters filter={{}} onFilterChange={onFilterChange} />)

    const input = screen.getByPlaceholderText('Filter by key or name…')
    fireEvent.change(input, { target: { value: 'mycomp' } })

    expect(onFilterChange).not.toHaveBeenCalled()

    act(() => { vi.advanceTimersByTime(300) })

    expect(onFilterChange).toHaveBeenCalledWith({ search: 'mycomp' })

    vi.useRealTimers()
  })

  // "Clear filters" / "Clear all" moved to the active-filter chips row at the
  // page level (spec §1.2 / ActiveFilterChips.test.tsx); ComponentFilters no
  // longer owns a clear-all control.
})

// The archived toggle button and the "My Components" switch were removed from
// ComponentFilters in the list redesign (spec §1.1/1.3): archived is now the
// "Archived" preset and My Components is the "My Components" preset, both on the
// preset bar (covered by ListPresetBar.test.tsx + ComponentListPage.test.tsx).
// The owner field-config placement is still exercised below.

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

/** Opens "+ Filter" and the named dimension's editor; returns the panel. */
async function openFilter(label: string) {
  await userEvent.click(screen.getByRole('button', { name: /^Add filter/ }))
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: label }))
  return within(screen.getByRole('group', { name: label }))
}

/** Picks Any / Yes / No on a tri-state editor (a segmented radio group) in the open panel. */
async function pickTriState(label: string, option: 'Any' | 'Yes' | 'No') {
  await userEvent.click(within(screen.getByRole('radiogroup', { name: label })).getByRole('radio', { name: option }))
}

const EXTENDED_LABELS = [
  'Client code', 'Jira project key', 'Java version', 'VCS path', 'Production branch', 'Parent component',
  'Group key', 'Solution', 'Jira technical', 'Can be parent', 'Distribution explicit', 'Distribution external',
]

describe('ComponentFilters "+ Filter" panel (extended dimensions)', () => {
  const onFilterChange = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    for (const k of Object.keys(fieldOptionSeeds)) delete fieldOptionSeeds[k]
    applyFieldOptionsMock()
    mockLabels()
    mockCurrentUser('testuser')
    mockFieldConfig([])
  })

  it('renders an "Add filter" button and no extended control in the bar', () => {
    render(<ComponentFilters filter={{ archived: false }} onFilterChange={onFilterChange} />)
    expect(screen.getByRole('button', { name: /^Add filter/ })).toBeDefined()
    for (const label of EXTENDED_LABELS) expect(screen.queryByLabelText(label)).toBeNull()
  })

  it('lists every Extended dimension, grouped by topic', async () => {
    render(<ComponentFilters filter={{ archived: false }} onFilterChange={onFilterChange} />)
    await userEvent.click(screen.getByRole('button', { name: /^Add filter/ }))
    const menu = screen.getByRole('dialog')
    // Default field-config has no `searchable` entries, so each extended field
    // falls back to DEFAULT_SEARCHABILITY = 'Extended' and is listed here.
    for (const label of EXTENDED_LABELS) expect(within(menu).getByRole('button', { name: label })).toBeDefined()
    expect(within(within(menu).getByRole('group', { name: 'Jira' })).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
      'Jira project key',
      'Jira technical',
    ])
  })

  it('an extended filter that holds a value never grows the bar: the button counts it and the list shows it', async () => {
    render(
      <ComponentFilters
        filter={{ archived: false, jiraProjectKey: ['ANCS', 'ANSROLE'], vcsPath: 'payments' }}
        onFilterChange={onFilterChange}
      />,
    )
    expect(screen.queryByLabelText('Jira project key')).toBeNull()
    expect(screen.getByRole('button', { name: /^Add filter/ }).textContent).toContain('2')
    await userEvent.click(screen.getByRole('button', { name: /^Add filter/ }))
    const menu = screen.getByRole('dialog')
    expect(within(menu).getByRole('button', { name: 'Jira project key' }).textContent).toContain('2 selected')
    expect(within(menu).getByRole('button', { name: 'VCS path' }).textContent).toContain('payments')
  })

  it('the editor has a way back to the list', async () => {
    render(<ComponentFilters filter={{ archived: false }} onFilterChange={onFilterChange} />)
    const panel = await openFilter('Solution')
    await userEvent.click(panel.getByRole('button', { name: 'Solution' }))
    expect(within(screen.getByRole('dialog')).getByRole('group', { name: 'Jira' })).toBeDefined()
  })

  it('typing in an extended text filter calls onFilterChange after debounce', async () => {
    render(<ComponentFilters filter={{ archived: false }} onFilterChange={onFilterChange} />)
    const panel = await openFilter('VCS path')
    fireEvent.change(panel.getByLabelText('VCS path'), { target: { value: 'repo/acme' } })
    expect(onFilterChange).not.toHaveBeenCalled()
    await waitFor(() =>
      expect(onFilterChange).toHaveBeenCalledWith(expect.objectContaining({ vcsPath: 'repo/acme' })),
    )
  })

  it('selecting a Java version emits a javaVersion filter (extended, multi-value, inline list)', async () => {
    mockFieldOptions('build.javaVersion', ['17', '21'])
    render(<ComponentFilters filter={{ archived: false }} onFilterChange={onFilterChange} />)
    const panel = await openFilter('Java version')
    await userEvent.click(panel.getByRole('checkbox', { name: '17' }))
    const lastCall = onFilterChange.mock.calls[onFilterChange.mock.calls.length - 1]![0]
    expect(lastCall.javaVersion).toEqual(['17'])
  })

  it('selecting "Yes" on the Can-be-parent tri-state emits canBeParent: true', async () => {
    render(<ComponentFilters filter={{ archived: false }} onFilterChange={onFilterChange} />)
    await openFilter('Can be parent')
    await pickTriState('Can be parent', 'Yes')
    expect(onFilterChange).toHaveBeenCalledWith(expect.objectContaining({ canBeParent: true }))
  })

  it('selecting "No" on the Can-be-parent tri-state emits canBeParent: false', async () => {
    // The false branch is the easy-to-miss case: an empty result on a `false`
    // selection previously read as a phantom bug, so pin it explicitly.
    render(<ComponentFilters filter={{ archived: false }} onFilterChange={onFilterChange} />)
    await openFilter('Can be parent')
    await pickTriState('Can be parent', 'No')
    expect(onFilterChange).toHaveBeenCalledWith(expect.objectContaining({ canBeParent: false }))
  })

  it('selecting "Any" on a tri-state clears the boolean back to undefined', async () => {
    render(<ComponentFilters filter={{ archived: false, canBeParent: true }} onFilterChange={onFilterChange} />)
    await openFilter('Can be parent')
    expect(within(screen.getByRole('radiogroup', { name: 'Can be parent' })).getByRole('radio', { name: 'Yes' }).getAttribute('aria-checked')).toBe('true')
    await pickTriState('Can be parent', 'Any')
    const lastArg = onFilterChange.mock.calls[onFilterChange.mock.calls.length - 1]![0]
    expect(lastArg.canBeParent).toBeUndefined()
  })

  it('does not offer an extended dimension configured searchable: None', async () => {
    mockUseFieldConfig.mockReturnValue({
      data: { component: { clientCode: { searchable: 'None' } } },
      isLoading: false,
    } as unknown as ReturnType<typeof useFieldConfig>)
    render(<ComponentFilters filter={{ archived: false }} onFilterChange={onFilterChange} />)
    await userEvent.click(screen.getByRole('button', { name: /^Add filter/ }))
    const menu = screen.getByRole('dialog')
    expect(within(menu).queryByRole('button', { name: 'Client code' })).toBeNull()
    expect(within(menu).getByRole('button', { name: 'Jira project key' })).toBeDefined()
  })

  it('renders a searchable:Main extended field in the bar with its label', () => {
    mockUseFieldConfig.mockReturnValue({
      data: { component: { clientCode: { searchable: 'Main' } } },
      isLoading: false,
    } as unknown as ReturnType<typeof useFieldConfig>)
    render(<ComponentFilters filter={{ archived: false }} onFilterChange={onFilterChange} />)
    expect(screen.getByLabelText('Client code')).toBeDefined()
    // "+ Filter" still exists for the remaining Extended-placed fields.
    expect(screen.getByRole('button', { name: /^Add filter/ })).toBeDefined()
  })

  it('owner searchable:None hides the owner picker', () => {
    mockUseFieldConfig.mockReturnValue({
      data: { component: { componentOwner: { searchable: 'None' } } },
      isLoading: false,
    } as unknown as ReturnType<typeof useFieldConfig>)
    render(<ComponentFilters filter={{ archived: false }} onFilterChange={onFilterChange} />)
    expect(screen.queryByRole('button', { name: /all owners/i })).toBeNull()
    expect(screen.getByRole('button', { name: /all systems/i })).toBeDefined()
  })

  it('a classic filter set searchable:Extended moves into "+ Filter"', async () => {
    mockUseFieldConfig.mockReturnValue({
      data: { component: { system: { searchable: 'Extended' } } },
      isLoading: false,
    } as unknown as ReturnType<typeof useFieldConfig>)
    render(<ComponentFilters filter={{ archived: false }} onFilterChange={onFilterChange} />)
    expect(screen.queryByRole('button', { name: /all systems/i })).toBeNull()
    const panel = await openFilter('System')
    expect(panel.getByPlaceholderText(/search systems/i)).toBeDefined()
  })

  it('labels searchable:None hides the labels filter entirely', () => {
    mockUseFieldConfig.mockReturnValue({
      data: { component: { labels: { searchable: 'None' } } },
      isLoading: false,
    } as unknown as ReturnType<typeof useFieldConfig>)
    render(<ComponentFilters filter={{ archived: false }} onFilterChange={onFilterChange} />)
    expect(screen.queryByRole('button', { name: /all labels/i })).toBeNull()
  })

  it('owner searchable:Extended moves the owner picker into "+ Filter"', async () => {
    mockUseFieldConfig.mockReturnValue({
      data: { component: { componentOwner: { searchable: 'Extended' } } },
      isLoading: false,
    } as unknown as ReturnType<typeof useFieldConfig>)
    render(<ComponentFilters filter={{ archived: false }} onFilterChange={onFilterChange} />)
    expect(screen.queryByRole('button', { name: /all owners/i })).toBeNull()
    const panel = await openFilter('Owner')
    expect(panel.getByPlaceholderText(/search owners/i)).toBeDefined()
  })
})

describe('ComponentFilters multi-value extended filters + distribution (SYS-045/046)', () => {
  const onFilterChange = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    for (const k of Object.keys(fieldOptionSeeds)) delete fieldOptionSeeds[k]
    applyFieldOptionsMock()
    mockLabels()
    mockCurrentUser('testuser')
    mockFieldConfig([])
    metaState.clientCodes = []
    metaState.jiraProjectKeys = []
    metaState.parentComponentNames = []
    metaState.groupKeys = []
  })

  it('picking a client code emits a single-element clientCode array', async () => {
    metaState.clientCodes = ['ACME-PORTAL', 'OTHER-CC']
    render(<ComponentFilters filter={{ archived: false }} onFilterChange={onFilterChange} />)
    const panel = await openFilter('Client code')
    await userEvent.click(panel.getByRole('checkbox', { name: 'ACME-PORTAL' }))
    const lastCall = onFilterChange.mock.calls[onFilterChange.mock.calls.length - 1]![0]
    expect(lastCall.clientCode).toEqual(['ACME-PORTAL'])
  })

  it('the inline client-code list shows the current selection checked', async () => {
    metaState.groupKeys = ['org.acme', 'org.other']
    render(<ComponentFilters filter={{ archived: false, groupKey: ['org.acme'] }} onFilterChange={onFilterChange} />)
    const panel = await openFilter('Group key')
    expect((panel.getByRole('checkbox', { name: 'org.acme' }) as HTMLInputElement).checked).toBe(true)
    expect((panel.getByRole('checkbox', { name: 'org.other' }) as HTMLInputElement).checked).toBe(false)
  })

  it('selecting "Yes" on the Distribution explicit tri-state emits distributionExplicit: true', async () => {
    render(<ComponentFilters filter={{ archived: false }} onFilterChange={onFilterChange} />)
    await openFilter('Distribution explicit')
    await pickTriState('Distribution explicit', 'Yes')
    expect(onFilterChange).toHaveBeenCalledWith(expect.objectContaining({ distributionExplicit: true }))
  })

  it('selecting "No" on the Distribution external tri-state emits distributionExternal: false', async () => {
    render(<ComponentFilters filter={{ archived: false }} onFilterChange={onFilterChange} />)
    await openFilter('Distribution external')
    await pickTriState('Distribution external', 'No')
    expect(onFilterChange).toHaveBeenCalledWith(expect.objectContaining({ distributionExternal: false }))
  })
})

// The "with validation problems" SWITCH moved to the preset bar (the "With
// problems" preset; see ListPresetBar.test.tsx + ComponentListPage.test.tsx).
// ComponentFilters keeps only the problems-only DIMMING + hint, driven by the
// `problemsOnly` prop the page passes when that preset is active.
describe('ComponentFilters — problems-only dimming + hint', () => {
  const onFilterChange = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    for (const k of Object.keys(fieldOptionSeeds)) delete fieldOptionSeeds[k]
    applyFieldOptionsMock()
    mockLabels()
    mockCurrentUser('testuser')
    mockFieldConfig([])
  })

  it('no longer renders an in-bar "with validation problems" switch', () => {
    render(
      <ComponentFilters filter={{ archived: false }} onFilterChange={onFilterChange} problemsOnly />,
    )
    expect(screen.queryByLabelText('with validation problems')).toBeNull()
  })

  it('leaves the CRS filter group enabled when problemsOnly is off', () => {
    render(
      <ComponentFilters
        filter={{ archived: false }}
        onFilterChange={onFilterChange}
        problemsOnly={false}
      />,
    )
    const group = screen.getByTestId('crs-filter-controls')
    expect(group.className).not.toContain('pointer-events-none')
    expect(group.getAttribute('aria-disabled')).toBeNull()
    expect(screen.queryByText(/don.t apply in the .With problems. preset/i)).toBeNull()
  })

  it('dims + disables the CRS filter group and shows a hint when problemsOnly is on', () => {
    render(
      <ComponentFilters filter={{ archived: false }} onFilterChange={onFilterChange} problemsOnly />,
    )
    const group = screen.getByTestId('crs-filter-controls')
    expect(group.className).toContain('opacity-50')
    expect(group.className).toContain('pointer-events-none')
    expect(group.getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByText(/don.t apply in the .With problems. preset/i)).toBeDefined()
  })

  it('shows the found-count beside the hint when problemsCount is given (plural)', () => {
    render(
      <ComponentFilters
        filter={{ archived: false }}
        onFilterChange={onFilterChange}
        problemsOnly
        problemsCount={3}
      />,
    )
    // The count and the existing hint share one line.
    expect(screen.getByText(/3 components with validation problems/i)).toBeDefined()
    expect(screen.getByText(/don.t apply in the .With problems. preset/i)).toBeDefined()
  })

  it('uses the singular noun (no plural "s") when problemsCount is 1', () => {
    render(
      <ComponentFilters
        filter={{ archived: false }}
        onFilterChange={onFilterChange}
        problemsOnly
        problemsCount={1}
      />,
    )
    expect(screen.getByText(/1 component with validation problems/i)).toBeDefined()
    // Guard against the plural form leaking in for the singular case.
    expect(screen.queryByText(/1 components with validation problems/i)).toBeNull()
  })

  it('omits the count while the report is still loading (problemsCount undefined)', () => {
    render(
      <ComponentFilters filter={{ archived: false }} onFilterChange={onFilterChange} problemsOnly />,
    )
    // Hint shows, but no found-count yet.
    expect(screen.getByText(/don.t apply in the .With problems. preset/i)).toBeDefined()
    expect(screen.queryByText(/with validation problems\./i)).toBeNull()
  })
})
