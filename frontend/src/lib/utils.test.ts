import { describe, it, expect } from 'vitest'
import { initials } from './utils'

describe('initials', () => {
  it('takes first chars of two segments split by hyphen', () => {
    expect(initials('e2e-admin')).toBe('EA')
  })

  it('takes first chars of two segments split by dot', () => {
    expect(initials('john.doe')).toBe('JD')
  })

  it('takes first chars of two segments split by whitespace', () => {
    expect(initials('alice smith')).toBe('AS')
  })

  it('returns single uppercase char for a single-segment username', () => {
    expect(initials('alice')).toBe('A')
  })

  it('returns ? for empty input', () => {
    expect(initials('')).toBe('?')
  })
})
