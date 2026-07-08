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

  it('renders the poster image when the backend has one', () => {
    mockStatus.mockReturnValue({ data: { onboardingVideoStatus: 'ready', onboardingVideoHasPoster: true } })
    render(<OnboardingVideoBanner />)
    const img = screen.getByTestId('onboarding-video-banner').querySelector('img')
    expect(img?.getAttribute('src')).toContain('portal/media/onboarding-video/poster')
  })

  it('clicking the poster opens the video and marks done', async () => {
    ready()
    const user = userEvent.setup()
    render(<OnboardingVideoBanner />)
    await user.click(screen.getByRole('button', { name: /play the intro video/i }))
    expect(useOnboardingVideo.getState().open).toBe(true)
    expect(JSON.parse(localStorage.getItem(KEY)!).status).toBe('done')
  })

  it('is hidden once the user has dismissed it (Not interested)', () => {
    ready()
    localStorage.setItem(KEY, JSON.stringify({ status: 'dismissed' }))
    render(<OnboardingVideoBanner />)
    expect(screen.queryByTestId('onboarding-video-banner')).not.toBeInTheDocument()
  })

  it('is hidden once the user has watched it (done)', () => {
    ready()
    localStorage.setItem(KEY, JSON.stringify({ status: 'done' }))
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

  it('Not interested persists dismissed and removes the banner from the DOM', async () => {
    ready()
    const user = userEvent.setup()
    render(<OnboardingVideoBanner />)
    await user.click(screen.getByRole('button', { name: /not interested/i }))
    expect(JSON.parse(localStorage.getItem(KEY)!).status).toBe('dismissed')
    expect(screen.queryByTestId('onboarding-video-banner')).not.toBeInTheDocument()
  })

  it('× closes for the session WITHOUT persisting, so it shows again next session', async () => {
    ready()
    const user = userEvent.setup()
    render(<OnboardingVideoBanner />)
    await user.click(screen.getByRole('button', { name: /close/i }))
    // Hidden this session via the store flag...
    expect(screen.queryByTestId('onboarding-video-banner')).not.toBeInTheDocument()
    expect(useOnboardingVideo.getState().bannerDismissed).toBe(true)
    // ...but nothing persisted, so a fresh session (store reset) still shows it.
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('stays hidden across navigation once closed this session (store-scoped flag)', () => {
    ready()
    // Simulate a prior dismissal this session (store flag survives Layout remounts).
    useOnboardingVideo.setState({ bannerDismissed: true })
    render(<OnboardingVideoBanner />)
    expect(screen.queryByTestId('onboarding-video-banner')).not.toBeInTheDocument()
  })
})
