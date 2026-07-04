import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ChipsInput } from './ChipsInput'

// ChipsInput's add control is a native <select> (see ChipsInput.tsx header
// for the rationale). Tests drive it with userEvent.selectOptions and
// assert via the testid `chips-add-select`. If the implementation ever
// moves to a Radix popover trigger, switch these tests to the pattern the
// EnumSelect tests use (open trigger → click option).

describe('ChipsInput — rendering', () => {
  it('renders each value as a badge', () => {
    render(
      <ChipsInput
        value={['backend', 'internal']}
        onChange={vi.fn()}
        options={['backend', 'internal', 'frontend']}
        placeholder="Add label"
        noun="label"
      />,
    )
    expect(screen.getByText('backend')).toBeDefined()
    expect(screen.getByText('internal')).toBeDefined()
  })

  it('renders no chip badges when value is empty (options still appear inside the add control)', () => {
    render(
      <ChipsInput
        value={[]}
        onChange={vi.fn()}
        options={['backend', 'internal']}
        placeholder="Add label"
        noun="label"
      />,
    )
    // 'backend' is offered as an <option> in the add control, so the bare
    // text appears in the DOM. The chips row itself must be empty — assert
    // via the data-testid'd chip wrapper instead of the literal text.
    expect(screen.queryByTestId('chip-backend')).toBeNull()
    expect(screen.queryByTestId('chip-internal')).toBeNull()
  })

  it('forwards the id to the add control so an outer <Label htmlFor> can target it', () => {
    render(
      <ChipsInput
        id="component-labels"
        value={[]}
        onChange={vi.fn()}
        options={['backend']}
        placeholder="Add label"
        noun="label"
      />,
    )
    const add = screen.getByLabelText(/^add label$/i)
    expect(add.getAttribute('id')).toBe('component-labels')
  })
})

describe('ChipsInput — interactions', () => {
  it('clicking the × on a chip removes that label from the value', async () => {
    const onChange = vi.fn()
    render(
      <ChipsInput
        value={['backend', 'internal']}
        onChange={onChange}
        options={['backend', 'internal', 'frontend']}
        placeholder="Add label"
        noun="label"
      />,
    )
    const removeBackend = screen.getByRole('button', { name: /^remove backend$/i })
    await userEvent.click(removeBackend)
    expect(onChange).toHaveBeenCalledWith(['internal'])
  })

  it('picking an option from the add control appends it to value', async () => {
    const onChange = vi.fn()
    render(
      <ChipsInput
        value={['backend']}
        onChange={onChange}
        options={['backend', 'internal', 'frontend']}
        placeholder="Add label"
        noun="label"
      />,
    )
    const addControl = screen.getByLabelText(/^add label$/i) as HTMLSelectElement
    await userEvent.selectOptions(addControl, 'frontend')
    expect(onChange).toHaveBeenCalledWith(['backend', 'frontend'])
  })

  it('add control filters out already-added values (you cannot pick a label twice)', () => {
    render(
      <ChipsInput
        value={['backend']}
        onChange={vi.fn()}
        options={['backend', 'internal', 'frontend']}
        placeholder="Add label"
        noun="label"
      />,
    )
    const addControl = screen.getByLabelText(/^add label$/i)
    const optionValues = Array.from(addControl.querySelectorAll('option')).map((o) => o.value)
    // 'backend' is already a chip → not offered. Other options remain.
    expect(optionValues).not.toContain('backend')
    expect(optionValues).toContain('internal')
    expect(optionValues).toContain('frontend')
  })

  it('add control resets after each pick, allowing add → remove → re-add of the same value', async () => {
    // The add control is a "pick-then-clear" affordance — picking a value
    // appends and the control immediately resets to the empty/placeholder
    // option. Without the reset, picking 'frontend', removing it, then
    // picking 'frontend' again would not fire onChange (the Select's
    // controlled value would already be 'frontend' and onChange wouldn't
    // re-fire on selecting the same value). This test walks the full
    // add → remove → re-add cycle to lock the contract end-to-end.
    const onChange = vi.fn()
    const { rerender } = render(
      <ChipsInput
        value={[]}
        onChange={onChange}
        options={['backend', 'frontend']}
        placeholder="Add label"
        noun="label"
      />,
    )

    // (1) Add 'frontend' from empty state.
    let addControl = screen.getByLabelText(/^add label$/i) as HTMLSelectElement
    await userEvent.selectOptions(addControl, 'frontend')
    expect(onChange).toHaveBeenLastCalledWith(['frontend'])

    // Parent acknowledges the change; control resets.
    rerender(
      <ChipsInput
        value={['frontend']}
        onChange={onChange}
        options={['backend', 'frontend']}
        placeholder="Add label"
        noun="label"
      />,
    )
    addControl = screen.getByLabelText(/^add label$/i) as HTMLSelectElement
    expect(addControl.value).toBe('')

    // (2) Remove 'frontend' via its × button.
    await userEvent.click(screen.getByRole('button', { name: /^remove frontend$/i }))
    expect(onChange).toHaveBeenLastCalledWith([])

    // Parent acknowledges the removal.
    rerender(
      <ChipsInput
        value={[]}
        onChange={onChange}
        options={['backend', 'frontend']}
        placeholder="Add label"
        noun="label"
      />,
    )

    // (3) Re-add 'frontend' — must fire onChange again despite picking the
    // same value as before. This is the contract the pick-then-clear
    // implementation has to honour.
    addControl = screen.getByLabelText(/^add label$/i) as HTMLSelectElement
    await userEvent.selectOptions(addControl, 'frontend')
    expect(onChange).toHaveBeenLastCalledWith(['frontend'])
  })

  it('duplicate values in `value` do not collide on the React key (defence-in-depth)', () => {
    // Server data might contain duplicates (malformed import, double-add
    // bug in another session). ChipsInput uses an index-suffixed key so
    // React doesn't drop a chip from the DOM under a duplicate-key warning.
    const onChange = vi.fn()
    const { container } = render(
      <ChipsInput
        value={['backend', 'backend']}
        onChange={onChange}
        options={['backend', 'internal']}
        placeholder="Add label"
        noun="label"
      />,
    )
    // Two chips must render even though both have the same value.
    const removeButtons = container.querySelectorAll('button[aria-label^="Remove "]')
    expect(removeButtons.length).toBe(2)
  })

  it('clicking × on a duplicate chip removes ONLY that one (remove-by-index, PR #44 review)', async () => {
    // The defensive duplicate-render is wasted if handleRemove still
    // filters by value — clicking one × would wipe every duplicate.
    // Switch to remove-by-index so each chip is independently removable.
    const onChange = vi.fn()
    const { container } = render(
      <ChipsInput
        value={['a', 'a', 'b']}
        onChange={onChange}
        options={['a', 'b']}
        placeholder="Add label"
        noun="label"
      />,
    )
    // Click the FIRST × button.
    const removeButtons = container.querySelectorAll(
      'button[aria-label^="Remove "]',
    ) as NodeListOf<HTMLButtonElement>
    await userEvent.click(removeButtons[0]!)
    // Result keeps the second 'a' and the 'b' — not [['b']] (which the
    // value-filter would produce).
    expect(onChange).toHaveBeenCalledWith(['a', 'b'])
  })
})

