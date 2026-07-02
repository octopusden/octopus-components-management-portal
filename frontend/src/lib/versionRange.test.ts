import { describe, it, expect } from 'vitest'
import { formatVersionRange, isValidVersionRange, isClosedVersionRange, isAllowedOverrideRange, isEmptyVersionRange, rangesOverlap, classifyRangeConflict, compareVersionRanges, highestLowerBoundVersion } from './versionRange'

describe('formatVersionRange', () => {
  it('formats (,) as "All versions"', () => {
    expect(formatVersionRange('(,)')).toBe('All versions')
  })

  it('formats the two-segment base sentinel (,0),[0,) as "All versions"', () => {
    expect(formatVersionRange('(,0),[0,)')).toBe('All versions')
  })

  it('tolerates whitespace and trailing zeros in the base sentinel', () => {
    expect(formatVersionRange('(, 0), [0, )')).toBe('All versions')
    expect(formatVersionRange('(,0.0),[0.0,)')).toBe('All versions')
    expect(formatVersionRange('(,0.0.0),[0.0.0,)')).toBe('All versions')
  })

  it('returns other ranges unchanged', () => {
    expect(formatVersionRange('[1.0,2.0)')).toBe('[1.0,2.0)')
    expect(formatVersionRange('(1.0,)')).toBe('(1.0,)')
    expect(formatVersionRange('[1.0.0,1.0.0]')).toBe('[1.0.0,1.0.0]')
  })
})

