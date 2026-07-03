import { describe, it, expect } from 'vitest'
import { omitNonEditable } from './payloadGating'

describe('omitNonEditable', () => {
  it('drops keys whose mapped field path is not editable', () => {
    const payload = { projectKey: 'K', technical: true, minorVersionFormat: '$major' }
    const out = omitNonEditable(
      payload,
      {
        projectKey: 'jira.projectKey',
        technical: 'jira.technical',
        minorVersionFormat: 'jira.minorVersionFormat',
      },
      (path) => path !== 'jira.technical',
    )
    expect(out).toEqual({ projectKey: 'K', minorVersionFormat: '$major' })
    expect('technical' in out).toBe(false)
  })

  it('keeps keys that have no mapped path (not field-config-gated)', () => {
    const payload = { projectKey: 'K', version: 3 }
    const out = omitNonEditable(payload, { projectKey: 'jira.projectKey' }, () => false)
    expect(out).toEqual({ version: 3 })
  })

  it('keeps every key when everything is editable', () => {
    const payload = { a: 1, b: 2 }
    expect(omitNonEditable(payload, { a: 'x', b: 'y' }, () => true)).toEqual({ a: 1, b: 2 })
  })

  it('preserves falsy values (0, "", false, null) for editable keys', () => {
    const payload = { a: 0, b: '', c: false, d: null }
    expect(omitNonEditable(payload, {}, () => true)).toEqual({ a: 0, b: '', c: false, d: null })
  })

  it('does not mutate the input payload', () => {
    const payload = { a: 1, b: 2 }
    omitNonEditable(payload, { b: 'y' }, () => false)
    expect(payload).toEqual({ a: 1, b: 2 })
  })
})
