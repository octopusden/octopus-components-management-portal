import { describe, expect, it } from 'vitest'
import { PLACEMENT_STATUS_BUCKETS, placementStatusInfo } from './placementStatus'

describe('placementStatusInfo — tone', () => {
  it('tones RESOLVED as success', () => {
    expect(placementStatusInfo('RESOLVED').tone).toBe('success')
  })

  it('tones IN_SYNC as secondary (neutral, not alarming)', () => {
    expect(placementStatusInfo('IN_SYNC').tone).toBe('secondary')
  })

  it('tones INVALID, CONFLICT and TC_ERROR as destructive', () => {
    expect(placementStatusInfo('INVALID').tone).toBe('destructive')
    expect(placementStatusInfo('CONFLICT').tone).toBe('destructive')
    expect(placementStatusInfo('TC_ERROR').tone).toBe('destructive')
  })

  it('tones the remaining report-only statuses as warning', () => {
    expect(placementStatusInfo('UNEXPRESSIBLE').tone).toBe('warning')
    expect(placementStatusInfo('NO_CHAIN').tone).toBe('warning')
    expect(placementStatusInfo('OUTSIDE_TEMPLATES').tone).toBe('warning')
    expect(placementStatusInfo('COMPILE_PAUSED').tone).toBe('warning')
    expect(placementStatusInfo('MANUAL_EDIT').tone).toBe('warning')
    expect(placementStatusInfo('ROOTS_MISMATCH').tone).toBe('warning')
  })
})

describe('placementStatusInfo — label', () => {
  it('labels the "ready" status', () => {
    expect(placementStatusInfo('RESOLVED').label).toBe('Ready to sync')
  })

  it('labels the "needs a look" statuses', () => {
    expect(placementStatusInfo('CONFLICT').label).toBe('TeamCity configurations disagree')
    expect(placementStatusInfo('INVALID').label).toBe('Derived value fails validation')
    expect(placementStatusInfo('TC_ERROR').label).toBe('TeamCity error')
    expect(placementStatusInfo('MANUAL_EDIT').label).toBe('Edited manually — kept')
  })

  it('labels the "can\'t derive" statuses', () => {
    expect(placementStatusInfo('UNEXPRESSIBLE').label).toBe("Checkout rule can't be represented")
    expect(placementStatusInfo('NO_CHAIN').label).toBe('No TeamCity chain found')
    expect(placementStatusInfo('OUTSIDE_TEMPLATES').label).toBe('Not on a supported template')
    expect(placementStatusInfo('COMPILE_PAUSED').label).toBe('Compile configurations paused')
    expect(placementStatusInfo('ROOTS_MISMATCH').label).toBe('VCS roots differ from the registry')
  })

  it('labels the "nothing to do" statuses', () => {
    expect(placementStatusInfo('IN_SYNC').label).toBe('Already in sync')
  })
})

describe('placementStatusInfo — bucket', () => {
  it('buckets each status into one of the four groups', () => {
    expect(placementStatusInfo('RESOLVED').bucket).toBe('ready')
    expect(placementStatusInfo('CONFLICT').bucket).toBe('needsLook')
    expect(placementStatusInfo('INVALID').bucket).toBe('needsLook')
    expect(placementStatusInfo('TC_ERROR').bucket).toBe('needsLook')
    expect(placementStatusInfo('MANUAL_EDIT').bucket).toBe('needsLook')
    expect(placementStatusInfo('UNEXPRESSIBLE').bucket).toBe('cantDerive')
    expect(placementStatusInfo('NO_CHAIN').bucket).toBe('cantDerive')
    expect(placementStatusInfo('OUTSIDE_TEMPLATES').bucket).toBe('cantDerive')
    expect(placementStatusInfo('COMPILE_PAUSED').bucket).toBe('cantDerive')
    expect(placementStatusInfo('ROOTS_MISMATCH').bucket).toBe('cantDerive')
    expect(placementStatusInfo('IN_SYNC').bucket).toBe('nothingToDo')
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
    expect(placementStatusInfo('SOMETHING_NEW').tone).toBe('secondary')
    expect(placementStatusInfo('SOMETHING_NEW').label).toBe('SOMETHING_NEW')
    expect(placementStatusInfo('SOMETHING_NEW').bucket).toBe('needsLook')
  })

})

describe('a status named like an Object.prototype key', () => {
  it('is unknown, not a crash or a prototype hit', () => {
    expect(placementStatusInfo('toString').label).toBe('toString')
    expect(placementStatusInfo('toString').bucket).toBe('needsLook')
  })
})

describe('unknown status fallback', () => {
  it('is neutral, raw-labelled, needs a look, and not derived', () => {
    expect(placementStatusInfo('NEW_STATUS').tone).toBe('secondary')
    expect(placementStatusInfo('NEW_STATUS').label).toBe('NEW_STATUS')
    expect(placementStatusInfo('NEW_STATUS').bucket).toBe('needsLook')
    expect(placementStatusInfo('NEW_STATUS').derived).toBe(false)
  })

  it.each(['RESOLVED', 'IN_SYNC', 'MANUAL_EDIT', 'INVALID'])('treats %s as derived', (s) => {
    expect(placementStatusInfo(s).derived).toBe(true)
  })
})

describe('placementStatusInfo — derived', () => {
  it.each(['CONFLICT', 'UNEXPRESSIBLE', 'NO_CHAIN', 'OUTSIDE_TEMPLATES', 'COMPILE_PAUSED', 'TC_ERROR', 'ROOTS_MISMATCH'])(
    'is false for the report-only %s',
    (s) => {
      expect(placementStatusInfo(s).derived).toBe(false)
    },
  )
})
