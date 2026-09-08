import { describe, it, expect } from 'vitest'
import { componentKeyCharsetError, initialValues, type ComponentDefaults } from './createFormModel'
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

// SYS-095 / CRS ADR-020: a Component Key may carry '_' only inside its
// client-code prefix — the lowercased Client Code of the same component.
describe('componentKeyCharsetError — client-code prefix', () => {
  it('accepts an underscore inside the client-code prefix', () => {
    expect(componentKeyCharsetError('ab_cd-payments', 'AB_CD')).toBeNull()
  })

  it('accepts the bare client-code prefix as the whole key', () => {
    expect(componentKeyCharsetError('ab_cd', 'AB_CD')).toBeNull()
  })

  it('accepts a plain kebab key with no client code', () => {
    expect(componentKeyCharsetError('plain-component')).toBeNull()
  })

  it('rejects an underscore when there is no client code', () => {
    expect(componentKeyCharsetError('ab_cd-payments')).toBe(
      'Component Key must be lowercase letters, digits and "-", starting with a letter',
    )
  })

  it('rejects an underscore when the client code has none', () => {
    expect(componentKeyCharsetError('ab_cd-payments', 'ABCD')).toContain('abcd')
  })

  it('rejects a client-code match that does not lead the key', () => {
    expect(componentKeyCharsetError('payments-ab_cd', 'AB_CD')).not.toBeNull()
  })

  it('rejects an uppercase key even when it matches the client code', () => {
    expect(componentKeyCharsetError('AB_CD-payments', 'AB_CD')).not.toBeNull()
  })

  it('rejects a digit-leading key even when the client code leads with that digit', () => {
    expect(componentKeyCharsetError('123abc-payments', '123ABC')).not.toBeNull()
  })

  it('rejects a bare all-digit client code as the whole key', () => {
    expect(componentKeyCharsetError('123', '123')).not.toBeNull()
  })

  it('rejects a key that is nothing but an underscore client code', () => {
    expect(componentKeyCharsetError('_', '_')).not.toBeNull()
  })

  it('names the prefix that would legalise the underscore', () => {
    expect(componentKeyCharsetError('payments_1', 'AB_CD')).toBe(
      'Component Key must be lowercase letters, digits and "-", starting with a letter; "_" is allowed only inside the Client Code prefix "ab_cd" (e.g. ab_cd-payments)',
    )
  })
})
