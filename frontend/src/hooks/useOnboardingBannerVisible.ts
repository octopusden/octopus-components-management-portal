import { useOnboardingVideoStatus } from './useInfo'
import { useOnboardingVideo } from '@/lib/onboardingVideoStore'
import { useOnboardingSeen } from '@/lib/onboardingSeen'

/**
 * Whether the first-login onboarding nudge is currently eligible to show: the video is
 * ready, the per-user seen-state still wants it, and it hasn't been dismissed this session.
 *
 * Lives in its own module (not the banner component file) so other one-off nudges — e.g.
 * the ⌘K command-palette coachmark in SearchCommandButton — can import it to yield to the
 * banner (one first-run popup at a time) without tripping react-refresh's
 * "only export components" rule. Consumers get their own useOnboardingSeen read (mount-time),
 * which is enough to decide whether to suppress themselves.
 */
export function useOnboardingBannerVisible(): boolean {
  const { data } = useOnboardingVideoStatus()
  const bannerDismissed = useOnboardingVideo((s) => s.bannerDismissed)
  const { shouldShow } = useOnboardingSeen()
  return data?.onboardingVideoStatus === 'ready' && shouldShow && !bannerDismissed
}
