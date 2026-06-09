import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { selectBaseRow, selectOverrideRows } from './baseRow'
import type { ComponentDetail, ComponentConfiguration } from '../types'

function makeRow(id: string, rowType: ComponentConfiguration['rowType']): ComponentConfiguration {
  return {
    id,
    versionRange: '(,0),[0,)',
    rowType,
    overriddenAttribute: null,
    isSyntheticBase: false,
    vcsEntries: [],
    mavenArtifacts: [],
    fileUrlArtifacts: [],
    dockerImages: [],
    packages: [],
    requiredTools: [],
  }
}

function makeComponent(id: string, configurations: ComponentConfiguration[]): ComponentDetail {
  return {
    id,
    name: 'svc',
    displayName: 'svc',
    componentOwner: null,
    productType: null,
    system: null,
    clientCode: null,
    archived: false,
    solution: null,
    parentComponentName: null,
    version: 1,
    createdAt: null,
    updatedAt: null,
    labels: [],
    docs: [],
    artifactIds: [],
    securityGroups: [],
    teamcityProjects: [],
    configurations,
  }
}

describe('selectBaseRow / selectOverrideRows', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    warnSpy.mockRestore()
  })

  it('returns the BASE row when exactly one is present', () => {
    const base = makeRow('b-1', 'BASE')
    const c = makeComponent('c-1', [base, makeRow('o-1', 'SCALAR_OVERRIDE')])
    expect(selectBaseRow(c)).toBe(base)
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('returns undefined when no BASE row is present (no warn)', () => {
    const c = makeComponent('c-1', [makeRow('o-1', 'SCALAR_OVERRIDE')])
    expect(selectBaseRow(c)).toBeUndefined()
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('warns and returns first BASE row when MULTIPLE BASE rows are on the wire', () => {
    const first = makeRow('b-1', 'BASE')
    const second = makeRow('b-2', 'BASE')
    const c = makeComponent('c-1', [first, second, makeRow('o-1', 'MARKER')])
    expect(selectBaseRow(c)).toBe(first)
    expect(warnSpy).toHaveBeenCalledOnce()
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('2 BASE rows'))
  })

  it('caps the warn to once per component snapshot (re-render does not re-warn)', () => {
    const c = makeComponent('c-1', [makeRow('b-1', 'BASE'), makeRow('b-2', 'BASE')])
    selectBaseRow(c)
    selectBaseRow(c)
    selectBaseRow(c)
    expect(warnSpy).toHaveBeenCalledOnce()
  })

  it('selectOverrideRows excludes the BASE row(s) and returns the rest', () => {
    const base = makeRow('b-1', 'BASE')
    const scalar = makeRow('o-1', 'SCALAR_OVERRIDE')
    const marker = makeRow('o-2', 'MARKER')
    const c = makeComponent('c-1', [base, scalar, marker])
    expect(selectOverrideRows(c)).toEqual([scalar, marker])
  })
})
