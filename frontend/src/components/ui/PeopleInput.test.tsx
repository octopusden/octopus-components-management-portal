import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PeopleInput } from './PeopleInput'

vi.mock('../../hooks/useOwners', () => ({
  useOwners: vi.fn(() => ({ data: ['alice@example.com', 'bob@example.com'] })),
}))

describe('PeopleInput', () => {
  const onChange = vi.fn()

  beforeEach(() => vi.clearAllMocks())

  it('renders with the provided value', () => {
    render(<PeopleInput value="alice@example.com" onChange={onChange} />)
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('alice@example.com')
  })

  it('shows all owner suggestions on focus', async () => {
    render(<PeopleInput value="" onChange={onChange} />)
    await userEvent.click(screen.getByRole('textbox'))
    expect(screen.getByText('alice@example.com')).toBeDefined()
    expect(screen.getByText('bob@example.com')).toBeDefined()
  })

  it('filters suggestions by typed text', async () => {
    render(<PeopleInput value="" onChange={onChange} />)
    const input = screen.getByRole('textbox')
    await userEvent.click(input)
    fireEvent.change(input, { target: { value: 'alice' } })
    expect(screen.getByText('alice@example.com')).toBeDefined()
    expect(screen.queryByText('bob@example.com')).toBeNull()
  })

  it('selects an owner suggestion on click and calls onChange', async () => {
    render(<PeopleInput value="" onChange={onChange} />)
    await userEvent.click(screen.getByRole('textbox'))
    fireEvent.mouseDown(screen.getByText('alice@example.com'))
    expect(onChange).toHaveBeenCalledWith('alice@example.com')
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('alice@example.com')
  })

  it('calls onChange with current value on blur', async () => {
    render(<PeopleInput value="carol@example.com" onChange={onChange} />)
    const input = screen.getByRole('textbox')
    fireEvent.focus(input)
    fireEvent.blur(input)
    expect(onChange).toHaveBeenCalledWith('carol@example.com')
  })

  it('does not call lookupFn when input is less than 2 characters', () => {
    vi.useFakeTimers()
    const lookupFn = vi.fn().mockResolvedValue([])
    render(<PeopleInput value="" onChange={onChange} lookupFn={lookupFn} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'a' } })
    act(() => { vi.advanceTimersByTime(400) })
    expect(lookupFn).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('calls lookupFn with debounce when input has 2+ characters', async () => {
    vi.useFakeTimers()
    const lookupFn = vi.fn().mockResolvedValue([])
    render(<PeopleInput value="" onChange={onChange} lookupFn={lookupFn} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'al' } })
    expect(lookupFn).not.toHaveBeenCalled()
    await act(async () => { vi.advanceTimersByTime(300) })
    expect(lookupFn).toHaveBeenCalledWith('al')
    vi.useRealTimers()
  })

  it('shows external lookup results alongside filtered owners', async () => {
    vi.useFakeTimers()
    const externalResult = { id: '99', displayName: 'Carol Smith', email: 'carol@example.com' }
    const lookupFn = vi.fn().mockResolvedValue([externalResult])
    render(<PeopleInput value="" onChange={onChange} lookupFn={lookupFn} />)
    fireEvent.focus(screen.getByRole('textbox'))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'ca' } })
    await act(async () => { vi.advanceTimersByTime(300) })
    expect(screen.getByText('Carol Smith (carol@example.com)')).toBeDefined()
    vi.useRealTimers()
  })

  it('clears external results and does not throw when lookupFn rejects', async () => {
    vi.useFakeTimers()
    const lookupFn = vi.fn().mockRejectedValue(new Error('network'))
    render(<PeopleInput value="" onChange={onChange} lookupFn={lookupFn} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'er' } })
    await act(async () => { vi.advanceTimersByTime(300) })
    // No error thrown, dropdown shows no external results
    expect(screen.queryByText('Carol Smith')).toBeNull()
    vi.useRealTimers()
  })

  it('hides dropdown on outside click', async () => {
    render(
      <div>
        <PeopleInput value="" onChange={onChange} />
        <button>outside</button>
      </div>,
    )
    await userEvent.click(screen.getByRole('textbox'))
    expect(screen.getByText('alice@example.com')).toBeDefined()
    fireEvent.mouseDown(screen.getByRole('button', { name: 'outside' }))
    expect(screen.queryByText('alice@example.com')).toBeNull()
  })

  it('updates inputValue when value prop changes', () => {
    const { rerender } = render(<PeopleInput value="alice@example.com" onChange={onChange} />)
    rerender(<PeopleInput value="bob@example.com" onChange={onChange} />)
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('bob@example.com')
  })
})
