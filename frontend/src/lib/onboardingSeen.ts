import { useCallback, useEffect, useState } from 'react'
import { useCurrentUser } from '@/hooks/useCurrentUser'

// Onboarding-video nudge state, persisted PER USER in localStorage.
//
// We deliberately use raw localStorage (not zustand `persist`, which binds a single
// static key at import time) because the key is `<base>.<username>` — resolved only
// after /auth/me loads. Mirrors the try/catch discipline of SearchCommandButton so a
// private-mode/storage-less browser fails closed (banner simply never shows).
//
// Only two things silence the banner for good; everything else re-shows next session:
//   pending    — not yet acted on; show the banner.
//   done       — user opened/watched the intro; never show again.
//   dismissed  — user clicked "Not interested"; never show again.
// Closing the banner (×) or just ignoring it persists NOTHING, so it stays `pending`
// and shows again on the next session (a new page load resets the session dismissal).

export type OnboardingSeenStatus = 'pending' | 'done' | 'dismissed'

export interface OnboardingSeenState {
  status: OnboardingSeenStatus
}

const KEY_PREFIX = 'octopus.portal.onboardingVideoSeen.'

const DEFAULT_STATE: OnboardingSeenState = { status: 'pending' }
const VALID: OnboardingSeenStatus[] = ['pending', 'done', 'dismissed']

function keyFor(username: string): string {
  return `${KEY_PREFIX}${username}`
}

/**
 * Reads the persisted state. Returns DEFAULT_STATE for a first-time user, or `null`
 * when storage is unavailable/corrupt — callers treat `null` as fail-closed (no banner).
 */
export function readSeen(username: string): OnboardingSeenState | null {
  try {
    const raw = localStorage.getItem(keyFor(username))
    if (raw == null) return DEFAULT_STATE
    const parsed = JSON.parse(raw) as Partial<OnboardingSeenState>
    const status = VALID.includes(parsed.status as OnboardingSeenStatus)
      ? (parsed.status as OnboardingSeenStatus)
      : 'pending'
    return { status }
  } catch {
    return null
  }
}

function writeSeen(username: string, state: OnboardingSeenState): void {
  try {
    localStorage.setItem(keyFor(username), JSON.stringify(state))
  } catch {
    // Best-effort; storage-less browsers just won't persist.
  }
}

export function shouldShowCoachmark(state: OnboardingSeenState | null): boolean {
  return state?.status === 'pending'
}

/**
 * Per-user nudge state + transition actions. `state` is null until /auth/me resolves
 * (or when storage is unavailable) so the banner stays hidden — fail-closed. Only the
 * two terminal transitions persist; closing/ignoring the banner persists nothing.
 */
export function useOnboardingSeen() {
  const { data: user } = useCurrentUser()
  const username = user?.username
  const [state, setState] = useState<OnboardingSeenState | null>(null)

  useEffect(() => {
    setState(username ? readSeen(username) : null)
  }, [username])

  const update = useCallback(
    (next: OnboardingSeenState) => {
      if (!username) return
      writeSeen(username, next)
      setState(next)
    },
    [username],
  )

  const markDone = useCallback(() => update({ status: 'done' }), [update])
  const dismissForever = useCallback(() => update({ status: 'dismissed' }), [update])

  return { state, shouldShow: shouldShowCoachmark(state), markDone, dismissForever }
}