describe('ChipsInput — disabled / loading / a11y', () => {
  it('disabled prop disables every × button and the add control', () => {
    render(
      <ChipsInput
        value={['backend']}
        onChange={vi.fn()}
        options={['backend', 'internal']}
        placeholder="Add label"
        noun="label"
        disabled
      />,
    )
    const removeBackend = screen.getByRole('button', { name: /^remove backend$/i }) as HTMLButtonElement
    expect(removeBackend.disabled).toBe(true)
    const addControl = screen.getByLabelText(/^add label$/i) as HTMLSelectElement
    expect(addControl.disabled).toBe(true)
  })

  it('forwards aria-required + aria-describedby + aria-invalid to the add control', () => {
    render(
      <ChipsInput
        value={[]}
        onChange={vi.fn()}
        options={['backend']}
        placeholder="Add label"
        noun="label"
        ariaRequired
        ariaDescribedBy="labels-error"
        ariaInvalid
      />,
    )
    const addControl = screen.getByLabelText(/^add label$/i)
    expect(addControl.getAttribute('aria-required')).toBe('true')
    expect(addControl.getAttribute('aria-describedby')).toBe('labels-error')
    // ariaInvalid parity with the rest of the editor (groupId Input,
    // system MultiSelectFilter): AT needs the invalid-state cue on the
    // control itself, not just the error text via aria-describedby.
    expect(addControl.getAttribute('aria-invalid')).toBe('true')
  })

  it('renders a loading-state add control when isLoading=true', () => {
    render(
      <ChipsInput
        value={[]}
        onChange={vi.fn()}
        options={[]}
        placeholder="Add label"
        noun="label"
        isLoading
      />,
    )
    // Either the loading state shows a disabled control or visible "Loading"
    // copy — assert via the disabled signal which is universal.
    const addControl = screen.getByLabelText(/^add label$/i) as HTMLSelectElement
    expect(addControl.disabled).toBe(true)
  })
})
