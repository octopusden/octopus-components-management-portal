import { useState } from 'react'
import { PlayCircle, X } from 'lucide-react'
import { Button } from './ui/button'
import { useOnboardingVideoStatus } from '@/hooks/useInfo'
import { useOnboardingVideo } from '@/lib/onboardingVideoStore'
import { useOnboardingSeen } from '@/lib/onboardingSeen'

const POSTER_URL = `${import.meta.env.BASE_URL}portal/media/onboarding-video/poster`

/**
 * First-login onboarding nudge: a floating card (bottom-LEFT — the bottom-right corner is
 * the toast viewport, and sticky destructive toasts would otherwise cover it) whose hero is
 * the video's poster frame with a Play overlay — clicking it opens the player. Watching or
 * "Not interested" silence it for good; × (or ignoring it) only closes it for the session,
 * so it shows again next time. Session dismissal lives in the store so it survives
 * navigation (Layout/AppShell remounts); the permanent re-watch path is the header button.
 */
export function OnboardingVideoBanner() {
  const { data } = useOnboardingVideoStatus()
  const ready = data?.onboardingVideoStatus === 'ready'
  const hasPoster = data?.onboardingVideoHasPoster === true
  const openVideo = useOnboardingVideo((s) => s.openVideo)
  const bannerDismissed = useOnboardingVideo((s) => s.bannerDismissed)
  const dismissBanner = useOnboardingVideo((s) => s.dismissBanner)
  const { shouldShow, markDone, dismissForever } = useOnboardingSeen()
  const [posterFailed, setPosterFailed] = useState(false)

  if (!ready || !shouldShow || bannerDismissed) return null

  // Watching or "Not interested" silence the banner for good; a plain close (×) only hides
  // it for this session (persists nothing) so it shows again next time — matching "only the
  // two explicit decisions stop it; ignoring it doesn't".
  const watch = () => {
    markDone()
    openVideo()
  }
  const notInterested = () => {
    dismissBanner()
    dismissForever()
  }
  const closeForNow = () => {
    dismissBanner()
  }

  const showPoster = hasPoster && !posterFailed

  return (
    <div
      role="status"
      aria-label="Onboarding video"
      data-testid="onboarding-video-banner"
      className="fixed bottom-4 left-4 z-50 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-card shadow-2xl animate-in fade-in slide-in-from-bottom-2 motion-reduce:animate-none"
    >
      {/* Poster hero with a Play overlay — the whole thing opens the player. */}
      <button
        type="button"
        onClick={watch}
        aria-label="Play the intro video"
        className="group relative block aspect-video w-full bg-gradient-to-br from-primary/25 to-primary/5"
      >
        {showPoster && (
          <img
            src={POSTER_URL}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            onError={() => setPosterFailed(true)}
          />
        )}
        <span className="absolute inset-0 flex items-center justify-center bg-black/20 transition-colors group-hover:bg-black/30">
          <PlayCircle className="h-14 w-14 text-white drop-shadow-lg transition-transform group-hover:scale-110" />
        </span>
      </button>

      <button
        type="button"
        aria-label="Close"
        onClick={closeForNow}
        className="absolute right-2 top-2 rounded-full bg-black/40 p-1 text-white/90 hover:bg-black/60 hover:text-white"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="p-3.5">
        <p className="text-sm font-semibold text-foreground">New to the portal?</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Take a 5-minute video tour of what you can do here.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <Button size="sm" onClick={watch} className="gap-1.5">
            <PlayCircle className="h-4 w-4" />
            Watch intro
          </Button>
          <button
            type="button"
            onClick={notInterested}
            className="ml-auto text-xs text-muted-foreground/80 underline-offset-2 hover:text-muted-foreground hover:underline"
          >
            Not interested
          </button>
        </div>
      </div>
    </div>
  )
}
