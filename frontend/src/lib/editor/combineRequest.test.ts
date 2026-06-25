import { describe, it, expect } from 'vitest'
import {
  mergeBaseConfiguration,
  combineRequest,
  collectDiff,
  anyDirty,
  type SectionSlice,
} from './combineRequest'

describe('mergeBaseConfiguration', () => {
  it('deep-merges build keys from two fragments (Build + Escrow both write build)', () => {
    const merged = mergeBaseConfiguration(
      { build: { buildSystem: 'GRADLE', javaVersion: '17' } },
      { build: { buildTasks: 'clean build', deprecated: true } },
    )
    expect(merged?.build).toEqual({
      buildSystem: 'GRADLE',
      javaVersion: '17',
      buildTasks: 'clean build',
      deprecated: true,
    })
  })

  it('does not let a null aspect from one side erase a populated aspect from the other', () => {
    const merged = mergeBaseConfiguration(
      { build: { buildSystem: 'MAVEN' } },
      { escrow: { reusable: true } },
    )
    expect(merged?.build).toEqual({ buildSystem: 'MAVEN' })
    expect(merged?.escrow).toEqual({ reusable: true })
  })

  it('replaces collection keys wholesale (vcsEntries / requiredTools)', () => {
    const merged = mergeBaseConfiguration(
      { vcsEntries: [{ vcsPath: 'a/b' }] },
      { requiredTools: ['x'] },
    )
    expect(merged?.vcsEntries).toEqual([{ vcsPath: 'a/b' }])
    expect(merged?.requiredTools).toEqual(['x'])
  })

  it('returns the other side unchanged when one side is null/undefined', () => {
    expect(mergeBaseConfiguration(null, { build: { buildSystem: 'X' } })).toEqual({
      build: { buildSystem: 'X' },
    })
    expect(mergeBaseConfiguration({ build: { buildSystem: 'X' } }, undefined)).toEqual({
      build: { buildSystem: 'X' },
    })
    expect(mergeBaseConfiguration(null, null)).toBeUndefined()
  })
})

describe('combineRequest', () => {
  const slice = (over: Partial<SectionSlice>): SectionSlice => ({
    isDirty: false,
    request: {},
    diff: [],
    ...over,
  })

  it('fires ONE body with a single version, merging only dirty slices', () => {
    const out = combineRequest(7, [
      slice({ isDirty: true, request: { displayName: 'New' } }),
      slice({ isDirty: true, request: { baseConfiguration: { build: { buildSystem: 'GRADLE' } } } }),
      // clean slice contributes nothing
      slice({ isDirty: false, request: { vcsExternalRegistry: 'should-not-appear' } }),
    ])
    expect(out.version).toBe(7)
    expect(out.clearGroup).toBe(false)
    expect(out.displayName).toBe('New')
    expect(out.baseConfiguration?.build).toEqual({ buildSystem: 'GRADLE' })
    expect('vcsExternalRegistry' in out).toBe(false)
  })

  it('deep-merges baseConfiguration across two dirty slices into one build object', () => {
    const out = combineRequest(1, [
      slice({ isDirty: true, request: { baseConfiguration: { build: { buildSystem: 'GRADLE' } } } }),
      slice({ isDirty: true, request: { baseConfiguration: { build: { buildTasks: 'assemble' }, escrow: { reusable: true } } } }),
    ])
    expect(out.baseConfiguration?.build).toEqual({ buildSystem: 'GRADLE', buildTasks: 'assemble' })
    expect(out.baseConfiguration?.escrow).toEqual({ reusable: true })
  })

  it('omits baseConfiguration entirely when no dirty slice contributes one', () => {
    const out = combineRequest(2, [slice({ isDirty: true, request: { clientCode: 'C' } })])
    expect('baseConfiguration' in out).toBe(false)
  })
})

describe('collectDiff / anyDirty', () => {
  it('collects diff rows from dirty slices in order, skipping clean ones', () => {
    const diffs = collectDiff([
      { isDirty: true, request: {}, diff: [{ label: 'A', oldValue: '1', newValue: '2' }] },
      { isDirty: false, request: {}, diff: [{ label: 'B', oldValue: 'x', newValue: 'y' }] },
      { isDirty: true, request: {}, diff: [{ label: 'C', oldValue: '', newValue: 'z' }] },
    ])
    expect(diffs.map((d) => d.label)).toEqual(['A', 'C'])
  })

  it('anyDirty reflects whether any slice is dirty', () => {
    expect(anyDirty([{ isDirty: false, request: {}, diff: [] }])).toBe(false)
    expect(
      anyDirty([
        { isDirty: false, request: {}, diff: [] },
        { isDirty: true, request: {}, diff: [] },
      ]),
    ).toBe(true)
  })
})
