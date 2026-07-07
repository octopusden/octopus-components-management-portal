import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OnboardingVideoButton } from './OnboardingVideoButton'
import { useOnboardingVideo } from '@/lib/onboardingVideoStore'

const mockStatus = vi.fn()
vi.mock('@/hooks/useInfo', () => ({
  useOnboardingVideoStatus: () => mockStatus(),
}))

const ready = () => mockStatus.mockReturnValue({ data: { onboardingVideoStatus: 'ready' } })

beforeEach(() => {
  useOnboardingVideo.setState({ open: false, bannerDismissed: false })
  mockStatus.mockReturnValue({ data: { onboardingVideoStatus: 'loading' } })
})

describe('OnboardingVideoButton', () => {
  it('renders nothing until the video is ready', () => {
    const { container } = render(<OnboardingVideoButton />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the button once ready', () => {
    ready()
    render(<OnboardingVideoButton />)
    expect(screen.getByRole('button', { name: /watch the intro video/i })).toBeInTheDocument()
  })

  it('opens the video and dismisses the banner when clicked', async () => {
    ready()
    const user = userEvent.setup()
    render(<OnboardingVideoButton />)
    await user.click(screen.getByRole('button', { name: /watch the intro video/i }))
    expect(useOnboardingVideo.getState().open).toBe(true)
    // Opening from the header must also dismiss any visible banner (shared store flag).
    expect(useOnboardingVideo.getState().bannerDismissed).toBe(true)
  })
})