describe('highestLowerBoundVersion', () => {
  it('returns the numeric-highest lower bound as a dot-string', () => {
    expect(highestLowerBoundVersion(['[1.5.0,1.5.1400)', '[1.5.1400,)'])).toBe('1.5.1400')
  })

  it('orders multi-digit segments numerically, not lexically', () => {
    expect(highestLowerBoundVersion(['[1.2,)', '[1.10,)'])).toBe('1.10')
  })

  it('considers the lower bound of closed ranges too', () => {
    expect(highestLowerBoundVersion(['[1.2,1.3)', '[1.4,1.5)', '[1.3,1.4)'])).toBe('1.4')
  })

  it('ignores entries with no usable lower bound', () => {
    expect(highestLowerBoundVersion(['(,0),[0,)', '(,)', '(,2.0)'])).toBeNull()
    expect(highestLowerBoundVersion([null, undefined, ''])).toBeNull()
    expect(highestLowerBoundVersion([])).toBeNull()
  })

  it('ignores a degenerate all-zero lower bound', () => {
    expect(highestLowerBoundVersion(['[0,)'])).toBeNull()
    expect(highestLowerBoundVersion(['[0.0,)'])).toBeNull()
  })

  it('ignores exclusive lower bounds (the bound itself is outside the range)', () => {
    expect(highestLowerBoundVersion(['(1.5,2.0]'])).toBeNull()
    expect(highestLowerBoundVersion(['(1.5,2.0)'])).toBeNull()
    // An inclusive range still wins over a higher exclusive one.
    expect(highestLowerBoundVersion(['(9.0,10.0]', '[1.4,1.5)'])).toBe('1.4')
  })

  it('mixes valid ranges with ignorable ones', () => {
    expect(highestLowerBoundVersion([null, '(,0),[0,)', '[1.4,1.5)', '(,1.0)'])).toBe('1.4')
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

describe('isAllowedOverrideRange (ADR-018: open-upper allowed, all-versions rejected)', () => {
  it('rejects invalid syntax', () => {
    expect(isAllowedOverrideRange('')).toBe(false)
    expect(isAllowedOverrideRange('garbage')).toBe(false)
    expect(isAllowedOverrideRange('[1.0')).toBe(false)
  })

  it('rejects the all-versions shapes (those are the base default)', () => {
    expect(isAllowedOverrideRange('(,)')).toBe(false)
    expect(isAllowedOverrideRange('(,0),[0,)')).toBe(false)
    expect(isAllowedOverrideRange('(, )')).toBe(false) // whitespace-normalized
  })

  it('rejects a composite that contains a universal (,) segment', () => {
    expect(isAllowedOverrideRange('(,),[1.0,2.0)')).toBe(false)
    expect(isAllowedOverrideRange('[1.0,2.0),(,)')).toBe(false)
  })

  it('ALLOWS open-upper ranges (the former D5 restriction is relaxed)', () => {
    expect(isAllowedOverrideRange('[1.0,)')).toBe(true)
    expect(isAllowedOverrideRange('[2.0,)')).toBe(true)
    expect(isAllowedOverrideRange('(1.0,)')).toBe(true)
  })

  it('allows closed and historical-left-unbounded ranges', () => {
    expect(isAllowedOverrideRange('[1.0,2.0)')).toBe(true)
    expect(isAllowedOverrideRange('(1.0,2.0]')).toBe(true)
    expect(isAllowedOverrideRange('(,1.0)')).toBe(true)
  })

  it('allows a composite with an open-upper terminal segment', () => {
    expect(isAllowedOverrideRange('[1.0,2.0),[5.0,)')).toBe(true)
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

  it('handles unbounded left side (,X) — containment is a conflict', () => {
    // (,1.0) is contained in (,2.0). A version like 0.5 matches both, so the
    // overlap is ambiguous and must be rejected (disjoint-only rule).
    expect(rangesOverlap('(,1.0)', '(,2.0)')).toBe(true)
  })

  it('handles unbounded right side [X,) — disjoint', () => {
    expect(rangesOverlap('[5.0,)', '[1.0,2.0)')).toBe(false)
  })

  it('handles unbounded right side [X,) — containment is a conflict', () => {
    // [5.0,) is contained in [1.0,) — a version like 6.0 matches both.
    expect(rangesOverlap('[1.0,)', '[5.0,)')).toBe(true)
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

  // Disjoint-only rule: any intersection between two overrides on the same
  // attribute is a conflict, because a version in the overlap would match both
  // and the resolved value is ambiguous. Strict containment is therefore a
  // conflict too (the inner range's versions match both overrides).
  it('returns true for strict containment (outer fully contains inner)', () => {
    expect(rangesOverlap('[1.0,3.0)', '[1.0,2.0)')).toBe(true)
    expect(rangesOverlap('[1.0,2.0)', '[1.0,3.0)')).toBe(true)
  })

  it('returns true for strict containment with different left bounds', () => {
    expect(rangesOverlap('[1.0,4.0)', '[2.0,3.0)')).toBe(true)
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

// classifyRangeConflict refines rangesOverlap's boolean `true` into the
// distinct cases the UI needs different copy for: a partial overlap, a
// strict containment, and a semantically-equal duplicate (which the DB
// UNIQUE constraint would miss across whitespace / trailing-zero
// differences). All three block a write. 'none' = disjoint (the only
// allowed relationship); 'unknown' = unparseable (defer to CRS).
describe('classifyRangeConflict', () => {
  it('classifies partial overlap as "partial"', () => {
    expect(classifyRangeConflict('[1.0,3.0)', '[2.0,4.0)')).toBe('partial')
  })

  it('classifies exact-equal ranges as "equal"', () => {
    expect(classifyRangeConflict('[1.0,2.0)', '[1.0,2.0)')).toBe('equal')
  })

  it('classifies whitespace-differing-but-equal ranges as "equal"', () => {
    expect(classifyRangeConflict('[1.0,2.0)', '[1.0, 2.0)')).toBe('equal')
  })

  it('classifies trailing-zero-differing-but-equal ranges as "equal"', () => {
    expect(classifyRangeConflict('[1,2)', '[1.0,2.0)')).toBe('equal')
  })

  it('classifies disjoint ranges as "none"', () => {
    expect(classifyRangeConflict('[1.0,2.0)', '[3.0,4.0)')).toBe('none')
  })

  it('classifies strict containment as "contains"', () => {
    expect(classifyRangeConflict('[1.0,4.0)', '[2.0,3.0)')).toBe('contains')
    expect(classifyRangeConflict('[2.0,3.0)', '[1.0,4.0)')).toBe('contains')
  })

  it('classifies same-endpoint mixed-inclusivity containment as "contains", not "equal"', () => {
    // [1.0,2.0] (includes 2.0) strictly contains [1.0,2.0) (excludes 2.0) —
    // they share endpoints but are NOT semantically equal.
    expect(classifyRangeConflict('[1.0,2.0]', '[1.0,2.0)')).toBe('contains')
    expect(classifyRangeConflict('[1.0,2.0)', '[1.0,2.0]')).toBe('contains')
  })

  it('classifies the reported [1.0,2.0] vs [0,3.0] case as "contains"', () => {
    // User-reported: [0,3.0] fully contains [1.0,2.0]; version 1.5 matches
    // both overrides, so this must be flagged, not silently allowed.
    expect(classifyRangeConflict('[1.0,2.0]', '[0,3.0]')).toBe('contains')
    expect(classifyRangeConflict('[0,3.0]', '[1.0,2.0]')).toBe('contains')
  })

  it('classifies composites / unparseable bounds as "unknown"', () => {
    expect(classifyRangeConflict('(,1.0),[2.0,)', '[1.5,3.0]')).toBe('unknown')
    expect(classifyRangeConflict('[1.0-SNAPSHOT,2.0)', '[1.5,3.0)')).toBe('unknown')
  })

  it('stays consistent with rangesOverlap', () => {
    const cases: Array<[string, string]> = [
      ['[1.0,3.0)', '[2.0,4.0)'],
      ['[1.0,2.0)', '[1.0,2.0)'],
      ['[1.0,2.0)', '[3.0,4.0)'],
      ['[1.0,4.0)', '[2.0,3.0)'],
      ['[1.0,2.0]', '[0,3.0]'],
      ['(,1.0),[2.0,)', '[1.5,3.0]'],
    ]
    for (const [a, b] of cases) {
      const kind = classifyRangeConflict(a, b)
      const overlap = rangesOverlap(a, b)
      if (kind === 'unknown') expect(overlap).toBe('unknown')
      else expect(overlap).toBe(kind === 'partial' || kind === 'equal' || kind === 'contains')
    }
  })
})

// compareVersionRanges sorts by lower bound numerically (then upper bound),
// fixing the localeCompare bug where `[10.0,)` sorts before `[2.0,)`.
describe('compareVersionRanges', () => {
  it('orders by numeric lower bound, not lexically', () => {
    // localeCompare would put "[10..." before "[2..." — numeric must not.
    expect(compareVersionRanges('[2.0,3.0)', '[10.0,11.0)')).toBeLessThan(0)
    expect(compareVersionRanges('[10.0,11.0)', '[2.0,3.0)')).toBeGreaterThan(0)
  })

  it('returns 0 for identical ranges', () => {
    expect(compareVersionRanges('[1.0,2.0)', '[1.0,2.0)')).toBe(0)
  })

  it('breaks ties on the upper bound when lower bounds are equal', () => {
    expect(compareVersionRanges('[1.0,2.0)', '[1.0,3.0)')).toBeLessThan(0)
  })

  it('sorts an unbounded lower edge before any concrete lower bound', () => {
    expect(compareVersionRanges('(,1.0)', '[0.0,5.0)')).toBeLessThan(0)
  })

  it('sorts an inclusive lower edge before an exclusive one at the same value', () => {
    expect(compareVersionRanges('[1.0,2.0)', '(1.0,2.0)')).toBeLessThan(0)
  })

  it('sorts an unbounded upper edge after a bounded one at the same lower', () => {
    expect(compareVersionRanges('[1.0,2.0)', '[1.0,)')).toBeLessThan(0)
  })

  it('falls back to localeCompare for unparseable / composite ranges', () => {
    expect(compareVersionRanges('garbage', '[1.0,2.0)')).toBe('garbage'.localeCompare('[1.0,2.0)'))
    const a = '(,1.0),[2.0,)'
    const b = '(,3.0),[4.0,)'
    expect(compareVersionRanges(a, b)).toBe(a.localeCompare(b))
  })

  it('produces a correct numeric ordering when used as Array.sort comparator', () => {
    const sorted = ['[10.0,)', '[2.0,3.0)', '(,1.0)', '[1.0,2.0)'].sort(compareVersionRanges)
    expect(sorted).toEqual(['(,1.0)', '[1.0,2.0)', '[2.0,3.0)', '[10.0,)'])
  })
})

describe('isEmptyVersionRange', () => {
  it('flags an inverted range (lower > upper), incl. dot-numeric segments', () => {
    expect(isEmptyVersionRange('[1.7.3076,1.7.3010]')).toBe(true)
    expect(isEmptyVersionRange('[5,2)')).toBe(true)
    expect(isEmptyVersionRange('(2.10,2.9]')).toBe(true)
  })

  it('flags equal bounds with an exclusive edge (empty), allows [x,x]', () => {
    expect(isEmptyVersionRange('[1.0,1.0)')).toBe(true)
    expect(isEmptyVersionRange('(1.0,1.0]')).toBe(true)
    expect(isEmptyVersionRange('(1.0,1.0)')).toBe(true)
    expect(isEmptyVersionRange('[1.0,1.0]')).toBe(false)
  })

  it('does not flag proper ranges', () => {
    expect(isEmptyVersionRange('[1.7.3076,1.7.3209]')).toBe(false)
    expect(isEmptyVersionRange('[1,2)')).toBe(false)
    expect(isEmptyVersionRange('[2.0,)')).toBe(false)
    expect(isEmptyVersionRange('(,2.0]')).toBe(false)
  })

  it('defers (false) on composites / unparseable / qualifier bounds', () => {
    expect(isEmptyVersionRange('(,0),[0,)')).toBe(false)
    expect(isEmptyVersionRange('[1.0-RC,2.0]')).toBe(false)
    expect(isEmptyVersionRange('garbage')).toBe(false)
  })
})
