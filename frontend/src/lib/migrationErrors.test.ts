import { describe, expect, it } from 'vitest'
import { ApiError } from './api'
import { formatMigrationError } from './migrationErrors'

describe('formatMigrationError', () => {
  it('extracts MigrationConflictResponse.message from a structured 409 envelope (kind=conflict)', () => {
    // P2 review fix: the destructive block used to dump the raw JSON envelope
    // {"kind":"conflict","code":"...","message":"..."} to the operator. The
    // friendly `message` field is the entire reason for the envelope.
    const body = JSON.stringify({
      kind: 'conflict',
      code: 'history-import-likely-live-elsewhere',
      message: 'Refusing force-reset: the IN_PROGRESS claim was updated 12s ago.',
      activeKind: 'HISTORY',
      activeJobId: null,
    })
    const formatted = formatMigrationError(new ApiError(409, body))
    expect(formatted).toBe(
      '409 Refusing force-reset: the IN_PROGRESS claim was updated 12s ago.',
    )
    // The raw envelope must NOT leak through.
    expect(formatted).not.toContain('"kind"')
    expect(formatted).not.toContain('"code"')
  })

  it('extracts conflict message when constructed with separate rawBody (production api.ts path)', () => {
    // api.ts extracts .message into the display field and stores the full JSON in rawBody.
    // Layer 1 must probe rawBody, not message, to work in this path.
    const rawBody = JSON.stringify({
      kind: 'conflict',
      code: 'history-import-likely-live-elsewhere',
      message: 'Refusing force-reset: the IN_PROGRESS claim was updated 12s ago.',
    })
    const formatted = formatMigrationError(
      new ApiError(409, 'Refusing force-reset: the IN_PROGRESS claim was updated 12s ago.', rawBody),
    )
    expect(formatted).toBe(
      '409 Refusing force-reset: the IN_PROGRESS claim was updated 12s ago.',
    )
    expect(formatted).not.toContain('"kind"')
  })

  it('falls through to status + body when kind is missing (older CRS, opaque error)', () => {
    const formatted = formatMigrationError(new ApiError(409, 'something old-style'))
    expect(formatted).toBe('409 something old-style')
  })

  it('strips HTML error pages from upstream proxies down to the h1 title', () => {
    const html =
      '<html><body><h1>504 Gateway Time-out</h1>The server did not respond in time.</body></html>'
    const formatted = formatMigrationError(new ApiError(504, html))
    expect(formatted).toBe('504 Gateway Time-out')
  })

  it('preserves status + body on a non-html, non-conflict ApiError', () => {
    const formatted = formatMigrationError(new ApiError(403, 'Forbidden'))
    expect(formatted).toBe('403 Forbidden')
  })

  it('returns Error.message for non-ApiError Error instances', () => {
    expect(formatMigrationError(new Error('boom'))).toBe('boom')
  })

  it('falls back to String() for non-Error values', () => {
    expect(formatMigrationError(42)).toBe('42')
    expect(formatMigrationError(null)).toBe('null')
  })

  it('does NOT extract message when JSON kind is something other than conflict', () => {
    // Defensive: only `kind === 'conflict'` triggers the friendly path. A
    // job-response body that happens to have a `message` field stays opaque.
    const body = JSON.stringify({ kind: 'job', state: 'RUNNING', message: 'should not surface' })
    const formatted = formatMigrationError(new ApiError(409, body))
    expect(formatted).toBe(`409 ${body}`)
  })

  it('does NOT extract message when message field is missing or non-string', () => {
    const body = JSON.stringify({ kind: 'conflict', code: 'x', message: 42 })
    const formatted = formatMigrationError(new ApiError(409, body))
    // Falls through to passthrough — no claim that the body is "friendly".
    expect(formatted).toBe(`409 ${body}`)
  })
})
