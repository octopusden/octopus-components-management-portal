import { useEffect, useRef, useState } from 'react'
import { PlayCircle, X } from 'lucide-react'
import { Button } from './ui/button'
import { useOnboardingVideoStatus } from '@/hooks/useInfo'
import { useOnboardingVideo } from '@/lib/onboardingVideoStore'
import { useOnboardingSeen } from '@/lib/onboardingSeen'

/**
 * Header entry point for the onboarding presentation video: a quiet always-available
 * "Watch intro" button (rendered only when the backend reports the video `ready`), plus a
 * first-login coachmark anchored to it.
 *
 * Best-practice onboarding UX: never a blocking modal on first load. The coachmark is a
 * dismissible bubble with a clear hierarchy — Watch (primary) / Later (soft, re-shows up
 * to LATER_CAP sessions) / Don't show again (muted, terminal). The button itself always
 * stays as the permanent re-watch path, whatever the coachmark state.
 */
export function OnboardingVideoButton() {
  const { data } = useOnboardingVideoStatus()
  const ready = data?.onboardingVideoStatus === 'ready'
  const openVideo = useOnboardingVideo((s) => s.openVideo)
  const { shouldShow, markDone, snoozeLater, dismissForever } = useOnboardingSeen()

  // Auto-open the coachmark at most once per mount (a snooze keeps `shouldShow` true
  // below the cap, but we must not immediately re-open it in the same session).
  const [coachOpen, setCoachOpen] = useState(false)
  const autoShown = useRef(false)
  useEffect(() => {
    if (ready && shouldShow && !autoShown.current) {
      autoShown.current = true
      setCoachOpen(true)
    }
  }, [ready, shouldShow])

  if (!ready) return null

  const watch = () => {
    setCoachOpen(false)
    markDone()
    openVideo()
  }
  const later = () => {
    setCoachOpen(false)
    snoozeLater()
  }
  const never = () => {
    setCoachOpen(false)
    dismissForever()
  }

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        onClick={openVideo}
        className="gap-2 text-muted-foreground"
        aria-label="Watch the intro video"
        title="Watch intro"
      >
        <PlayCircle className="h-4 w-4" />
        <span className="hidden md:inline">Watch intro</span>
      </Button>

      {coachOpen && (
        <div
          role="status"
          data-testid="onboarding-video-coachmark"
          className="absolute right-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-lg animate-in fade-in slide-in-from-top-1 motion-reduce:animate-none"
        >
          {/* Subtle brand-tinted header strip keeps it feeling like a "welcome", not an alert. */}
          <div className="bg-gradient-to-br from-primary/10 to-transparent p-3.5">
            <button
              type="button"
              aria-label="Remind me later"
              onClick={later}
              className="absolute right-2 top-2 rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            <p className="pr-5 text-sm font-semibold text-foreground">New to the portal?</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Take a 5-minute video tour of what you can do here.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <Button size="sm" onClick={watch} className="gap-1.5">
                <PlayCircle className="h-4 w-4" />
                Watch
              </Button>
              <Button size="sm" variant="ghost" onClick={later} className="text-muted-foreground">
                Later
              </Button>
              <button
                type="button"
                onClick={never}
                className="ml-auto text-[11px] text-muted-foreground/70 underline-offset-2 hover:text-muted-foreground hover:underline"
              >
                Don&apos;t show again
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
