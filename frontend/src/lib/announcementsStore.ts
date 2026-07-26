import { create } from 'zustand'
import type { Announcement } from '@/announcements/announcements'

/**
 * Ephemeral view-state for the "What's new" surface (NOT persisted — that's
 * announcementsSeen). Holds which entries the modal currently shows and the pending
 * feature spotlight. Modal OPEN/CLOSE itself is the shared overlay coordinator
 * (uiOverlayStore `activeModal === 'announcement'`); this store only carries the payload.
 */
export interface PendingSpotlight {
  target: string
  announcementId: string
}

interface AnnouncementsState {
  /** Entries shown in the modal — a single newest-unseen on auto-open, or all when manual. */
  entries: Announcement[]
  spotlight: PendingSpotlight | null
  present: (entries: Announcement[]) => void
  clearEntries: () => void
  setSpotlight: (spotlight: PendingSpotlight | null) => void
}

export const useAnnouncementsStore = create<AnnouncementsState>((set) => ({
  entries: [],
  spotlight: null,
  present: (entries) => set({ entries }),
  clearEntries: () => set({ entries: [] }),
  setSpotlight: (spotlight) => set({ spotlight }),
}))
