import type { ComponentCreateRequest } from '../types'
import { isBadToken } from '../artifactOwnership'
import { findUnsupportedGroupId } from '../groupValidation'
import { hostOf, isVcsHostSupported } from '../vcsHost'
import { SSH_VCS_URL_REGEX, vcsBlockApplies } from './buildCreateRequest'

export interface PortalRuleOptions {
  supportedGroups: readonly string[]
  gitBaseUrl: string | null | undefined
  /** `false` for a caller that already requires the Jira project key and full version format. */
  checkJiraRequired?: boolean
  /** Whether a `component.<field>` is editable; a field that is not is never required. Default: all. */
  editable?: (field: string) => boolean
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

/** CRS rule #6 mirror: an explicit+external component needs ≥1 distribution row. */
export const COORDINATE_REQUIRED_MESSAGE =
  'At least one distribution (Maven, Docker, package or generic) is required for an explicit + external component'

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

/**
 * The maven groupId supported-prefix rule (CRS rule #10) — checked for EVERY row
 * the request sends, regardless of the explicit+external classification (the
 * registry validates every submitted groupPattern the same way).
 */
function mavenPrefixIssues(request: ComponentCreateRequest, supportedGroups: readonly string[]): PortalRuleIssue[] {
  return (request.baseConfiguration?.mavenArtifacts ?? []).flatMap((row, i) => {
    const groupId = row.groupPattern?.trim() ?? ''
    const unsupported = groupId ? findUnsupportedGroupId(groupId, supportedGroups) : undefined
    return unsupported
      ? [
          {
            path: `baseConfiguration.mavenArtifacts[${i}].groupPattern`,
            message: `Group ID "${unsupported}" must start with a supported prefix (${supportedGroups.join(', ')})`,
          },
        ]
      : []
  })
}

/** The rows a request carries across all distribution families. */
function hasDistributionRow(request: ComponentCreateRequest): boolean {
  const base = request.baseConfiguration
  return (
    !!base?.mavenArtifacts?.length ||
    !!base?.dockerImages?.length ||
    !!base?.packages?.length ||
    !!base?.genericArtifacts?.length
  )
}

function explicitExternalIssues(request: ComponentCreateRequest, options: PortalRuleOptions): PortalRuleIssue[] {
  const explicitExternal = options.explicitExternal ?? (request.distributionExplicit && request.distributionExternal)
  const issues: PortalRuleIssue[] = []
  if (explicitExternal) {
    const editable = options.editable ?? (() => true)
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
    // CRS rule #6: at least one distribution row of any family. The path keeps
    // the registry's [0]-row convention so template Review maps it to a row.
    if (!hasDistributionRow(request)) {
      issues.push({ path: 'baseConfiguration.mavenArtifacts[0].groupPattern', message: COORDINATE_REQUIRED_MESSAGE })
    }
  }
  return [...issues, ...mavenPrefixIssues(request, options.supportedGroups)]
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
