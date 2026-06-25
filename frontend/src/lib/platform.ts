/**
 * Whether we are on a Mac, so UI can show ⌘ instead of Ctrl. Best-effort and
 * SSR/test-safe: falls back to false when navigator is unavailable. Uses the
 * platform string (userAgentData.platform when present, else the legacy
 * navigator.platform / userAgent) — good enough for picking a key glyph.
 */
export function isMac(): boolean {
  if (typeof navigator === 'undefined') return false
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } }
  const platform = nav.userAgentData?.platform || nav.platform || nav.userAgent || ''
  return /mac|iphone|ipad|ipod/i.test(platform)
}

/** The command-modifier glyph/label for the current platform (⌘ on mac, "Ctrl" elsewhere). */
export const MOD_KEY_LABEL = isMac() ? '⌘' : 'Ctrl'
