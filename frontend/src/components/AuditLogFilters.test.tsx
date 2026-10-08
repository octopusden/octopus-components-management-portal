import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuditLogFilters, type AuditFilter } from './AuditLogFilters'

// Same Radix-Select polyfill rationale as ComponentFilters tests — Radix
// internals call hasPointerCapture/scrollIntoView during transitions and
// jsdom doesn't ship those.

// The bar: "Changed by" text, Action select, Period button (From / To inside), "+ Filter"
// (Source, Entity type, Jira task key, Comment) and the "Show migration" switch. Active values
// show as chips under the bar, with "Clear all".
const changedBy = () => screen.getByRole('textbox', { name: 'Changed by' }) as HTMLInputElement

/** Opens "+ Filter" and picks [item] — its editor replaces the list. fireEvent, so fake timers work. */
function openExtra(item: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Add filter' }))
  fireEvent.click(screen.getByRole('button', { name: item }))
}

function openPeriod() {
  fireEvent.click(screen.getByRole('button', { name: 'Period' }))
}

const clearAll = () => screen.getByRole('button', { name: /clear all/i })

describe('AuditLogFilters (B7.1.3)', () => {
  const onChange = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('debounces changedBy text input through onChange', () => {
    vi.useFakeTimers()

    render(<AuditLogFilters filter={{}} onChange={onChange} />)

    fireEvent.change(changedBy(), { target: { value: 'alice' } })

    // Same 300ms debounce convention as ComponentFilters — saves a fetch
    // round-trip on every keystroke without changing the user-perceived
    // responsiveness.
    expect(onChange).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(300) })
    expect(onChange).toHaveBeenCalledWith({ changedBy: 'alice' })
  })

  it('blanks changedBy → undefined (clear) on debounce', () => {
    vi.useFakeTimers()
    render(<AuditLogFilters filter={{ changedBy: 'alice' }} onChange={onChange} />)

    fireEvent.change(changedBy(), { target: { value: '' } })
    act(() => { vi.advanceTimersByTime(300) })

    expect(onChange).toHaveBeenCalledWith({ changedBy: undefined })
  })

  it('debounces jiraTaskKey text input through onChange (trimmed)', () => {
    vi.useFakeTimers()
    render(<AuditLogFilters filter={{}} onChange={onChange} />)

    openExtra('Jira task key')
    fireEvent.change(screen.getByRole('textbox', { name: 'Jira task key' }), { target: { value: '  ABC-123 ' } })

    expect(onChange).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(300) })
    expect(onChange).toHaveBeenCalledWith({ jiraTaskKey: 'ABC-123' })
  })

  it('blanks jiraTaskKey → undefined (clear) on debounce', () => {
    vi.useFakeTimers()
    render(<AuditLogFilters filter={{ jiraTaskKey: 'ABC-123' }} onChange={onChange} />)

    openExtra('Jira task key')
    fireEvent.change(screen.getByRole('textbox', { name: 'Jira task key' }), { target: { value: '   ' } })
    act(() => { vi.advanceTimersByTime(300) })

    expect(onChange).toHaveBeenCalledWith({ jiraTaskKey: undefined })
  })

  it('a pending text debounce survives closing the "+ Filter" panel', () => {
    vi.useFakeTimers()
    render(<AuditLogFilters filter={{}} onChange={onChange} />)

    openExtra('Jira task key')
    const input = screen.getByRole('textbox', { name: 'Jira task key' })
    fireEvent.change(input, { target: { value: 'ABC-9' } })
    // Close the panel (its editor unmounts) before the debounce fires.
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByRole('textbox', { name: 'Jira task key' })).toBeNull()
    act(() => { vi.advanceTimersByTime(300) })
    expect(onChange).toHaveBeenCalledWith({ jiraTaskKey: 'ABC-9' })
  })

  it('shows a chip and Clear all when only jiraTaskKey filter is active', () => {
    render(<AuditLogFilters filter={{ jiraTaskKey: 'ABC-123' }} onChange={onChange} />)
    expect(screen.getByText('Jira: ABC-123')).toBeDefined()
    expect(clearAll()).toBeDefined()
  })

  it('debounced text merges against the LATEST filter, not the one at keystroke time', () => {
    vi.useFakeTimers()
    const { rerender } = render(<AuditLogFilters filter={{}} onChange={onChange} />)
    // Type a Jira key — debounce armed while filter is {}.
    openExtra('Jira task key')
    fireEvent.change(screen.getByRole('textbox', { name: 'Jira task key' }), { target: { value: 'ABC-1' } })
    // Parent applies an Action filter before the 300ms fires.
    rerender(<AuditLogFilters filter={{ action: 'CREATE' }} onChange={onChange} />)
    act(() => { vi.advanceTimersByTime(300) })
    // The delayed onChange must keep the newer action, not drop it back to {}.
    expect(onChange).toHaveBeenCalledWith({ action: 'CREATE', jiraTaskKey: 'ABC-1' })
  })

  it('Clear all cancels a pending text debounce so the stale value cannot reappear', () => {
    vi.useFakeTimers()
    render(<AuditLogFilters filter={{ source: 'api' }} onChange={onChange} />)
    openExtra('Jira task key')
    fireEvent.change(screen.getByRole('textbox', { name: 'Jira task key' }), { target: { value: 'ABC-1' } })
    // Clear before the debounce fires.
    fireEvent.click(clearAll())
    expect(onChange).toHaveBeenLastCalledWith({})
    act(() => { vi.advanceTimersByTime(300) })
    // No second call resurrecting the typed Jira key.
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('removing a text chip cancels its pending debounce too', () => {
    vi.useFakeTimers()
    render(<AuditLogFilters filter={{ changedBy: 'alice' }} onChange={onChange} />)
    fireEvent.change(changedBy(), { target: { value: 'alicia' } })
    fireEvent.click(screen.getByRole('button', { name: 'Remove Changed by: alice' }))
    expect(onChange).toHaveBeenLastCalledWith({ changedBy: undefined })
    expect(changedBy().value).toBe('')
    act(() => { vi.advanceTimersByTime(300) })
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('debounces changeComment text input through onChange (trimmed)', () => {
    vi.useFakeTimers()
    render(<AuditLogFilters filter={{}} onChange={onChange} />)

    openExtra('Comment')
    fireEvent.change(screen.getByRole('textbox', { name: 'Comment' }), { target: { value: '  release prep ' } })

    expect(onChange).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(300) })
    expect(onChange).toHaveBeenCalledWith({ changeComment: 'release prep' })
  })

  it('shows a chip and Clear all when only changeComment filter is active', () => {
    render(<AuditLogFilters filter={{ changeComment: 'prep' }} onChange={onChange} />)
    expect(screen.getByText('Comment: “prep”')).toBeDefined()
    expect(clearAll()).toBeDefined()
  })

  it('offers Source in "+ Filter" with api and git-history (and an All option)', () => {
    render(<AuditLogFilters filter={{}} onChange={onChange} />)

    openExtra('Source')

    expect(screen.getByRole('radio', { name: 'api' })).toBeDefined()
    expect(screen.getByRole('radio', { name: 'git-history' })).toBeDefined()
    expect(screen.getByRole('radio', { name: /all sources/i }).getAttribute('aria-checked')).toBe('true')
  })

  it('calls onChange with source when a value is picked', () => {
    render(<AuditLogFilters filter={{}} onChange={onChange} />)

    openExtra('Source')
    fireEvent.click(screen.getByRole('radio', { name: 'git-history' }))

    expect(onChange).toHaveBeenCalledWith({ source: 'git-history' })
  })

  it('exposes an action dropdown with CRUD/RENAME/MIGRATED plus All', async () => {
    render(<AuditLogFilters filter={{}} onChange={onChange} />)

    await userEvent.click(screen.getByRole('combobox', { name: /action/i }))

    for (const action of ['CREATE', 'UPDATE', 'DELETE', 'RENAME', 'MIGRATED']) {
      expect(screen.getByRole('option', { name: action })).toBeDefined()
    }
    expect(screen.getByRole('option', { name: /all actions/i })).toBeDefined()
  })

  it('exposes from / to datetime-local inputs behind Period and propagates them as ISO instants', () => {
    render(<AuditLogFilters filter={{}} onChange={onChange} />)

    expect(screen.getByRole('button', { name: 'Period' }).textContent).toContain('Any time')
    openPeriod()
    const from = screen.getByLabelText(/^from$/i) as HTMLInputElement
    const to = screen.getByLabelText(/^to$/i) as HTMLInputElement
    expect(from.type).toBe('datetime-local')
    expect(to.type).toBe('datetime-local')

    fireEvent.change(from, { target: { value: '2026-04-30T08:30' } })
    // The handler converts datetime-local (browser local time) to ISO instant
    // so the wire layer (CRS @DateTimeFormat ISO.DATE_TIME) accepts it. We
    // assert the result starts with the expected date — exact instant depends
    // on the test environment's TZ, which we don't control.
    expect(onChange).toHaveBeenCalled()
    const calledFilter = onChange.mock.calls.at(-1)![0] as AuditFilter
    expect(calledFilter.from).toMatch(/^2026-04-30T/)
    expect(calledFilter.from?.endsWith('Z')).toBe(true)
  })

  it('a Period preset sets from ≈ now − span and clears to', () => {
    render(<AuditLogFilters filter={{ to: '2026-01-01T00:00:00Z' }} onChange={onChange} />)
    openPeriod()
    const before = Date.now()
    fireEvent.click(screen.getByRole('button', { name: 'Last 7 days' }))
    const next = onChange.mock.calls.at(-1)![0] as AuditFilter
    expect(next.to).toBeUndefined()
    const from = new Date(next.from!).getTime()
    expect(before - from).toBeGreaterThanOrEqual(7 * 24 * 3600_000 - 1000)
    expect(before - from).toBeLessThanOrEqual(7 * 24 * 3600_000 + 1000)
  })

  it('names the period as one chip that clears both bounds', async () => {
    render(
      <AuditLogFilters filter={{ from: '2026-04-28T12:00:00Z', to: '2026-04-30T12:00:00Z' }} onChange={onChange} />,
    )
    await userEvent.click(screen.getByRole('button', { name: /^Remove .+ – .+/ }))
    expect(onChange).toHaveBeenCalledWith({ from: undefined, to: undefined })
  })

  it('Clear all resets when any filter is active', async () => {
    render(<AuditLogFilters filter={{ changedBy: 'alice', source: 'api' }} onChange={onChange} />)
    await userEvent.click(clearAll())
    expect(onChange).toHaveBeenCalledWith({})
  })

  it('shows no chips (no Clear all) when no filter is active', () => {
    render(<AuditLogFilters filter={{}} onChange={onChange} />)
    expect(screen.queryByTestId('active-filter-chips')).toBeNull()
  })

  it('propagates the to field as an ISO instant', () => {
    render(<AuditLogFilters filter={{}} onChange={onChange} />)
    openPeriod()
    fireEvent.change(screen.getByLabelText(/^to$/i), { target: { value: '2026-05-01T18:00' } })
    expect(onChange).toHaveBeenCalled()
    const calledFilter = onChange.mock.calls.at(-1)![0] as AuditFilter
    expect(calledFilter.to).toMatch(/^2026-05-01T/)
    expect(calledFilter.to?.endsWith('Z')).toBe(true)
  })

  it('renders empty value in the to input when the filter carries an unparseable instant', () => {
    // instantToLocal: new Date('garbage') → NaN → returns ''
    render(<AuditLogFilters filter={{ to: 'garbage-date-string' }} onChange={onChange} />)
    openPeriod()
    const to = screen.getByLabelText(/^to$/i) as HTMLInputElement
    expect(to.value).toBe('')
  })

  it('reflects an existing from filter value in the input', () => {
    const instant = new Date('2026-04-28T12:00:00Z').toISOString()
    render(<AuditLogFilters filter={{ from: instant }} onChange={onChange} />)
    openPeriod()
    const from = screen.getByLabelText(/^from$/i) as HTMLInputElement
    expect(from.value).toMatch(/^2026-04-28T/)
  })

  it('calls onChange with action when an action is selected', async () => {
    render(<AuditLogFilters filter={{}} onChange={onChange} />)
    await userEvent.click(screen.getByRole('combobox', { name: /action/i }))
    await userEvent.click(screen.getByRole('option', { name: 'CREATE' }))
    expect(onChange).toHaveBeenCalledWith({ action: 'CREATE' })
  })

  it('clears action when All actions is selected', async () => {
    render(<AuditLogFilters filter={{ action: 'CREATE' }} onChange={onChange} />)
    await userEvent.click(screen.getByRole('combobox', { name: /action/i }))
    await userEvent.click(screen.getByRole('option', { name: /all actions/i }))
    expect(onChange).toHaveBeenCalledWith({ action: undefined })
  })

  it('clears source when All sources is selected', () => {
    render(<AuditLogFilters filter={{ source: 'api' }} onChange={onChange} />)
    openExtra('Source')
    fireEvent.click(screen.getByRole('radio', { name: /all sources/i }))
    expect(onChange).toHaveBeenCalledWith({ source: undefined })
  })

  it('syncs changedBy input when filter.changedBy prop changes', () => {
    const { rerender } = render(<AuditLogFilters filter={{ changedBy: 'alice' }} onChange={onChange} />)
    rerender(<AuditLogFilters filter={{ changedBy: 'bob' }} onChange={onChange} />)
    expect(changedBy().value).toBe('bob')
  })

  it('offers Entity type in "+ Filter" with a Component option and an All types option', () => {
    render(<AuditLogFilters filter={{}} onChange={onChange} />)

    openExtra('Entity type')

    expect(screen.getByRole('radio', { name: 'Component' })).toBeDefined()
    expect(screen.getByRole('radio', { name: /all types/i })).toBeDefined()
  })

  it('calls onChange with entityType=Component when Component is selected', () => {
    render(<AuditLogFilters filter={{}} onChange={onChange} />)

    openExtra('Entity type')
    fireEvent.click(screen.getByRole('radio', { name: 'Component' }))

    expect(onChange).toHaveBeenCalledWith({ entityType: 'Component' })
  })

  it('clears entityType when All types is selected', () => {
    render(<AuditLogFilters filter={{ entityType: 'Component' }} onChange={onChange} />)

    openExtra('Entity type')
    fireEvent.click(screen.getByRole('radio', { name: /all types/i }))

    expect(onChange).toHaveBeenCalledWith({ entityType: undefined })
  })

  it('shows a chip and Clear all when only entityType filter is active', () => {
    render(<AuditLogFilters filter={{ entityType: 'Component' }} onChange={onChange} />)
    expect(screen.getByText('Entity: Component')).toBeDefined()
    expect(clearAll()).toBeDefined()
  })

  it('resets entityType on Clear all click', async () => {
    render(<AuditLogFilters filter={{ entityType: 'Component' }} onChange={onChange} />)
    await userEvent.click(clearAll())
    expect(onChange).toHaveBeenCalledWith({})
  })

  it('counts the "+ Filter" values on its button', () => {
    render(<AuditLogFilters filter={{ source: 'api', jiraTaskKey: 'ABC-1' }} onChange={onChange} />)
    expect(screen.getByRole('button', { name: 'Add filter' }).textContent).toContain('2')
  })

  it('exposes a "Show migration" toggle that is off by default', () => {
    render(<AuditLogFilters filter={{}} onChange={onChange} />)
    const toggle = screen.getByRole('switch', { name: /show migration/i })
    expect(toggle.getAttribute('aria-checked')).toBe('false')
  })

  it('turns includeMigrated on when the toggle is switched', async () => {
    render(<AuditLogFilters filter={{}} onChange={onChange} />)
    await userEvent.click(screen.getByRole('switch', { name: /show migration/i }))
    expect(onChange).toHaveBeenCalledWith({ includeMigrated: true })
  })

  it('turns includeMigrated off (omitted) when the toggle is switched back', async () => {
    render(<AuditLogFilters filter={{ includeMigrated: true }} onChange={onChange} />)
    const toggle = screen.getByRole('switch', { name: /show migration/i })
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    await userEvent.click(toggle)
    expect(onChange).toHaveBeenCalledWith({ includeMigrated: undefined })
  })
})
