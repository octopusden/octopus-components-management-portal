import type { ArchiveReadinessEntry, ArchiveReadinessResponsibility, ArchiveReadinessTargetKind } from './types'

/**
 * The instruction shown on an entry that still owes work.
 *
 * CRS sends no prose on a NOT_COMPLETED entry, so Portal writes the sentence
 * either way — this writes the useful one. A row naming only the state ("this
 * repository is not archived") leaves the reader to work out the verb, the
 * system and the step; a row naming the work does not.
 */
export function actionFor(kind: ArchiveReadinessTargetKind): string {
  switch (kind) {
    case 'REPOSITORY':
      return 'Archive this repository in the VCS.'
    case 'TEAMCITY_PROJECT':
      return 'Archive this project in TeamCity.'
    case 'JIRA_PROJECT':
      return 'Move this project into the retired category in the issue tracker.'
    case 'JIRA_ISSUES':
      return 'Close the issues listed below.'
  }
}

/**
 * Who owns that work.
 *
 * Derived, not reported: CRS's entry has no responsibility field today. The rule
 * is fixed — only a component's own people can judge whether one of its issues
 * may be closed, so open issues are theirs; every other target is infrastructure
 * the platform team administers, and so is anything unreadable, whatever kind it
 * sits on.
 *
 * Null on COMPLETED, where nothing is owed.
 */
export function responsibilityFor(entry: ArchiveReadinessEntry): ArchiveReadinessResponsibility | null {
  if (entry.outcome === 'COMPLETED') return null
  if (entry.outcome === 'UNKNOWN') return 'F1_TEAM'
  return entry.targetKind === 'JIRA_ISSUES' ? 'COMPONENT_OWNER' : 'F1_TEAM'
}

/** Label for the responsibility badge. Unrecognised values are shown as reported rather than dropped. */
export function responsibilityLabel(r: ArchiveReadinessResponsibility): string {
  switch (r) {
    case 'COMPONENT_OWNER':
      return 'Component owner'
    case 'F1_TEAM':
      return 'F1 team'
    default:
      return r
  }
}
