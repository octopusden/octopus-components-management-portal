import { describe, expect, it } from 'vitest'
import type { components } from './api/schema'
import { fieldDescriptions } from './fieldDescriptions'

/**
 * #82 reconciliation guard (narrowed form): the field-help PROSE stays hand-authored in
 * `fieldDescriptions.ts`, but its KEYS are reconciled against the CRS v4 OpenAPI contract —
 * here, the generated `api/schema.d.ts` types (produced by CRS TD-003 and vendored as
 * `api/v4.json`). If CRS renames or removes a v4 field, the `[type, prop]` mapping below stops
 * satisfying `keyof` that generated schema type and **`npm run typecheck` fails** — so a tooltip
 * can't silently point at a dead field, the drift ADR-012 / TD-003 set out to prevent.
 *
 * Two layers:
 *  - compile time (`satisfies SchemaProp`): every mapped `prop` must exist on the named generated
 *    schema type. This is the field-rename/removal guard, enforced by `tsc --noEmit`.
 *  - run time (the vitest cases): the key set of `fieldDescriptions` and `KEY_TO_SCHEMA` must match
 *    exactly, so a NEW help key can't skip reconciliation and a stale mapping can't linger.
 *
 * Separate from `fieldDescriptions.test.ts` (which enforces the `EXPECTED_KEYS` completeness
 * invariant) — the two concerns stay in their own files.
 *
 * The mapping is explicit because the UI's `section.field` dotted keys do NOT match the schema
 * property names 1:1 — e.g. `distribution.package.type` → `PackageResponse.packageType`,
 * `jira.displayName` → the per-component `ComponentDetailResponse.jiraDisplayName` scalar,
 * `build.requiredTools` → the `ComponentConfigurationResponse.requiredTools` marker list,
 * `component.groupId` → `ComponentGroupResponse.groupKey`.
 */

type Schemas = components['schemas']
// A [schemaType, property] pair where `property` is constrained to an actual key of that
// generated schema type. A wrong/removed property name fails to satisfy this and errors in tsc.
type SchemaProp = { [T in keyof Schemas]: readonly [T, keyof Schemas[T] & string] }[keyof Schemas]

