import type { ComponentCreateRequest } from '../types'
import { isBadToken } from '../artifactOwnership'
import { findUnsupportedGroupId } from '../groupValidation'
import { hostOf, isVcsHostSupported } from '../vcsHost'
import { SSH_VCS_URL_REGEX, vcsBlockApplies, type CoordinateType } from './buildCreateRequest'

export interface PortalRuleOptions {
  supportedGroups: readonly string[]
  gitBaseUrl: string | null | undefined
  /** `false` for a caller that already requires the Jira project key and full version format. */
  checkJiraRequired?: boolean
  /** Whether a `component.<field>` is editable; a field that is not is never required. Default: all. */
  editable?: (field: string) => boolean
  /**
   * The coordinate type the creator chose. The wizard sends no Docker image while its name is
   * blank, so the request alone cannot tell "Docker, name missing" from "no coordinate".
   */
  coordinateType?: CoordinateType
  /**
   * Whether the component is explicit and external. A request may omit both flags when field-config
   * locks them, so the wizard passes its own; by default they are read from the request.
   */
  explicitExternal?: boolean
}

/** A Portal-only rule a create request breaks, on its create-request path. */
export interface PortalRuleIssue {
  path: string
  message: string
}

const VCS = 'baseConfiguration.vcsEntries[0]'

function jiraIssues(request: ComponentCreateRequest): PortalRuleIssue[] {
  const jira = request.baseConfiguration?.jira
  const issues: PortalRuleIssue[] = []
  if (!jira?.projectKey?.trim()) {
    issues.push({ path: 'baseConfiguration.jira.projectKey', message: 'Jira Project Key is required' })
  }
  // A component's Jira versions cannot render without a full version format.
  if (!jira?.versionFormat?.trim()) {
    issues.push({ path: 'baseConfiguration.jira.versionFormat', message: 'Full Version Format is required' })
  }
  return issues
}

function ownershipIssues(request: ComponentCreateRequest, supportedGroups: readonly string[]): PortalRuleIssue[] {
  return (request.artifactIds ?? []).flatMap((row, i) => {
    const groupId = row.groupPattern?.trim() ?? ''
    if (!groupId) return []
    const issues: PortalRuleIssue[] = []
    if (isBadToken(groupId)) {
      issues.push({ path: `artifactIds[${i}].groupPattern`, message: `Invalid group "${groupId}" — letters, digits, . _ - only` })
    }
    const unsupported = findUnsupportedGroupId(groupId, supportedGroups)
    if (unsupported) {
      issues.push({
        path: `artifactIds[${i}].groupPattern`,
        message: `Group "${unsupported}" must start with a supported prefix (${supportedGroups.join(', ')})`,
      })
    }
    if (row.mode === 'EXPLICIT' && (row.artifactTokens ?? []).length === 0) {
      issues.push({ path: `artifactIds[${i}].artifactTokens`, message: 'Add at least one artifact, or switch to a catch-all mode' })
    }
    return issues
  })
}

function coordinateTypeOf(request: ComponentCreateRequest): CoordinateType | undefined {
  const base = request.baseConfiguration
  if (base?.mavenArtifacts?.length) return 'maven'
  if (base?.dockerImages?.length) return 'docker'
  if (base?.packages?.length) return 'package'
  return undefined
}

