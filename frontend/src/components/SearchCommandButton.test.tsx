import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SearchCommandButton } from './SearchCommandButton'
import { useUiOverlay } from '@/lib/uiOverlayStore'

const COACHMARK_KEY = 'crs_kbd_hint'

// The button yields to the onboarding-video banner (one first-run popup at a time).
// Mock the eligibility hook so these tests control it (and so they don't need a
// QueryClient/auth context, which the real hook pulls in transitively).
const mockBannerVisible = vi.fn(() => false)
vi.mock('@/hooks/useOnboardingBannerVisible', () => ({
  useOnboardingBannerVisible: () => mockBannerVisible(),
}))

beforeEach(() => {
  useUiOverlay.setState({ paletteOpen: false, shortcutsOpen: false })
  localStorage.clear()
  mockBannerVisible.mockReturnValue(false)
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

  it('suppresses the coachmark while the onboarding-video banner is showing', () => {
    mockBannerVisible.mockReturnValue(true)
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
