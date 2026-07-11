import { useCallback, useEffect, useState } from 'react'
import { useCurrentUser } from '@/hooks/useCurrentUser'

// "What's new" seen-state, persisted PER USER in localStorage — same convention as
// onboardingSeen.ts (raw localStorage keyed `<base>.<username>`, resolved only after
// /auth/me; fail-closed when storage is unavailable). Two independent sets are tracked:
//   - seen announcement ids  → suppresses the auto-open modal
//   - seen spotlight ids     → suppresses the one-time feature coach-mark
// A brand-new user (empty state) is NOT flooded with history: the auto-open logic
// (useAnnouncements) only ever shows the single newest unseen entry.

const ANNOUNCEMENTS_KEY_PREFIX = 'octopus.portal.seenAnnouncements.'
const SPOTLIGHT_KEY_PREFIX = 'octopus.portal.seenSpotlight.'

function readIds(key: string): string[] | null {
  try {
    const raw = localStorage.getItem(key)
    if (raw == null) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return null
  }
}

function writeIds(key: string, ids: string[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(ids))
  } catch {
    // Best-effort; storage-less browsers just won't persist (auto-open may re-show).
  }
}

/**
 * Per-user seen-state for announcements + spotlights. `ready` is false until /auth/me
 * resolves (or when storage is unavailable) so nothing auto-opens before we know who the
 * user is — fail-closed. Marking is a union merge (never shrinks).
 */
export function useAnnouncementsSeen() {
  const { data: user } = useCurrentUser()
  const username = user?.username
  const [seenAnnouncements, setSeenAnnouncements] = useState<string[] | null>(null)
  const [seenSpotlights, setSeenSpotlights] = useState<string[] | null>(null)

  useEffect(() => {
    if (!username) {
      setSeenAnnouncements(null)
      setSeenSpotlights(null)
      return
    }
    setSeenAnnouncements(readIds(ANNOUNCEMENTS_KEY_PREFIX + username))
    setSeenSpotlights(readIds(SPOTLIGHT_KEY_PREFIX + username))
  }, [username])

  const markAnnouncementsSeen = useCallback(
    (ids: string[]) => {
      if (!username) return
      setSeenAnnouncements((prev) => {
        const merged = Array.from(new Set([...(prev ?? []), ...ids]))
        writeIds(ANNOUNCEMENTS_KEY_PREFIX + username, merged)
        return merged
      })
    },
    [username],
  )

  const markSpotlightSeen = useCallback(
    (id: string) => {
      if (!username) return
      setSeenSpotlights((prev) => {
        const merged = Array.from(new Set([...(prev ?? []), id]))
        writeIds(SPOTLIGHT_KEY_PREFIX + username, merged)
        return merged
      })
    },
    [username],
  )

  return {
    ready: seenAnnouncements !== null,
    seenAnnouncements: seenAnnouncements ?? [],
    seenSpotlights: seenSpotlights ?? [],
    markAnnouncementsSeen,
    markSpotlightSeen,
  }
}
