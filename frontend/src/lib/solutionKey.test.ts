import { describe, it, expect } from 'vitest'
import { isSolutionCandidate } from './solutionKey'

describe('isSolutionCandidate', () => {
  const patterns = ['-solution', 'dmp-bundle']

  it('matches a key containing a pattern as a substring', () => {
    expect(isSolutionCandidate('payment-solution', patterns)).toBe(true)
    expect(isSolutionCandidate('acme-dmp-bundle-core', patterns)).toBe(true)
  })

  it('does not match a key without any pattern', () => {
    expect(isSolutionCandidate('payment-service', patterns)).toBe(false)
  })

  it('is case-sensitive (mirrors the backend substring match)', () => {
    expect(isSolutionCandidate('Payment-SOLUTION', patterns)).toBe(false)
  })

  it('returns false for empty / missing key or patterns', () => {
    expect(isSolutionCandidate('', patterns)).toBe(false)
    expect(isSolutionCandidate(null, patterns)).toBe(false)
    expect(isSolutionCandidate(undefined, patterns)).toBe(false)
    expect(isSolutionCandidate('payment-solution', [])).toBe(false)
    expect(isSolutionCandidate('payment-solution', undefined)).toBe(false)
  })

  it('ignores empty-string patterns (would otherwise match everything)', () => {
    expect(isSolutionCandidate('anything', [''])).toBe(false)
  })
})
