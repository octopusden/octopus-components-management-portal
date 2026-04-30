import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuditLogFilters, type AuditFilter } from './AuditLogFilters'

// Same Radix-Select polyfill rationale as ComponentFilters tests — Radix
// internals call hasPointerCapture/scrollIntoView during transitions and
// jsdom doesn't ship those.

describe('AuditLogFilters (B7.1.3)', () => {
  const onChange = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('debounces changedBy text input through onChange', () => {
    vi.useFakeTimers()

    render(<AuditLogFilters filter={{}} onChange={onChange} />)

    const input = screen.getByLabelText(/changed by/i) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'alice' } })

    // Same 300ms debounce convention as ComponentFilters — saves a fetch
    // round-trip on every keystroke without changing the user-perceived
    // responsiveness.
    expect(onChange).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(300) })
    expect(onChange).toHaveBeenCalledWith({ changedBy: 'alice' })

    vi.useRealTimers()
  })

  it('blanks changedBy → undefined (clear) on debounce', () => {
    vi.useFakeTimers()
    render(<AuditLogFilters filter={{ changedBy: 'alice' }} onChange={onChange} />)

    const input = screen.getByLabelText(/changed by/i) as HTMLInputElement
    fireEvent.change(input, { target: { value: '' } })
    act(() => { vi.advanceTimersByTime(300) })

    expect(onChange).toHaveBeenCalledWith({ changedBy: undefined })
    vi.useRealTimers()
  })

  it('exposes a source dropdown with api and git-history (and an All option)', async () => {
    render(<AuditLogFilters filter={{}} onChange={onChange} />)

    const trigger = screen.getByRole('combobox', { name: /source/i })
    await userEvent.click(trigger)

    expect(screen.getByRole('option', { name: 'api' })).toBeDefined()
    expect(screen.getByRole('option', { name: 'git-history' })).toBeDefined()
    expect(screen.getByRole('option', { name: /all sources/i })).toBeDefined()
  })

  it('calls onChange with source when a value is picked', async () => {
    render(<AuditLogFilters filter={{}} onChange={onChange} />)

    await userEvent.click(screen.getByRole('combobox', { name: /source/i }))
    await userEvent.click(screen.getByRole('option', { name: 'git-history' }))

    expect(onChange).toHaveBeenCalledWith({ source: 'git-history' })
  })

  it('exposes an action dropdown with CRUD/RENAME/ARCHIVE plus All', async () => {
    render(<AuditLogFilters filter={{}} onChange={onChange} />)

    await userEvent.click(screen.getByRole('combobox', { name: /action/i }))

    for (const action of ['CREATE', 'UPDATE', 'DELETE', 'RENAME', 'ARCHIVE']) {
      expect(screen.getByRole('option', { name: action })).toBeDefined()
    }
    expect(screen.getByRole('option', { name: /all actions/i })).toBeDefined()
  })

  it('exposes from / to datetime-local inputs and propagates them as ISO instants', () => {
    render(<AuditLogFilters filter={{}} onChange={onChange} />)

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

  it('shows Clear filters and resets when any filter is active', async () => {
    render(<AuditLogFilters filter={{ changedBy: 'alice', source: 'api' }} onChange={onChange} />)
    const clear = screen.getByRole('button', { name: /clear filters/i })
    await userEvent.click(clear)
    expect(onChange).toHaveBeenCalledWith({})
  })

  it('hides Clear filters when no filter is active', () => {
    render(<AuditLogFilters filter={{}} onChange={onChange} />)
    expect(screen.queryByRole('button', { name: /clear filters/i })).toBeNull()
  })
})
