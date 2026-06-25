import { create } from 'zustand'

/**
 * Open-state for the two global keyboard-driven overlays: the ⌘K command
 * palette and the "?" keyboard-shortcuts panel. A tiny shared store (not props)
 * so the global hotkey listener, the in-page Search button, and the footer link
 * can all toggle them without threading callbacks through the tree.
 *
 * Opening one closes the other so the two dialogs never stack — pressing ⌘K
 * from the shortcuts panel swaps straight to the palette, and vice versa.
 */
interface UiOverlayState {
  paletteOpen: boolean
  shortcutsOpen: boolean
  openPalette: () => void
  closePalette: () => void
  togglePalette: () => void
  openShortcuts: () => void
  closeShortcuts: () => void
  setPaletteOpen: (open: boolean) => void
  setShortcutsOpen: (open: boolean) => void
}

export const useUiOverlay = create<UiOverlayState>((set) => ({
  paletteOpen: false,
  shortcutsOpen: false,
  openPalette: () => set({ paletteOpen: true, shortcutsOpen: false }),
  closePalette: () => set({ paletteOpen: false }),
  togglePalette: () => set((s) => ({ paletteOpen: !s.paletteOpen, shortcutsOpen: false })),
  openShortcuts: () => set({ shortcutsOpen: true, paletteOpen: false }),
  closeShortcuts: () => set({ shortcutsOpen: false }),
  // Opening via the setters keeps the same "never stack" invariant as the
  // explicit open* actions: turning one on turns the other off. Radix's
  // onOpenChange routes through these, so a programmatic re-open can never
  // surface both dialogs at once.
  setPaletteOpen: (open) => set(open ? { paletteOpen: true, shortcutsOpen: false } : { paletteOpen: false }),
  setShortcutsOpen: (open) =>
    set(open ? { shortcutsOpen: true, paletteOpen: false } : { shortcutsOpen: false }),
}))
