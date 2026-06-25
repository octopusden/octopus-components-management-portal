import { describe, it, expect } from 'vitest'
import { formatAbsoluteDate, formatRelativeTime } from './date'

describe('formatAbsoluteDate', () => {
  it('returns em-dash for null', () => {
    expect(formatAbsoluteDate(null)).toBe('—')
  })

  it('formats an ISO date as en-GB "02 Jun 2026"', () => {
    expect(formatAbsoluteDate('2026-06-02T10:00:00Z')).toBe('02 Jun 2026')
  })

  it('yields "Invalid Date" for an unparseable string (matches the extracted behavior)', () => {
    // V8's toLocaleDateString does NOT throw on an Invalid Date — it returns the
    // literal "Invalid Date". The try/catch only guards the rarer throwing cases.
    // This mirrors ComponentTable's original formatDate exactly.
    expect(formatAbsoluteDate('not-a-date')).toBe('Invalid Date')
  })
})

describe('formatRelativeTime', () => {
  // Fixed reference instant so every bucket is deterministic.
  const now = new Date('2026-06-25T12:00:00Z')

  it('returns em-dash for null', () => {
    expect(formatRelativeTime(null, now)).toBe('—')
  })

  it('returns "Today" for the same calendar moment', () => {
    expect(formatRelativeTime('2026-06-25T08:00:00Z', now)).toBe('Today')
  })

  it('returns "Today" for a future timestamp (clock skew → negative delta)', () => {
    expect(formatRelativeTime('2026-06-26T12:00:00Z', now)).toBe('Today')
  })

  it('returns "Yesterday" for ~1 day ago', () => {
    expect(formatRelativeTime('2026-06-24T12:00:00Z', now)).toBe('Yesterday')
  })

  it('returns "N days ago" within the week', () => {
    expect(formatRelativeTime('2026-06-22T12:00:00Z', now)).toBe('3 days ago')
  })

  it('returns "N weeks ago" within the month', () => {
    expect(formatRelativeTime('2026-06-04T12:00:00Z', now)).toBe('3 weeks ago')
  })

  it('returns "1 week ago" (singular) at exactly seven days', () => {
    expect(formatRelativeTime('2026-06-18T12:00:00Z', now)).toBe('1 week ago')
  })

  it('returns "N months ago" within the year', () => {
    expect(formatRelativeTime('2026-03-25T12:00:00Z', now)).toBe('3 months ago')
  })

  it('returns "1 month ago" (singular)', () => {
    expect(formatRelativeTime('2026-05-20T12:00:00Z', now)).toBe('1 month ago')
  })

  it('falls back to the absolute date beyond ~12 months', () => {
    expect(formatRelativeTime('2024-01-10T12:00:00Z', now)).toBe('10 Jan 2024')
  })

  it('falls back to the absolute formatter for an unparseable input', () => {
    // NaN time → defers to formatAbsoluteDate, which yields "Invalid Date" here
    // (see the formatAbsoluteDate suite — toLocaleDateString does not throw).
    expect(formatRelativeTime('garbage', now)).toBe('Invalid Date')
  })
})
