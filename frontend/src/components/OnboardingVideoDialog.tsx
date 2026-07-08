import { useEffect, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog'
import { useOnboardingVideo } from '@/lib/onboardingVideoStore'
import { useOnboardingVideoStatus } from '@/hooks/useInfo'
import { useOnboardingSeen } from '@/lib/onboardingSeen'

const VIDEO_URL = `${import.meta.env.BASE_URL}portal/media/onboarding-video`
const POSTER_URL = `${import.meta.env.BASE_URL}portal/media/onboarding-video/poster`
const VIEW_URL = `${import.meta.env.BASE_URL}portal/media/onboarding-video/view`

// Fire-and-forget usage ping: records an ONBOARDING_VIDEO_VIEW in the CRS journal (backend
// resolves the username). Plain fetch (not the `api` wrapper) because the endpoint returns
// an empty 202 and telemetry must never surface an error or trigger the 401→OIDC redirect.
// Sends the double-submit CSRF header the BFF requires for non-safe methods.
function reportVideoView(): void {
  try {
    const csrf = document.cookie.match(/(?:^|; )XSRF-TOKEN=([^;]+)/)?.[1]
    void fetch(VIEW_URL, {
      method: 'POST',
      credentials: 'include',
      headers: csrf ? { 'X-XSRF-TOKEN': decodeURIComponent(csrf) } : {},
    }).catch(() => {})
  } catch {
    // best-effort
  }
}

/**
 * Globally-mounted onboarding-video player (mounted in AppShell like the shortcuts
 * dialog). Open-state lives in the ephemeral onboardingVideo store so the header button
 * and coachmark can both open it.
 *
 * The <video> is only in the DOM while the dialog is open, so `preload="none"` means the
 * ~11 MB never loads for anyone who doesn't open it. Opening is a user gesture, so
 * autoPlay-with-sound is permitted; native controls are the fallback. A poster is used
 * only when the backend has one.
 *
 * Opening the player (from ANY entry point — the header button or the banner) marks
 * onboarding as done, so the first-login banner never nags a user who has already engaged,
 * regardless of whether they watch to the end. This is the single place both entry points
 * funnel through, which fixes the gap where clicking the header button (which just opens
 * the dialog) left the seen-state untouched.
 */
export function OnboardingVideoDialog() {
  const open = useOnboardingVideo((s) => s.open)
  const setOpen = useOnboardingVideo((s) => s.setOpen)
  const { data } = useOnboardingVideoStatus()
  const hasPoster = data?.onboardingVideoHasPoster === true
  const { state: seen, markDone } = useOnboardingSeen()
  const [errored, setErrored] = useState(false)
  // One usage ping per open: reset when the dialog closes so re-opening counts a fresh view.
  const viewReported = useRef(false)

  // Mark done when the player opens. Guarded on the current status so this settles in one
  // pass (markDone flips status → effect re-runs → condition false) rather than looping.
  useEffect(() => {
    if (open && seen && seen.status !== 'done') markDone()
  }, [open, seen, markDone])

  useEffect(() => {
    if (!open) viewReported.current = false
  }, [open])

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
                onPlay={() => {
                  if (!viewReported.current) {
                    viewReported.current = true
                    reportVideoView()
                  }
                }}
                onEnded={markDone}
                onError={() => setErrored(true)}
              />
            ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
