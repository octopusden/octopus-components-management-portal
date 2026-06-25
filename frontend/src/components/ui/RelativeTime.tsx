import { formatAbsoluteDate, formatRelativeTime } from '../../lib/date'

interface RelativeTimeProps {
  /** ISO timestamp (or null). Null renders an em-dash. */
  ts: string | null
  className?: string
  /**
   * Override for the native `title` tooltip. Defaults to the date-only absolute
   * date (`formatAbsoluteDate`). Callers that need finer precision — e.g. the
   * audit log, where entries can repeat within a day — pass the full
   * date-and-time timestamp here so the exact instant stays one hover away.
   */
  title?: string
}

/**
 * Renders a human-friendly relative time ("3 days ago") with the exact absolute
 * date in the native `title` tooltip, so the at-a-glance label stays compact and
 * the precise value is one hover away. Recomputed on each render against the
 * current clock — fine for a list cell; no timer churn.
 */
export function RelativeTime({ ts, className, title }: RelativeTimeProps) {
  return (
    <span title={title ?? formatAbsoluteDate(ts)} className={className}>
      {formatRelativeTime(ts)}
    </span>
  )
}
