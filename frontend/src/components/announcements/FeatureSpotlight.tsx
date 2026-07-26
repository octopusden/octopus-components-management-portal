import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { useAnnouncementsStore } from '@/lib/announcementsStore'
import { useAnnouncementsSeen } from '@/lib/announcementsSeen'
import { useUiOverlay } from '@/lib/uiOverlayStore'
import { useOnboardingVideo } from '@/lib/onboardingVideoStore'
import { useOnboardingBannerVisible } from '@/hooks/useOnboardingBannerVisible'
import { Button } from '../ui/button'

/**
 * SYS-062 one-time feature coach-mark. When armed (announcementsStore.spotlight) and
 * nothing else is open, it highlights the element carrying `data-spotlight="<target>"`
 * and shows a short tooltip. Dismiss (button / Escape) persists the per-announcement
 * spotlight-seen flag so it never shows again.
 *
 * Rendered ABOVE the sticky header (z-index > 50). The highlight ring is
 * pointer-events-none so the underlying control stays clickable; only the tooltip
 * captures clicks.
 */
export function FeatureSpotlight() {
  const spotlight = useAnnouncementsStore((s) => s.spotlight)
  const setSpotlight = useAnnouncementsStore((s) => s.setSpotlight)
  const { markSpotlightSeen } = useAnnouncementsSeen()
  const anyOverlayOpen = useUiOverlay((s) => s.anyOverlayOpen)
  const paletteOpen = useUiOverlay((s) => s.paletteOpen)
  const shortcutsOpen = useUiOverlay((s) => s.shortcutsOpen)
  const activeModal = useUiOverlay((s) => s.activeModal)
  const onboardingVideoOpen = useOnboardingVideo((s) => s.open)
  const onboardingBannerVisible = useOnboardingBannerVisible()

  const [rect, setRect] = useState<DOMRect | null>(null)

  // Yield while any overlay (palette/shortcuts/modal, the onboarding player, or the
  // first-login onboarding banner) is showing, so the coach-mark never overlaps them.
  const blocked =
    onboardingVideoOpen ||
    onboardingBannerVisible ||
    paletteOpen ||
    shortcutsOpen ||
    activeModal !== null ||
    anyOverlayOpen()
  const active = spotlight !== null && !blocked

  const measure = useCallback(() => {
    if (!spotlight) return
    const el = document.querySelector<HTMLElement>(`[data-spotlight="${spotlight.target}"]`)
    setRect(el ? el.getBoundingClientRect() : null)
  }, [spotlight])

  useLayoutEffect(() => {
    if (!active) return
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [active, measure])

  const dismiss = useCallback(() => {
    if (spotlight) markSpotlightSeen(spotlight.announcementId)
    setSpotlight(null)
    setRect(null)
  }, [spotlight, markSpotlightSeen, setSpotlight])

  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, dismiss])

  if (!active || !rect) return null

  const pad = 6
  const tooltipTop = rect.bottom + 10
  const tooltipLeft = Math.max(12, Math.min(rect.left, window.innerWidth - 300))

  return (
    // pointer-events-none on the full-viewport layer so it never blocks clicks to the app
    // (only the tooltip below re-enables them); the highlighted control stays fully usable.
    <div className="pointer-events-none fixed inset-0 z-[60]" aria-live="polite">
      {/* Highlight ring — does not capture clicks, so the control stays usable. */}
      <div
        className="pointer-events-none absolute rounded-md ring-2 ring-primary ring-offset-2 ring-offset-background transition-all"
        style={{
          top: rect.top - pad,
          left: rect.left - pad,
          width: rect.width + pad * 2,
          height: rect.height + pad * 2,
        }}
      />
      <div
        role="dialog"
        aria-label="New feature"
        className="pointer-events-auto absolute w-72 rounded-lg border bg-popover p-3 text-popover-foreground shadow-lg"
        style={{ top: tooltipTop, left: tooltipLeft }}
      >
        <p className="text-sm font-medium">Here&apos;s the new Feedback button</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Use it any time to report a problem, suggest an idea, or ask a question.
        </p>
        <div className="mt-3 flex justify-end">
          <Button size="sm" onClick={dismiss}>
            Got it
          </Button>
        </div>
      </div>
    </div>
  )
}
