import { describe, it, expect } from 'vitest'
import { fieldDescriptions } from './fieldDescriptions'

/**
 * Every field path the editor tabs reference via <FieldInfo>. A key listed
 * here but missing from the registry means a silently absent info icon —
 * this test makes that a build failure instead.
 *
 * NOTE on content: forbidden-token checking is deliberately NOT automated
 * here. The canonical denylist lives in the external octopus-base merge-gate
 * (Content Validation) — a local inline denylist would itself contain the
 * forbidden tokens and trip that same gate. Texts are reviewed manually.
 */
const EXPECTED_KEYS = [
  // GeneralTab
  'component.name',
  'component.displayName',
  'component.parentComponentName',
  'component.canBeParent',
  'component.groupId',
  'component.solution',
  'component.componentOwner',
  'component.releaseManager',
  'component.securityChampion',
  'component.system',
  'component.clientCode',
  'component.copyright',
  'component.labels',
  'component.docs',
  'component.artifactIds',
  // build aspect (toolchain scalars on BuildTab; buildTasks / systemProperties /
  // deprecated / requiredProject / requiredTools / projectVersion render on EscrowTab)
  'build.buildSystem',
  'build.buildFilePath',
  'build.javaVersion',
  'build.mavenVersion',
  'build.gradleVersion',
  'build.projectVersion',
  'build.buildTasks',
  'build.systemProperties',
  'build.deprecated',
  'build.requiredProject',
  'build.requiredTools',
  // JiraTab
  'jira.projectKey',
  'jira.displayName',
  'jira.technical',
  'component.releasesInDefaultBranch',
  'jira.hotfixVersionFormat',
  'jira.versionPrefix',
  'jira.minorVersionFormat',
  'jira.releaseVersionFormat',
  'jira.buildVersionFormat',
  'jira.lineVersionFormat',
  'jira.versionFormat',
  'jira.skipCommitCheck',
  // VcsTab
  'vcs.externalRegistry',
  'vcs.entries',
  'vcs.name',
  'vcs.vcsPath',
  'vcs.repositoryType',
  'vcs.branch',
  'vcs.tag',
  'vcs.hotfixBranch',
  // DistributionTab
  'component.distributionExplicit',
  'component.distributionExternal',
  'distribution.mavenArtifacts',
  'distribution.fileUrlArtifacts',
  'distribution.dockerImages',
  'distribution.packages',
  'distribution.securityGroups',
  'distribution.maven.groupPattern',
  'distribution.maven.artifactPattern',
  'distribution.maven.extension',
  'distribution.maven.classifier',
  'distribution.fileUrl.url',
  'distribution.fileUrl.artifactId',
  'distribution.fileUrl.classifier',
  'distribution.docker.imageName',
  'distribution.docker.flavor',
  'distribution.package.type',
  'distribution.package.name',
  'distribution.securityGroup.type',
  'distribution.securityGroup.name',
  // EscrowTab
  'component.productType',
  'escrow.generation',
  'escrow.diskSpace',
  'escrow.reusable',
  'escrow.providedDependencies',
  'escrow.additionalSources',
  'escrow.gradleIncludeConfigurations',
  'escrow.gradleExcludeConfigurations',
  'escrow.gradleIncludeTestConfigurations',
  'escrow.buildTask',
]

describe('fieldDescriptions registry', () => {
  it.each(EXPECTED_KEYS)('has a description for %s', (key) => {
    expect(fieldDescriptions[key], `missing registry entry for "${key}"`).toBeTruthy()
  })

  it('contains only non-empty trimmed strings', () => {
    for (const [key, value] of Object.entries(fieldDescriptions)) {
      expect(typeof value, key).toBe('string')
      expect(value.trim().length, `empty description for "${key}"`).toBeGreaterThan(0)
    }
  })

  it('declares every registry key in EXPECTED_KEYS (no undocumented entries)', () => {
    // Inverse of the per-key check: a key added to the registry without being
    // declared here would otherwise slip through silently.
    expect(Object.keys(fieldDescriptions).sort()).toEqual([...EXPECTED_KEYS].sort())
  })

  it('has no registry keys outside the known section prefixes', () => {
    const allowedPrefix = /^(component|build|jira|vcs|distribution|escrow)\./
    for (const key of Object.keys(fieldDescriptions)) {
      expect(key, `unexpected section prefix in "${key}"`).toMatch(allowedPrefix)
    }
  })
})
