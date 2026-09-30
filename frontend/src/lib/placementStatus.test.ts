import { describe, expect, it } from 'vitest'
import { getPlacementStatusTone, isPlacementRowSelectable } from './placementStatus'

describe('getPlacementStatusTone', () => {
  it('tones RESOLVED as success', () => {
    expect(getPlacementStatusTone('RESOLVED')).toBe('success')
  })

  it('tones IN_SYNC and OUTSIDE_SCOPE as secondary (neutral, not alarming)', () => {
    expect(getPlacementStatusTone('IN_SYNC')).toBe('secondary')
    expect(getPlacementStatusTone('OUTSIDE_SCOPE')).toBe('secondary')
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
  })
})

describe('isPlacementRowSelectable', () => {
  it('is true only for a RESOLVED + BASE row', () => {
    expect(isPlacementRowSelectable({ status: 'RESOLVED', rowLabel: 'BASE' })).toBe(true)
  })

  it('is false for a marker (per-range) row even when RESOLVED', () => {
    expect(isPlacementRowSelectable({ status: 'RESOLVED', rowLabel: 'vcs.settings' })).toBe(false)
  })

  it('is false for OUTSIDE_SCOPE — archived components and marker rows are report-only', () => {
    expect(isPlacementRowSelectable({ status: 'OUTSIDE_SCOPE', rowLabel: 'BASE' })).toBe(false)
  })

  it('is false for any other non-RESOLVED status', () => {
    expect(isPlacementRowSelectable({ status: 'CONFLICT', rowLabel: 'BASE' })).toBe(false)
  })
})
