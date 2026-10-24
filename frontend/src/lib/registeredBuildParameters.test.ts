import { describe, it, expect } from 'vitest'
import { dedupeActualDisagreements } from './registeredBuildParameters'
import type { ActualDisagreement } from './types'

const d = (subRange: string, actualValue: string): ActualDisagreement => ({ subRange, actualValue })

describe('dedupeActualDisagreements', () => {
  it('returns an empty list unchanged', () => {
    expect(dedupeActualDisagreements([])).toEqual([])
  })

  it('keeps distinct (subRange, actualValue) pairs', () => {
    const input = [d('[2.0,3.0)', '17'), d('[3.0,4.0)', '21')]
    expect(dedupeActualDisagreements(input)).toEqual(input)
  })

  it('collapses byte-identical entries into one', () => {
    const input = [d('[2.0,3.0)', '17'), d('[2.0,3.0)', '17'), d('[3.0,4.0)', '21')]
    expect(dedupeActualDisagreements(input)).toEqual([d('[2.0,3.0)', '17'), d('[3.0,4.0)', '21')])
  })

  it('treats the same subRange with a different actualValue as distinct', () => {
    const input = [d('[2.0,3.0)', '17'), d('[2.0,3.0)', '21')]
    expect(dedupeActualDisagreements(input)).toEqual(input)
  })

  it('preserves first-seen order', () => {
    const input = [d('[3.0,4.0)', '21'), d('[2.0,3.0)', '17'), d('[3.0,4.0)', '21')]
    expect(dedupeActualDisagreements(input)).toEqual([d('[3.0,4.0)', '21'), d('[2.0,3.0)', '17')])
  })
})
