import { describe, it, expect } from 'vitest'
import { formatVersionRange, isValidVersionRange, isClosedVersionRange, rangesOverlap } from './versionRange'

describe('formatVersionRange', () => {
  it('formats (,) as "All versions"', () => {
    expect(formatVersionRange('(,)')).toBe('All versions')
  })

  it('returns other ranges unchanged', () => {
    expect(formatVersionRange('[1.0,2.0)')).toBe('[1.0,2.0)')
    expect(formatVersionRange('(1.0,)')).toBe('(1.0,)')
    expect(formatVersionRange('[1.0.0,1.0.0]')).toBe('[1.0.0,1.0.0]')
  })
})

describe('isValidVersionRange', () => {
  it('returns false for empty string', () => {
    expect(isValidVersionRange('')).toBe(false)
  })

  it('returns false for string without brackets', () => {
    expect(isValidVersionRange('1.0,2.0')).toBe(false)
  })

  it('returns false for too-short string', () => {
    expect(isValidVersionRange('()')).toBe(false)
  })

  it('returns false when no comma', () => {
    expect(isValidVersionRange('(1.0)')).toBe(false)
  })

  it('returns false when brackets are mismatched (wrong opening)', () => {
    expect(isValidVersionRange('1.0,2.0)')).toBe(false)
  })

  it('returns false when brackets are mismatched (wrong closing)', () => {
    expect(isValidVersionRange('(1.0,2.0')).toBe(false)
  })

  it('accepts open-open range (,)', () => {
    expect(isValidVersionRange('(,)')).toBe(true)
  })

  it('accepts closed-open range [1.0,2.0)', () => {
    expect(isValidVersionRange('[1.0,2.0)')).toBe(true)
  })

  it('accepts open-closed range (1.0,2.0]', () => {
    expect(isValidVersionRange('(1.0,2.0]')).toBe(true)
  })

  it('accepts closed-closed range [1.0,1.0]', () => {
    expect(isValidVersionRange('[1.0,1.0]')).toBe(true)
  })

  it('accepts range with no lower bound (,2.0)', () => {
    expect(isValidVersionRange('(,2.0)')).toBe(true)
  })

  it('rejects extra closing bracket [1.0.107,2.0))', () => {
    expect(isValidVersionRange('[1.0.107,2.0))')).toBe(false)
  })

  it('rejects extra opening bracket ((1.0,2.0)', () => {
    expect(isValidVersionRange('((1.0,2.0)')).toBe(false)
  })

  it('rejects extra closing square bracket [1.0,2.0]]', () => {
    expect(isValidVersionRange('[1.0,2.0]]')).toBe(false)
  })

  it('rejects trailing garbage after closing bracket', () => {
    expect(isValidVersionRange('[1.0,2.0]garbage')).toBe(false)
  })

  it('rejects bracket characters inside the version body', () => {
    expect(isValidVersionRange('[1.0],2.0)')).toBe(false)
    expect(isValidVersionRange('[1.0,(2.0)')).toBe(false)
  })

  it('accepts composite of two segments', () => {
    expect(isValidVersionRange('(,0),[0,)')).toBe(true)
    expect(isValidVersionRange('(,1.0],[2.0,3.0)')).toBe(true)
  })

  it('rejects composite with malformed segment', () => {
    expect(isValidVersionRange('(,1.0],[2.0,3.0))')).toBe(false)
    expect(isValidVersionRange('(,1.0]],[2.0,3.0)')).toBe(false)
  })
})

// D5: field-overrides must be closed (or historical-left-unbounded);
// open-upward and universal forms belong to BASE, not overrides.
describe('isClosedVersionRange', () => {
  it('rejects empty / syntactically invalid input', () => {
    expect(isClosedVersionRange('')).toBe(false)
    expect(isClosedVersionRange('garbage')).toBe(false)
    expect(isClosedVersionRange('[1.0')).toBe(false)
  })

  it('rejects universal (,)', () => {
    expect(isClosedVersionRange('(,)')).toBe(false)
  })

  it('rejects legacy universal (,0),[0,)', () => {
    expect(isClosedVersionRange('(,0),[0,)')).toBe(false)
  })

  it('rejects simple open-upward [X,)', () => {
    expect(isClosedVersionRange('[1.0,)')).toBe(false)
    expect(isClosedVersionRange('[1.0.107,)')).toBe(false)
  })

  it('rejects simple open-upward (X,)', () => {
    expect(isClosedVersionRange('(1.0,)')).toBe(false)
  })

  it('rejects composite ending in open-upward', () => {
    expect(isClosedVersionRange('[1.0,2.0),(3.0,)')).toBe(false)
  })

  it('accepts closed-open [X,Y)', () => {
    expect(isClosedVersionRange('[1.0,2.0)')).toBe(true)
  })

  it('accepts closed-closed [X,Y]', () => {
    expect(isClosedVersionRange('[1.0,1.0]')).toBe(true)
  })

  it('accepts open-closed (X,Y]', () => {
    expect(isClosedVersionRange('(1.0,2.0]')).toBe(true)
  })

  it('accepts historical-left-unbounded (,X)', () => {
    expect(isClosedVersionRange('(,1.0.107)')).toBe(true)
  })

  it('accepts historical-left-unbounded (,X]', () => {
    expect(isClosedVersionRange('(,2.0]')).toBe(true)
  })

  it('accepts composite of closed segments', () => {
    expect(isClosedVersionRange('(,1.0),(2.0,3.0]')).toBe(true)
  })

  it('rejects composite with open-upward non-terminal segment [1.0,),[2.0,3.0]', () => {
    expect(isClosedVersionRange('[1.0,),[2.0,3.0]')).toBe(false)
  })

  it('rejects open-upward with whitespace before closing paren [1.0, )', () => {
    expect(isClosedVersionRange('[1.0, )')).toBe(false)
  })
})

