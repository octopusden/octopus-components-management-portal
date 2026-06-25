/**
 * Whether a keyboard event target is a text-entry control the user is typing
 * into — so a bare-letter global shortcut (e.g. "?") must NOT fire. Used by the
 * global hotkey listener: ⌘K/Ctrl+K still works everywhere (it carries a
 * modifier), but the plain "?" shortcut is suppressed while the user types.
 *
 * Text inputs, textareas, selects, and contenteditable hosts count; checkboxes
 * / radios / buttons do not (a "?" there is a real shortcut, not typed text).
 */
export function isTypingInFormField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true

  const tag = target.tagName
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (tag === 'INPUT') {
    const type = (target as HTMLInputElement).type
    // Non-text input types (checkbox, radio, button, range, …) are not text
    // entry, so a plain shortcut over them should still fire.
    const NON_TEXT = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file'])
    return !NON_TEXT.has(type)
  }
  return false
}
