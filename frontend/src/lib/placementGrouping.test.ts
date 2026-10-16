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
        } as PlacementRowDiff['entries'][number],
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

describe('wasRowDerived', () => {
  // Shaped like real CRS JSON: every nullable field is present, explicitly null
  // (no NON_NULL on the DTOs), so null cannot signal "not derived".
  const wire = (status: PlacementRowDiff['status']): PlacementRowDiff =>
    row({
      status,
      entries: [
        {
          name: 'main',
          vcsPath: 'ssh://git/x.git',
          branch: null,
          tag: null,
          hotfixBranch: null,
          repositoryType: 'GIT',
          currentCheckoutDirectory: null,
          currentSourcePath: null,
          derivedCheckoutDirectory: null,
          derivedSourcePath: null,
        },
      ],
      currentBuildWorkingDirectory: null,
      derivedBuildWorkingDirectory: null,
    })

  it.each(['RESOLVED', 'IN_SYNC', 'MANUAL_EDIT', 'INVALID'] as const)('is true for %s, even when every derived field is null', (status) => {
    expect(wasRowDerived(wire(status))).toBe(true)
  })

  it.each(['CONFLICT', 'UNEXPRESSIBLE', 'NO_CHAIN', 'OUTSIDE_TEMPLATES', 'COMPILE_PAUSED', 'TC_ERROR', 'ROOTS_MISMATCH'] as const)(
    'is false for %s (report-only), even though its derived fields are null on the wire',
    (status) => {
      expect(wasRowDerived(wire(status))).toBe(false)
    },
  )

  it('is false for a status this Portal does not know', () => {
    expect(wasRowDerived(wire('SOMETHING_NEW' as PlacementRowDiff['status']))).toBe(false)
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
