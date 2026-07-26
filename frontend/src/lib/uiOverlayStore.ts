import { create } from 'zustand'

/**
 * Coordinator for the app's global overlays so they never stack.
 *
 * Two families share this store:
 *  1. The keyboard-driven overlays — the ⌘K command palette and the "?" shortcuts
 *     panel. Opening one closes the other (⌘K from the shortcuts panel swaps straight
 *     to the palette, and vice versa).
 *  2. The "big" app modals (SYS-062 feedback + What's-new announcement), tracked by a
 *     single [activeModal] discriminator so at most one is open, and opening a modal
 *     also closes the palette/shortcuts. The announcement auto-open is deferred while
 *     ANY overlay here is open (see useAnnouncements), and the feature spotlight waits
 *     until everything is closed.
 *
 * Onboarding keeps its own store (onboardingVideoStore) but is consulted for precedence
 * by the announcement logic — the auto-announcement yields to a pending onboarding nudge.
 */
export type ActiveModal = 'feedback' | 'announcement' | null

interface UiOverlayState {
  paletteOpen: boolean
  shortcutsOpen: boolean
  activeModal: ActiveModal
  openPalette: () => void
  closePalette: () => void
  togglePalette: () => void
  openShortcuts: () => void
  closeShortcuts: () => void
  setPaletteOpen: (open: boolean) => void
  setShortcutsOpen: (open: boolean) => void
  openModal: (modal: Exclude<ActiveModal, null>) => void
  closeModal: (modal: Exclude<ActiveModal, null>) => void
  /** True when nothing in this store is open — the spotlight's go-signal. */
  anyOverlayOpen: () => boolean
}

export const useUiOverlay = create<UiOverlayState>((set, get) => ({
  paletteOpen: false,
  shortcutsOpen: false,
  activeModal: null,
  // Opening any overlay closes every other one (single-overlay invariant).
  openPalette: () => set({ paletteOpen: true, shortcutsOpen: false, activeModal: null }),
  closePalette: () => set({ paletteOpen: false }),
  togglePalette: () => set((s) => ({ paletteOpen: !s.paletteOpen, shortcutsOpen: false, activeModal: null })),
  openShortcuts: () => set({ shortcutsOpen: true, paletteOpen: false, activeModal: null }),
  closeShortcuts: () => set({ shortcutsOpen: false }),
  setPaletteOpen: (open) =>
    set(open ? { paletteOpen: true, shortcutsOpen: false, activeModal: null } : { paletteOpen: false }),
  setShortcutsOpen: (open) =>
    set(open ? { shortcutsOpen: true, paletteOpen: false, activeModal: null } : { shortcutsOpen: false }),
  openModal: (modal) => set({ activeModal: modal, paletteOpen: false, shortcutsOpen: false }),
  // Only clear if THIS modal is the active one, so a stale close can't shut a newer modal.
  closeModal: (modal) => set((s) => (s.activeModal === modal ? { activeModal: null } : {})),
  anyOverlayOpen: () => {
    const s = get()
    return s.paletteOpen || s.shortcutsOpen || s.activeModal !== null
  },
}))
