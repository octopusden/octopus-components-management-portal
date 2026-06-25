import { describe, it, expect } from 'vitest'
import { generalSlice, generalDiff } from './generalSlice'
import type { ComponentDetail, ComponentUpdateRequest } from '../../lib/types'

function makeComponent(over: Partial<ComponentDetail> = {}): ComponentDetail {
  return {
    id: 'c1', name: 'comp', displayName: 'Old Name', componentOwner: 'alice', productType: null,
    system: 'SYS1', clientCode: null, archived: false, solution: false, parentComponentName: null,
    version: 3, createdAt: null, updatedAt: null, labels: ['x'], docs: [], artifactIds: [],
    securityGroups: [], teamcityProjects: [], configurations: [],
    ...over,
  }
}

const patch = (over: Partial<ComponentUpdateRequest>): ComponentUpdateRequest => ({
  version: 3, clearGroup: false, ...over,
})

describe('generalSlice', () => {
  it('is clean when the patch carries only version/clearGroup', () => {
    const slice = generalSlice(makeComponent(), patch({}), false)
    expect(slice.isDirty).toBe(false)
    expect(slice.diff).toEqual([])
  })

  it('is dirty when the patch carries a real field; request strips version/clearGroup', () => {
    const slice = generalSlice(makeComponent(), patch({ displayName: 'New Name' }), false)
    expect(slice.isDirty).toBe(true)
    expect('version' in slice.request).toBe(false)
    expect('clearGroup' in slice.request).toBe(false)
    expect(slice.request.displayName).toBe('New Name')
  })

  it('forces dirty when system clear needs attention even though the patch omits system', () => {
    const slice = generalSlice(makeComponent(), patch({}), true)
    expect(slice.isDirty).toBe(true)
  })

  it('preserves clearParent (a real General control) in the slice request', () => {
    const slice = generalSlice(makeComponent({ parentComponentName: 'p' }), patch({ parentComponentName: null, clearParent: true }), false)
    expect(slice.request.clearParent).toBe(true)
  })
})

describe('generalDiff', () => {
  it('lists changed scalar with old → new', () => {
    const diff = generalDiff(makeComponent(), patch({ displayName: 'New Name' }))
    expect(diff).toContainEqual({ label: 'Display Name', oldValue: 'Old Name', newValue: 'New Name', clearedScalarNoop: false })
  })

  it('never flags a General field clear as a no-op (they are top-level columns, clears persist)', () => {
    const diff = generalDiff(makeComponent(), patch({ displayName: '' }))
    const row = diff.find((d) => d.label === 'Display Name')
    expect(row?.clearedScalarNoop).toBe(false)
    expect(row?.newValue).toBe('—')
  })

  it('renders list fields (labels clear → []) readably', () => {
    const diff = generalDiff(makeComponent({ labels: ['a', 'b'] }), patch({ labels: [] }))
    expect(diff).toContainEqual({ label: 'Labels', oldValue: 'a, b', newValue: '—', clearedScalarNoop: false })
  })

  it('maps docs/artifactIds to readable summaries', () => {
    const diff = generalDiff(
      makeComponent(),
      patch({ docs: [{ docComponentKey: 'doc-1', majorVersion: null }] }),
    )
    expect(diff.find((d) => d.label === 'Doc Links')?.newValue).toBe('doc-1')
  })

  it('ignores control flags (clearParent / clearGroup / version)', () => {
    const diff = generalDiff(makeComponent(), patch({ clearParent: true }))
    expect(diff).toEqual([])
  })
})
