import { describe, it, expect } from 'vitest'
import { portalCreateRules, type PortalRuleOptions } from './portalCreateRules'
import type { ComponentCreateRequest } from '../types'

const GIT_BASE_URL = 'ssh://git@git.example.com'
const VCS_PATH = 'baseConfiguration.vcsEntries[0].vcsPath'

function request(overrides: Partial<ComponentCreateRequest> = {}): ComponentCreateRequest {
  return {
    name: 'payments',
    componentOwner: 'jdoe',
    distributionExplicit: false,
    distributionExternal: false,
    artifactIds: [],
    baseConfiguration: {
      build: { buildSystem: 'GRADLE' },
      jira: { projectKey: 'PAY', versionFormat: '$versionPrefix-$baseVersionFormat' },
      vcsEntries: [{ vcsPath: 'ssh://git@git.example.com/pay/payments.git', tag: '$module-$version', branch: 'master' }],
    },
    ...overrides,
  }
}

function withBase(base: Partial<NonNullable<ComponentCreateRequest['baseConfiguration']>>): ComponentCreateRequest {
  const r = request()
  return { ...r, baseConfiguration: { ...r.baseConfiguration, ...base } }
}

function rules(req: ComponentCreateRequest, options: Partial<PortalRuleOptions> = {}) {
  return portalCreateRules(req, { supportedGroups: ['org.example', 'com.example'], gitBaseUrl: GIT_BASE_URL, ...options })
}

