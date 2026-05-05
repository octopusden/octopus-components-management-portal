import { ApiError } from './api'

/**
 * Format an error from a migration mutation into a human-readable string for
 * the destructive block. Three layers, in priority order:
 *
 *  1. ApiError carrying a JSON-encoded [MigrationConflictResponse] body
 *     (cross-kind 409 from /migrate, /migrate-history, or
 *     /migrate-history/force-reset). Surface the friendly `message` field
 *     prefixed with the status code — the operator should NEVER see raw
 *     `{"kind":"conflict",...}` JSON.
 *  2. ApiError carrying a text/html error page (gateway / WAF 5xx). Strip
 *     the markup down to the `<h1>`-style title.
 *  3. Anything else — fall back to `${status} ${message}` for ApiError or
 *     the bare Error.message / String() for non-Error values.
 *
 * Both MigrationPanel and MigrationHistoryPanel use this — extracted so the
 * cross-kind 409 message extraction lives in one place rather than being
 * duplicated (and only-half-implemented) per panel.
 */
export function formatMigrationError(error: unknown): string {
  if (!(error instanceof ApiError)) {
    if (error instanceof Error) return error.message
    return String(error)
  }
  // Layer 1: structured conflict envelope — probe rawBody, not message, because
  // api.ts now extracts the human-readable .message field into error.message
  // for display. The raw JSON envelope (needed to check kind/message shape) is
  // preserved verbatim in rawBody regardless of whether extraction happened.
  const message = error.message
  if (error.rawBody.startsWith('{')) {
    try {
      const parsed = JSON.parse(error.rawBody) as unknown
      if (
        parsed !== null &&
        typeof parsed === 'object' &&
        !Array.isArray(parsed) &&
        (parsed as Record<string, unknown>)['kind'] === 'conflict' &&
        typeof (parsed as Record<string, unknown>)['message'] === 'string'
      ) {
        const friendly = (parsed as Record<string, unknown>)['message'] as string
        return `${error.status} ${friendly}`
      }
    } catch {
      // Not JSON / not a known shape — fall through.
    }
  }
  // Layer 2: HTML error page from upstream proxy.
  if (/^\s*<(?:!doctype|html)/i.test(message)) {
    const h1 = message.match(/<h1[^>]*>([^<]+)<\/h1>/i)?.[1]?.trim()
    if (!h1) return `${error.status} ${error.name}`
    return new RegExp(`^${error.status}\\b`).test(h1) ? h1 : `${error.status} ${h1}`
  }
  // Layer 3: passthrough.
  return `${error.status} ${message}`
}
