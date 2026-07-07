import { useCallback, useEffect, useState } from 'react'
import { useCurrentUser } from '@/hooks/useCurrentUser'

// First-login onboarding-video coachmark state, persisted PER USER in localStorage.
//
// We deliberately use raw localStorage (not zustand `persist`, which binds a single
// static key at import time) because the key is `<base>.<username>` — resolved only
// after /auth/me loads. Mirrors the try/catch discipline of SearchCommandButton so a
// private-mode/storage-less browser fails closed (coachmark simply never shows).
//
// status:
//   pending    — never seen; show the coachmark.
//   later       — snoozed; show again next session up to LATER_CAP times.
//   done        — watched (or opened); never show again.
//   dismissed   — explicit "don't show again", or later-cap reached; never show again.

export type OnboardingSeenStatus = 'pending' | 'later' | 'done' | 'dismissed'

export interface OnboardingSeenState {
  status: OnboardingSeenStatus
  shownCount: number
}

const KEY_PREFIX = 'octopus.portal.onboardingVideoSeen.'
export const LATER_CAP = 3

const DEFAULT_STATE: OnboardingSeenState = { status: 'pending', shownCount: 0 }
const VALID: OnboardingSeenStatus[] = ['pending', 'later', 'done', 'dismissed']

function keyFor(username: string): string {
  return `${KEY_PREFIX}${username}`
}

/**
 * Reads the persisted state. Returns DEFAULT_STATE for a first-time user, or `null`
 * when storage is unavailable/corrupt — callers treat `null` as fail-closed (no coachmark).
 */
export function readSeen(username: string): OnboardingSeenState | null {
  try {
    const raw = localStorage.getItem(keyFor(username))
    if (raw == null) return DEFAULT_STATE
    const parsed = JSON.parse(raw) as Partial<OnboardingSeenState>
    const status = VALID.includes(parsed.status as OnboardingSeenStatus)
      ? (parsed.status as OnboardingSeenStatus)
      : 'pending'
    const shownCount = typeof parsed.shownCount === 'number' && parsed.shownCount >= 0 ? parsed.shownCount : 0
    return { status, shownCount }
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
  if (state == null) return false
  return state.status === 'pending' || (state.status === 'later' && state.shownCount < LATER_CAP)
}

/**
 * Per-user coachmark state + transition actions. `state` is null until /auth/me
 * resolves (or when storage is unavailable) so the coachmark stays hidden — fail-closed.
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

  // Transitions re-read the LATEST persisted value (not the captured render state) so a write
  // from another mounted hook instance or another tab isn't clobbered — and a snooze can never
  // downgrade a terminal `done`/`dismissed` back to `later` (which would re-show the nudge).
  const markDone = useCallback(() => {
    if (!username) return
    update({ status: 'done', shownCount: readSeen(username)?.shownCount ?? 0 })
  }, [update, username])
  const snoozeLater = useCallback(() => {
    if (!username) return
    const latest = readSeen(username)
    if (latest && (latest.status === 'done' || latest.status === 'dismissed')) return
    const shownCount = (latest?.shownCount ?? 0) + 1
    update({ status: shownCount >= LATER_CAP ? 'dismissed' : 'later', shownCount })
  }, [update, username])
  const dismissForever = useCallback(() => {
    if (!username) return
    update({ status: 'dismissed', shownCount: readSeen(username)?.shownCount ?? 0 })
  }, [update, username])

  return { state, shouldShow: shouldShowCoachmark(state), markDone, snoozeLater, dismissForever }
}
