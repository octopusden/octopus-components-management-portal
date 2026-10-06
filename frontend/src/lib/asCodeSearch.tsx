import type { ReactNode } from 'react'
import type { AsCodeMatchRange } from './types'

/** Detail-page deep link that opens the As Code tab (Full view) scrolled to [line]. */
export function asCodeLineHref(componentId: string, line: number): string {
  return `/components/${encodeURIComponent(componentId)}?tab=as-code&line=${line}`
}

/**
 * Wraps the server-reported matched spans of [text] in <mark>. The spans come from the server's
 * own matcher (substring or Java regex), so regex hits are highlighted exactly — no JS RegExp is
 * ever run on the pattern. Out-of-range, empty or overlapping spans are ignored defensively.
 */
export function highlightRanges(text: string, ranges: readonly AsCodeMatchRange[]): ReactNode[] {
  const parts: ReactNode[] = []
  let from = 0
  for (const { start, end } of [...ranges].sort((a, b) => a.start - b.start)) {
    const s = Math.max(start, from)
    const e = Math.min(end, text.length)
    if (s >= e) continue
    if (s > from) parts.push(text.slice(from, s))
    parts.push(
      <mark key={s} className="rounded-sm bg-amber-200 px-0.5 text-inherit dark:bg-amber-500/40">
        {text.slice(s, e)}
      </mark>,
    )
    from = e
  }
  if (from < text.length) parts.push(text.slice(from))
  return parts
}
