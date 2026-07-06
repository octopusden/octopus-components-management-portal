import { describe, it, expect } from 'vitest'
import { initialValues, type ComponentDefaults } from './createFormModel'
import type { ComponentConfiguration, ComponentDetail } from '../types'

function makeBaseRow(overrides: Partial<ComponentConfiguration> = {}): ComponentConfiguration {
  return {
    id: 'cfg-base',
    versionRange: '(,0),[0,)',
    rowType: 'BASE',
    overriddenAttribute: null,
    isSyntheticBase: false,
    build: { buildSystem: 'GRADLE' },
    escrow: null,
    jira: null,
    vcsEntries: [],
    mavenArtifacts: [],
    fileUrlArtifacts: [],
    dockerImages: [],
    packages: [],
    requiredTools: [],
    ...overrides,
  }
}

function makeSource(overrides: Partial<ComponentDetail> = {}): ComponentDetail {
  return {
    id: 'c-1',
    name: 'svc-alpha',
    displayName: 'Service Alpha',
    componentOwner: 'alice',
    productType: null,
    systems: [],
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
    releaseManager: [],
    securityChampion: [],
    distributionExplicit: false,
    distributionExternal: true,
    configurations: [makeBaseRow()],
    ...overrides,
  }
}

describe('initialValues — escrow generation', () => {
  it('scratch: seeds escrowGeneration from the component-defaults escrow.generation', () => {
    const defaults: ComponentDefaults = { escrow: { generation: 'AUTO' } }
    expect(initialValues(null, defaults).escrowGeneration).toBe('AUTO')
  })

  it('scratch: escrowGeneration is empty when no default is configured', () => {
    expect(initialValues(null, {}).escrowGeneration).toBe('')
  })

  it('scratch: a blank default escrow.generation becomes empty', () => {
    const defaults: ComponentDefaults = { escrow: { generation: '   ' } }
    expect(initialValues(null, defaults).escrowGeneration).toBe('')
  })

  it('clone: seeds escrowGeneration from the source base-row escrow.generation', () => {
    const source = makeSource({
      configurations: [makeBaseRow({ escrow: { generation: 'MANUAL', reusable: true } })],
    })
    expect(initialValues(source, {}).escrowGeneration).toBe('MANUAL')
  })

  it('clone: escrowGeneration is empty when the source base row has no escrow generation', () => {
    const source = makeSource({ configurations: [makeBaseRow({ escrow: null })] })
    expect(initialValues(source, {}).escrowGeneration).toBe('')
  })
})
