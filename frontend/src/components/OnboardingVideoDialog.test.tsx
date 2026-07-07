import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { OnboardingVideoDialog } from './OnboardingVideoDialog'
import { useOnboardingVideo } from '@/lib/onboardingVideoStore'

const mockStatus = vi.fn()
vi.mock('@/hooks/useInfo', () => ({
  useOnboardingVideoStatus: () => mockStatus(),
}))
vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({ data: { username: 'alice' } }),
}))

const KEY = 'octopus.portal.onboardingVideoSeen.alice'

beforeEach(() => {
  localStorage.clear()
  useOnboardingVideo.setState({ open: true })
  mockStatus.mockReturnValue({ data: { onboardingVideoStatus: 'ready', onboardingVideoHasPoster: false } })
})

describe('OnboardingVideoDialog', () => {
  it('renders the video pointing at the same-origin endpoint when open', () => {
    render(<OnboardingVideoDialog />)
    const video = document.querySelector('video')
    expect(video).not.toBeNull()
    expect(video!.getAttribute('src')).toContain('portal/media/onboarding-video')
    expect(video!.getAttribute('preload')).toBe('none')
  })

  it('sets the poster only when the backend has one', () => {
    mockStatus.mockReturnValue({ data: { onboardingVideoStatus: 'ready', onboardingVideoHasPoster: true } })
    render(<OnboardingVideoDialog />)
    expect(document.querySelector('video')!.getAttribute('poster')).toContain(
      'portal/media/onboarding-video/poster',
    )
  })

  it('omits the poster when the backend has none', () => {
    render(<OnboardingVideoDialog />)
    expect(document.querySelector('video')!.getAttribute('poster')).toBeNull()
  })

  it('marks onboarding done as soon as the player opens (any entry point)', () => {
    render(<OnboardingVideoDialog />) // beforeEach sets open: true
    expect(JSON.parse(localStorage.getItem(KEY)!).status).toBe('done')
  })

  it('marks onboarding done when the video finishes', () => {
    render(<OnboardingVideoDialog />)
    fireEvent(document.querySelector('video')!, new Event('ended'))
    expect(JSON.parse(localStorage.getItem(KEY)!).status).toBe('done')
  })

  it('does not mark done while closed', () => {
    useOnboardingVideo.setState({ open: false })
    render(<OnboardingVideoDialog />)
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('shows a graceful message and no video on load error', () => {
    render(<OnboardingVideoDialog />)
    fireEvent(document.querySelector('video')!, new Event('error'))
    expect(screen.getByText(/couldn't be loaded/i)).toBeInTheDocument()
    expect(document.querySelector('video')).toBeNull()
  })

  it('renders no video when closed', () => {
    useOnboardingVideo.setState({ open: false })
    render(<OnboardingVideoDialog />)
    expect(document.querySelector('video')).toBeNull()
  })
})
