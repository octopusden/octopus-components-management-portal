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

if (ANNOUNCEMENTS.length === 0) throw new Error('ANNOUNCEMENTS manifest must have at least one entry')

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
  it('auto-opens showing every unseen entry when nothing blocks', () => {
    render(<Announcements />)
    expect(useUiOverlay.getState().activeModal).toBe('announcement')
    expect(useAnnouncementsStore.getState().entries.map((e) => e.id)).toEqual(
      ANNOUNCEMENTS.map((a) => a.id),
    )
    expect(screen.getByText("What's new")).toBeInTheDocument()
  })

  it('auto-opens showing only the entries unseen by this user', () => {
    const alreadySeen = ANNOUNCEMENTS[ANNOUNCEMENTS.length - 1]
    if (!alreadySeen) throw new Error('ANNOUNCEMENTS manifest must have at least one entry')
    localStorage.setItem('octopus.portal.seenAnnouncements.alice', JSON.stringify([alreadySeen.id]))
    render(<Announcements />)
    expect(useAnnouncementsStore.getState().entries.map((e) => e.id)).toEqual(
      ANNOUNCEMENTS.filter((a) => a.id !== alreadySeen.id).map((a) => a.id),
    )
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

  it('dismiss marks every shown entry seen and arms the feature spotlight', () => {
    // With nothing seen yet, every entry auto-opens; the spotlight arms for whichever
    // shown entry declares one first (mirrors WhatsNewModal.dismiss's own lookup).
    const withSpotlight = ANNOUNCEMENTS.find((a) => a.spotlightTarget)
    render(<Announcements />)
    fireEvent.click(screen.getByRole('button', { name: /got it/i }))
    expect(useUiOverlay.getState().activeModal).toBeNull()
    expect(useAnnouncementsStore.getState().spotlight).toEqual(
      withSpotlight ? { target: withSpotlight.spotlightTarget, announcementId: withSpotlight.id } : null,
    )
    const seen = JSON.parse(localStorage.getItem('octopus.portal.seenAnnouncements.alice')!)
    expect(seen).toEqual(expect.arrayContaining(ANNOUNCEMENTS.map((a) => a.id)))
  })
})