describe('portalCreateRules', () => {
  it('finds nothing wrong with a complete request', () => {
    expect(rules(request())).toEqual([])
  })

  describe('Jira', () => {
    it('requires the Jira project key and the full version format', () => {
      expect(rules(withBase({ jira: { versionPrefix: 'pay' } }))).toEqual([
        { path: 'baseConfiguration.jira.projectKey', message: 'Jira Project Key is required' },
        { path: 'baseConfiguration.jira.versionFormat', message: 'Full Version Format is required' },
      ])
    })

    it('treats a blank value as missing', () => {
      expect(rules(withBase({ jira: { projectKey: ' ', versionFormat: '$versionPrefix-$baseVersionFormat' } }))).toEqual([
        { path: 'baseConfiguration.jira.projectKey', message: 'Jira Project Key is required' },
      ])
    })

    it('leaves both to a caller that requires them itself', () => {
      expect(rules(withBase({ jira: undefined }), { checkJiraRequired: false })).toEqual([])
    })
  })

  describe('artifact ownership', () => {
    const row = (groupPattern: string, mode: 'ALL' | 'ALL_EXCEPT_CLAIMED' | 'EXPLICIT' = 'ALL', artifactTokens: string[] = []) => ({
      versionRange: null,
      groupPattern,
      mode,
      artifactTokens,
    })

    it('rejects a group ID with characters outside letters, digits, . _ -', () => {
      expect(rules(request({ artifactIds: [row('org.example/pay')] }))).toEqual([
        { path: 'artifactIds[0].groupPattern', message: 'Invalid group "org.example/pay" — letters, digits, . _ - only' },
      ])
    })

    it('rejects a group ID without a supported prefix, on its own row', () => {
      expect(rules(request({ artifactIds: [row('org.example.pay'), row('net.other.pay')] }))).toEqual([
        {
          path: 'artifactIds[1].groupPattern',
          message: 'Group "net.other.pay" must start with a supported prefix (org.example, com.example)',
        },
      ])
    })

    it('skips the prefix check while the supported prefixes are unknown', () => {
      expect(rules(request({ artifactIds: [row('net.other.pay')] }), { supportedGroups: [] })).toEqual([])
    })

    it('asks for an artifact when the row is limited to specific artifacts and names none', () => {
      expect(rules(request({ artifactIds: [row('org.example.pay', 'EXPLICIT')] }))).toEqual([
        { path: 'artifactIds[0].artifactTokens', message: 'Add at least one artifact, or switch to a catch-all mode' },
      ])
    })

    it('skips a row with a blank group ID', () => {
      expect(rules(request({ artifactIds: [row(' ', 'EXPLICIT')] }))).toEqual([])
    })
  })

  describe('an explicit external component', () => {
    const explicitExternal = (overrides: Partial<ComponentCreateRequest> = {}) =>
      request({
        distributionExplicit: true,
        distributionExternal: true,
        displayName: 'Payments',
        releaseManager: ['jdoe'],
        securityChampion: ['asmith'],
        ...overrides,
        baseConfiguration: {
          ...request().baseConfiguration,
          mavenArtifacts: [{ groupPattern: 'org.example.pay', artifactPattern: 'payments' }],
          ...overrides.baseConfiguration,
        },
      })

    it('finds nothing wrong when it is complete', () => {
      expect(rules(explicitExternal())).toEqual([])
    })

    it('requires a display name, a release manager and a security champion', () => {
      expect(rules(explicitExternal({ displayName: ' ', releaseManager: [], securityChampion: undefined }))).toEqual([
        { path: 'displayName', message: 'Display Name is required for an explicit + external component' },
        { path: 'releaseManager', message: 'At least one Release Manager is required for an explicit + external component' },
        { path: 'securityChampion', message: 'At least one Security Champion is required for an explicit + external component' },
      ])
    })

    it('does not require a field the caller cannot edit', () => {
      const editable = (field: string) => field !== 'displayName' && field !== 'securityChampion'
      expect(rules(explicitExternal({ displayName: undefined, securityChampion: [] }), { editable })).toEqual([])
    })

    it('asks nothing of a component that is not both explicit and external', () => {
      expect(rules(request({ distributionExplicit: true, distributionExternal: false }))).toEqual([])
    })

    it('requires the Maven group and artifact IDs, and a supported group prefix', () => {
      const maven = (groupPattern: string, artifactPattern: string) =>
        explicitExternal({ baseConfiguration: { mavenArtifacts: [{ groupPattern, artifactPattern }] } })
      expect(rules(maven('', ''))).toEqual([
        { path: 'baseConfiguration.mavenArtifacts[0].groupPattern', message: 'Group ID is required' },
        { path: 'baseConfiguration.mavenArtifacts[0].artifactPattern', message: 'Artifact ID is required' },
      ])
      expect(rules(maven('net.other', 'payments'))).toEqual([
        {
          path: 'baseConfiguration.mavenArtifacts[0].groupPattern',
          message: 'Group ID "net.other" must start with a supported prefix (org.example, com.example)',
        },
      ])
    })

    it('requires a Docker image name or a package name for those coordinates', () => {
      expect(
        rules(explicitExternal({ baseConfiguration: { mavenArtifacts: undefined, dockerImages: [{ imageName: ' ' }] } })),
      ).toEqual([{ path: 'baseConfiguration.dockerImages[0].imageName', message: 'Image name is required' }])
      expect(
        rules(
          explicitExternal({
            baseConfiguration: { mavenArtifacts: undefined, packages: [{ packageType: 'DEB', packageName: '' }] },
          }),
        ),
      ).toEqual([{ path: 'baseConfiguration.packages[0].packageName', message: 'Package name is required' }])
    })

    it('reads a chosen coordinate type that the request does not carry yet, as the wizard sends a blank Docker image', () => {
      const noCoordinate = explicitExternal({ baseConfiguration: { mavenArtifacts: undefined } })
      expect(rules(noCoordinate, { coordinateType: 'docker' })).toEqual([
        { path: 'baseConfiguration.dockerImages[0].imageName', message: 'Image name is required' },
      ])
    })

    it('requires some coordinate when the request carries none and no type was chosen', () => {
      expect(rules(explicitExternal({ baseConfiguration: { mavenArtifacts: undefined } }))).toEqual([
        {
          path: 'baseConfiguration.mavenArtifacts[0].groupPattern',
          message: 'A Maven, Docker or package coordinate is required for an explicit + external component',
        },
      ])
    })
  })

  describe('VCS', () => {
    it('requires a VCS path for a build system that needs one', () => {
      expect(rules(withBase({ vcsEntries: [{ vcsPath: '', tag: 't', branch: 'b' }] }))).toEqual([
        { path: VCS_PATH, message: 'VCS Path is required for this build system' },
      ])
    })

    it('requires a VCS path when the request has no VCS entry at all', () => {
      expect(rules(withBase({ vcsEntries: undefined }))).toEqual([
        { path: VCS_PATH, message: 'VCS Path is required for this build system' },
        { path: 'baseConfiguration.vcsEntries[0].tag', message: 'Tag is required' },
        { path: 'baseConfiguration.vcsEntries[0].branch', message: 'Production branch is required' },
      ])
    })

    it('rejects a VCS path that is not an ssh:// URL', () => {
      expect(rules(withBase({ vcsEntries: [{ vcsPath: 'https://git.example.com/pay.git', tag: 't', branch: 'b' }] }))).toEqual([
        { path: VCS_PATH, message: 'VCS Path must be an ssh:// URL, e.g. ssh://git@host/path/repo.git' },
      ])
    })

    it('rejects an ssh:// URL on another host, naming the ecosystem host', () => {
      expect(rules(withBase({ vcsEntries: [{ vcsPath: 'ssh://git@elsewhere.org/pay.git', tag: 't', branch: 'b' }] }))).toEqual([
        { path: VCS_PATH, message: 'VCS host must be git.example.com (the ecosystem Bitbucket)' },
      ])
    })

    it('requires the tag and the production branch', () => {
      expect(rules(withBase({ vcsEntries: [{ vcsPath: 'ssh://git@git.example.com/p.git' }] }))).toEqual([
        { path: 'baseConfiguration.vcsEntries[0].tag', message: 'Tag is required' },
        { path: 'baseConfiguration.vcsEntries[0].branch', message: 'Production branch is required' },
      ])
    })

    it.each(['PROVIDED', 'ESCROW_PROVIDED_MANUALLY', 'ESCROW_NOT_SUPPORTED', 'WHISKEY'])(
      'asks nothing about VCS for %s, which needs none',
      (buildSystem) => {
        expect(rules(withBase({ build: { buildSystem }, vcsEntries: undefined }))).toEqual([])
      },
    )
  })
})
