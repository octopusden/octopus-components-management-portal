import { describe, it, expect } from 'vitest'
import { validateJiraKey, normalizeJiraKey, normalizeChangeComment, JIRA_KEY_ERROR } from './jiraKey'

describe('validateJiraKey', () => {
  it('accepts a well-formed key', () => {
    expect(validateJiraKey('ABC-123')).toBeNull()
    expect(validateJiraKey('PROJ-1001')).toBeNull()
    expect(validateJiraKey('AB1-9')).toBeNull()
  })

  it('treats blank / whitespace / null / undefined as valid "no key"', () => {
    expect(validateJiraKey('')).toBeNull()
    expect(validateJiraKey('   ')).toBeNull()
    expect(validateJiraKey(null)).toBeNull()
    expect(validateJiraKey(undefined)).toBeNull()
  })

  it('tolerates surrounding whitespace around an otherwise-valid key', () => {
    expect(validateJiraKey('  ABC-123  ')).toBeNull()
  })

  it('rejects a malformed non-blank key', () => {
    expect(validateJiraKey('not a key')).toBe(JIRA_KEY_ERROR)
    expect(validateJiraKey('abc-123')).toBe(JIRA_KEY_ERROR) // lower-case
    expect(validateJiraKey('A-1')).toBe(JIRA_KEY_ERROR) // single-char project key
    expect(validateJiraKey('ABC-')).toBe(JIRA_KEY_ERROR) // no number
    expect(validateJiraKey('ABC123')).toBe(JIRA_KEY_ERROR) // no dash
  })
})

describe('normalizeJiraKey', () => {
  it('trims a value and omits when blank', () => {
    expect(normalizeJiraKey('  ABC-123 ')).toBe('ABC-123')
    expect(normalizeJiraKey('')).toBeUndefined()
    expect(normalizeJiraKey('   ')).toBeUndefined()
    expect(normalizeJiraKey(null)).toBeUndefined()
    expect(normalizeJiraKey(undefined)).toBeUndefined()
  })
})

describe('normalizeChangeComment', () => {
  it('trims a value and omits when blank', () => {
    expect(normalizeChangeComment('  hello  ')).toBe('hello')
    expect(normalizeChangeComment('   ')).toBeUndefined()
    expect(normalizeChangeComment(undefined)).toBeUndefined()
  })
})
