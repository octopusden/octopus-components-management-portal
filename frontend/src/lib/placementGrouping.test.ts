import { describe, expect, it } from 'vitest'
import {
  appliesToLabel,
  buildProposedChangeLines,
  fieldChange,
  countChangedFields,
  groupPlacementRows,
  summarizeKeys,
  wasRowDerived,
} from './placementGrouping'
import type { PlacementRowDiff } from './types'

function row(overrides: Partial<PlacementRowDiff> = {}): PlacementRowDiff {
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

describe('wasRowDerived', () => {
  it('is false when nothing was derived (e.g. a report-only row)', () => {
    expect(wasRowDerived(row())).toBe(false)
  })

  it('is true when the row-level Build Working Directory was derived, even if unchanged', () => {
    expect(wasRowDerived(row({ derivedBuildWorkingDirectory: 'app-alpha' }))).toBe(true)
  })

  it('is true when any entry has a derived Checkout Directory or Source Path, even if unchanged', () => {
    expect(
      wasRowDerived(row({ entries: [{ name: 'main', vcsPath: '.', derivedSourcePath: 'src' }] })),
    ).toBe(true)
  })
})

describe('appliesToLabel', () => {
  it('labels a BASE row "Base"', () => {
    expect(appliesToLabel(row({ rowLabel: 'BASE' }))).toBe('Base')
  })

  it('labels a marker row "Override for versions <range>" — the literal "vcs.settings" never appears', () => {
    const label = appliesToLabel(row({ rowLabel: 'vcs.settings', versionRange: '[2.0,)' }))
    expect(label).toBe('Override for versions [2.0,)')
    expect(label).not.toMatch(/vcs\.settings/)
  })
})

describe('groupPlacementRows', () => {
  it('groups rows by component, sorted by component key, Base first then overrides sorted by range', () => {
    const rows: PlacementRowDiff[] = [
      row({ componentId: 'comp-b', componentKey: 'app-beta', rowLabel: 'vcs.settings', versionRange: '[3.0,)', configurationRowId: 'row-b2' }),
      row({ componentId: 'comp-b', componentKey: 'app-beta', rowLabel: 'BASE', configurationRowId: 'row-b1' }),
      row({ componentId: 'comp-b', componentKey: 'app-beta', rowLabel: 'vcs.settings', versionRange: '[2.0,)', configurationRowId: 'row-b3' }),
      row({ componentId: 'comp-a', componentKey: 'app-alpha', rowLabel: 'BASE', configurationRowId: 'row-a1' }),
    ]
    const groups = groupPlacementRows(rows)
    expect(groups.map((g) => g.componentKey)).toEqual(['app-alpha', 'app-beta'])
    const beta = groups[1]!
    expect(beta.rows.map((r) => r.configurationRowId)).toEqual(['row-b1', 'row-b3', 'row-b2'])
  })

  it('carries the distinct statuses present in the group, for the header chips', () => {
    const rows: PlacementRowDiff[] = [
      row({ rowLabel: 'BASE', status: 'RESOLVED', configurationRowId: 'row-1' }),
      row({ rowLabel: 'vcs.settings', versionRange: '[2.0,)', status: 'IN_SYNC', configurationRowId: 'row-2' }),
    ]
    const group = groupPlacementRows(rows)[0]!
    expect(group.statuses).toEqual(['RESOLVED', 'IN_SYNC'])
  })

  it('is selectable only when the group has a RESOLVED Base row', () => {
    const resolvedBase = groupPlacementRows([row({ rowLabel: 'BASE', status: 'RESOLVED' })])[0]!
    expect(resolvedBase.selectable).toBe(true)

    const conflictBase = groupPlacementRows([row({ rowLabel: 'BASE', status: 'CONFLICT' })])[0]!
    expect(conflictBase.selectable).toBe(false)

    const noBase = groupPlacementRows([row({ rowLabel: 'vcs.settings', versionRange: '[2.0,)', status: 'IN_SYNC' })])[0]!
    expect(noBase.selectable).toBe(false)
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
  it('sums the changed fields of the selected components\' Base rows only', () => {
    const groups = groupPlacementRows([
      row({
        componentId: 'comp-a',
        rowLabel: 'BASE',
        entries: [{ name: 'main', vcsPath: '.', derivedCheckoutDirectory: 'app-alpha' }],
        derivedBuildWorkingDirectory: 'app-alpha',
      }),
      row({ componentId: 'comp-b', componentKey: 'app-beta', rowLabel: 'BASE' }),
    ])
    expect(countChangedFields(groups, new Set(['comp-a']))).toBe(2)
    expect(countChangedFields(groups, new Set(['comp-a', 'comp-b']))).toBe(2)
    expect(countChangedFields(groups, new Set())).toBe(0)
  })
})
