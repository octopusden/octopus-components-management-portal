import { describe, it, expect } from 'vitest'
import { buildCopyRequest } from './buildCopyRequest'
import type { ComponentConfiguration, ComponentDetail } from '../types'

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

function makeComponent(overrides: Partial<ComponentDetail> = {}): ComponentDetail {
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
    releaseManager: ['rm@example.com'],
    securityChampion: ['sc@example.com'],
    copyright: 'ACME',
    releasesInDefaultBranch: true,
    labels: ['backend', 'internal'],
    jiraDisplayName: 'Alpha Service',
    jiraHotfixVersionFormat: '%d.%d.%d.%d',
    vcsExternalRegistry: 'registry-x',
    distributionExplicit: true,
    distributionExternal: false,
    group: { groupKey: 'org.example.legacy', isFake: false, role: 'MEMBER' },
    docs: [
      { id: 'd-1', docComponentKey: 'docs-a', majorVersion: '1.x', sortOrder: 0 },
      { id: 'd-2', docComponentKey: 'docs-b', majorVersion: null, sortOrder: 1 },
    ],
    artifactIds: [{ id: 'a-1', groupPattern: 'org.x', artifactPattern: 'alpha-*' }],
    securityGroups: [{ id: 'sg-1', groupType: 'LAS', groupName: 'las-alpha' }],
    teamcityProjects: [{ id: 'tc-1', projectId: 'AlphaProject', projectUrl: 'https://tc/x', sortOrder: 0 }],
    configurations: [makeBaseRow()],
    canEdit: true,
    ...overrides,
  }
}

const INPUT = { name: 'svc-beta', displayName: 'Service Beta' }

describe('buildCopyRequest — identity & input', () => {
  it('name and displayName come from input, never from the source', () => {
    const req = buildCopyRequest(makeComponent(), INPUT)
    expect(req.name).toBe('svc-beta')
    expect(req.displayName).toBe('Service Beta')
  })

  it('archived is always false, even for an archived source', () => {
    const req = buildCopyRequest(makeComponent({ archived: true }), INPUT)
    expect(req.archived).toBe(false)
  })

  it('server-owned and migration-owned fields never leak into the request', () => {
    const req = buildCopyRequest(makeComponent(), INPUT)
    for (const key of ['id', 'version', 'createdAt', 'updatedAt', 'canEdit', 'canBeParent', 'group']) {
      expect(key in req, `${key} must be absent`).toBe(false)
    }
  })
})

describe('buildCopyRequest — copied general fields', () => {
  it('copies general scalars from the source', () => {
    const req = buildCopyRequest(makeComponent(), INPUT)
    expect(req).toMatchObject({
      componentOwner: 'alice@example.com',
      productType: 'TYPE_A',
      system: 'SYS1',
      clientCode: 'CL1',
      solution: true,
      parentComponentName: 'parent-svc',
      copyright: 'ACME',
      releasesInDefaultBranch: true,
      distributionExplicit: true,
      distributionExternal: false,
      vcsExternalRegistry: 'registry-x',
      jiraHotfixVersionFormat: '%d.%d.%d.%d',
    })
  })

  it('copies people lists and labels', () => {
    const req = buildCopyRequest(makeComponent(), INPUT)
    expect(req.releaseManager).toEqual(['rm@example.com'])
    expect(req.securityChampion).toEqual(['sc@example.com'])
    expect(req.labels).toEqual(['backend', 'internal'])
  })

  it('maps docs to DocLinkRequest (drops id/sortOrder)', () => {
    const req = buildCopyRequest(makeComponent(), INPUT)
    expect(req.docs).toEqual([
      { docComponentKey: 'docs-a', majorVersion: '1.x' },
      { docComponentKey: 'docs-b', majorVersion: null },
    ])
  })

  it('maps securityGroups to SecurityGroupRequest (drops id)', () => {
    const req = buildCopyRequest(makeComponent(), INPUT)
    expect(req.securityGroups).toEqual([{ groupType: 'LAS', groupName: 'las-alpha' }])
  })

  it('required collections default to [] when the detail omits them (legacy/fixture shapes)', () => {
    const req = buildCopyRequest(
      makeComponent({ releaseManager: undefined, securityChampion: undefined }),
      INPUT,
    )
    expect(req.releaseManager).toEqual([])
    expect(req.securityChampion).toEqual([])
  })
})

describe('buildCopyRequest — excluded unique fields', () => {
  it('jiraDisplayName is not copied', () => {
    const req = buildCopyRequest(makeComponent(), INPUT)
    expect('jiraDisplayName' in req).toBe(false)
  })

  it('artifactIds and teamcityProjects are explicit [] (required by the create contract, not copied)', () => {
    const req = buildCopyRequest(makeComponent(), INPUT)
    expect(req.artifactIds).toEqual([])
    expect(req.teamcityProjects).toEqual([])
  })
})

