import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useVcsSection } from './useVcsSection'
import { useDistributionSection } from './useDistributionSection'
import { useJiraSection } from './useJiraSection'
import { useEscrowSection } from './useEscrowSection'
import type { ComponentDetail, ComponentConfiguration } from '../../lib/types'

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

function makeComponent(over: Partial<ComponentDetail> = {}, row: Partial<ComponentConfiguration> = {}): ComponentDetail {
  return {
    id: 'c1', name: 'comp', displayName: null, componentOwner: null, productType: null,
    system: null, clientCode: null, archived: false, solution: false, parentComponentName: null,
    version: 1, createdAt: null, updatedAt: null, labels: [], docs: [], artifactIds: [],
    securityGroups: [], teamcityProjects: [], configurations: [baseRow(row)],
    ...over,
  }
}

beforeEach(() => vi.clearAllMocks())

describe('useVcsSection', () => {
  it('clean initially; dirty after editing external registry; slice carries it', () => {
    const { result } = renderHook(() => useVcsSection(makeComponent({ vcsExternalRegistry: 'reg' })))
    expect(result.current.slice.isDirty).toBe(false)
    act(() => result.current.setExternalRegistry('reg2'))
    expect(result.current.slice.isDirty).toBe(true)
    expect(result.current.slice.request.vcsExternalRegistry).toBe('reg2')
  })

  it('drops blank-vcsPath entries from the slice payload', () => {
    const { result } = renderHook(() => useVcsSection(makeComponent()))
    act(() => result.current.addEntry())
    act(() => result.current.updateEntry(0, 'name', 'has-no-path'))
    expect(result.current.slice.request.baseConfiguration?.vcsEntries).toEqual([])
  })

  it('does not clobber a dirty section on component re-seed', () => {
    const c1 = makeComponent({ vcsExternalRegistry: 'a' })
    const { result, rerender } = renderHook(({ c }) => useVcsSection(c), { initialProps: { c: c1 } })
    act(() => result.current.setExternalRegistry('edited'))
    rerender({ c: makeComponent({ vcsExternalRegistry: 'b' }) })
    expect(result.current.externalRegistry).toBe('edited')
  })
})

describe('useDistributionSection', () => {
  it('dirty on toggling explicit; slice carries both flags', () => {
    const { result } = renderHook(() => useDistributionSection(makeComponent({ distributionExplicit: false, distributionExternal: false })))
    act(() => result.current.setExplicit(true))
    expect(result.current.slice.isDirty).toBe(true)
    expect(result.current.slice.request.distributionExplicit).toBe(true)
    expect(result.current.slice.request.distributionExternal).toBe(false)
  })

  it('securityGroups go top-level, not inside baseConfiguration', () => {
    const { result } = renderHook(() => useDistributionSection(makeComponent()))
    act(() => result.current.addSecurityGroup())
    act(() => result.current.updateSecurityGroup(0, 'groupName', 'grp'))
    expect(result.current.slice.request.securityGroups).toEqual([{ groupType: 'read', groupName: 'grp' }])
    expect('securityGroups' in (result.current.slice.request.baseConfiguration ?? {})).toBe(false)
  })
})

describe('useJiraSection', () => {
  const vis = { releasesInDefaultBranch: 'editable' as const }

  it('dirty on project key edit; jira nested in baseConfiguration', () => {
    const { result } = renderHook(() => useJiraSection(makeComponent({}, { jira: { projectKey: 'OLD' } }), vis))
    act(() => result.current.set('projectKey', 'NEW'))
    expect(result.current.slice.request.baseConfiguration?.jira?.projectKey).toBe('NEW')
  })

  it('does NOT send releasesInDefaultBranch when field is hidden', () => {
    const { result } = renderHook(() =>
      useJiraSection(makeComponent({ releasesInDefaultBranch: false }), { releasesInDefaultBranch: 'hidden' }),
    )
    act(() => result.current.set('releasesInDefaultBranch', true))
    expect('releasesInDefaultBranch' in result.current.slice.request).toBe(false)
  })

  it('sends releasesInDefaultBranch only when changed from server value', () => {
    const { result } = renderHook(() => useJiraSection(makeComponent({ releasesInDefaultBranch: false }), vis))
    expect('releasesInDefaultBranch' in result.current.slice.request).toBe(false)
    act(() => result.current.set('releasesInDefaultBranch', true))
    expect(result.current.slice.request.releasesInDefaultBranch).toBe(true)
  })
})

describe('useEscrowSection', () => {
  const vis = { productType: 'editable' as const }

  it('dirty on generation edit; escrow nested in baseConfiguration', () => {
    const { result } = renderHook(() => useEscrowSection(makeComponent({}, { escrow: { generation: 'G1' } }), vis))
    act(() => result.current.set('generation', 'G2'))
    expect(result.current.slice.request.baseConfiguration?.escrow?.generation).toBe('G2')
  })

  it('emits build knobs in baseConfiguration.build (disjoint from Build section keys)', () => {
    const { result } = renderHook(() => useEscrowSection(makeComponent({}, { build: { buildSystem: 'GRADLE' } }), vis))
    act(() => result.current.set('buildTasks', 'assemble'))
    const build = result.current.slice.request.baseConfiguration?.build
    expect(build?.buildTasks).toBe('assemble')
    // Escrow must NOT write buildSystem — that's the Build section's key.
    expect('buildSystem' in (build ?? {})).toBe(false)
  })

  it('does NOT send productType when hidden', () => {
    const { result } = renderHook(() =>
      useEscrowSection(makeComponent({ productType: 'TYPE_A' }), { productType: 'hidden' }),
    )
    act(() => result.current.set('generation', 'G2'))
    expect('productType' in result.current.slice.request).toBe(false)
  })

  it('parses requiredTools into a deduped, trimmed array', () => {
    const { result } = renderHook(() => useEscrowSection(makeComponent(), vis))
    act(() => result.current.set('requiredToolsInput', 'a, b , a'))
    expect(result.current.slice.request.baseConfiguration?.requiredTools).toEqual(['a', 'b'])
  })
})
