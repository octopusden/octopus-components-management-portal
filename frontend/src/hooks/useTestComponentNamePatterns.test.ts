import { describe, it, expect } from 'vitest'
import { keyMatchesTestPatterns } from './useTestComponentNamePatterns'

describe('keyMatchesTestPatterns', () => {
  const P = ['^test-', '^cvelab-']
  it('matches any pattern with find semantics', () => {
    expect(keyMatchesTestPatterns('cvelab-app', P)).toBe(true)
    expect(keyMatchesTestPatterns('test-x', P)).toBe(true)
    expect(keyMatchesTestPatterns('my-test-x', P)).toBe(false)
    expect(keyMatchesTestPatterns('x-test', ['test'])).toBe(true)
  })
  it('fails open: no patterns, or only unparsable ones, allow any key', () => {
    expect(keyMatchesTestPatterns('payments', [])).toBe(true)
    expect(keyMatchesTestPatterns('payments', ['('])).toBe(true)
    expect(keyMatchesTestPatterns('payments', ['(', '^test-'])).toBe(false)
  })
})
