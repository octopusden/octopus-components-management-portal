import { describe, it, expect } from 'vitest'
import { completenessPercent } from './completeness'
import type { ComponentDetail, ComponentConfiguration } from '../types'

function baseRow(over: Partial<ComponentConfiguration> = {}): ComponentConfiguration {
  return {
    id: 'cfg-1', versionRange: '(,0),[0,)', rowType: 'BASE', overriddenAttribute: null,
    isSyntheticBase: false, build: null, escrow: null, jira: null, vcsEntries: [],
    mavenArtifacts: [], fileUrlArtifacts: [], dockerImages: [], packages: [], requiredTools: [],
    ...over,
  }
}

function makeComponent(over: Partial<ComponentDetail> = {}, row?: Partial<ComponentConfiguration>): ComponentDetail {
  return {
    id: 'c1', name: '', displayName: null, componentOwner: null, productType: null,
    systems: [], clientCode: null, archived: false, solution: false, parentComponentName: null,
    version: 1, createdAt: null, updatedAt: null, labels: [], docs: [], artifactIds: [],
    securityGroups: [], teamcityProjects: [], configurations: row ? [baseRow(row)] : [],
    ...over,
  }
}

describe('completenessPercent', () => {
  it('is 0 when no required field is filled', () => {
    expect(completenessPercent(makeComponent())).toBe(0)
  })

  it('is 100 when all six required fields are present', () => {
    const c = makeComponent(
      { name: 'k', displayName: 'D', componentOwner: 'alice', clientCode: 'CC' },
      { jira: { projectKey: 'PROJ' }, build: { buildSystem: 'GRADLE' } },
    )
    expect(completenessPercent(c)).toBe(100)
  })

  it('counts present fields proportionally and rounds', () => {
    // 3 of 6 filled → 50
    const c = makeComponent({ name: 'k', displayName: 'D', componentOwner: 'alice' })
    expect(completenessPercent(c)).toBe(50)
  })

  it('treats blank/whitespace as unfilled', () => {
    const c = makeComponent({ name: '   ', displayName: '', componentOwner: 'alice' })
    expect(completenessPercent(c)).toBe(Math.round((1 / 6) * 100))
  })
})
