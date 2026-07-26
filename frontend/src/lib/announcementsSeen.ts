import { useEffect } from 'react'
import { create } from 'zustand'
import { useCurrentUser } from '@/hooks/useCurrentUser'

// "What's new" seen-state, persisted PER USER in localStorage — same convention as
// onboardingSeen.ts (raw localStorage keyed `<base>.<username>`, resolved only after
// /auth/me; fail-closed when storage is unavailable). Two independent sets are tracked:
//   - seen announcement ids  → suppresses the auto-open modal
//   - seen spotlight ids     → suppresses the one-time feature coach-mark
//
// State lives in a SHARED zustand store (not per-hook useState) so all three announcement
// components (Announcements, WhatsNewModal, FeatureSpotlight) observe the same value — a
// spotlight dismissed in one is immediately seen by the others, so manually reopening the
// modal can't re-arm an already-seen spotlight. A brand-new user is never flooded: the
// auto-open logic (Announcements) shows only the newest unseen entry and seeds the rest seen.

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

interface SeenStore {
  username: string | null
  /** false when storage is unavailable/corrupt — callers fail closed (nothing auto-opens). */
  storageOk: boolean
  seenAnnouncements: string[]
  seenSpotlights: string[]
  hydrate: (username: string | null) => void
  markAnnouncementsSeen: (ids: string[]) => void
  markSpotlightSeen: (id: string) => void
}

/** Exported for tests (reset between cases); app code uses the useAnnouncementsSeen hook. */
export const useAnnouncementsSeenStore = create<SeenStore>((set, get) => ({
  username: null,
  storageOk: false,
  seenAnnouncements: [],
  seenSpotlights: [],
  hydrate: (username) => {
    if (!username) {
      set({ username: null, storageOk: false, seenAnnouncements: [], seenSpotlights: [] })
      return
    }
    const ann = readIds(ANNOUNCEMENTS_KEY_PREFIX + username)
    const spot = readIds(SPOTLIGHT_KEY_PREFIX + username)
    set({
      username,
      storageOk: ann !== null && spot !== null,
      seenAnnouncements: ann ?? [],
      seenSpotlights: spot ?? [],
    })
  },
  markAnnouncementsSeen: (ids) => {
    const { username, seenAnnouncements } = get()
    if (!username) return
    const merged = Array.from(new Set([...seenAnnouncements, ...ids]))
    writeIds(ANNOUNCEMENTS_KEY_PREFIX + username, merged)
    set({ seenAnnouncements: merged })
  },
  markSpotlightSeen: (id) => {
    const { username, seenSpotlights } = get()
    if (!username) return
    const merged = Array.from(new Set([...seenSpotlights, id]))
    writeIds(SPOTLIGHT_KEY_PREFIX + username, merged)
    set({ seenSpotlights: merged })
  },
}))

/**
 * Per-user seen-state for announcements + spotlights, shared across components. `ready`
 * is false until /auth/me resolves (or when storage is unavailable) so nothing auto-opens
 * before we know who the user is — fail-closed. Marking is a union merge (never shrinks).
 */
export function useAnnouncementsSeen() {
  const { data: user } = useCurrentUser()
  const username = user?.username ?? null
  const hydrate = useAnnouncementsSeenStore((s) => s.hydrate)

  useEffect(() => {
    hydrate(username)
  }, [username, hydrate])

  const hydratedUsername = useAnnouncementsSeenStore((s) => s.username)
  const storageOk = useAnnouncementsSeenStore((s) => s.storageOk)
  const seenAnnouncements = useAnnouncementsSeenStore((s) => s.seenAnnouncements)
  const seenSpotlights = useAnnouncementsSeenStore((s) => s.seenSpotlights)
  const markAnnouncementsSeen = useAnnouncementsSeenStore((s) => s.markAnnouncementsSeen)
  const markSpotlightSeen = useAnnouncementsSeenStore((s) => s.markSpotlightSeen)

  return {
    // Ready only once the store is hydrated for the CURRENT user and storage works.
    ready: username !== null && hydratedUsername === username && storageOk,
    seenAnnouncements,
    seenSpotlights,
    markAnnouncementsSeen,
    markSpotlightSeen,
  }
}
