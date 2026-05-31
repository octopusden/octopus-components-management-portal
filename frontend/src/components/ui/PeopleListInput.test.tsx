import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
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
  // "Remove …" / "Drag …" buttons (different accessible names).
  fireEvent.mouseDown(screen.getByRole('button', { name: email }))
}

const ROW_HEIGHT = 40

// dnd-kit's KeyboardSensor reorders by comparing the *layout* rects of the
// sortable rows: sortableKeyboardCoordinates only treats a row as a move
// target when `collisionRect.top < rect.top` (down) / `>` (up). jsdom has no
// layout engine, so every getBoundingClientRect() returns an all-zero rect and
// no row ever ranks above/below another — keyboard moves would silently no-op.
// Give each row a deterministic vertical slot keyed off its data-testid so the
// sensor can resolve a real move target. Restored in afterEach.
function mockRowRects() {
  return vi
    .spyOn(Element.prototype, 'getBoundingClientRect')
    .mockImplementation(function (this: Element) {
      const testid = this.getAttribute('data-testid') ?? ''
      const match = /^person-row-(\d+)$/.exec(testid)
      const top = match ? Number(match[1]) * ROW_HEIGHT : 0
      return {
        x: 0,
        y: top,
        top,
        bottom: top + (match ? ROW_HEIGHT : 0),
        left: 0,
        right: 200,
        width: match ? 200 : 0,
        height: match ? ROW_HEIGHT : 0,
        toJSON: () => ({}),
      } as DOMRect
    })
}

/**
 * Drive a full keyboard reorder via dnd-kit's KeyboardSensor.
 *
 * The lift (Space) MUST be fired on the grip itself — the sensor's activator
 * guard rejects activation unless `event.target` is the registered activator
 * node. After activation the sensor adds its keydown listener to `document` on
 * a `setTimeout(0)`, so we flush a macrotask before moving. The move/drop keys
 * are fired on `document.body` (they're handled by that document listener, and
 * bubbling there avoids re-hitting the grip's activator handler on the drop).
 */
async function keyboardReorder(handle: HTMLElement, moves: Array<'ArrowDown' | 'ArrowUp'>) {
  handle.focus()
  fireEvent.keyDown(handle, { key: ' ', code: 'Space' })
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 25))
  })
  for (const code of moves) {
    fireEvent.keyDown(document.body, { key: code, code })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
  fireEvent.keyDown(document.body, { key: ' ', code: 'Space' })
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

describe('PeopleListInput', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.restoreAllMocks())

  it('renders "No people yet" when empty', () => {
    render(<Harness initial={[]} />)
    expect(screen.getByText(/no people yet/i)).toBeDefined()
    expect(dump()).toBe('[]')
  })

  it('renders one row per person with a drag handle and a Remove button', () => {
    render(<Harness initial={['alice@example.com', 'bob@example.com']} />)
    expect(screen.getByRole('button', { name: /^remove alice@example\.com$/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /^remove bob@example\.com$/i })).toBeDefined()
    // Drag handle per row (replaces the old up/down arrow buttons).
    expect(screen.getByRole('button', { name: /^drag alice@example\.com to reorder$/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /^drag bob@example\.com to reorder$/i })).toBeDefined()
    // The old arrow controls are gone.
    expect(screen.queryByRole('button', { name: /move .* up/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /move .* down/i })).toBeNull()
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

  it('reorders via the keyboard: lift the grip, ArrowDown, drop → moved one slot down', async () => {
    mockRowRects()
    render(<Harness initial={['alice@example.com', 'bob@example.com', 'carol@example.com']} />)
    const grip = screen.getByRole('button', { name: /^drag alice@example\.com to reorder$/i })
    await keyboardReorder(grip, ['ArrowDown'])
    await waitFor(() => {
      expect(dump()).toBe(
        JSON.stringify(['bob@example.com', 'alice@example.com', 'carol@example.com']),
      )
    })
  })

  it('reorders via the keyboard: lift the grip, ArrowUp, drop → moved one slot up', async () => {
    mockRowRects()
    render(<Harness initial={['alice@example.com', 'bob@example.com', 'carol@example.com']} />)
    const grip = screen.getByRole('button', { name: /^drag carol@example\.com to reorder$/i })
    await keyboardReorder(grip, ['ArrowUp'])
    await waitFor(() => {
      expect(dump()).toBe(
        JSON.stringify(['alice@example.com', 'carol@example.com', 'bob@example.com']),
      )
    })
  })

  it('add then keyboard-reorder then remove yields the expected ordered array', async () => {
    mockRowRects()
    render(<Harness initial={['alice@example.com']} />)
    // add bob → [alice, bob]
    await addViaSuggestion('bob@example.com')
    await waitFor(() => expect(dump()).toBe(JSON.stringify(['alice@example.com', 'bob@example.com'])))
    // add carol → [alice, bob, carol]
    await addViaSuggestion('carol@example.com')
    await waitFor(() => expect(dump()).toBe(JSON.stringify(['alice@example.com', 'bob@example.com', 'carol@example.com'])))
    // keyboard-move carol up → [alice, carol, bob]
    const grip = screen.getByRole('button', { name: /^drag carol@example\.com to reorder$/i })
    await keyboardReorder(grip, ['ArrowUp'])
    await waitFor(() => expect(dump()).toBe(JSON.stringify(['alice@example.com', 'carol@example.com', 'bob@example.com'])))
    // remove alice → [carol, bob]
    await userEvent.click(screen.getByRole('button', { name: /^remove alice@example\.com$/i }))
    await waitFor(() => expect(dump()).toBe(JSON.stringify(['carol@example.com', 'bob@example.com'])))
  })

  // When disabled, every row control (drag grip + remove) is disabled AND the
  // add-row input is hidden — the list is fully read-only, with no arrows.
  it('disabled: drag grips + Remove buttons are disabled, add input is hidden, no arrows', () => {
    render(
      <PeopleListInput
        value={['alice@example.com', 'bob@example.com']}
        onChange={vi.fn()}
        disabled
      />,
    )
    // Drag grips disabled.
    expect((screen.getByRole('button', { name: /^drag alice@example\.com to reorder$/i }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: /^drag bob@example\.com to reorder$/i }) as HTMLButtonElement).disabled).toBe(true)
    // Remove buttons disabled.
    expect((screen.getByRole('button', { name: /^remove alice@example\.com$/i }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: /^remove bob@example\.com$/i }) as HTMLButtonElement).disabled).toBe(true)
    // No legacy arrow controls.
    expect(screen.queryByRole('button', { name: /move .* up/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /move .* down/i })).toBeNull()
    // Add-row autocomplete is not rendered when disabled.
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  // Committing a value via the add-row trims surrounding whitespace, and
  // re-adding the trimmed value is a dedupe no-op.
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