const KEY_TO_SCHEMA = {
  // ── component.* → ComponentDetailResponse scalars/collections ──
  'component.name': ['ComponentDetailResponse', 'name'],
  'component.displayName': ['ComponentDetailResponse', 'displayName'],
  'component.parentComponentName': ['ComponentDetailResponse', 'parentComponentName'],
  'component.canBeParent': ['ComponentDetailResponse', 'canBeParent'],
  // UI "Group Key" documents aggregator-group membership; the backing field is group.groupKey.
  'component.groupId': ['ComponentGroupResponse', 'groupKey'],
  'component.solution': ['ComponentDetailResponse', 'solution'],
  'component.componentOwner': ['ComponentDetailResponse', 'componentOwner'],
  'component.releaseManager': ['ComponentDetailResponse', 'releaseManager'],
  'component.securityChampion': ['ComponentDetailResponse', 'securityChampion'],
  'component.system': ['ComponentDetailResponse', 'system'],
  'component.clientCode': ['ComponentDetailResponse', 'clientCode'],
  'component.copyright': ['ComponentDetailResponse', 'copyright'],
  'component.labels': ['ComponentDetailResponse', 'labels'],
  'component.docs': ['ComponentDetailResponse', 'docs'],
  'component.artifactIds': ['ComponentDetailResponse', 'artifactIds'],
  'component.releasesInDefaultBranch': ['ComponentDetailResponse', 'releasesInDefaultBranch'],
  'component.distributionExplicit': ['ComponentDetailResponse', 'distributionExplicit'],
  'component.distributionExternal': ['ComponentDetailResponse', 'distributionExternal'],
  'component.productType': ['ComponentDetailResponse', 'productType'],

  // ── jira.* → JiraAspectResponse (per-range aspect) — except displayName (per-component scalar) ──
  'jira.projectKey': ['JiraAspectResponse', 'projectKey'],
  'jira.displayName': ['ComponentDetailResponse', 'jiraDisplayName'],
  'jira.technical': ['JiraAspectResponse', 'technical'],
  'jira.hotfixVersionFormat': ['JiraAspectResponse', 'hotfixVersionFormat'],
  'jira.versionPrefix': ['JiraAspectResponse', 'versionPrefix'],
  'jira.minorVersionFormat': ['JiraAspectResponse', 'minorVersionFormat'],
  'jira.releaseVersionFormat': ['JiraAspectResponse', 'releaseVersionFormat'],
  'jira.buildVersionFormat': ['JiraAspectResponse', 'buildVersionFormat'],
  'jira.lineVersionFormat': ['JiraAspectResponse', 'lineVersionFormat'],
  'jira.versionFormat': ['JiraAspectResponse', 'versionFormat'],

  // ── build.* → BuildAspectResponse — except requiredTools (marker collection on the config row) ──
  'build.buildSystem': ['BuildAspectResponse', 'buildSystem'],
  'build.buildFilePath': ['BuildAspectResponse', 'buildFilePath'],
  'build.javaVersion': ['BuildAspectResponse', 'javaVersion'],
  'build.mavenVersion': ['BuildAspectResponse', 'mavenVersion'],
  'build.gradleVersion': ['BuildAspectResponse', 'gradleVersion'],
  'build.projectVersion': ['BuildAspectResponse', 'projectVersion'],
  'build.buildTasks': ['BuildAspectResponse', 'buildTasks'],
  'build.systemProperties': ['BuildAspectResponse', 'systemProperties'],
  'build.deprecated': ['BuildAspectResponse', 'deprecated'],
  'build.requiredProject': ['BuildAspectResponse', 'requiredProject'],
  'build.requiredTools': ['ComponentConfigurationResponse', 'requiredTools'],

  // ── vcs.* → VcsEntryResponse — except externalRegistry (per-component scalar) + entries (collection) ──
  'vcs.externalRegistry': ['ComponentDetailResponse', 'vcsExternalRegistry'],
  'vcs.entries': ['ComponentConfigurationResponse', 'vcsEntries'],
  'vcs.name': ['VcsEntryResponse', 'name'],
  'vcs.vcsPath': ['VcsEntryResponse', 'vcsPath'],
  'vcs.repositoryType': ['VcsEntryResponse', 'repositoryType'],
  'vcs.branch': ['VcsEntryResponse', 'branch'],
  'vcs.tag': ['VcsEntryResponse', 'tag'],
  'vcs.hotfixBranch': ['VcsEntryResponse', 'hotfixBranch'],

  // ── distribution.* — collection-level keys point at the list property; row keys at the child DTO ──
  'distribution.mavenArtifacts': ['ComponentConfigurationResponse', 'mavenArtifacts'],
  'distribution.fileUrlArtifacts': ['ComponentConfigurationResponse', 'fileUrlArtifacts'],
  'distribution.dockerImages': ['ComponentConfigurationResponse', 'dockerImages'],
  'distribution.packages': ['ComponentConfigurationResponse', 'packages'],
  'distribution.securityGroups': ['ComponentDetailResponse', 'securityGroups'],
  'distribution.maven.groupPattern': ['MavenArtifactResponse', 'groupPattern'],
  'distribution.maven.artifactPattern': ['MavenArtifactResponse', 'artifactPattern'],
  'distribution.maven.extension': ['MavenArtifactResponse', 'extension'],
  'distribution.maven.classifier': ['MavenArtifactResponse', 'classifier'],
  'distribution.fileUrl.url': ['FileUrlArtifactResponse', 'url'],
  'distribution.fileUrl.artifactId': ['FileUrlArtifactResponse', 'artifactId'],
  'distribution.fileUrl.classifier': ['FileUrlArtifactResponse', 'classifier'],
  'distribution.docker.imageName': ['DockerImageResponse', 'imageName'],
  'distribution.docker.flavor': ['DockerImageResponse', 'flavor'],
  'distribution.package.type': ['PackageResponse', 'packageType'],
  'distribution.package.name': ['PackageResponse', 'packageName'],
  'distribution.securityGroup.type': ['SecurityGroupResponse', 'groupType'],
  'distribution.securityGroup.name': ['SecurityGroupResponse', 'groupName'],

  // ── escrow.* → EscrowAspectResponse ──
  'escrow.generation': ['EscrowAspectResponse', 'generation'],
  'escrow.diskSpace': ['EscrowAspectResponse', 'diskSpace'],
  'escrow.reusable': ['EscrowAspectResponse', 'reusable'],
  'escrow.providedDependencies': ['EscrowAspectResponse', 'providedDependencies'],
  'escrow.additionalSources': ['EscrowAspectResponse', 'additionalSources'],
  'escrow.gradleIncludeConfigurations': ['EscrowAspectResponse', 'gradleIncludeConfigurations'],
  'escrow.gradleExcludeConfigurations': ['EscrowAspectResponse', 'gradleExcludeConfigurations'],
  'escrow.gradleIncludeTestConfigurations': ['EscrowAspectResponse', 'gradleIncludeTestConfigurations'],
  'escrow.buildTask': ['EscrowAspectResponse', 'buildTask'],
} as const satisfies Record<string, SchemaProp>

describe('fieldDescriptions ↔ CRS v4 schema reconciliation (#82)', () => {
  it('every help-text key is mapped to a schema target (no key skips reconciliation)', () => {
    const unmapped = Object.keys(fieldDescriptions).filter((k) => !(k in KEY_TO_SCHEMA))
    expect(unmapped, 'add these fieldDescriptions keys to KEY_TO_SCHEMA').toEqual([])
  })

  it('no stale mappings (every mapped key still has help text)', () => {
    const stale = Object.keys(KEY_TO_SCHEMA).filter((k) => !(k in fieldDescriptions))
    expect(stale, 'remove these stale KEY_TO_SCHEMA entries').toEqual([])
  })

  // The "every mapped property exists on the generated schema type" guarantee is enforced at
  // COMPILE TIME by `satisfies SchemaProp` above (run `npm run typecheck`). This case documents
  // that and keeps the suite meaningful at runtime.
  it('has a mapping for every documented field', () => {
    expect(Object.keys(KEY_TO_SCHEMA).length).toBe(Object.keys(fieldDescriptions).length)
  })
})
