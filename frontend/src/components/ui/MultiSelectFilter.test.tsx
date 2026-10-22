import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MultiSelectFilter } from './MultiSelectFilter'

describe('MultiSelectFilter', () => {
  it('keeps a selected value that is not among the options when another option is picked', async () => {
    // A preset or deep-link can select a value the in-use vocabulary does not
    // list (e.g. "I am Release Manager" for someone assigned nowhere). Picking a
    // second option must not silently drop it.
    const onChange = vi.fn()
    render(
      <MultiSelectFilter
        value={['me']}
        onChange={onChange}
        options={['alice', 'bob']}
        placeholder="Release manager"
        unitLabel="release manager"
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /me/i }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'bob' }))
    expect(onChange).toHaveBeenCalledWith(['me', 'bob'])
  })
})
