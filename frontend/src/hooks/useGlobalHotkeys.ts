import { useEffect } from 'react'
import { useUiOverlay } from '@/lib/uiOverlayStore'
import { isTypingInFormField } from '@/lib/keyboard'

/**
 * App-global keyboard shortcuts (spec §1.6). Mounted once near the router root:
 *
 *  - ⌘K (mac) / Ctrl+K (win/linux) — toggle the command palette. Carries a
 *    modifier, so it fires even while typing (and we preventDefault so the
 *    browser's own Ctrl+K doesn't steal it).
 *  - "?" — open the keyboard-shortcuts panel, but ONLY when the user is not
 *    typing in a text field (otherwise a literal "?" should be entered).
 *
 * Esc / arrow / enter handling lives inside the cmdk palette and the Radix
 * dialogs themselves, so this hook only owns the open triggers.
 */
export function useGlobalHotkeys() {
  const togglePalette = useUiOverlay((s) => s.togglePalette)
  const openShortcuts = useUiOverlay((s) => s.openShortcuts)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // ⌘K / Ctrl+K — guard against the AltGr combo (ctrl+alt) some layouts use
      // to type characters, and ignore auto-repeat.
      if ((e.metaKey || e.ctrlKey) && !e.altKey && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        togglePalette()
        return
      }

      // "?" — a plain shortcut, suppressed while typing. Require no command
      // modifier so ⌘? / Ctrl+? (browser shortcuts) are left alone.
      if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (isTypingInFormField(e.target)) return
        e.preventDefault()
        openShortcuts()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [togglePalette, openShortcuts])
}
