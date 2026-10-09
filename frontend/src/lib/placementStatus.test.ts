import { describe, expect, it } from 'vitest'
import {
  getPlacementStatusBucket,
  getPlacementStatusLabel,
  getPlacementStatusTone,
  isPlacementRowSelectable,
  PLACEMENT_STATUS_BUCKETS,
} from './placementStatus'

describe('getPlacementStatusTone', () => {
  it('tones RESOLVED as success', () => {
    expect(getPlacementStatusTone('RESOLVED')).toBe('success')
  })

  it('tones IN_SYNC as secondary (neutral, not alarming)', () => {
    expect(getPlacementStatusTone('IN_SYNC')).toBe('secondary')
  })

  it('tones INVALID, CONFLICT and TC_ERROR as destructive', () => {
    expect(getPlacementStatusTone('INVALID')).toBe('destructive')
    expect(getPlacementStatusTone('CONFLICT')).toBe('destructive')
    expect(getPlacementStatusTone('TC_ERROR')).toBe('destructive')
  })

  it('tones the remaining report-only statuses as warning', () => {
    expect(getPlacementStatusTone('UNEXPRESSIBLE')).toBe('warning')
    expect(getPlacementStatusTone('NO_CHAIN')).toBe('warning')
    expect(getPlacementStatusTone('OUTSIDE_TEMPLATES')).toBe('warning')
    expect(getPlacementStatusTone('COMPILE_PAUSED')).toBe('warning')
    expect(getPlacementStatusTone('MANUAL_EDIT')).toBe('warning')
    expect(getPlacementStatusTone('ROOTS_MISMATCH')).toBe('warning')
  })
})

describe('isPlacementRowSelectable', () => {
  it('is true only for a RESOLVED + BASE row', () => {
    expect(isPlacementRowSelectable({ status: 'RESOLVED', rowLabel: 'BASE' })).toBe(true)
  })

  it('is false for a marker (per-range) row even when RESOLVED', () => {
    expect(isPlacementRowSelectable({ status: 'RESOLVED', rowLabel: 'vcs.settings' })).toBe(false)
  })

  it('is false for any other non-RESOLVED status', () => {
    expect(isPlacementRowSelectable({ status: 'CONFLICT', rowLabel: 'BASE' })).toBe(false)
    expect(isPlacementRowSelectable({ status: 'ROOTS_MISMATCH', rowLabel: 'BASE' })).toBe(false)
  })
})

describe('getPlacementStatusLabel', () => {
  it('labels the "ready" status', () => {
    expect(getPlacementStatusLabel('RESOLVED')).toBe('Ready to sync')
  })

  it('labels the "needs a look" statuses', () => {
    expect(getPlacementStatusLabel('CONFLICT')).toBe('TeamCity configurations disagree')
    expect(getPlacementStatusLabel('INVALID')).toBe('Derived value fails validation')
    expect(getPlacementStatusLabel('TC_ERROR')).toBe('TeamCity error')
    expect(getPlacementStatusLabel('MANUAL_EDIT')).toBe('Edited manually — kept')
  })

  it('labels the "can\'t derive" statuses', () => {
    expect(getPlacementStatusLabel('UNEXPRESSIBLE')).toBe("Checkout rule can't be represented")
    expect(getPlacementStatusLabel('NO_CHAIN')).toBe('No TeamCity chain found')
    expect(getPlacementStatusLabel('OUTSIDE_TEMPLATES')).toBe('Not on a supported template')
    expect(getPlacementStatusLabel('COMPILE_PAUSED')).toBe('Compile configurations paused')
    expect(getPlacementStatusLabel('ROOTS_MISMATCH')).toBe('VCS roots differ from the registry')
  })

  it('labels the "nothing to do" statuses', () => {
    expect(getPlacementStatusLabel('IN_SYNC')).toBe('Already in sync')
  })
})

describe('getPlacementStatusBucket', () => {
  it('buckets each status into one of the four groups', () => {
    expect(getPlacementStatusBucket('RESOLVED')).toBe('ready')
    expect(getPlacementStatusBucket('CONFLICT')).toBe('needsLook')
    expect(getPlacementStatusBucket('INVALID')).toBe('needsLook')
    expect(getPlacementStatusBucket('TC_ERROR')).toBe('needsLook')
    expect(getPlacementStatusBucket('MANUAL_EDIT')).toBe('needsLook')
    expect(getPlacementStatusBucket('UNEXPRESSIBLE')).toBe('cantDerive')
    expect(getPlacementStatusBucket('NO_CHAIN')).toBe('cantDerive')
    expect(getPlacementStatusBucket('OUTSIDE_TEMPLATES')).toBe('cantDerive')
    expect(getPlacementStatusBucket('COMPILE_PAUSED')).toBe('cantDerive')
    expect(getPlacementStatusBucket('ROOTS_MISMATCH')).toBe('cantDerive')
    expect(getPlacementStatusBucket('IN_SYNC')).toBe('nothingToDo')
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
    expect(getPlacementStatusTone('SOMETHING_NEW')).toBe('secondary')
    expect(getPlacementStatusLabel('SOMETHING_NEW')).toBe('SOMETHING_NEW')
    expect(getPlacementStatusBucket('SOMETHING_NEW')).toBe('needsLook')
  })

  it('is never selectable', () => {
    expect(isPlacementRowSelectable({ status: 'SOMETHING_NEW', rowLabel: 'BASE' })).toBe(false)
  })
})
