import { describe, expect, it } from 'vitest'
import { buildProposedChangeLines, countChangedFields, fieldChange, summarizeKeys } from './checkoutLayoutRows'
import type { CheckoutLayoutRowDiff } from './types'

function row(overrides: Partial<CheckoutLayoutRowDiff> = {}): CheckoutLayoutRowDiff {
  return {
    componentId: 'comp-a',
    componentKey: 'app-alpha',
    configurationRowId: 'row-a',
    versionRange: '[1.0,)',
    rowLabel: 'BASE',
    status: 'RESOLVED',
    entries: [],
    sourceBuildTypeIds: ['Build_App_Alpha'],
    notes: [],
    ...overrides,
  }
}

describe('fieldChange', () => {
  it('treats undefined as no change', () => {
    expect(fieldChange(undefined, undefined)).toBeNull()
  })

  it('treats null (the wire value for "no override") as no change, same as undefined', () => {
    expect(fieldChange(null, null)).toBeNull()
    expect(fieldChange(null, undefined)).toBeNull()
  })

  it('treats equal current/derived as no change even when both are set', () => {
    expect(fieldChange('app', 'app')).toBeNull()
  })

  it('renders "current → derived" when they differ', () => {
    expect(fieldChange('app', 'app2')).toBe('app → app2')
  })

  it('renders "(root)" for a null/undefined directory on either side of a real change', () => {
    expect(fieldChange(null, 'app')).toBe('(root) → app')
    expect(fieldChange('app', null)).toBe('app → (root)')
  })
})

describe('buildProposedChangeLines', () => {
  it('is empty when nothing changed', () => {
    expect(buildProposedChangeLines(row())).toEqual([])
  })

  it('proposes nothing for a report-only row whose current values are set but nothing was derived', () => {
    // CRS sends the current values on every row; on NO_CHAIN / TC_ERROR the derived ones are null.
    const r = row({
      status: 'NO_CHAIN',
      entries: [
        {
          name: 'app',
          vcsPath: 'ssh://h/prj/app-one.git',
          currentCheckoutDirectory: 'app',
          derivedCheckoutDirectory: null,
          currentSourcePath: null,
          derivedSourcePath: null,
        } as CheckoutLayoutRowDiff['entries'][number],
      ],
      currentBuildWorkingDirectory: 'app/build',
      derivedBuildWorkingDirectory: null,
    })
    expect(buildProposedChangeLines(r)).toEqual([])
  })

  it('lists a changed Checkout Directory and Source Path with full field names, unprefixed for a single root', () => {
    const r = row({
      entries: [
        {
          name: 'main',
          vcsPath: '.',
          currentCheckoutDirectory: undefined,
          derivedCheckoutDirectory: 'app-alpha',
          currentSourcePath: 'src',
          derivedSourcePath: 'source',
        },
      ],
    })
    expect(buildProposedChangeLines(r)).toEqual([
      'Checkout Directory: (root) → app-alpha',
      'Source Path: src → source',
    ])
  })

  it('prefixes each line with the VCS root name only when the row has more than one root', () => {
    const r = row({
      entries: [
        { name: 'main', vcsPath: '.', derivedCheckoutDirectory: 'app-alpha' },
        { name: 'submodule', vcsPath: './sub', derivedCheckoutDirectory: 'app-alpha/sub' },
      ],
    })
    expect(buildProposedChangeLines(r)).toEqual([
      'main: Checkout Directory: (root) → app-alpha',
      'submodule: Checkout Directory: (root) → app-alpha/sub',
    ])
  })

  it('lists a changed Build Working Directory, using the full field name (no BWD abbreviation)', () => {
    const r = row({ currentBuildWorkingDirectory: undefined, derivedBuildWorkingDirectory: 'app-alpha' })
    expect(buildProposedChangeLines(r)).toEqual(['Build Working Directory: (root) → app-alpha'])
  })
})

describe('summarizeKeys', () => {
  it('joins up to 10 keys as-is', () => {
    expect(summarizeKeys(['a', 'b', 'c'])).toBe('a, b, c')
  })

  it('lists the first 10 then "and N more" beyond that', () => {
    const keys = Array.from({ length: 12 }, (_, i) => `k${i}`)
    expect(summarizeKeys(keys)).toBe('k0, k1, k2, k3, k4, k5, k6, k7, k8, k9, and 2 more')
  })
})

describe('countChangedFields', () => {
  it("sums the changed fields of the selected components' rows only", () => {
    const rows = [
      row({
        componentId: 'comp-a',
        entries: [{ name: 'main', vcsPath: '.', derivedCheckoutDirectory: 'app-alpha' }],
        derivedBuildWorkingDirectory: 'app-alpha',
      }),
      row({ componentId: 'comp-b', componentKey: 'app-beta' }),
    ]
    expect(countChangedFields(rows, new Set(['comp-a']))).toBe(2)
    expect(countChangedFields(rows, new Set(['comp-a', 'comp-b']))).toBe(2)
    expect(countChangedFields(rows, new Set())).toBe(0)
  })
})
