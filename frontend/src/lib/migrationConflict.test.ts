import { describe, expect, it } from 'vitest'
import { ApiError } from './api'
import { isDiffReplacedConflict } from './migrationConflict'

function conflict409(body: unknown) {
  return new ApiError(409, 'Conflict', JSON.stringify(body))
}

describe('isDiffReplacedConflict', () => {
  it('is true for the actual CRS body (errorCode placement-diff-stale)', () => {
    const err = conflict409({ errorMessage: 'diff replaced, re-run Diff', errorCode: 'placement-diff-stale' })
    expect(isDiffReplacedConflict(err)).toBe(true)
  })

  it('is true on errorCode alone, whatever the message says', () => {
    expect(isDiffReplacedConflict(conflict409({ errorCode: 'placement-diff-stale', errorMessage: 'reworded' }))).toBe(true)
  })

  it('falls back to errorMessage for a CRS without errorCode', () => {
    expect(isDiffReplacedConflict(conflict409({ errorMessage: 'diff replaced, re-run Diff' }))).toBe(true)
  })

  it('falls back to a Spring-default message body', () => {
    expect(isDiffReplacedConflict(conflict409({ status: 409, message: 'diff replaced, re-run Diff' }))).toBe(true)
  })

  it('is false for a cross-kind conflict (kind: "conflict")', () => {
    const err = conflict409({
      kind: 'conflict',
      code: 'components-migration-running',
      message: 'Cross-kind migration conflict',
      activeKind: 'COMPONENTS',
      activeJobId: 'xyz',
    })
    expect(isDiffReplacedConflict(err)).toBe(false)
  })

  it('is false for a same-kind attach (kind: "job")', () => {
    const err = conflict409({ kind: 'job', id: 'sync-1', state: 'RUNNING' })
    expect(isDiffReplacedConflict(err)).toBe(false)
  })

  it('is false for an unrelated plain 409 body without a "diff replaced" message', () => {
    // Guards against treating every kind-less 409 as "diff replaced" — only
    // this endpoint's specific message should match.
    const err = conflict409({ errorMessage: 'some other conflict entirely' })
    expect(isDiffReplacedConflict(err)).toBe(false)
  })

  it('is false for a non-409 ApiError', () => {
    const err = new ApiError(500, 'boom', JSON.stringify({ message: 'diff replaced, re-run Diff' }))
    expect(isDiffReplacedConflict(err)).toBe(false)
  })

  it('is false for a non-ApiError value', () => {
    expect(isDiffReplacedConflict(new Error('diff replaced, re-run Diff'))).toBe(false)
  })
})
