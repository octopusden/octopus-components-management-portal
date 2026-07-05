import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { ModeRadioGroup } from './ModeRadioGroup'
import type { ArtifactIdMode } from '@/lib/types'

// Controlled harness: the group is value-driven, so re-render on selection is
// what flips the roving tabIndex.
function Harness({ initial = 'ALL' as ArtifactIdMode }) {
  const [value, setValue] = useState<ArtifactIdMode>(initial)
  return <ModeRadioGroup value={value} onChange={setValue} />
}

describe('ModeRadioGroup — roving focus', () => {
  it('moves focus (and selection) to the next radio on ArrowDown', async () => {
    render(<Harness />)
    const first = screen.getByRole('radio', { name: /All under the group ID/i })
    first.focus()
    expect(first).toHaveFocus()

    await userEvent.keyboard('{ArrowDown}')

    const second = screen.getByRole('radio', { name: /All except artifacts assigned elsewhere/i })
    expect(second).toHaveAttribute('aria-checked', 'true')
    // Roving-tabindex contract: arrow navigation must carry keyboard focus to the
    // newly selected radio, not leave it stranded on the previous one.
    expect(second).toHaveFocus()
  })

  it('wraps focus to the last radio on ArrowUp from the first', async () => {
    render(<Harness />)
    const first = screen.getByRole('radio', { name: /All under the group ID/i })
    first.focus()

    await userEvent.keyboard('{ArrowUp}')

    const last = screen.getByRole('radio', { name: /Specific artifacts only/i })
    expect(last).toHaveAttribute('aria-checked', 'true')
    expect(last).toHaveFocus()
  })
})
