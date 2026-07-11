import { describe, it, expect, beforeEach } from 'vitest'
import { useUiOverlay } from './uiOverlayStore'

beforeEach(() => {
  useUiOverlay.setState({ paletteOpen: false, shortcutsOpen: false, activeModal: null })
})

describe('useUiOverlay', () => {
  it('opens and closes the palette', () => {
    useUiOverlay.getState().openPalette()
    expect(useUiOverlay.getState().paletteOpen).toBe(true)
    useUiOverlay.getState().closePalette()
    expect(useUiOverlay.getState().paletteOpen).toBe(false)
  })

  it('toggles the palette', () => {
    useUiOverlay.getState().togglePalette()
    expect(useUiOverlay.getState().paletteOpen).toBe(true)
    useUiOverlay.getState().togglePalette()
    expect(useUiOverlay.getState().paletteOpen).toBe(false)
  })

  it('opening the palette closes the shortcuts panel (never stack)', () => {
    useUiOverlay.getState().openShortcuts()
    expect(useUiOverlay.getState().shortcutsOpen).toBe(true)
    useUiOverlay.getState().openPalette()
    expect(useUiOverlay.getState().paletteOpen).toBe(true)
    expect(useUiOverlay.getState().shortcutsOpen).toBe(false)
  })

  it('opening the shortcuts panel closes the palette', () => {
    useUiOverlay.getState().openPalette()
    useUiOverlay.getState().openShortcuts()
    expect(useUiOverlay.getState().shortcutsOpen).toBe(true)
    expect(useUiOverlay.getState().paletteOpen).toBe(false)
  })

  it('setPaletteOpen(true) also closes the shortcuts panel (no stacking via Radix onOpenChange)', () => {
    useUiOverlay.getState().openShortcuts()
    useUiOverlay.getState().setPaletteOpen(true)
    expect(useUiOverlay.getState().paletteOpen).toBe(true)
    expect(useUiOverlay.getState().shortcutsOpen).toBe(false)
  })

  it('setShortcutsOpen(true) also closes the palette', () => {
    useUiOverlay.getState().openPalette()
    useUiOverlay.getState().setShortcutsOpen(true)
    expect(useUiOverlay.getState().shortcutsOpen).toBe(true)
    expect(useUiOverlay.getState().paletteOpen).toBe(false)
  })

  it('opening a modal closes palette and shortcuts (single-overlay invariant)', () => {
    useUiOverlay.getState().openPalette()
    useUiOverlay.getState().openModal('feedback')
    const s = useUiOverlay.getState()
    expect(s.activeModal).toBe('feedback')
    expect(s.paletteOpen).toBe(false)
    expect(s.shortcutsOpen).toBe(false)
  })

  it('opening palette/shortcuts clears the active modal', () => {
    useUiOverlay.getState().openModal('announcement')
    useUiOverlay.getState().openShortcuts()
    expect(useUiOverlay.getState().activeModal).toBeNull()
  })

  it('closeModal only clears when that modal is the active one', () => {
    useUiOverlay.getState().openModal('feedback')
    useUiOverlay.getState().closeModal('announcement')
    expect(useUiOverlay.getState().activeModal).toBe('feedback')
    useUiOverlay.getState().closeModal('feedback')
    expect(useUiOverlay.getState().activeModal).toBeNull()
  })

  it('anyOverlayOpen reflects palette, shortcuts, and the active modal', () => {
    expect(useUiOverlay.getState().anyOverlayOpen()).toBe(false)
    useUiOverlay.getState().openModal('feedback')
    expect(useUiOverlay.getState().anyOverlayOpen()).toBe(true)
    useUiOverlay.getState().closeModal('feedback')
    expect(useUiOverlay.getState().anyOverlayOpen()).toBe(false)
  })
})
