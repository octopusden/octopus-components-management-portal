import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OnboardingVideoBanner } from './OnboardingVideoBanner'
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
  useOnboardingVideo.setState({ open: false, bannerDismissed: false })
  mockStatus.mockReturnValue({ data: { onboardingVideoStatus: 'loading' } })
})

describe('OnboardingVideoBanner', () => {
  it('is hidden until the video is ready', () => {
    render(<OnboardingVideoBanner />)
    expect(screen.queryByTestId('onboarding-video-banner')).not.toBeInTheDocument()
  })

  it('shows on first login when ready', () => {
    ready()
    render(<OnboardingVideoBanner />)
    expect(screen.getByTestId('onboarding-video-banner')).toBeInTheDocument()
  })

  it('is hidden once the user has dismissed it', () => {
    ready()
    localStorage.setItem(KEY, JSON.stringify({ status: 'dismissed', shownCount: 0 }))
    render(<OnboardingVideoBanner />)
    expect(screen.queryByTestId('onboarding-video-banner')).not.toBeInTheDocument()
  })

  it('Watch opens the video, marks done, and hides the banner', async () => {
    ready()
    const user = userEvent.setup()
    render(<OnboardingVideoBanner />)
    await user.click(screen.getByRole('button', { name: /watch intro/i }))
    expect(useOnboardingVideo.getState().open).toBe(true)
    expect(JSON.parse(localStorage.getItem(KEY)!).status).toBe('done')
    expect(screen.queryByTestId('onboarding-video-banner')).not.toBeInTheDocument()
  })

  it('Later snoozes (persists later + increments) and hides for the session', async () => {
    ready()
    const user = userEvent.setup()
    render(<OnboardingVideoBanner />)
    await user.click(screen.getByRole('button', { name: /^later$/i }))
    expect(screen.queryByTestId('onboarding-video-banner')).not.toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ status: 'later', shownCount: 1 })
  })

  it("Don't show again persists dismissed and removes the banner from the DOM", async () => {
    ready()
    const user = userEvent.setup()
    render(<OnboardingVideoBanner />)
    await user.click(screen.getByRole('button', { name: /don't show again/i }))
    expect(JSON.parse(localStorage.getItem(KEY)!).status).toBe('dismissed')
    expect(screen.queryByTestId('onboarding-video-banner')).not.toBeInTheDocument()
  })

  it('the × control snoozes like Later and hides the banner', async () => {
    ready()
    const user = userEvent.setup()
    render(<OnboardingVideoBanner />)
    await user.click(screen.getByRole('button', { name: /remind me later/i }))
    expect(screen.queryByTestId('onboarding-video-banner')).not.toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ status: 'later', shownCount: 1 })
  })

  it('re-shows for a snoozed state below the cap', () => {
    ready()
    localStorage.setItem(KEY, JSON.stringify({ status: 'later', shownCount: 1 }))
    render(<OnboardingVideoBanner />)
    expect(screen.getByTestId('onboarding-video-banner')).toBeInTheDocument()
  })

  it('stays hidden after the Later cap is reached', () => {
    ready()
    localStorage.setItem(KEY, JSON.stringify({ status: 'later', shownCount: 3 }))
    render(<OnboardingVideoBanner />)
    expect(screen.queryByTestId('onboarding-video-banner')).not.toBeInTheDocument()
  })

  it('stays hidden across navigation once dismissed this session (store-scoped flag)', () => {
    ready()
    // Simulate a prior dismissal this session (store flag survives Layout remounts).
    useOnboardingVideo.setState({ bannerDismissed: true })
    render(<OnboardingVideoBanner />)
    expect(screen.queryByTestId('onboarding-video-banner')).not.toBeInTheDocument()
  })
})
