import type { ReactNode } from 'react'

/** Detail-page deep link that opens the As Code tab (Full view) scrolled to [line]. */
export function asCodeLineHref(componentId: string, line: number): string {
  return `/components/${encodeURIComponent(componentId)}?tab=as-code&line=${line}`
}

/**
 * Splits [text] around every case-insensitive occurrence of [query] and wraps the hits in
 * <mark>. Used only for substring searches: in regex mode the server matched a Java regex,
 * which a JS RegExp cannot be trusted to reproduce, so the line is shown unmarked instead.
 */
export function highlightSubstring(text: string, query: string): ReactNode[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return [text]
  const haystack = text.toLowerCase()
  const parts: ReactNode[] = []
  let from = 0
  let at = haystack.indexOf(needle, from)
  while (at !== -1) {
    if (at > from) parts.push(text.slice(from, at))
    parts.push(
      <mark key={at} className="rounded-sm bg-amber-200 px-0.5 text-inherit dark:bg-amber-500/40">
        {text.slice(at, at + needle.length)}
      </mark>,
    )
    from = at + needle.length
    at = haystack.indexOf(needle, from)
  }
  if (from < text.length) parts.push(text.slice(from))
  return parts
}
