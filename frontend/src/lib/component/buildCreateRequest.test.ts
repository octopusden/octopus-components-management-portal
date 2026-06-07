import { describe, it, expect } from 'vitest'
import { buildCreateRequest, type CreateFormValues } from './buildCreateRequest'
import type { ComponentConfiguration, ComponentDetail } from '../types'

function makeForm(overrides: Partial<CreateFormValues> = {}): CreateFormValues {
  return {
    name: 'svc-new',
    displayName: 'Service New',
    buildSystem: 'MAVEN',
    componentOwner: 'owner@example.com',
    distributionExplicit: false,
    distributionExternal: true,
    releaseManager: [],
    securityChampion: [],
    copyright: '',
    coordinate: {
      type: 'maven',
      groupPattern: '',
      artifactPattern: '',
      imageName: '',
      packageType: 'DEB',
      packageName: '',
    },
    ...overrides,
  }
}

function makeBaseRow(overrides: Partial<ComponentConfiguration> = {}): ComponentConfiguration {
  return {
    id: 'cfg-base',
    versionRange: '(,0),[0,)',
    rowType: 'BASE',
    overriddenAttribute: null,
    isSyntheticBase: false,
    build: null,
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
    componentOwner: 'alice@example.com',
    productType: 'TYPE_A',
    system: 'SYS1',
    clientCode: 'CL1',
    archived: false,
    solution: true,
    parentComponentName: 'parent-svc',
    version: 7,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-02T00:00:00Z',
    releaseManager: ['rm-src'],
    securityChampion: ['sc-src'],
    copyright: 'ACME',
    releasesInDefaultBranch: true,
    labels: ['backend', 'internal'],
    jiraDisplayName: 'Alpha Service',
    jiraHotfixVersionFormat: '%d.%d.%d.%d',
    vcsExternalRegistry: 'registry-x',
    distributionExplicit: true,
    distributionExternal: false,
    group: { groupKey: 'org.example.legacy', isFake: false, role: 'MEMBER' },
    docs: [{ id: 'd-1', docComponentKey: 'docs-a', majorVersion: '1.x', sortOrder: 0 }],
    artifactIds: [{ id: 'a-1', groupPattern: 'org.x', artifactPattern: 'alpha-*' }],
    securityGroups: [{ id: 'sg-1', groupType: 'LAS', groupName: 'las-alpha' }],
    teamcityProjects: [{ id: 'tc-1', projectId: 'AlphaProject', projectUrl: 'https://tc/x', sortOrder: 0 }],
    configurations: [makeBaseRow({ build: { buildSystem: 'GRADLE', gradleVersion: '8.5' } })],
    canEdit: true,
    ...overrides,
  }
}

describe('buildCreateRequest — scratch mode (no source)', () => {
  it('builds the from-scratch payload mirroring the legacy CreateComponentDialog shape', () => {
    const req = buildCreateRequest(makeForm({ name: 'widget', displayName: 'Widget' }))
    expect(req).toMatchObject({
      name: 'widget',
      displayName: 'Widget',
      componentOwner: 'owner@example.com',
      system: null,
      labels: [],
      docs: [],
      artifactIds: [],
      securityGroups: [],
      teamcityProjects: [],
      archived: false,
      distributionExplicit: false,
      distributionExternal: true,
      baseConfiguration: { build: { buildSystem: 'MAVEN' } },
    })
    expect('group' in req).toBe(false)
    expect('productType' in req).toBe(false)
  })

  it('omits empty displayName (undefined, not empty string)', () => {
    const req = buildCreateRequest(makeForm({ displayName: '' }))
    expect(req.displayName).toBeUndefined()
  })

  it('baseConfiguration is always present (form always supplies buildSystem)', () => {
    const req = buildCreateRequest(makeForm({ buildSystem: 'GRADLE' }))
    expect(req.baseConfiguration?.build?.buildSystem).toBe('GRADLE')
  })

  it('non-gated form sends no RM/SC values and no distribution coordinate lists', () => {
    const req = buildCreateRequest(
      makeForm({ distributionExplicit: false, distributionExternal: true }),
    )
    expect(req.releaseManager).toEqual([])
    expect(req.securityChampion).toEqual([])
    const base = req.baseConfiguration!
    expect('mavenArtifacts' in base).toBe(false)
    expect('dockerImages' in base).toBe(false)
    expect('packages' in base).toBe(false)
  })
})

describe('buildCreateRequest — gated (explicit+external) coordinate', () => {
  const gated = (coordinate: Partial<CreateFormValues['coordinate']>) =>
    makeForm({
      distributionExplicit: true,
      distributionExternal: true,
      releaseManager: ['rm-a'],
      securityChampion: ['sc-a'],
      copyright: 'ACME',
      coordinate: { ...makeForm().coordinate, ...coordinate },
    })

  it('maven coordinate → one mavenArtifacts entry', () => {
    const req = buildCreateRequest(
      gated({ type: 'maven', groupPattern: 'org.acme', artifactPattern: 'svc' }),
    )
    expect(req.baseConfiguration?.mavenArtifacts).toEqual([
      { groupPattern: 'org.acme', artifactPattern: 'svc', extension: null, classifier: null },
    ])
    expect('dockerImages' in req.baseConfiguration!).toBe(false)
    expect('packages' in req.baseConfiguration!).toBe(false)
  })

  it('docker coordinate → one dockerImages entry', () => {
    const req = buildCreateRequest(gated({ type: 'docker', imageName: 'acme/svc' }))
    expect(req.baseConfiguration?.dockerImages).toEqual([{ imageName: 'acme/svc', flavor: null }])
    expect('mavenArtifacts' in req.baseConfiguration!).toBe(false)
  })

  it('package coordinate → one packages entry with DEB/RPM type', () => {
    const req = buildCreateRequest(
      gated({ type: 'package', packageType: 'RPM', packageName: 'svc-pkg' }),
    )
    expect(req.baseConfiguration?.packages).toEqual([
      { packageType: 'RPM', packageName: 'svc-pkg' },
    ])
  })

  it('forwards RM/SC and copyright from the form when gated', () => {
    const req = buildCreateRequest(
      gated({ type: 'maven', groupPattern: 'org.acme', artifactPattern: 'svc' }),
    )
    expect(req.releaseManager).toEqual(['rm-a'])
    expect(req.securityChampion).toEqual(['sc-a'])
    expect(req.copyright).toBe('ACME')
  })
})

