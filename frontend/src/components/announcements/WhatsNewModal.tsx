import { PlayCircle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { Button } from '../ui/button'
import { useUiOverlay } from '@/lib/uiOverlayStore'
import { useAnnouncementsStore } from '@/lib/announcementsStore'
import { useAnnouncementsSeen } from '@/lib/announcementsSeen'
import { useOnboardingVideo } from '@/lib/onboardingVideoStore'
import { useOnboardingVideoStatus } from '@/hooks/useInfo'

/**
 * SYS-062 "What's new" modal. Globally mounted; open state is the shared overlay
 * coordinator (`activeModal === 'announcement'`), payload is announcementsStore.entries.
 * On close it marks the shown entries seen and, if the top entry declares a
 * `spotlightTarget` not yet seen, arms the one-time feature spotlight.
 */
export function WhatsNewModal() {
  const open = useUiOverlay((s) => s.activeModal === 'announcement')
  const closeModal = useUiOverlay((s) => s.closeModal)
  const entries = useAnnouncementsStore((s) => s.entries)
  const clearEntries = useAnnouncementsStore((s) => s.clearEntries)
  const setSpotlight = useAnnouncementsStore((s) => s.setSpotlight)
  const { seenSpotlights, markAnnouncementsSeen } = useAnnouncementsSeen()
  const openVideo = useOnboardingVideo((s) => s.openVideo)
  const { data: videoStatus } = useOnboardingVideoStatus()
  const introVideoReady = videoStatus?.onboardingVideoStatus === 'ready'

  function dismiss() {
    markAnnouncementsSeen(entries.map((e) => e.id))
    const withSpotlight = entries.find((e) => e.spotlightTarget && !seenSpotlights.includes(e.id))
    setSpotlight(
      withSpotlight?.spotlightTarget
        ? { target: withSpotlight.spotlightTarget, announcementId: withSpotlight.id }
        : null,
    )
    closeModal('announcement')
    clearEntries()
  }

  function watchIntro() {
    // Yield the announcement to the onboarding player (single-overlay); keep the
    // spotlight armed for after the video closes.
    dismiss()
    openVideo()
  }

  const wantsIntroButton = entries.some((e) => e.showIntroVideoButton) && introVideoReady

  return (
    <Dialog open={open} onOpenChange={(next) => !next && dismiss()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>What&apos;s new</DialogTitle>
          <DialogDescription>Recent updates to the Components Registry portal.</DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-6 overflow-y-auto">
          {entries.map((e) => (
            <section key={e.id} className="space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="font-semibold">{e.title}</h3>
                <span className="shrink-0 text-xs text-muted-foreground">{e.publishedAt}</span>
              </div>
              <div className="text-sm">{e.body}</div>
              {e.video && (
                <video
                  className="mt-2 w-full rounded border"
                  src={e.video.src}
                  poster={e.video.poster}
                  preload="none"
                  controls
                  playsInline
                />
              )}
            </section>
          ))}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {wantsIntroButton ? (
            <Button type="button" variant="outline" onClick={watchIntro} className="gap-2">
              <PlayCircle className="h-4 w-4" />
              Watch the intro
            </Button>
          ) : (
            <span />
          )}
          <Button type="button" onClick={dismiss}>
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
