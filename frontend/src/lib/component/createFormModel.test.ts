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

describe('initialValues — Full Version Format (config-first with a universal fallback)', () => {
  const FALLBACK = '$versionPrefix-$baseVersionFormat'
  it('scratch: uses the component-defaults value, else the universal fallback (never blank)', () => {
    expect(initialValues(null, {}).versionFormat).toBe(FALLBACK)
    const defaults: ComponentDefaults = {
      jira: { componentVersionFormat: { versionFormat: '$prefix-$custom' } },
    }
    expect(initialValues(null, defaults).versionFormat).toBe('$prefix-$custom')
  })

  it('clone: uses the source versionFormat, else the universal fallback', () => {
    const withFmt = makeSource({
      configurations: [makeBaseRow({ jira: { projectKey: 'A', versionFormat: 'SRC-FMT' } })],
    })
    expect(initialValues(withFmt, {}).versionFormat).toBe('SRC-FMT')
    const noFmt = makeSource({ configurations: [makeBaseRow({ jira: { projectKey: 'A' } })] })
    expect(initialValues(noFmt, {}).versionFormat).toBe(FALLBACK)
  })
})

describe('initialValues — scratch distribution flags follow the pre-selected profile', () => {
  it('derives External/Explicit from the default profile, NOT from defaults.distribution', () => {
    // Even if component-defaults say internal/explicit, a scratch component starts
    // as the pre-selected Regular external profile → external=true, explicit=false.
    const defaults: ComponentDefaults = { distribution: { external: false, explicit: true } }
    const v = initialValues(null, defaults)
    expect(v.distributionExternal).toBe(true)
    expect(v.distributionExplicit).toBe(false)
  })
})