describe('buildCreateRequest — copy mode (with source)', () => {
  const source = makeSource()

  it('copies source general fields and lists', () => {
    const req = buildCreateRequest(makeForm({ name: 'svc-clone' }), source)
    expect(req).toMatchObject({
      name: 'svc-clone',
      productType: 'TYPE_A',
      system: 'SYS1',
      clientCode: 'CL1',
      solution: true,
      parentComponentName: 'parent-svc',
      releasesInDefaultBranch: true,
      vcsExternalRegistry: 'registry-x',
      jiraHotfixVersionFormat: '%d.%d.%d.%d',
      labels: ['backend', 'internal'],
      docs: [{ docComponentKey: 'docs-a', majorVersion: '1.x' }],
      securityGroups: [{ groupType: 'LAS', groupName: 'las-alpha' }],
      artifactIds: [],
      teamcityProjects: [],
    })
    expect('group' in req).toBe(false)
    expect('jiraDisplayName' in req).toBe(false)
  })

  it('form fields WIN over source: owner, displayName, flags, RM/SC, copyright', () => {
    const form = makeForm({
      name: 'svc-clone',
      displayName: 'Clone DN',
      componentOwner: 'form-owner@example.com',
      distributionExplicit: false,
      distributionExternal: false,
      releaseManager: ['rm-form'],
      securityChampion: ['sc-form'],
      copyright: 'FORM-CR',
    })
    const req = buildCreateRequest(form, source)
    expect(req.displayName).toBe('Clone DN')
    expect(req.componentOwner).toBe('form-owner@example.com')
    expect(req.distributionExplicit).toBe(false)
    expect(req.distributionExternal).toBe(false)
    expect(req.releaseManager).toEqual(['rm-form'])
    expect(req.securityChampion).toEqual(['sc-form'])
    expect(req.copyright).toBe('FORM-CR')
  })

  it('build aspect = source build merged with form buildSystem (gradleVersion kept, buildSystem from form)', () => {
    const req = buildCreateRequest(makeForm({ name: 'svc-clone', buildSystem: 'MAVEN' }), source)
    expect(req.baseConfiguration?.build).toEqual({ buildSystem: 'MAVEN', gradleVersion: '8.5' })
  })

  it('copies escrow / jira(without projectKey) / requiredTools from the source BASE row', () => {
    const src = makeSource({
      configurations: [
        makeBaseRow({
          build: { buildSystem: 'GRADLE' },
          escrow: { reusable: true },
          jira: { projectKey: 'ALPHA', majorVersionFormat: '%d.%d' },
          requiredTools: ['tool-a'],
        }),
      ],
    })
    const req = buildCreateRequest(makeForm({ name: 'svc-clone' }), src)
    expect(req.baseConfiguration?.escrow).toEqual({ reusable: true })
    expect(req.baseConfiguration?.jira).toEqual({ majorVersionFormat: '%d.%d' })
    expect(req.baseConfiguration?.requiredTools).toEqual(['tool-a'])
  })

  it('coordinate is NEVER taken from source distribution artifacts', () => {
    const src = makeSource({
      configurations: [
        makeBaseRow({
          build: { buildSystem: 'GRADLE' },
          mavenArtifacts: [
            { id: 'm-1', groupPattern: 'org.src', artifactPattern: 'src', sortOrder: 0 },
          ],
        }),
      ],
    })
    // non-gated copy → no coordinate lists at all
    const req = buildCreateRequest(makeForm({ name: 'svc-clone' }), src)
    const base = req.baseConfiguration!
    expect('mavenArtifacts' in base).toBe(false)
    expect('dockerImages' in base).toBe(false)
    expect('packages' in base).toBe(false)
  })

  it('gated copy: form coordinate lands in baseConfiguration, source mavenArtifacts ignored', () => {
    const src = makeSource({
      distributionExplicit: true,
      distributionExternal: true,
      configurations: [
        makeBaseRow({
          build: { buildSystem: 'GRADLE' },
          mavenArtifacts: [
            { id: 'm-1', groupPattern: 'org.src', artifactPattern: 'SHOULD-NOT-APPEAR', sortOrder: 0 },
          ],
        }),
      ],
    })
    const form = makeForm({
      name: 'svc-clone',
      distributionExplicit: true,
      distributionExternal: true,
      releaseManager: ['rm-form'],
      securityChampion: ['sc-form'],
      coordinate: { ...makeForm().coordinate, type: 'docker', imageName: 'acme/clone' },
    })
    const req = buildCreateRequest(form, src)
    expect(req.baseConfiguration?.dockerImages).toEqual([{ imageName: 'acme/clone', flavor: null }])
    expect('mavenArtifacts' in req.baseConfiguration!).toBe(false)
  })

  it('never leaks server-owned fields', () => {
    const req = buildCreateRequest(makeForm({ name: 'svc-clone' }), source)
    for (const key of ['id', 'version', 'createdAt', 'updatedAt', 'canEdit', 'canBeParent', 'group']) {
      expect(key in req, `${key} must be absent`).toBe(false)
    }
  })
})
