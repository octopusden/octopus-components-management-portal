import { PlayCircle } from 'lucide-react'
import { Button } from './ui/button'
import { useOnboardingVideoStatus } from '@/hooks/useInfo'
import { useOnboardingVideo } from '@/lib/onboardingVideoStore'

/**
 * Permanent header entry point for the onboarding presentation video: a quiet
 * always-available "Watch intro" button, rendered only when the backend reports the
 * video `ready`. The first-login nudge lives in OnboardingVideoBanner (a page-wide strip
 * under the header) rather than a floating coachmark here, so it can't collide with the
 * command-palette coachmark and is more noticeable.
 */
export function OnboardingVideoButton() {
  const { data } = useOnboardingVideoStatus()
  const openVideo = useOnboardingVideo((s) => s.openVideo)

  if (data?.onboardingVideoStatus !== 'ready') return null

  return (
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
  )
}
