import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useBuildSection } from './useBuildSection'
import type { ComponentDetail, ComponentConfiguration } from '../../lib/types'

// Field-config data source (used for diff labels) — no network.
vi.mock('../../hooks/useAdminConfig', () => ({
  useFieldConfig: () => ({ data: undefined, isLoading: false, isError: false }),
}))

function baseRow(over: Partial<ComponentConfiguration> = {}): ComponentConfiguration {
  return {
    id: 'cfg-1', versionRange: '(,0),[0,)', rowType: 'BASE', overriddenAttribute: null,
    isSyntheticBase: false, build: null, escrow: null, jira: null, vcsEntries: [],
    mavenArtifacts: [], fileUrlArtifacts: [], dockerImages: [], packages: [], requiredTools: [],
    ...over,
  }
}

function makeComponent(over: Partial<ComponentDetail> = {}): ComponentDetail {
  return {
    id: 'c1', name: 'comp', displayName: null, componentOwner: null, productType: null,
    systems: [], clientCode: null, archived: false, solution: false, parentComponentName: null,
    version: 1, createdAt: null, updatedAt: null, labels: [], docs: [], artifactIds: [],
    securityGroups: [], teamcityProjects: [],
    configurations: [baseRow({ build: { buildSystem: 'GRADLE', javaVersion: '17' } })],
    ...over,
  }
}

describe('useBuildSection', () => {
  beforeEach(() => vi.clearAllMocks())

  it('starts clean (snapshot == server) and slice carries the BASE build scalars', () => {
    const { result } = renderHook(() => useBuildSection(makeComponent()))
    expect(result.current.slice.isDirty).toBe(false)
    expect(result.current.slice.request.baseConfiguration?.build).toMatchObject({
      buildSystem: 'GRADLE',
      javaVersion: '17',
    })
  })

  it('goes dirty on a real change and the slice/diff reflects it', () => {
    const { result } = renderHook(() => useBuildSection(makeComponent()))
    act(() => result.current.set('javaVersion', '21'))
    expect(result.current.slice.isDirty).toBe(true)
    expect(result.current.slice.request.baseConfiguration?.build?.javaVersion).toBe('21')
    const row = result.current.slice.diff.find((d) => d.label.includes('Java Version'))
    expect(row).toMatchObject({ oldValue: '17', newValue: '21' })
  })

  // P-1 ""-clear migration: aspect string scalars now clear via '' (CRS-A) and
  // are no longer flagged as a no-op.
  it("clears a build scalar via '' and does NOT flag it as a no-op", () => {
    const { result } = renderHook(() => useBuildSection(makeComponent()))
    act(() => result.current.set('javaVersion', ''))
    expect(result.current.slice.request.baseConfiguration?.build?.javaVersion).toBe('')
    const row = result.current.slice.diff.find((d) => d.label.includes('Java Version'))
    expect(row?.clearedScalarNoop).toBeFalsy()
  })

  // buildSystem is a validated enum — blank 400s server-side, so it stays on the
  // null-clear (no-op) contract and keeps the "clearing not supported" flag.
  it('keeps buildSystem clear as a null no-op (enum exception)', () => {
    const { result } = renderHook(() => useBuildSection(makeComponent()))
    act(() => result.current.set('buildSystem', ''))
    expect(result.current.slice.request.baseConfiguration?.build?.buildSystem).toBeNull()
    const row = result.current.slice.diff.find((d) => d.label.includes('Build System'))
    expect(row?.clearedScalarNoop).toBe(true)
  })

  it('reports buildSystemMissing when buildSystem is empty (page Save guard)', () => {
    const { result } = renderHook(() =>
      useBuildSection(makeComponent({ configurations: [baseRow({ build: null })] })),
    )
    expect(result.current.buildSystemMissing).toBe(true)
  })

  it('does NOT re-seed (clobber) a dirty section when component reference changes', () => {
    const c1 = makeComponent()
    const { result, rerender } = renderHook(({ c }) => useBuildSection(c), {
      initialProps: { c: c1 },
    })
    act(() => result.current.set('javaVersion', '21'))
    // A sibling save re-seeds component (same key, new build value). Dirty section keeps its edit.
    const c2 = makeComponent({ configurations: [baseRow({ build: { buildSystem: 'GRADLE', javaVersion: '8' } })] })
    rerender({ c: c2 })
    expect(result.current.state.javaVersion).toBe('21')
    expect(result.current.slice.isDirty).toBe(true)
  })

  it('re-seeds from the new component when the section is clean', () => {
    const c1 = makeComponent()
    const { result, rerender } = renderHook(({ c }) => useBuildSection(c), {
      initialProps: { c: c1 },
    })
    const c2 = makeComponent({ configurations: [baseRow({ build: { buildSystem: 'MAVEN', javaVersion: '11' } })] })
    rerender({ c: c2 })
    expect(result.current.state.buildSystem).toBe('MAVEN')
    expect(result.current.state.javaVersion).toBe('11')
    expect(result.current.slice.isDirty).toBe(false)
  })

  it('reset() reverts local edits back to the snapshot', () => {
    const { result } = renderHook(() => useBuildSection(makeComponent()))
    act(() => result.current.set('javaVersion', '21'))
    act(() => result.current.reset())
    expect(result.current.state.javaVersion).toBe('17')
    expect(result.current.slice.isDirty).toBe(false)
  })

  // Acceptance #3: after a successful save the server value now EQUALS the draft;
  // the snapshot must catch up so the section reads clean — no phantom dirty —
  // even though it was dirty against the stale snapshot.
  it('clears dirty when the saved component arrives matching the draft (own save, no phantom dirty)', () => {
    const c1 = makeComponent()
    const { result, rerender } = renderHook(({ c }) => useBuildSection(c), { initialProps: { c: c1 } })
    act(() => result.current.set('javaVersion', '21'))
    expect(result.current.slice.isDirty).toBe(true)
    // The save lands: server now reports java 21 (same id, bumped version).
    const saved = makeComponent({ version: 2, configurations: [baseRow({ build: { buildSystem: 'GRADLE', javaVersion: '21' } })] })
    rerender({ c: saved })
    expect(result.current.slice.isDirty).toBe(false)
    expect(result.current.state.javaVersion).toBe('21')
  })

  // Acceptance #4: switching to a DIFFERENT component id starts a FRESH draft,
  // even if the section was dirty — no leak of the previous component's edits.
  it('starts a fresh, clean draft when the component id changes, even while dirty (no leak)', () => {
    const c1 = makeComponent({ id: 'comp-1' })
    const { result, rerender } = renderHook(({ c }) => useBuildSection(c), { initialProps: { c: c1 } })
    act(() => result.current.set('javaVersion', '99'))
    expect(result.current.slice.isDirty).toBe(true)
    // Navigate to a different component (different id + different build values).
    const other = makeComponent({ id: 'comp-2', configurations: [baseRow({ build: { buildSystem: 'MAVEN', javaVersion: '11' } })] })
    rerender({ c: other })
    expect(result.current.state.javaVersion).toBe('11') // comp-2's value, not the leaked '99'
    expect(result.current.state.buildSystem).toBe('MAVEN')
    expect(result.current.slice.isDirty).toBe(false)
  })
})
