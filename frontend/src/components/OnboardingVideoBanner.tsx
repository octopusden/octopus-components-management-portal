import { useState } from 'react'
import { PlayCircle, X } from 'lucide-react'
import { Button } from './ui/button'
import { useOnboardingVideoStatus } from '@/hooks/useInfo'
import { useOnboardingVideo } from '@/lib/onboardingVideoStore'
import { useOnboardingSeen } from '@/lib/onboardingSeen'

/**
 * First-login nudge for the onboarding video: a page-wide dismissible strip under the
 * header (not a floating coachmark, so it neither collides with the command-palette
 * coachmark nor gets lost in the corner). Shown only when the video is `ready` AND the
 * per-user seen-state still wants it (pending / snoozed-below-cap). Actions mirror the
 * previous coachmark: Watch (primary, marks done) / Later (snooze, re-shows up to the cap)
 * / Don't show again (terminal) / × (= Later). The permanent re-watch path is the header
 * button (OnboardingVideoButton), which stays regardless.
 */
export function OnboardingVideoBanner() {
  const { data } = useOnboardingVideoStatus()
  const ready = data?.onboardingVideoStatus === 'ready'
  const openVideo = useOnboardingVideo((s) => s.openVideo)
  const { shouldShow, markDone, snoozeLater, dismissForever } = useOnboardingSeen()

  // Session-local close so an action hides the banner immediately even when the seen-state
  // stays eligible (a snooze keeps shouldShow true below the cap for the NEXT session).
  const [closed, setClosed] = useState(false)

  if (!ready || !shouldShow || closed) return null

  const watch = () => {
    setClosed(true)
    markDone()
    openVideo()
  }
  const later = () => {
    setClosed(true)
    snoozeLater()
  }
  const never = () => {
    setClosed(true)
    dismissForever()
  }

  return (
    <div
      role="region"
      aria-label="Onboarding video"
      data-testid="onboarding-video-banner"
      className="border-b border-border bg-gradient-to-r from-primary/10 via-primary/5 to-transparent animate-in fade-in slide-in-from-top-1 motion-reduce:animate-none"
    >
      <div className="max-w-screen-xl mx-auto px-6 py-2.5 flex items-center gap-3">
        <PlayCircle className="h-5 w-5 shrink-0 text-primary" aria-hidden />
        <p className="text-sm text-foreground">
          <span className="font-medium">New to the portal?</span>{' '}
          <span className="text-muted-foreground">Take a 5-minute video tour of what you can do here.</span>
        </p>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" onClick={watch} className="gap-1.5">
            <PlayCircle className="h-4 w-4" />
            Watch intro
          </Button>
          <Button size="sm" variant="ghost" onClick={later} className="text-muted-foreground">
            Later
          </Button>
          <button
            type="button"
            onClick={never}
            className="text-[11px] text-muted-foreground/70 underline-offset-2 hover:text-muted-foreground hover:underline"
          >
            Don&apos;t show again
          </button>
          <button
            type="button"
            aria-label="Remind me later"
            onClick={later}
            className="rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