describe('buildCopyRequest — baseConfiguration', () => {
  const FULL_BUILD = {
    buildSystem: 'GRADLE',
    gradleVersion: '8.5',
    javaVersion: '21',
    buildFilePath: 'sub/build.gradle',
    deprecated: false,
    systemProperties: '-Dx=1',
  }
  const FULL_ESCROW = { providedDependencies: 'dep-a', reusable: true, generation: 'G2' }
  const FULL_JIRA = {
    projectKey: 'ALPHA',
    technical: true,
    majorVersionFormat: '%d.%d',
    releaseVersionFormat: '%d.%d.%d',
    versionPrefix: 'v',
  }

  function sourceWithBase(rowOverrides: Partial<ComponentConfiguration>): ComponentDetail {
    return makeComponent({ configurations: [makeBaseRow(rowOverrides)] })
  }

  it('copies build and escrow aspects wholesale from the BASE row', () => {
    const req = buildCopyRequest(
      sourceWithBase({ build: FULL_BUILD, escrow: FULL_ESCROW }),
      INPUT,
    )
    expect(req.baseConfiguration?.build).toEqual(FULL_BUILD)
    expect(req.baseConfiguration?.escrow).toEqual(FULL_ESCROW)
  })

  it('copies the jira aspect WITHOUT projectKey (version formats are kept)', () => {
    const req = buildCopyRequest(sourceWithBase({ jira: FULL_JIRA }), INPUT)
    expect(req.baseConfiguration?.jira).toEqual({
      technical: true,
      majorVersionFormat: '%d.%d',
      releaseVersionFormat: '%d.%d.%d',
      versionPrefix: 'v',
    })
  })

  it('omits jira entirely when the source aspect only has projectKey', () => {
    // build present so baseConfiguration itself exists — the assertion
    // targets the jira key specifically; whole-object omission has its
    // own test below.
    const req = buildCopyRequest(
      sourceWithBase({ build: FULL_BUILD, jira: { projectKey: 'ALPHA' } }),
      INPUT,
    )
    expect(req.baseConfiguration && 'jira' in req.baseConfiguration).toBe(false)
  })

  it('omits jira when the BASE row has no jira aspect (no empty object synthesized)', () => {
    const req = buildCopyRequest(sourceWithBase({ jira: null, build: FULL_BUILD }), INPUT)
    expect(req.baseConfiguration && 'jira' in req.baseConfiguration).toBe(false)
  })

  it('copies requiredTools', () => {
    const req = buildCopyRequest(sourceWithBase({ requiredTools: ['tool-a', 'tool-b'] }), INPUT)
    expect(req.baseConfiguration?.requiredTools).toEqual(['tool-a', 'tool-b'])
  })

  it('never includes unique child collections or versionRange', () => {
    const req = buildCopyRequest(
      sourceWithBase({
        build: FULL_BUILD,
        versionRange: '[1.0,2.0)',
        vcsEntries: [
          { id: 'v-1', vcsPath: 'proj/repo', branch: 'main', sortOrder: 0 },
        ],
        mavenArtifacts: [
          { id: 'm-1', groupPattern: 'org.x', artifactPattern: 'alpha', sortOrder: 0 },
        ],
        fileUrlArtifacts: [{ id: 'f-1', url: 'https://x/y.zip', sortOrder: 0 }],
        dockerImages: [{ id: 'di-1', imageName: 'alpha-img', sortOrder: 0 }],
        packages: [{ id: 'p-1', packageType: 'NPM', packageName: 'alpha-pkg', sortOrder: 0 }],
      }),
      INPUT,
    )
    const base = req.baseConfiguration
    expect(base).toBeDefined()
    for (const key of [
      'versionRange',
      'vcsEntries',
      'mavenArtifacts',
      'fileUrlArtifacts',
      'dockerImages',
      'packages',
    ]) {
      expect(base && key in base, `${key} must be absent`).toBe(false)
    }
  })

  it('omits baseConfiguration entirely when the source has no BASE row', () => {
    const req = buildCopyRequest(makeComponent({ configurations: [] }), INPUT)
    expect('baseConfiguration' in req).toBe(false)
  })

  it('omits baseConfiguration when the BASE row has nothing to copy (no aspects, no tools)', () => {
    // e.g. a synthetic/minimal BASE row whose only content is excluded
    // collections — copying must not send `baseConfiguration: {}`.
    const req = buildCopyRequest(
      sourceWithBase({
        build: null,
        escrow: null,
        jira: { projectKey: 'ALPHA' },
        requiredTools: [],
        vcsEntries: [{ id: 'v-1', vcsPath: 'proj/repo', sortOrder: 0 }],
      }),
      INPUT,
    )
    expect('baseConfiguration' in req).toBe(false)
  })

  it('override rows (SCALAR_OVERRIDE / MARKER) never influence the request', () => {
    const req = buildCopyRequest(
      makeComponent({
        configurations: [
          makeBaseRow({ build: FULL_BUILD }),
          makeBaseRow({
            id: 'cfg-ovr',
            rowType: 'SCALAR_OVERRIDE',
            overriddenAttribute: 'build.buildSystem',
            versionRange: '[1.0,2.0)',
            build: { buildSystem: 'MAVEN' },
          }),
        ],
      }),
      INPUT,
    )
    expect(req.baseConfiguration?.build).toEqual(FULL_BUILD)
  })
})
