import type {
  ArchiveReadinessEntry,
  ArchiveReadinessReasonKind,
  ArchiveReadinessTargetKind,
} from './types'

/** Display label for a target kind, used to name each row in the readiness view. */
export function targetKindLabel(kind: ArchiveReadinessTargetKind): string {
  switch (kind) {
    case 'REPOSITORY':
      return 'Repository'
    case 'TEAMCITY_PROJECT':
      return 'TeamCity project'
    case 'JIRA_PROJECT':
      return 'Issue-tracker project'
    case 'JIRA_ISSUES':
      return 'Open issues'
  }
}

/**
 * Portal-authored wording for a NOT_COMPLETED entry. CRS gives outcome + targetKind
 * with no prose for outstanding work (design.md decision 3) — this is the
 * only place that sentence is written.
 */
export function failedReasonFor(kind: ArchiveReadinessTargetKind): string {
  switch (kind) {
    case 'REPOSITORY':
      return 'This repository is not archived.'
    case 'TEAMCITY_PROJECT':
      return 'This TeamCity project is not archived.'
    case 'JIRA_PROJECT':
      return 'This issue-tracker project is not retired.'
    case 'JIRA_ISSUES':
      return 'This component has open issues against it.'
  }
}

export interface UnknownWording {
  message: string
  /** Whether retrying the check can change the answer (design.md decision 4). */
  retryable: boolean
}

/**
 * Portal-authored wording for an UNKNOWN entry, keyed on CRS's `reasonKind`.
 * Only SYSTEM_UNAVAILABLE is worth retrying — REGISTRY_DATA and
 * NOT_CONFIGURED never resolve by retrying, so retry is not offered for them.
 */
export function unknownWordingFor(reasonKind: ArchiveReadinessReasonKind | null): UnknownWording {
  switch (reasonKind) {
    case 'REGISTRY_DATA':
      return {
        message: "The check could not be completed. This component's recorded data needs to be corrected.",
        retryable: false,
      }
    case 'NOT_CONFIGURED':
      return {
        message: 'The check could not be completed. A registry configuration needs to be fixed before this can be checked.',
        retryable: false,
      }
    case 'SYSTEM_UNAVAILABLE':
    default:
      return {
        message: 'The check could not be completed. This can be retried.',
        retryable: true,
      }
  }
}

/** Number of COMPLETED entries whose target was not required to be archived because a live component shares it. */
export function sharedTargetCount(entries: ArchiveReadinessEntry[]): number {
  return entries.filter((e) => e.outcome === 'COMPLETED' && e.sharedWith.length > 0).length
}

/**
 * Link to an open issue. CRS supplies no URL on `ArchiveReadinessOpenIssue` —
 * Portal builds it the same way AuditLogTable / ComponentTable do, from the
 * configured issue-tracker base URL. Null when unconfigured — callers must
 * still list the issue, without a link.
 */
export function issueTrackerUrl(jiraBaseUrl: string | undefined, issueKey: string): string | null {
  return jiraBaseUrl ? `${jiraBaseUrl}/browse/${issueKey}` : null
}
