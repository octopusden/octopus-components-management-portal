import { describe, it, expect } from 'vitest'
import { generalSlice, generalDiff } from './generalSlice'
import type { ComponentDetail, ComponentUpdateRequest } from '../../lib/types'

function makeComponent(over: Partial<ComponentDetail> = {}): ComponentDetail {
  return {
    id: 'c1', name: 'comp', displayName: 'Old Name', componentOwner: 'alice', productType: null,
    systems: ['SYS1'], clientCode: null, archived: false, solution: false, parentComponentName: null,
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
    const slice = generalSlice(makeComponent(), patch({}))
    expect(slice.isDirty).toBe(false)
    expect(slice.diff).toEqual([])
  })

  it('is dirty when the patch carries a real field; request strips version/clearGroup', () => {
    const slice = generalSlice(makeComponent(), patch({ displayName: 'New Name' }))
    expect(slice.isDirty).toBe(true)
    expect('version' in slice.request).toBe(false)
    expect('clearGroup' in slice.request).toBe(false)
    expect(slice.request.displayName).toBe('New Name')
  })

  it('is dirty (and carries the clear) when systems is cleared to empty', () => {
    const slice = generalSlice(makeComponent({ systems: ['SYS1'] }), patch({ systems: [] }))
    expect(slice.isDirty).toBe(true)
    expect(slice.request.systems).toEqual([])
  })

  it('is dirty when systems changes', () => {
    const slice = generalSlice(makeComponent({ systems: ['SYS1'] }), patch({ systems: ['SYS1', 'SYS2'] }))
    expect(slice.isDirty).toBe(true)
  })

  it('preserves clearParent (a real General control) in the slice request', () => {
    const slice = generalSlice(makeComponent({ parentComponentName: 'p' }), patch({ parentComponentName: null, clearParent: true }))
    expect(slice.request.clearParent).toBe(true)
  })

  // Clearing componentOwner / clientCode / copyright must make the slice dirty (so the SaveBar
  // arms and the Review dialog shows the clear) — buildUpdateRequest now emits '' for the clear
  // instead of dropping it to undefined, so the diff/dirty path sees it. Regression for the
  // silent clear-with-success-toast bug.
  it('is dirty (and carries the clear) when componentOwner is cleared', () => {
    const slice = generalSlice(makeComponent({ componentOwner: 'alice' }), patch({ componentOwner: '' }))
    expect(slice.isDirty).toBe(true)
    expect(slice.request.componentOwner).toBe('')
  })

  it('is dirty when clientCode is cleared', () => {
    const slice = generalSlice(makeComponent({ clientCode: 'CC1' }), patch({ clientCode: '' }))
    expect(slice.isDirty).toBe(true)
  })

  it('is dirty when copyright is cleared', () => {
    const slice = generalSlice(makeComponent({ copyright: 'ACME' }), patch({ copyright: '' }))
    expect(slice.isDirty).toBe(true)
  })
})

describe('generalSlice — artifactIds ownership (request shape)', () => {
  // buildUpdateRequest emits the REQUEST shape (groupPattern + artifactTokens) and includes
  // artifactIds whenever the component owns any — even on a clean load. The diff must read the
  // request shape (not the form's OwnershipMappingValue) or it crashes with "n is not iterable".
  const owned = makeComponent({
    artifactIds: [
      { id: 'm1', versionRange: '(,0),[0,)', groupPattern: 'com.example.foo', mode: 'ALL', artifactTokens: [] },
      { id: 'm2', versionRange: '[1,2)', groupPattern: 'com.example.bar', mode: 'EXPLICIT', artifactTokens: ['svc-a'] },
    ],
  })
  const sameRequest = [
    { versionRange: null, groupPattern: 'com.example.foo', mode: 'ALL' as const, artifactTokens: [] },
    { versionRange: '[1,2)', groupPattern: 'com.example.bar', mode: 'EXPLICIT' as const, artifactTokens: ['svc-a'] },
  ]

  it('does not crash and reads clean when a request-shaped artifactIds patch matches the component (load scenario)', () => {
    const slice = generalSlice(owned, patch({ artifactIds: sameRequest }))
    expect(slice.isDirty).toBe(false)
    expect(slice.diff).toEqual([])
  })

  it('flags dirty when an ownership token actually changes', () => {
    const changed = sameRequest.map((m, i) => (i === 1 ? { ...m, artifactTokens: ['svc-b'] } : m))
    const slice = generalSlice(owned, patch({ artifactIds: changed }))
    expect(slice.isDirty).toBe(true)
  })

  it('produces a readable itemized diff (removed/added lines, no ::-keys)', () => {
    const changed = sameRequest.map((m, i) => (i === 1 ? { ...m, artifactTokens: ['svc-b'] } : m))
    const diff = generalDiff(owned, patch({ artifactIds: changed }))
    const row = diff.find((d) => d.label === 'Artifact IDs')
    expect(row).toBeDefined()
    // Only the changed mapping appears; the unchanged base mapping is omitted.
    expect(row!.oldItems).toEqual(['[1,2) · Specific · com.example.bar · svc-a'])
    expect(row!.newItems).toEqual(['[1,2) · Specific · com.example.bar · svc-b'])
    expect(row!.oldValue).toBe('2 mappings')
    expect(row!.newValue).toBe('2 mappings')
    // No cryptic canonical keys or [object Object] leak into the diff.
    expect(JSON.stringify(row)).not.toContain('::')
    expect(JSON.stringify(row)).not.toContain('[object Object]')
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

  it('renders a componentOwner clear as "alice → —"', () => {
    const diff = generalDiff(makeComponent({ componentOwner: 'alice' }), patch({ componentOwner: '' }))
    expect(diff).toContainEqual({ label: 'Component Owner', oldValue: 'alice', newValue: '—', clearedScalarNoop: false })
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
