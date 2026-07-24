import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Announcements } from './Announcements'
import { ANNOUNCEMENTS } from '@/announcements/announcements'
import { useUiOverlay } from '@/lib/uiOverlayStore'
import { useAnnouncementsStore } from '@/lib/announcementsStore'
import { useAnnouncementsSeenStore } from '@/lib/announcementsSeen'
import { useOnboardingVideo } from '@/lib/onboardingVideoStore'

const bannerVisible = vi.fn()
vi.mock('@/hooks/useOnboardingBannerVisible', () => ({
  useOnboardingBannerVisible: () => bannerVisible(),
}))
vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({ data: { username: 'alice' } }),
}))
vi.mock('@/hooks/useInfo', () => ({
  useOnboardingVideoStatus: () => ({ data: { onboardingVideoStatus: 'disabled' } }),
}))

const SEED = ANNOUNCEMENTS[0]
if (!SEED) throw new Error('ANNOUNCEMENTS manifest must have at least one entry')

beforeEach(() => {
  localStorage.clear()
  bannerVisible.mockReturnValue(false)
  useUiOverlay.setState({ paletteOpen: false, shortcutsOpen: false, activeModal: null })
  useAnnouncementsStore.setState({ entries: [], spotlight: null })
  // Reset the shared (module-global) seen store so stale state from a prior test can't
  // leak into the first render and trip the one-shot auto-open.
  useAnnouncementsSeenStore.setState({ username: null, storageOk: false, seenAnnouncements: [], seenSpotlights: [] })
  useOnboardingVideo.setState({ open: false, bannerDismissed: false })
})

describe('Announcements auto-open', () => {
  it('auto-opens the newest unseen entry when nothing blocks', () => {
    render(<Announcements />)
    expect(useUiOverlay.getState().activeModal).toBe('announcement')
    expect(useAnnouncementsStore.getState().entries.map((e) => e.id)).toEqual([SEED.id])
    expect(screen.getByText("What's new")).toBeInTheDocument()
  })

  it('yields while another overlay is open', () => {
    useUiOverlay.setState({ paletteOpen: true })
    render(<Announcements />)
    expect(useUiOverlay.getState().activeModal).toBeNull()
  })

  it('yields while the onboarding banner is pending', () => {
    bannerVisible.mockReturnValue(true)
    render(<Announcements />)
    expect(useUiOverlay.getState().activeModal).toBeNull()
  })

  it('does not auto-open in an automated browser (navigator.webdriver)', () => {
    const original = Object.getOwnPropertyDescriptor(navigator, 'webdriver')
    Object.defineProperty(navigator, 'webdriver', { configurable: true, value: true })
    try {
      render(<Announcements />)
      expect(useUiOverlay.getState().activeModal).toBeNull()
    } finally {
      if (original) Object.defineProperty(navigator, 'webdriver', original)
      else Object.defineProperty(navigator, 'webdriver', { configurable: true, value: false })
    }
  })

  it('does not re-open an already-seen announcement', () => {
    // Mark every entry seen, not just SEED — otherwise an older still-unseen entry
    // would become the new "newest unseen" and the modal would (correctly) reopen.
    localStorage.setItem(
      'octopus.portal.seenAnnouncements.alice',
      JSON.stringify(ANNOUNCEMENTS.map((a) => a.id)),
    )
    render(<Announcements />)
    expect(useUiOverlay.getState().activeModal).toBeNull()
  })

  it('dismiss marks it seen and arms the feature spotlight', () => {
    render(<Announcements />)
    fireEvent.click(screen.getByRole('button', { name: /got it/i }))
    expect(useUiOverlay.getState().activeModal).toBeNull()
    expect(useAnnouncementsStore.getState().spotlight).toEqual(
      SEED.spotlightTarget ? { target: SEED.spotlightTarget, announcementId: SEED.id } : null,
    )
    expect(JSON.parse(localStorage.getItem('octopus.portal.seenAnnouncements.alice')!)).toContain(SEED.id)
  })
})
