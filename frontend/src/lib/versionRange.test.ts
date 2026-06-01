import { describe, it, expect } from 'vitest'
import { formatVersionRange, isValidVersionRange, isClosedVersionRange } from './versionRange'

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
})
