import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SearchCommandButton } from './SearchCommandButton'
import { useUiOverlay } from '@/lib/uiOverlayStore'

const COACHMARK_KEY = 'crs_kbd_hint'

beforeEach(() => {
  useUiOverlay.setState({ paletteOpen: false, shortcutsOpen: false })
  localStorage.clear()
})

describe('SearchCommandButton', () => {
  it('opens the palette when clicked', async () => {
    const user = userEvent.setup()
    render(<SearchCommandButton />)
    await user.click(screen.getByRole('button', { name: /search/i }))
    expect(useUiOverlay.getState().paletteOpen).toBe(true)
  })

  it('shows the coachmark on first visit (no localStorage flag)', async () => {
    render(<SearchCommandButton />)
    expect(await screen.findByTestId('kbd-coachmark')).toBeInTheDocument()
  })

  it('does not show the coachmark once dismissed (flag set)', () => {
    localStorage.setItem(COACHMARK_KEY, '1')
    render(<SearchCommandButton />)
    expect(screen.queryByTestId('kbd-coachmark')).not.toBeInTheDocument()
  })

  it('dismissing the coachmark hides it and persists the flag', async () => {
    const user = userEvent.setup()
    render(<SearchCommandButton />)
    expect(await screen.findByTestId('kbd-coachmark')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(screen.queryByTestId('kbd-coachmark')).not.toBeInTheDocument()
    expect(localStorage.getItem(COACHMARK_KEY)).not.toBeNull()
  })
})
