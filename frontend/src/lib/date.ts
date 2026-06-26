/**
 * Absolute date formatting, extracted verbatim from ComponentTable's local
 * `formatDate` so the table and the new RelativeTime tooltip share one source
 * of truth. en-GB "02 Jun 2026", em-dash for null, raw string on parse error.
 */
export function formatAbsoluteDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  try {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return dateStr
  }
}

const MS_PER_DAY = 1000 * 60 * 60 * 24

/**
 * Human-friendly relative time: "Today / Yesterday / N days ago / N weeks ago /
 * N months ago". Beyond ~12 months it falls back to the absolute date so the
 * label never drifts into ambiguous "13 months ago" territory. Pure — `now` is
 * injectable for deterministic tests (defaults to the current instant).
 *
 * Buckets are computed from whole-day deltas (not calendar arithmetic): days for
 * <7, weeks for <~1 month, months for <~12 months. This keeps the function
 * dependency-free while staying close enough for an at-a-glance "Updated" hint;
 * the exact date is always one hover away via formatAbsoluteDate.
 */
export function formatRelativeTime(dateStr: string | null, now: Date = new Date()): string {
  if (!dateStr) return '—'
  const then = new Date(dateStr)
  if (Number.isNaN(then.getTime())) return formatAbsoluteDate(dateStr)

  const days = Math.floor((now.getTime() - then.getTime()) / MS_PER_DAY)

  // days <= 0 covers same-day timestamps AND future ones (negative delta from
  // clock skew) — both collapse to "Today" rather than rendering "-1 days ago".
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 30) {
    const weeks = Math.floor(days / 7)
    return `${weeks} ${weeks === 1 ? 'week' : 'weeks'} ago`
  }
  if (days < 365) {
    const months = Math.floor(days / 30)
    return `${months} ${months === 1 ? 'month' : 'months'} ago`
  }
  return formatAbsoluteDate(dateStr)
}