function coordinateIssues(
  request: ComponentCreateRequest,
  supportedGroups: readonly string[],
  chosen: CoordinateType | undefined,
): PortalRuleIssue[] {
  const base = request.baseConfiguration
  const maven = 'baseConfiguration.mavenArtifacts[0]'
  switch (chosen ?? coordinateTypeOf(request)) {
    case 'maven': {
      const groupId = base?.mavenArtifacts?.[0]?.groupPattern?.trim() ?? ''
      const issues: PortalRuleIssue[] = []
      const unsupported = groupId ? findUnsupportedGroupId(groupId, supportedGroups) : undefined
      if (!groupId) {
        issues.push({ path: `${maven}.groupPattern`, message: 'Group ID is required' })
      } else if (unsupported) {
        issues.push({
          path: `${maven}.groupPattern`,
          message: `Group ID "${unsupported}" must start with a supported prefix (${supportedGroups.join(', ')})`,
        })
      }
      if (!base?.mavenArtifacts?.[0]?.artifactPattern?.trim()) {
        issues.push({ path: `${maven}.artifactPattern`, message: 'Artifact ID is required' })
      }
      return issues
    }
    case 'docker':
      return base?.dockerImages?.[0]?.imageName?.trim()
        ? []
        : [{ path: 'baseConfiguration.dockerImages[0].imageName', message: 'Image name is required' }]
    case 'package':
      return base?.packages?.[0]?.packageName?.trim()
        ? []
        : [{ path: 'baseConfiguration.packages[0].packageName', message: 'Package name is required' }]
    case undefined:
      return [
        {
          path: `${maven}.groupPattern`,
          message: 'A Maven, Docker or package coordinate is required for an explicit + external component',
        },
      ]
  }
}

function explicitExternalIssues(request: ComponentCreateRequest, options: PortalRuleOptions): PortalRuleIssue[] {
  const explicitExternal = options.explicitExternal ?? (request.distributionExplicit && request.distributionExternal)
  if (!explicitExternal) return []
  const editable = options.editable ?? (() => true)
  const issues: PortalRuleIssue[] = []
  if (editable('displayName') && !request.displayName?.trim()) {
    issues.push({ path: 'displayName', message: 'Display Name is required for an explicit + external component' })
  }
  if (editable('releaseManager') && !request.releaseManager?.length) {
    issues.push({
      path: 'releaseManager',
      message: 'At least one Release Manager is required for an explicit + external component',
    })
  }
  if (editable('securityChampion') && !request.securityChampion?.length) {
    issues.push({
      path: 'securityChampion',
      message: 'At least one Security Champion is required for an explicit + external component',
    })
  }
  return [...issues, ...coordinateIssues(request, options.supportedGroups, options.coordinateType)]
}

function vcsIssues(request: ComponentCreateRequest, gitBaseUrl: string | null | undefined): PortalRuleIssue[] {
  const base = request.baseConfiguration
  if (!vcsBlockApplies(base?.build?.buildSystem ?? '')) return []
  const vcs = base?.vcsEntries?.[0]
  const issues: PortalRuleIssue[] = []
  const url = vcs?.vcsPath?.trim() ?? ''
  if (!url) {
    issues.push({ path: `${VCS}.vcsPath`, message: 'VCS Path is required for this build system' })
  } else if (!SSH_VCS_URL_REGEX.test(url)) {
    issues.push({ path: `${VCS}.vcsPath`, message: 'VCS Path must be an ssh:// URL, e.g. ssh://git@host/path/repo.git' })
  } else if (!isVcsHostSupported(url, gitBaseUrl)) {
    issues.push({ path: `${VCS}.vcsPath`, message: `VCS host must be ${hostOf(gitBaseUrl)} (the ecosystem Bitbucket)` })
  }
  if (!vcs?.tag?.trim()) issues.push({ path: `${VCS}.tag`, message: 'Tag is required' })
  if (!vcs?.branch?.trim()) issues.push({ path: `${VCS}.branch`, message: 'Production branch is required' })
  return issues
}

/**
 * The create rules only the Portal enforces — the registry accepts a request that breaks them —
 * checked on a create request, each on its create-request path.
 *
 * One rule set for every create path: the regular wizard maps each path to its form field, and
 * template review attributes it to the parameters the dry run says the field came from. Rules the
 * registry enforces itself are not repeated here.
 */
export function portalCreateRules(request: ComponentCreateRequest, options: PortalRuleOptions): PortalRuleIssue[] {
  return [
    ...(options.checkJiraRequired === false ? [] : jiraIssues(request)),
    ...vcsIssues(request, options.gitBaseUrl),
    ...ownershipIssues(request, options.supportedGroups),
    ...explicitExternalIssues(request, options),
  ]
}
