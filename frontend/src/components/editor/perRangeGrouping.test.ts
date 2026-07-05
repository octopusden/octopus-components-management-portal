import { describe, it, expect } from 'vitest'
import { coalescePerRangeOverrides } from './perRangeGrouping'
import type { FieldOverride } from '../../lib/types'

function docker(range: string, id: string, imageName: string | null): FieldOverride {
  return {
    id,
    overriddenAttribute: 'distribution.docker',
    versionRange: range,
    rowType: 'MARKER',
    value: null,
    markerChildren: { dockerImages: imageName === null ? [] : [{ imageName, flavor: null }] },
    createdAt: null,
    updatedAt: null,
  }
}

function scalar(range: string, id: string, value: unknown): FieldOverride {
  return {
    id,
    overriddenAttribute: 'build.javaVersion',
    versionRange: range,
    rowType: 'SCALAR_OVERRIDE',
    value,
    markerChildren: null,
    createdAt: null,
    updatedAt: null,
  }
}

describe('coalescePerRangeOverrides', () => {
  it('collapses a run of contiguous, same-value overrides into one group', () => {
    const groups = coalescePerRangeOverrides([
      docker('(,1.0.107)', 'a', null),
      docker('[1.0.107,1.2.471)', 'b', null),
      docker('[1.2.471,1.2.474)', 'c', null),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0]!.displayRange).toBe('(,1.2.474)')
    expect(groups[0]!.representative.id).toBe('a')
    expect(groups[0]!.members.map((m) => m.id)).toEqual(['a', 'b', 'c'])
  })

  it('sorts defensively so contiguity holds regardless of input order', () => {
    const groups = coalescePerRangeOverrides([
      docker('[1.2.471,1.2.474)', 'c', null),
      docker('(,1.0.107)', 'a', null),
      docker('[1.0.107,1.2.471)', 'b', null),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0]!.members.map((m) => m.id)).toEqual(['a', 'b', 'c'])
  })

  it('does NOT collapse contiguous ranges with different values', () => {
    const groups = coalescePerRangeOverrides([
      docker('(,1.0.107)', 'a', 'acme/one'),
      docker('[1.0.107,1.2.471)', 'b', 'acme/two'),
    ])
    expect(groups).toHaveLength(2)
    expect(groups.map((g) => g.displayRange)).toEqual(['(,1.0.107)', '[1.0.107,1.2.471)'])
  })

  it('does NOT collapse same-value ranges that leave a gap', () => {
    const groups = coalescePerRangeOverrides([
      docker('[1.0,2.0)', 'a', null),
      docker('[2.1,3.0)', 'b', null),
    ])
    expect(groups).toHaveLength(2)
  })

  it('starts a fresh group after a break, then coalesces the next contiguous run', () => {
    const groups = coalescePerRangeOverrides([
      docker('(,1.0)', 'a', null),
      docker('[1.0,2.0)', 'b', null), // contiguous+equal with a
      docker('[2.0,3.0)', 'c', 'acme/x'), // value differs → break
      docker('[3.0,4.0)', 'd', 'acme/x'), // contiguous+equal with c
    ])
    expect(groups.map((g) => g.members.map((m) => m.id))).toEqual([['a', 'b'], ['c', 'd']])
    expect(groups.map((g) => g.displayRange)).toEqual(['(,2.0)', '[2.0,4.0)'])
  })

  it('coalesces scalar overrides by their value too', () => {
    const groups = coalescePerRangeOverrides([
      scalar('[1.0,2.0)', 'a', '17'),
      scalar('[2.0,3.0)', 'b', '17'),
      scalar('[3.0,4.0)', 'c', '21'),
    ])
    expect(groups.map((g) => g.displayRange)).toEqual(['[1.0,3.0)', '[3.0,4.0)'])
  })

  it('does NOT merge contiguous overrides on different attributes even when their (empty) values match', () => {
    const dockerEmpty: FieldOverride = { ...docker('(,1.0)', 'a', null) }
    const packagesEmpty: FieldOverride = {
      ...docker('[1.0,2.0)', 'b', null),
      overriddenAttribute: 'distribution.packages',
      markerChildren: { packages: [] },
    }
    // deepEqual would treat {dockerImages:[]} vs {packages:[]} as different, but
    // guard the attribute explicitly so structurally-equal empties never bridge.
    const groups = coalescePerRangeOverrides([dockerEmpty, packagesEmpty])
    expect(groups).toHaveLength(2)
  })

  it('returns an empty array for no overrides', () => {
    expect(coalescePerRangeOverrides([])).toEqual([])
  })
})
