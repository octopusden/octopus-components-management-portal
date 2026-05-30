import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PeopleListInput } from './PeopleListInput'

// The embedded add-row PeopleInput pulls the owner suggestion list from
// useOwners(); stub it so the dropdown is deterministic and offline.
vi.mock('../../hooks/useOwners', () => ({
  useOwners: vi.fn(() => ({
    data: ['alice@example.com', 'bob@example.com', 'carol@example.com'],
  })),
}))

// Stateful harness — PeopleListInput is controlled (parent owns the array).
// A dump element exposes the current value so tests assert the exact ordered
// string[] the component emits.
function Harness({ initial = [] as string[] }) {
  const [value, setValue] = useState<string[]>(initial)
  return (
    <>
      <PeopleListInput value={value} onChange={setValue} />
      <div data-testid="dump">{JSON.stringify(value)}</div>
    </>
  )
}

function dump() {
  return screen.getByTestId('dump').textContent
}

/** Add a person by clicking the add-row input and picking a suggestion. */
async function addViaSuggestion(email: string) {
  // The add-row is the only textbox in the tree.
  const input = screen.getByRole('textbox')
  await userEvent.click(input)
  // The suggestion is a <button> whose accessible name is exactly the email.
  // Match by role + exact name so it doesn't collide with the row's <span>
  // (same text) when the person is already in the list, nor with the row's
  // "Remove …" / "Move … up" buttons (different accessible names).
  fireEvent.mouseDown(screen.getByRole('button', { name: email }))
}

describe('PeopleListInput', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders "No people yet" when empty', () => {
    render(<Harness initial={[]} />)
    expect(screen.getByText(/no people yet/i)).toBeDefined()
    expect(dump()).toBe('[]')
  })

  it('renders one row per person with a Remove button', () => {
    render(<Harness initial={['alice@example.com', 'bob@example.com']} />)
    expect(screen.getByRole('button', { name: /^remove alice@example\.com$/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /^remove bob@example\.com$/i })).toBeDefined()
  })

  it('adds a picked person to the END of the ordered list', async () => {
    render(<Harness initial={['alice@example.com']} />)
    await addViaSuggestion('bob@example.com')
    await waitFor(() => {
      expect(dump()).toBe(JSON.stringify(['alice@example.com', 'bob@example.com']))
    })
  })

  it('dedupes: picking a person already in the list is a no-op (keep-first)', async () => {
    render(<Harness initial={['alice@example.com']} />)
    await addViaSuggestion('alice@example.com')
    // Still a single entry — no duplicate appended.
    await waitFor(() => {
      expect(dump()).toBe(JSON.stringify(['alice@example.com']))
    })
  })

  it('removes a person by its own row index', async () => {
    render(<Harness initial={['alice@example.com', 'bob@example.com', 'carol@example.com']} />)
    await userEvent.click(screen.getByRole('button', { name: /^remove bob@example\.com$/i }))
    await waitFor(() => {
      expect(dump()).toBe(JSON.stringify(['alice@example.com', 'carol@example.com']))
    })
  })

  it('moves a person down (reorder preserves the rest of the order)', async () => {
    render(<Harness initial={['alice@example.com', 'bob@example.com', 'carol@example.com']} />)
    await userEvent.click(screen.getByRole('button', { name: /^move alice@example\.com down$/i }))
    await waitFor(() => {
      expect(dump()).toBe(JSON.stringify(['bob@example.com', 'alice@example.com', 'carol@example.com']))
    })
  })

  it('moves a person up', async () => {
    render(<Harness initial={['alice@example.com', 'bob@example.com', 'carol@example.com']} />)
    await userEvent.click(screen.getByRole('button', { name: /^move carol@example\.com up$/i }))
    await waitFor(() => {
      expect(dump()).toBe(JSON.stringify(['alice@example.com', 'carol@example.com', 'bob@example.com']))
    })
  })

  it('disables Move-up on the first row and Move-down on the last row', () => {
    render(<Harness initial={['alice@example.com', 'bob@example.com']} />)
    expect((screen.getByRole('button', { name: /^move alice@example\.com up$/i }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: /^move bob@example\.com down$/i }) as HTMLButtonElement).disabled).toBe(true)
    // Interior moves are enabled.
    expect((screen.getByRole('button', { name: /^move alice@example\.com down$/i }) as HTMLButtonElement).disabled).toBe(false)
    expect((screen.getByRole('button', { name: /^move bob@example\.com up$/i }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('add then reorder then remove yields the expected ordered array', async () => {
    render(<Harness initial={['alice@example.com']} />)
    // add bob → [alice, bob]
    await addViaSuggestion('bob@example.com')
    await waitFor(() => expect(dump()).toBe(JSON.stringify(['alice@example.com', 'bob@example.com'])))
    // add carol → [alice, bob, carol]
    await addViaSuggestion('carol@example.com')
    await waitFor(() => expect(dump()).toBe(JSON.stringify(['alice@example.com', 'bob@example.com', 'carol@example.com'])))
    // move carol up → [alice, carol, bob]
    await userEvent.click(screen.getByRole('button', { name: /^move carol@example\.com up$/i }))
    await waitFor(() => expect(dump()).toBe(JSON.stringify(['alice@example.com', 'carol@example.com', 'bob@example.com'])))
    // remove alice → [carol, bob]
    await userEvent.click(screen.getByRole('button', { name: /^remove alice@example\.com$/i }))
    await waitFor(() => expect(dump()).toBe(JSON.stringify(['carol@example.com', 'bob@example.com'])))
  })

  // N1 (review nit): when disabled, every row control is disabled AND the
  // add-row input is hidden — the list is fully read-only.
  it('disabled: all row Move/Remove buttons are disabled and the add input is hidden', () => {
    render(
      <PeopleListInput
        value={['alice@example.com', 'bob@example.com']}
        onChange={vi.fn()}
        disabled
      />,
    )
    // Interior controls that would normally be enabled are disabled too.
    expect((screen.getByRole('button', { name: /^move alice@example\.com down$/i }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: /^move bob@example\.com up$/i }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: /^remove alice@example\.com$/i }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: /^remove bob@example\.com$/i }) as HTMLButtonElement).disabled).toBe(true)
    // Add-row autocomplete is not rendered when disabled.
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  // N2 (review nit): committing a value via the add-row trims surrounding
  // whitespace, and re-adding the trimmed value is a dedupe no-op.
  it('trims surrounding whitespace on add, then dedupes the trimmed value', async () => {
    render(<Harness initial={[]} />)
    const input = screen.getByRole('textbox')
    // Type a padded value and commit via blur (PeopleInput emits onChange(inputValue) on blur).
    await userEvent.type(input, '  alice  ')
    fireEvent.blur(input)
    await waitFor(() => expect(dump()).toBe(JSON.stringify(['alice'])))

    // The add-row remounts cleared after the add; typing the trimmed value
    // again and committing is a no-op (keep-first dedupe).
    const input2 = screen.getByRole('textbox')
    await userEvent.type(input2, 'alice')
    fireEvent.blur(input2)
    await waitFor(() => expect(dump()).toBe(JSON.stringify(['alice'])))
  })
})
