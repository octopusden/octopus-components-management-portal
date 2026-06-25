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
    system: null, clientCode: null, archived: false, solution: false, parentComponentName: null,
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

  it('flags a build scalar clear as a CRS no-op in the diff', () => {
    const { result } = renderHook(() => useBuildSection(makeComponent()))
    act(() => result.current.set('javaVersion', ''))
    const row = result.current.slice.diff.find((d) => d.label.includes('Java Version'))
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
})
