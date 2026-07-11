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
  const { ready, seenAnnouncements } = useAnnouncementsSeen()
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

  const blocked =
    paletteOpen || shortcutsOpen || activeModal !== null || onboardingVideoOpen || onboardingBannerVisible

  useEffect(() => {
    if (autoOpened.current || !ready || !newestUnseen || blocked) return
    autoOpened.current = true
    present([newestUnseen])
    openModal('announcement')
  }, [ready, newestUnseen, blocked, present, openModal])

  return (
    <>
      <WhatsNewModal />
      <FeatureSpotlight />
    </>
  )
}
