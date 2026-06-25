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

// Acceptance #6: the review diff and the PATCH body are derived from the SAME
// dirty slices, so what the user reviews equals what is sent. collectDiff and
// combineRequest both filter on `isDirty` over the identical slice array —
// a clean slice contributes to NEITHER; a dirty slice's change appears in BOTH
// (incl. the cleared-scalar no-op annotation and the deep-merged build result).
describe('review diff ⇔ combined payload equivalence (#6)', () => {
  it('the same dirty slices feed both: clean contributes to neither, dirty to both', () => {
    const slices: SectionSlice[] = [
      // Build: a cleared scalar (no-op annotation) — must show in the diff AND
      // land in the payload as build.javaVersion: null.
      {
        isDirty: true,
        request: { baseConfiguration: { build: { javaVersion: null, buildSystem: 'GRADLE' } } },
        diff: [
          { label: 'Build · Java Version', oldValue: '17', newValue: '—', clearedScalarNoop: true },
        ],
      },
      // Escrow: deep-merges into the same build object.
      {
        isDirty: true,
        request: { baseConfiguration: { build: { buildTasks: 'assemble' } } },
        diff: [{ label: 'Escrow · Build Tasks', oldValue: '—', newValue: 'assemble' }],
      },
      // Clean slice: must appear in NEITHER the diff NOR the payload.
      {
        isDirty: false,
        request: { displayName: 'should-not-appear' },
        diff: [{ label: 'Display Name', oldValue: 'a', newValue: 'b' }],
      },
    ]

    const diff = collectDiff(slices)
    const body = combineRequest(5, slices)

    // Clean slice contributes to neither.
    expect(diff.find((d) => d.label === 'Display Name')).toBeUndefined()
    expect('displayName' in body).toBe(false)

    // Both dirty slices' changes are in the diff...
    expect(diff.map((d) => d.label)).toEqual(['Build · Java Version', 'Escrow · Build Tasks'])
    // ...and the SAME changes are in the single payload's deep-merged build.
    expect(body.baseConfiguration?.build).toEqual({
      javaVersion: null, // the cleared scalar the diff flagged as a no-op
      buildSystem: 'GRADLE',
      buildTasks: 'assemble', // the Escrow edit, deep-merged into the same object
    })
    // The no-op annotation rides the same slice whose field is in the payload.
    expect(diff.find((d) => d.label === 'Build · Java Version')?.clearedScalarNoop).toBe(true)
  })
})
