/**
 * Copy text to the clipboard. Prefers the async Clipboard API, but falls back to
 * a hidden-textarea `execCommand('copy')` for insecure contexts (e.g. the HTTP
 * dev proxy) where `navigator.clipboard` is unavailable. Rejects if neither path
 * succeeds so callers can surface an error toast.
 */
export async function copyToClipboard(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  if (typeof document === 'undefined') {
    throw new Error('Clipboard unavailable')
  }
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'absolute'
  textarea.style.left = '-9999px'
  document.body.appendChild(textarea)
  try {
    textarea.select()
    const ok = document.execCommand('copy')
    if (!ok) throw new Error('Copy command was rejected')
  } finally {
    document.body.removeChild(textarea)
  }
}
