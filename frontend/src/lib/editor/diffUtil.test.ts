import { describe, it, expect } from 'vitest'
import { deepEqual, formatDiffValue, scalarDiff, boolDiff, listDiff } from './diffUtil'

describe('deepEqual', () => {
  it('compares scalars, arrays, and nested objects', () => {
    expect(deepEqual(1, 1)).toBe(true)
    expect(deepEqual('a', 'b')).toBe(false)
    expect(deepEqual([1, 2], [1, 2])).toBe(true)
    expect(deepEqual([1, 2], [2, 1])).toBe(false)
    expect(deepEqual({ a: 1, b: [2] }, { a: 1, b: [2] })).toBe(true)
    expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false)
    expect(deepEqual(null, undefined)).toBe(false)
  })
})

describe('formatDiffValue', () => {
  it('renders blanks/empties as em-dash, booleans as On/Off, arrays joined', () => {
    expect(formatDiffValue('')).toBe('—')
    expect(formatDiffValue('  ')).toBe('—')
    expect(formatDiffValue(null)).toBe('—')
    expect(formatDiffValue([])).toBe('—')
    expect(formatDiffValue(true)).toBe('On')
    expect(formatDiffValue(false)).toBe('Off')
    expect(formatDiffValue(['a', 'b'])).toBe('a, b')
    expect(formatDiffValue('x')).toBe('x')
  })
})

describe('scalarDiff', () => {
  it('returns null when unchanged', () => {
    expect(scalarDiff('Field', 'same', 'same')).toBeNull()
  })

  it('returns a row on change', () => {
    expect(scalarDiff('Field', 'old', 'new')).toEqual({
      label: 'Field',
      oldValue: 'old',
      newValue: 'new',
      clearedScalarNoop: false,
    })
  })

  it('flags an aspect-scalar clear as a no-op', () => {
    const row = scalarDiff('Build · System', 'GRADLE', '', { aspectScalar: true })
    expect(row?.clearedScalarNoop).toBe(true)
    expect(row?.newValue).toBe('—')
  })

  it('does NOT flag a non-aspect scalar clear', () => {
    const row = scalarDiff('Display Name', 'Foo', '')
    expect(row?.clearedScalarNoop).toBe(false)
  })

  it('does NOT flag an aspect-scalar set (non-empty new value)', () => {
    const row = scalarDiff('Build · System', '', 'GRADLE', { aspectScalar: true })
    expect(row?.clearedScalarNoop).toBe(false)
  })
})

describe('boolDiff / listDiff', () => {
  it('boolDiff returns null when unchanged, a row on flip', () => {
    expect(boolDiff('Flag', true, true)).toBeNull()
    expect(boolDiff('Flag', false, true)).toEqual({ label: 'Flag', oldValue: 'Off', newValue: 'On' })
  })

  it('listDiff never flags clears (REPLACE semantics persist)', () => {
    expect(listDiff('Labels', ['a'], ['a'])).toBeNull()
    const row = listDiff('Labels', ['a', 'b'], [])
    expect(row).toEqual({ label: 'Labels', oldValue: 'a, b', newValue: '—' })
    expect(row).not.toHaveProperty('clearedScalarNoop')
  })
})
