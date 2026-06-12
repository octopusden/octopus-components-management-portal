import { describe, it, expect } from 'vitest'
import { classifyConflictBody, describeOptimisticConflict } from './conflict'

describe('classifyConflictBody', () => {
  it('extracts errorCode and errorMessage from the ErrorResponse envelope', () => {
    expect(
      classifyConflictBody('{"errorMessage":"uniqueness violation: …","errorCode":"UNIQUENESS_VIOLATION"}'),
    ).toEqual({ errorCode: 'UNIQUENESS_VIOLATION', errorMessage: 'uniqueness violation: …' })
  })

  it('returns null errorCode for an older server without the field', () => {
    expect(classifyConflictBody('{"errorMessage":"plain conflict"}')).toEqual({
      errorCode: null,
      errorMessage: 'plain conflict',
    })
  })

  it('tolerates malformed / non-JSON bodies', () => {
    expect(classifyConflictBody('<html>proxy error</html>')).toEqual({
      errorCode: null,
      errorMessage: null,
    })
    expect(classifyConflictBody('')).toEqual({ errorCode: null, errorMessage: null })
  })
})

describe('describeOptimisticConflict (B7.1.6)', () => {
  it('returns a title and a description that names "updated by another user" when latest is unknown', () => {
    const result = describeOptimisticConflict(undefined)
    expect(result.title).toBe('Save conflict')
    expect(result.description).toMatch(/updated by another user/i)
    // Without server data we don't know who or when, so the description must
    // tell the user what to do next instead of inventing information.
    expect(result.description).toMatch(/reload/i)
  })

  it('includes the updatedAt timestamp when latest is known', () => {
    const updatedAt = '2026-04-30T10:15:00Z'
    const result = describeOptimisticConflict({ updatedAt })
    expect(result.title).toBe('Save conflict')
    // Expose the timestamp so the user can decide whether to re-apply or abandon.
    expect(result.description).toContain(updatedAt)
  })

  it('treats null updatedAt the same as missing latest', () => {
    const result = describeOptimisticConflict({ updatedAt: null })
    expect(result.description).toMatch(/updated by another user/i)
    expect(result.description).not.toContain('null')
  })
})
