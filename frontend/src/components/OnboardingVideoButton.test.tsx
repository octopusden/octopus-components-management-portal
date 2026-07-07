import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OnboardingVideoButton } from './OnboardingVideoButton'
import { useOnboardingVideo } from '@/lib/onboardingVideoStore'

const mockStatus = vi.fn()
vi.mock('@/hooks/useInfo', () => ({
  useOnboardingVideoStatus: () => mockStatus(),
}))
vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({ data: { username: 'alice' } }),
}))

const KEY = 'octopus.portal.onboardingVideoSeen.alice'
const ready = () => mockStatus.mockReturnValue({ data: { onboardingVideoStatus: 'ready' } })

beforeEach(() => {
  localStorage.clear()
  useOnboardingVideo.setState({ open: false })
  mockStatus.mockReturnValue({ data: { onboardingVideoStatus: 'loading' } })
})

describe('OnboardingVideoButton', () => {
  it('renders nothing until the video is ready', () => {
    mockStatus.mockReturnValue({ data: { onboardingVideoStatus: 'loading' } })
    const { container } = render(<OnboardingVideoButton />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the button once ready', () => {
    ready()
    render(<OnboardingVideoButton />)
    expect(screen.getByRole('button', { name: /watch the intro video/i })).toBeInTheDocument()
  })

  it('shows the coachmark on first login and opens the video from it', async () => {
    ready()
    const user = userEvent.setup()
    render(<OnboardingVideoButton />)
    expect(await screen.findByTestId('onboarding-video-coachmark')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^watch$/i }))
    expect(useOnboardingVideo.getState().open).toBe(true)
    expect(screen.queryByTestId('onboarding-video-coachmark')).not.toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem(KEY)!).status).toBe('done')
  })

  it('does not show the coachmark once dismissed', () => {
    ready()
    localStorage.setItem(KEY, JSON.stringify({ status: 'dismissed', shownCount: 0 }))
    render(<OnboardingVideoButton />)
    expect(screen.queryByTestId('onboarding-video-coachmark')).not.toBeInTheDocument()
    // ...but the button stays as the permanent re-watch entry point.
    expect(screen.getByRole('button', { name: /watch the intro video/i })).toBeInTheDocument()
  })

  it('Later snoozes (persists later + increments count) and hides the coachmark', async () => {
    ready()
    const user = userEvent.setup()
    render(<OnboardingVideoButton />)
    await user.click(await screen.findByRole('button', { name: /^later$/i }))
    expect(screen.queryByTestId('onboarding-video-coachmark')).not.toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ status: 'later', shownCount: 1 })
  })

  it("Don't show again persists dismissed", async () => {
    ready()
    const user = userEvent.setup()
    render(<OnboardingVideoButton />)
    await user.click(await screen.findByRole('button', { name: /don't show again/i }))
    expect(JSON.parse(localStorage.getItem(KEY)!).status).toBe('dismissed')
  })

  it('clicking the header button opens the video, marks done, and closes the coachmark', async () => {
    ready()
    const user = userEvent.setup()
    render(<OnboardingVideoButton />)
    // Coachmark is auto-showing (first login); clicking the header button should open the
    // video, mark onboarding done, and dismiss the coachmark — no lingering nag.
    expect(await screen.findByTestId('onboarding-video-coachmark')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /watch the intro video/i }))
    expect(useOnboardingVideo.getState().open).toBe(true)
    expect(JSON.parse(localStorage.getItem(KEY)!).status).toBe('done')
    expect(screen.queryByTestId('onboarding-video-coachmark')).not.toBeInTheDocument()
  })
})