// rangesOverlap: simple-segment overlap detector. Composites and
// unparseable forms return 'unknown' so the server-side check (P-Overlap
// in CRS) remains the authoritative backstop.
describe('rangesOverlap', () => {
  it('detects overlap between [1.0,2.0] and [1.0.107,)', () => {
    expect(rangesOverlap('[1.0,2.0]', '[1.0.107,)')).toBe(true)
  })

  it('is symmetric', () => {
    expect(rangesOverlap('[1.0.107,)', '[1.0,2.0]')).toBe(true)
  })

  it('detects disjoint ranges as non-overlapping', () => {
    expect(rangesOverlap('[1.0,2.0)', '[3.0,4.0)')).toBe(false)
    expect(rangesOverlap('(,1.0)', '[2.0,3.0)')).toBe(false)
  })

  it('treats touching boundaries as non-overlap when one side is exclusive', () => {
    expect(rangesOverlap('[1.0,2.0)', '[2.0,3.0)')).toBe(false)
    expect(rangesOverlap('(1.0,2.0)', '(2.0,3.0)')).toBe(false)
  })

  it('treats touching boundaries as overlap when both sides are inclusive', () => {
    expect(rangesOverlap('[1.0,2.0]', '[2.0,3.0)')).toBe(true)
  })

  it('handles unbounded left side (,X) — partial overlap', () => {
    // (,1.0) and [0.5,3.0) — intersect on [0.5,1.0); neither contains the other.
    expect(rangesOverlap('(,1.0)', '[0.5,3.0)')).toBe(true)
  })

  it('handles unbounded left side (,X) — containment is allowed', () => {
    // (,1.0) is contained in (,2.0) — strict containment per schema-spec §3.5.
    expect(rangesOverlap('(,1.0)', '(,2.0)')).toBe(false)
  })

  it('handles unbounded right side [X,) — disjoint', () => {
    expect(rangesOverlap('[5.0,)', '[1.0,2.0)')).toBe(false)
  })

  it('handles unbounded right side [X,) — containment is allowed', () => {
    // [5.0,) is contained in [1.0,) — strict containment per schema-spec §3.5.
    expect(rangesOverlap('[1.0,)', '[5.0,)')).toBe(false)
  })

  it('returns "unknown" for composite ranges', () => {
    expect(rangesOverlap('(,1.0),[2.0,)', '[1.5,3.0]')).toBe('unknown')
    expect(rangesOverlap('[1.0,2.0]', '(,1.0),[2.0,)')).toBe('unknown')
  })

  it('returns "unknown" for syntactically invalid input', () => {
    expect(rangesOverlap('garbage', '[1.0,2.0)')).toBe('unknown')
    expect(rangesOverlap('[1.0,2.0)', '')).toBe('unknown')
  })

  it('returns "unknown" for non-numeric version bounds', () => {
    expect(rangesOverlap('[1.0-SNAPSHOT,2.0)', '[1.5,3.0)')).toBe('unknown')
  })

  // Per schema-spec §3.5: only PARTIAL overlap is rejected at write-time.
  // Strict containment is explicitly allowed; equal ranges blocked by UNIQUE.
  it('returns false for strict containment (outer fully contains inner)', () => {
    expect(rangesOverlap('[1.0,3.0)', '[1.0,2.0)')).toBe(false)
    expect(rangesOverlap('[1.0,2.0)', '[1.0,3.0)')).toBe(false)
  })

  it('returns false for strict containment with different left bounds', () => {
    expect(rangesOverlap('[1.0,4.0)', '[2.0,3.0)')).toBe(false)
  })

  it('returns true for exact-equal ranges (semantic duplicate)', () => {
    expect(rangesOverlap('[1.0,2.0)', '[1.0,2.0)')).toBe(true)
  })

  it('returns true for whitespace-differing-but-equal ranges', () => {
    // Normalisation inside parseSimpleSegment strips whitespace before
    // comparison so the DB-level UNIQUE constraint (which is exact-string)
    // does not silently accept what is the same range.
    expect(rangesOverlap('[1.0,2.0)', '[1.0, 2.0)')).toBe(true)
  })

  it('returns true for trailing-zero-differing-but-equal ranges', () => {
    // DefaultArtifactVersion treats `1` and `1.0` as equal; we do the same
    // via compareVersionArrays padding so user-typed `[1,2)` and stored
    // `[1.0,2.0)` are flagged as duplicates.
    expect(rangesOverlap('[1,2)', '[1.0,2.0)')).toBe(true)
  })

  it('returns true for partial overlap with shifted left and right bounds', () => {
    expect(rangesOverlap('[1.0,3.0)', '[2.0,4.0)')).toBe(true)
  })
})
