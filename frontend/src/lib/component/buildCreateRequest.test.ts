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
    jiraProjectKey: '',
    versionPrefix: '',
    minorVersionFormat: '',
    releaseVersionFormat: '',
    buildVersionFormat: '',
    lineVersionFormat: '',
    minorSeparate: false,
    buildSeparate: false,
    vcsUrl: 'ssh://git@host/proj/repo.git',
    vcsTag: '$module-$version',
    vcsBranch: 'master',
    coordinate: {
      type: 'maven',
      groupPattern: '',
      artifactPattern: '',
      imageName: '',
      packageType: 'DEB',
      packageName: '',
    },
    ownership: { groups: '', mode: 'ALL', tokens: [] },
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
    artifactIds: [{ id: 'a-1', groupPattern: 'org.x', mode: 'ALL', artifactTokens: [] }],
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

describe('buildCreateRequest — base artifact ownership', () => {
  it('EXPLICIT mode forwards the artifact tokens', () => {
    const req = buildCreateRequest(
      makeForm({ ownership: { groups: 'org.x', mode: 'EXPLICIT', tokens: ['foo', 'bar'] } }),
    )
    expect(req.artifactIds).toEqual([
      { versionRange: null, groupPattern: 'org.x', mode: 'EXPLICIT', artifactTokens: ['foo', 'bar'] },
    ])
  })

  it('catch-all modes send an empty token list even if tokens linger in form state', () => {
    const req = buildCreateRequest(
      makeForm({ ownership: { groups: 'org.x', mode: 'ALL', tokens: ['stale'] } }),
    )
    expect(req.artifactIds).toEqual([
      { versionRange: null, groupPattern: 'org.x', mode: 'ALL', artifactTokens: [] },
    ])
  })

  it('no group ⇒ no ownership mapping (tokens ignored)', () => {
    const req = buildCreateRequest(
      makeForm({ ownership: { groups: '', mode: 'EXPLICIT', tokens: ['foo'] } }),
    )
    expect(req.artifactIds).toEqual([])
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

  it('emits form jiraProjectKey + versionPrefix onto baseConfiguration.jira', () => {
    const req = buildCreateRequest(makeForm({ jiraProjectKey: 'PROJ', versionPrefix: 'svc-new' }))
    expect(req.baseConfiguration?.jira).toMatchObject({ projectKey: 'PROJ', versionPrefix: 'svc-new' })
  })

  it('maps the version formats onto the jira aspect (all pairs separate)', () => {
    const req = buildCreateRequest(
      makeForm({
        minorVersionFormat: '$major.$minor',
        minorSeparate: true,
        releaseVersionFormat: '$major.$minor.$service',
        buildVersionFormat: '$b',
        buildSeparate: true,
        lineVersionFormat: '$l',
      }),
    )
    expect(req.baseConfiguration?.jira).toMatchObject({
      minorVersionFormat: '$major.$minor',
      releaseVersionFormat: '$major.$minor.$service',
      buildVersionFormat: '$b',
      lineVersionFormat: '$l',
    })
  })

  it('never sets a hotfix format on create (no field; server default applies)', () => {
    const req = buildCreateRequest(
      makeForm({ lineVersionFormat: '$l', releaseVersionFormat: '$r' }),
      makeSource({ jiraHotfixVersionFormat: '%d.%d.%d.%d' }),
    )
    expect('jiraHotfixVersionFormat' in req).toBe(false)
    expect('hotfixVersionFormat' in (req.baseConfiguration?.jira ?? {})).toBe(false)
  })

  it('omits jira aspect entirely when no jira fields are set (scratch)', () => {
    const req = buildCreateRequest(makeForm({ jiraProjectKey: '', versionPrefix: '' }))
    expect('jira' in (req.baseConfiguration ?? {})).toBe(false)
  })
})

describe('buildCreateRequest — Line/Minor and Release/Build materialization (§R6)', () => {
  it('Minor MIRRORED materializes the Line value into BOTH stored fields', () => {
    const req = buildCreateRequest(
      makeForm({ lineVersionFormat: '$major', minorVersionFormat: '', minorSeparate: false }),
    )
    expect(req.baseConfiguration?.jira).toMatchObject({
      lineVersionFormat: '$major',
      minorVersionFormat: '$major',
    })
  })

  it('Minor SEPARATE keeps its own value distinct from Line', () => {
    const req = buildCreateRequest(
      makeForm({
        lineVersionFormat: '$major.x',
        minorVersionFormat: '$major.$minor',
        minorSeparate: true,
      }),
    )
    expect(req.baseConfiguration?.jira).toMatchObject({
      lineVersionFormat: '$major.x',
      minorVersionFormat: '$major.$minor',
    })
  })

  it('Build MIRRORED omits buildVersionFormat (CRS falls back to Release)', () => {
    const req = buildCreateRequest(
      makeForm({
        releaseVersionFormat: '$major.$minor.$service',
        buildVersionFormat: '',
        buildSeparate: false,
      }),
    )
    expect(req.baseConfiguration?.jira?.releaseVersionFormat).toBe('$major.$minor.$service')
    expect('buildVersionFormat' in (req.baseConfiguration?.jira ?? {})).toBe(false)
  })

  it('Build SEPARATE keeps its own value', () => {
    const req = buildCreateRequest(
      makeForm({
        releaseVersionFormat: '$major.$minor.$service',
        buildVersionFormat: '$major.$minor.$service.$fix',
        buildSeparate: true,
      }),
    )
    expect(req.baseConfiguration?.jira?.buildVersionFormat).toBe('$major.$minor.$service.$fix')
  })

  it('a Build value lingering in form state is dropped when mirrored', () => {
    const req = buildCreateRequest(
      makeForm({
        releaseVersionFormat: '$r',
        buildVersionFormat: '$stale',
        buildSeparate: false,
      }),
    )
    expect('buildVersionFormat' in (req.baseConfiguration?.jira ?? {})).toBe(false)
  })

  it('copy mode: collapsing Minor to mirror materializes Line, dropping the source Minor', () => {
    const src = makeSource({
      configurations: [
        makeBaseRow({
          build: { buildSystem: 'GRADLE' },
          jira: { projectKey: 'ALPHA', lineVersionFormat: '$major', minorVersionFormat: '$major.$minor' },
        }),
      ],
    })
    // User collapsed Minor back to mirroring Line (minorSeparate false) — Line
    // must be written into both fields, not the source's separate Minor.
    const req = buildCreateRequest(
      makeForm({ name: 'svc-clone', lineVersionFormat: '$major', minorSeparate: false }),
      src,
    )
    expect(req.baseConfiguration?.jira).toMatchObject({
      lineVersionFormat: '$major',
      minorVersionFormat: '$major',
    })
  })
})

describe('buildCreateRequest — VCS entry (legacy EscrowConfigValidator rule)', () => {
  it.each(['MAVEN', 'GOLANG'])('emits one vcsEntries row for %s (VCS-requiring build system)', (buildSystem) => {
    const req = buildCreateRequest(makeForm({ buildSystem }))
    expect(req.baseConfiguration?.vcsEntries).toEqual([
      { vcsPath: 'ssh://git@host/proj/repo.git', tag: '$module-$version', branch: 'master' },
    ])
  })

  it.each(['BS2_0', 'PROVIDED', 'ESCROW_PROVIDED_MANUALLY', 'ESCROW_NOT_SUPPORTED', 'WHISKEY'])(
    'sends NO vcsEntries for exempt build system %s even when the form carries values',
    (buildSystem) => {
      const req = buildCreateRequest(makeForm({ buildSystem }))
      expect('vcsEntries' in (req.baseConfiguration ?? {})).toBe(false)
    },
  )

  it('trims vcsPath and drops blank tag/branch instead of sending empty strings', () => {
    const req = buildCreateRequest(
      makeForm({ vcsUrl: '  ssh://git@host/proj/repo.git ', vcsTag: '  ', vcsBranch: '' }),
    )
    expect(req.baseConfiguration?.vcsEntries).toEqual([{ vcsPath: 'ssh://git@host/proj/repo.git' }])
  })

  it('copy mode: vcsEntries come from the FORM, never from the source BASE row', () => {
    const src = makeSource({
      configurations: [
        makeBaseRow({
          build: { buildSystem: 'GRADLE' },
          vcsEntries: [
            {
              id: 'v-1',
              name: null,
              vcsPath: 'ssh://git@host/src/SHOULD-NOT-APPEAR.git',
              branch: 'main',
              tag: 'src-tag',
              hotfixBranch: null,
              repositoryType: 'GIT',
              sortOrder: 0,
            },
          ],
        }),
      ],
    })
    const req = buildCreateRequest(makeForm({ buildSystem: 'GRADLE' }), src)
    expect(req.baseConfiguration?.vcsEntries).toEqual([
      { vcsPath: 'ssh://git@host/proj/repo.git', tag: '$module-$version', branch: 'master' },
    ])
  })

  it('exposes the rule helpers: vcsBlockApplies + deprecated set', async () => {
    const { vcsBlockApplies, DEPRECATED_BUILD_SYSTEMS, FALLBACK_VCS_BRANCH } = await import('./buildCreateRequest')
    expect(vcsBlockApplies('')).toBe(false)
    expect(vcsBlockApplies('MAVEN')).toBe(true)
    expect(vcsBlockApplies('SOME_FUTURE_SYSTEM')).toBe(true) // legacy default: everything else requires VCS
    expect(vcsBlockApplies('WHISKEY')).toBe(false)
    expect(DEPRECATED_BUILD_SYSTEMS.has('BS2_0')).toBe(true)
    expect(FALLBACK_VCS_BRANCH).toBe('master')
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
      labels: ['backend', 'internal'],
      docs: [{ docComponentKey: 'docs-a', majorVersion: '1.x' }],
      securityGroups: [{ groupType: 'LAS', groupName: 'las-alpha' }],
      artifactIds: [],
      teamcityProjects: [],
    })
    expect('group' in req).toBe(false)
    expect('jiraDisplayName' in req).toBe(false)
    // Hotfix format is never carried on create (no field), even from a source
    // that defines one.
    expect('jiraHotfixVersionFormat' in req).toBe(false)
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

  it('copies escrow / requiredTools from source; jira version formats are FORM-driven (copy mode prefills the form)', () => {
    const src = makeSource({
      configurations: [
        makeBaseRow({
          build: { buildSystem: 'GRADLE' },
          escrow: { reusable: true },
          jira: { projectKey: 'ALPHA', minorVersionFormat: '%d.%d' },
          requiredTools: ['tool-a'],
        }),
      ],
    })
    // The dialog prefills minorVersionFormat from the source into the form; a
    // source with a separate Minor seeds minorSeparate=true, so it stays distinct.
    const req = buildCreateRequest(
      makeForm({ name: 'svc-clone', minorVersionFormat: '%d.%d', minorSeparate: true }),
      src,
    )
    expect(req.baseConfiguration?.escrow).toEqual({ reusable: true })
    expect(req.baseConfiguration?.jira).toEqual({ minorVersionFormat: '%d.%d' })
    expect(req.baseConfiguration?.requiredTools).toEqual(['tool-a'])
  })

  it('copy mode: clearing a BASE jira version format drops it (not re-sent from the source)', () => {
    const src = makeSource({
      configurations: [
        makeBaseRow({ build: { buildSystem: 'GRADLE' }, jira: { projectKey: 'ALPHA', minorVersionFormat: '%d.%d' } }),
      ],
    })
    // User cleared the prefilled Minor Version Format → form blank → must NOT re-send the source value.
    const req = buildCreateRequest(makeForm({ name: 'svc-clone', minorVersionFormat: '' }), src)
    expect(req.baseConfiguration?.jira == null || !('minorVersionFormat' in req.baseConfiguration.jira)).toBe(true)
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

  // Field-config visibility gating: a hidden/readonly component field must never
  // be sent on create — not from the form, and not copied from the source.
  it('strips a field-config hidden field (copyright) from the request, including the copied source value', () => {
    const req = buildCreateRequest(
      makeForm({ copyright: 'FORM-CR' }),
      makeSource({ copyright: 'SOURCE-CR' }),
      (field) => field !== 'copyright',
    )
    expect('copyright' in req).toBe(false)
  })

  it('strips a hidden source-only field (system) from the request', () => {
    const req = buildCreateRequest(makeForm(), makeSource({ system: 'SYS1' }), (field) => field !== 'system')
    expect('system' in req).toBe(false)
  })

  it('keeps fields the visibility predicate marks editable', () => {
    const req = buildCreateRequest(makeForm({ copyright: 'KEEP' }), makeSource(), () => true)
    expect(req.copyright).toBe('KEEP')
  })

  // Copy-mode adminOnly gating (§P-4): a field non-editable for the current user
  // (e.g. External Registry, which is adminOnly) must NOT be copied from the
  // source — otherwise a non-admin's POST carries a value the server rejects.
  it('does not copy an adminOnly source value (vcsExternalRegistry) for a non-admin', () => {
    const req = buildCreateRequest(
      makeForm(),
      makeSource({ vcsExternalRegistry: 'registry-x' }),
      (field) => field !== 'vcsExternalRegistry',
    )
    expect('vcsExternalRegistry' in req).toBe(false)
  })
})
