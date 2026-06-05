import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EmployeeStatusBadge, PeopleInput } from './PeopleInput'

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

  it('commits the current value and closes suggestions on Enter', async () => {
    render(<PeopleInput value="" onChange={onChange} />)
    const input = screen.getByRole('textbox')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'carol@example.com' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith('carol@example.com')
    expect(screen.queryByText('alice@example.com')).toBeNull()
  })

  it('commits a typed person only after exact active validation', async () => {
    const lookupFn = vi.fn().mockResolvedValue([{ username: 'carol', active: true }])
    render(<PeopleInput value="" onChange={onChange} lookupFn={lookupFn} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'carol' } })
    fireEvent.blur(input)
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('carol'))
    expect(lookupFn).toHaveBeenCalledWith('carol')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('clears the committed parent value immediately when a validated value is edited', () => {
    const lookupFn = vi.fn().mockResolvedValue([])
    const { rerender } = render(
      <PeopleInput value="alice" onChange={onChange} lookupFn={lookupFn} />,
    )
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'asdfd' } })

    expect(onChange).toHaveBeenCalledWith('')
    expect((input as HTMLInputElement).value).toBe('asdfd')

    rerender(<PeopleInput value="" onChange={onChange} lookupFn={lookupFn} />)
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('asdfd')
  })

  it('cancels a pending validation when the user edits again', async () => {
    let resolveLookup!: (value: { username: string; active: boolean }[]) => void
    const lookupFn = vi.fn(() =>
      new Promise<{ username: string; active: boolean }[]>((resolve) => {
        resolveLookup = resolve
      }),
    )
    render(<PeopleInput value="" onChange={onChange} lookupFn={lookupFn} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'carol' } })
    fireEvent.blur(input)
    await screen.findByText('Validating person...')

    fireEvent.change(input, { target: { value: 'dave' } })
    expect(screen.queryByText('Validating person...')).toBeNull()

    await act(async () => {
      resolveLookup([{ username: 'carol', active: true }])
    })

    expect(onChange).not.toHaveBeenCalledWith('carol')
    expect((input as HTMLInputElement).value).toBe('dave')
  })

  it('does not commit a typed person that is missing from the directory', async () => {
    const lookupFn = vi.fn().mockResolvedValue([])
    render(<PeopleInput value="" onChange={onChange} lookupFn={lookupFn} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'asdfd' } })
    fireEvent.blur(input)
    await screen.findByRole('alert')
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByText('Select an active person from the directory')).toBeDefined()
    expect((input as HTMLInputElement).value).toBe('asdfd')
  })

  it('does not commit an inactive typed person', async () => {
    const lookupFn = vi.fn().mockResolvedValue([{ username: 'carol', active: false }])
    render(<PeopleInput value="" onChange={onChange} lookupFn={lookupFn} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'carol' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await screen.findByRole('alert')
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByText('Person is inactive')).toBeDefined()
  })

  it('validates an owner suggestion before committing when lookupFn is present', async () => {
    const lookupFn = vi.fn().mockResolvedValue([{ username: 'alice@example.com', active: true }])
    render(<PeopleInput value="" onChange={onChange} lookupFn={lookupFn} />)
    await userEvent.click(screen.getByRole('textbox'))
    fireEvent.mouseDown(screen.getByRole('button', { name: 'alice@example.com' }))
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('alice@example.com'))
    expect(lookupFn).toHaveBeenCalledWith('alice@example.com')
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
    const externalResult = { username: 'carol@example.com', active: true }
    const lookupFn = vi.fn().mockResolvedValue([externalResult])
    render(<PeopleInput value="" onChange={onChange} lookupFn={lookupFn} />)
    fireEvent.focus(screen.getByRole('textbox'))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'ca' } })
    await act(async () => { vi.advanceTimersByTime(300) })
    expect(screen.getByText('carol@example.com')).toBeDefined()
    expect(screen.getByText('Active')).toBeDefined()
    vi.useRealTimers()
  })

  it('annotates an exact inactive lookup result', async () => {
    vi.useFakeTimers()
    const lookupFn = vi.fn().mockResolvedValue([{ username: 'carol', active: false }])
    render(<PeopleInput value="" onChange={onChange} lookupFn={lookupFn} />)
    fireEvent.focus(screen.getByRole('textbox'))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'carol' } })
    await act(async () => { vi.advanceTimersByTime(300) })
    expect(screen.getByText('Inactive')).toBeDefined()
    vi.useRealTimers()
  })

  it('renders an inactive badge for the current value', () => {
    render(<PeopleInput value="alice" onChange={onChange} status={false} />)
    expect(screen.getByText('Inactive')).toBeDefined()
  })

  it('renders a not-verified badge when unknown status is explicitly shown', () => {
    render(<EmployeeStatusBadge status={null} showUnknown />)
    expect(screen.getByText('Not verified')).toBeDefined()
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

  it('treats an empty lookup response as no external results', async () => {
    vi.useFakeTimers()
    const lookupMock = vi.fn(async () => undefined)
    const lookupFn = lookupMock as unknown as (query: string) => Promise<[]>
    render(<PeopleInput value="" onChange={onChange} lookupFn={lookupFn} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'al' } })
    await act(async () => { vi.advanceTimersByTime(300) })
    expect(lookupMock).toHaveBeenCalledWith('al')
    expect(screen.getByText('alice@example.com')).toBeDefined()
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
