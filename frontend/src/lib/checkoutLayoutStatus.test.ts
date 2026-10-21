import { describe, expect, it } from 'vitest'
import { PLACEMENT_STATUS_BUCKETS, checkoutLayoutStatusInfo } from './checkoutLayoutStatus'

describe('checkoutLayoutStatusInfo — tone', () => {
  it('tones RESOLVED as success', () => {
    expect(checkoutLayoutStatusInfo('RESOLVED').tone).toBe('success')
  })

  it('tones IN_SYNC as secondary (neutral, not alarming)', () => {
    expect(checkoutLayoutStatusInfo('IN_SYNC').tone).toBe('secondary')
  })

  it('tones INVALID, CONFLICT and TC_ERROR as destructive', () => {
    expect(checkoutLayoutStatusInfo('INVALID').tone).toBe('destructive')
    expect(checkoutLayoutStatusInfo('CONFLICT').tone).toBe('destructive')
    expect(checkoutLayoutStatusInfo('TC_ERROR').tone).toBe('destructive')
  })

  it('tones the remaining report-only statuses as warning', () => {
    expect(checkoutLayoutStatusInfo('UNEXPRESSIBLE').tone).toBe('warning')
    expect(checkoutLayoutStatusInfo('NO_CHAIN').tone).toBe('warning')
    expect(checkoutLayoutStatusInfo('OUTSIDE_TEMPLATES').tone).toBe('warning')
    expect(checkoutLayoutStatusInfo('COMPILE_PAUSED').tone).toBe('warning')
    expect(checkoutLayoutStatusInfo('MANUAL_EDIT').tone).toBe('warning')
    expect(checkoutLayoutStatusInfo('ROOTS_MISMATCH').tone).toBe('warning')
  })
})

describe('checkoutLayoutStatusInfo — label', () => {
  it('labels the "ready" status', () => {
    expect(checkoutLayoutStatusInfo('RESOLVED').label).toBe('Ready to sync')
  })

  it('labels the "needs a look" statuses', () => {
    expect(checkoutLayoutStatusInfo('CONFLICT').label).toBe('TeamCity configurations disagree')
    expect(checkoutLayoutStatusInfo('INVALID').label).toBe('Derived value fails validation')
    expect(checkoutLayoutStatusInfo('TC_ERROR').label).toBe('TeamCity error')
    expect(checkoutLayoutStatusInfo('MANUAL_EDIT').label).toBe('Edited manually — kept')
  })

  it('labels the "can\'t derive" statuses', () => {
    expect(checkoutLayoutStatusInfo('UNEXPRESSIBLE').label).toBe("Checkout rule can't be represented")
    expect(checkoutLayoutStatusInfo('NO_CHAIN').label).toBe('No TeamCity chain found')
    expect(checkoutLayoutStatusInfo('OUTSIDE_TEMPLATES').label).toBe('Not on a supported template')
    expect(checkoutLayoutStatusInfo('COMPILE_PAUSED').label).toBe('Compile configurations paused')
    expect(checkoutLayoutStatusInfo('ROOTS_MISMATCH').label).toBe('VCS roots differ from the registry')
  })

  it('labels the "nothing to do" statuses', () => {
    expect(checkoutLayoutStatusInfo('IN_SYNC').label).toBe('Already in sync')
  })
})

describe('checkoutLayoutStatusInfo — bucket', () => {
  it('buckets each status into one of the four groups', () => {
    expect(checkoutLayoutStatusInfo('RESOLVED').bucket).toBe('ready')
    expect(checkoutLayoutStatusInfo('CONFLICT').bucket).toBe('needsLook')
    expect(checkoutLayoutStatusInfo('INVALID').bucket).toBe('needsLook')
    expect(checkoutLayoutStatusInfo('TC_ERROR').bucket).toBe('needsLook')
    expect(checkoutLayoutStatusInfo('MANUAL_EDIT').bucket).toBe('needsLook')
    expect(checkoutLayoutStatusInfo('UNEXPRESSIBLE').bucket).toBe('cantDerive')
    expect(checkoutLayoutStatusInfo('NO_CHAIN').bucket).toBe('cantDerive')
    expect(checkoutLayoutStatusInfo('OUTSIDE_TEMPLATES').bucket).toBe('cantDerive')
    expect(checkoutLayoutStatusInfo('COMPILE_PAUSED').bucket).toBe('cantDerive')
    expect(checkoutLayoutStatusInfo('ROOTS_MISMATCH').bucket).toBe('cantDerive')
    expect(checkoutLayoutStatusInfo('IN_SYNC').bucket).toBe('nothingToDo')
  })
})

describe('PLACEMENT_STATUS_BUCKETS', () => {
  it('orders the four buckets Ready, Needs a look, Can\'t derive, Nothing to do, each with a label', () => {
    expect(PLACEMENT_STATUS_BUCKETS.map((b) => b.id)).toEqual(['ready', 'needsLook', 'cantDerive', 'nothingToDo'])
    expect(PLACEMENT_STATUS_BUCKETS.map((b) => b.label)).toEqual([
      'Ready',
      'Needs a look',
      "Can't derive",
      'Nothing to do',
    ])
  })
})

describe('an unknown status (CRS deploys independently of the Portal)', () => {
  it('falls back to a neutral needs-a-look badge labelled with the raw code', () => {
    expect(checkoutLayoutStatusInfo('SOMETHING_NEW').tone).toBe('secondary')
    expect(checkoutLayoutStatusInfo('SOMETHING_NEW').label).toBe('SOMETHING_NEW')
    expect(checkoutLayoutStatusInfo('SOMETHING_NEW').bucket).toBe('needsLook')
  })

})

describe('a status named like an Object.prototype key', () => {
  it('is unknown, not a crash or a prototype hit', () => {
    expect(checkoutLayoutStatusInfo('toString').label).toBe('toString')
    expect(checkoutLayoutStatusInfo('toString').bucket).toBe('needsLook')
  })
})

describe('unknown status fallback', () => {
  it('is neutral, raw-labelled, needs a look, and not derived', () => {
    expect(checkoutLayoutStatusInfo('NEW_STATUS').tone).toBe('secondary')
    expect(checkoutLayoutStatusInfo('NEW_STATUS').label).toBe('NEW_STATUS')
    expect(checkoutLayoutStatusInfo('NEW_STATUS').bucket).toBe('needsLook')
    expect(checkoutLayoutStatusInfo('NEW_STATUS').derived).toBe(false)
  })

  it.each(['RESOLVED', 'IN_SYNC', 'MANUAL_EDIT', 'INVALID'])('treats %s as derived', (s) => {
    expect(checkoutLayoutStatusInfo(s).derived).toBe(true)
  })
})

describe('checkoutLayoutStatusInfo — derived', () => {
  it.each(['CONFLICT', 'UNEXPRESSIBLE', 'NO_CHAIN', 'OUTSIDE_TEMPLATES', 'COMPILE_PAUSED', 'TC_ERROR', 'ROOTS_MISMATCH'])(
    'is false for the report-only %s',
    (s) => {
      expect(checkoutLayoutStatusInfo(s).derived).toBe(false)
    },
  )
})
