import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog'
import { useOnboardingVideo } from '@/lib/onboardingVideoStore'
import { useOnboardingVideoStatus } from '@/hooks/useInfo'
import { useOnboardingSeen } from '@/lib/onboardingSeen'

const VIDEO_URL = `${import.meta.env.BASE_URL}portal/media/onboarding-video`
const POSTER_URL = `${import.meta.env.BASE_URL}portal/media/onboarding-video/poster`

/**
 * Globally-mounted onboarding-video player (mounted in AppShell like the shortcuts
 * dialog). Open-state lives in the ephemeral onboardingVideo store so the header button
 * and coachmark can both open it.
 *
 * The <video> is only in the DOM while the dialog is open, so `preload="none"` means the
 * ~11 MB never loads for anyone who doesn't open it. Opening is a user gesture, so
 * autoPlay-with-sound is permitted; native controls are the fallback. Finishing the video
 * marks onboarding done (no more coachmark). A poster is used only when the backend has one.
 */
export function OnboardingVideoDialog() {
  const open = useOnboardingVideo((s) => s.open)
  const setOpen = useOnboardingVideo((s) => s.setOpen)
  const { data } = useOnboardingVideoStatus()
  const hasPoster = data?.onboardingVideoHasPoster === true
  const { markDone } = useOnboardingSeen()
  const [errored, setErrored] = useState(false)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setErrored(false)
      }}
    >
      <DialogContent className="max-w-3xl overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="px-5 pt-5">
          <DialogTitle>Welcome to the Components Registry</DialogTitle>
          <DialogDescription>A short tour of what you can do in the portal.</DialogDescription>
        </DialogHeader>
        <div className="mt-3 aspect-video w-full bg-black">
          {open &&
            (errored ? (
              <div className="flex h-full w-full items-center justify-center px-6 text-center text-sm text-white/80">
                The intro video couldn&apos;t be loaded right now. Please try again later.
              </div>
            ) : (
              <video
                className="h-full w-full"
                src={VIDEO_URL}
                poster={hasPoster ? POSTER_URL : undefined}
                preload="none"
                controls
                autoPlay
                playsInline
                onEnded={markDone}
                onError={() => setErrored(true)}
              />
            ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
