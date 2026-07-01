import { describe, it, expect } from 'vitest'
import type { FieldOverride } from '../../lib/types'
import {
  isDraftId,
  DRAFT_ID_PREFIX,
  toUpsert,
  formatOverrideValue,
  diffOverrides,
} from './overrideDraftUtil'

function ov(over: Partial<FieldOverride> = {}): FieldOverride {
  return {
    id: 'o1',
    overriddenAttribute: 'build.javaVersion',
    versionRange: '[1.0,2.0)',
    rowType: 'SCALAR_OVERRIDE',
    value: '17',
    markerChildren: null,
    createdAt: null,
    updatedAt: null,
    ...over,
  }
}

describe('isDraftId', () => {
  it('recognises the draft id prefix', () => {
    expect(isDraftId(`${DRAFT_ID_PREFIX}1`)).toBe(true)
    expect(isDraftId('o1')).toBe(false)
  })
})

describe('formatOverrideValue', () => {
  it('renders a scalar string value', () => {
    expect(formatOverrideValue(ov({ value: '21' }))).toBe('21')
  })

  it('renders a boolean value as On/Off', () => {
    expect(formatOverrideValue(ov({ value: true }))).toBe('On')
    expect(formatOverrideValue(ov({ value: false }))).toBe('Off')
  })

  it('summarises a marker payload by child counts in a stable order', () => {
    const marker = ov({
      overriddenAttribute: 'distribution.maven',
      rowType: 'MARKER',
      value: null,
      markerChildren: {
        mavenArtifacts: [{}, {}] as never,
        dockerImages: [{}] as never,
      },
    })
    expect(formatOverrideValue(marker)).toBe('2 Maven artifacts, 1 Docker images')
  })

  it('renders an empty marker payload distinctly (not [object Object])', () => {
    const marker = ov({ rowType: 'MARKER', value: null, markerChildren: {} })
    expect(formatOverrideValue(marker)).toBe('marker (no entries)')
  })

  it('renders a SCALAR row by its value even if stray markerChildren are present', () => {
    const scalar = ov({ rowType: 'SCALAR_OVERRIDE', value: '21', markerChildren: { requiredTools: ['x'] } })
    expect(formatOverrideValue(scalar)).toBe('21')
  })

  it('renders a null scalar value as an em-dash', () => {
    expect(formatOverrideValue(ov({ value: null }))).toBe('—')
  })
})

describe('toUpsert', () => {
  it('keeps a real server id', () => {
    expect(toUpsert(ov({ id: 'o1' }))).toMatchObject({ id: 'o1', overriddenAttribute: 'build.javaVersion', value: '17' })
  })

  it('strips a draft (temp) id so the server treats it as a create', () => {
    const upsert = toUpsert(ov({ id: `${DRAFT_ID_PREFIX}3` }))
    expect('id' in upsert).toBe(false)
    expect(upsert).toMatchObject({ overriddenAttribute: 'build.javaVersion', versionRange: '[1.0,2.0)', value: '17' })
  })

  it('a scalar override carries value, not markerChildren', () => {
    const upsert = toUpsert(ov({ value: '21' }))
    expect(upsert.value).toBe('21')
    expect('markerChildren' in upsert).toBe(false)
  })

  it('a marker override carries markerChildren, not value', () => {
    const upsert = toUpsert(ov({ rowType: 'MARKER', value: null, markerChildren: { requiredTools: ['x'] } }))
    expect(upsert.markerChildren).toEqual({ requiredTools: ['x'] })
    expect('value' in upsert).toBe(false)
  })
})

describe('diffOverrides', () => {
  const label = (o: FieldOverride) => `Override · ${o.overriddenAttribute}`

  it('emits a create row (— → value) for an effective row absent from the server', () => {
    const created = ov({ id: `${DRAFT_ID_PREFIX}1`, value: '21' })
    const rows = diffOverrides([], [created], label)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ oldValue: '—' })
    expect(rows[0]?.newValue).toContain('21')
  })

  it('emits an update row when the value changed', () => {
    const server = ov({ id: 'o1', value: '17' })
    const updated = ov({ id: 'o1', value: '21' })
    const rows = diffOverrides([server], [updated], label)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.oldValue).toContain('17')
    expect(rows[0]?.newValue).toContain('21')
  })

  it('emits an update row when only the version range changed', () => {
    const server = ov({ id: 'o1', versionRange: '[1.0,2.0)', value: '17' })
    const updated = ov({ id: 'o1', versionRange: '[1.0,3.0)', value: '17' })
    const rows = diffOverrides([server], [updated], label)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.oldValue).not.toBe(rows[0]?.newValue)
  })

  it('emits a delete row (value → (removed)) for a server row absent from effective', () => {
    const server = ov({ id: 'o1', value: '17' })
    const rows = diffOverrides([server], [], label)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.newValue).toBe('(removed)')
  })

  it('emits nothing when server and effective match', () => {
    const server = ov({ id: 'o1', value: '17' })
    expect(diffOverrides([server], [ov({ id: 'o1', value: '17' })], label)).toHaveLength(0)
  })
})
