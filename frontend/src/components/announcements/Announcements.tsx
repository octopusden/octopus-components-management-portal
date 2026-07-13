import { useEffect, useMemo, useRef } from 'react'
import { ANNOUNCEMENTS } from '@/announcements/announcements'
import { useAnnouncementsSeen } from '@/lib/announcementsSeen'
import { useAnnouncementsStore } from '@/lib/announcementsStore'
import { useUiOverlay } from '@/lib/uiOverlayStore'
import { useOnboardingVideo } from '@/lib/onboardingVideoStore'
import { useOnboardingBannerVisible } from '@/hooks/useOnboardingBannerVisible'
import { WhatsNewModal } from './WhatsNewModal'
import { FeatureSpotlight } from './FeatureSpotlight'

/**
 * SYS-062 "What's new" orchestrator, mounted once in AppShell. Owns the auto-open
 * decision and renders the modal + spotlight. Auto-open shows ONLY the single newest
 * unseen entry (never floods a new user with history) and YIELDS to any open overlay
 * and to a pending onboarding nudge/player, so popups never stack.
 */
export function Announcements() {
  const { ready, seenAnnouncements, markAnnouncementsSeen } = useAnnouncementsSeen()
  const present = useAnnouncementsStore((s) => s.present)
  const openModal = useUiOverlay((s) => s.openModal)
  const paletteOpen = useUiOverlay((s) => s.paletteOpen)
  const shortcutsOpen = useUiOverlay((s) => s.shortcutsOpen)
  const activeModal = useUiOverlay((s) => s.activeModal)
  const onboardingVideoOpen = useOnboardingVideo((s) => s.open)
  const onboardingBannerVisible = useOnboardingBannerVisible()
  const autoOpened = useRef(false)

  const newestUnseen = useMemo(
    () => ANNOUNCEMENTS.find((a) => !seenAnnouncements.includes(a.id)) ?? null,
    [seenAnnouncements],
  )

  // Never auto-interrupt an automated browser (Playwright/WebDriver) with the What's-new
  // interstitial: it traps focus and blocks clicks, which would break unrelated e2e flows
  // (real users never have navigator.webdriver). The manual "What's new" button still works,
  // so a test that wants the modal can open it explicitly. Mirrors how the onboarding banner
  // stays out of e2e (its media repo is never 'ready' there).
  const isAutomated = typeof navigator !== 'undefined' && navigator.webdriver === true

  const blocked =
    isAutomated || paletteOpen || shortcutsOpen || activeModal !== null || onboardingVideoOpen || onboardingBannerVisible

  useEffect(() => {
    if (autoOpened.current || !ready || !newestUnseen || blocked) return
    // Also yield to any page-local dialog already open (e.g. the unsaved-changes prompt) so
    // the auto-announcement never stacks on top of one it doesn't know about.
    if (typeof document !== 'undefined' && document.querySelector('[role="dialog"][data-state="open"]')) return
    autoOpened.current = true
    // Show ONLY the newest unseen entry; seed every older entry as seen so a first-time user
    // is never walked through the whole history on successive reloads (they remain reachable
    // via the manual "What's new" button). The newest is marked seen when the modal closes.
    const older = ANNOUNCEMENTS.filter((a) => a.id !== newestUnseen.id).map((a) => a.id)
    if (older.length > 0) markAnnouncementsSeen(older)
    present([newestUnseen])
    openModal('announcement')
  }, [ready, newestUnseen, blocked, present, openModal, markAnnouncementsSeen])

  return (
    <>
      <WhatsNewModal />
      <FeatureSpotlight />
    </>
  )
}
