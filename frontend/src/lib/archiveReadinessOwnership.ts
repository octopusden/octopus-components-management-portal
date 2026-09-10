import type { ArchiveReadinessEntry, ArchiveReadinessResponsibility, ArchiveReadinessTargetKind } from './types'

/**
 * The instruction shown on an entry that still owes work.
 *
 * CRS's own reason diagnoses the state ("Repository is not archived: <id>").
 * This is the other half: the step that follows from it. Both are rendered,
 * because a row naming only the state leaves the reader to work out the verb,
 * the system and the step.
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

export interface ResponsibleParty {
  /** Who to name, already resolved for display. */
  name: string
  /** True when the reader is the person named — the row is their own work. */
  isViewer: boolean
}

/**
 * Who to name as responsible, resolved for display.
 *
 * The component owner is named as a person, because the row is one specific
 * person's work and a category label ("Component owner") does not tell a reader
 * whether it is theirs. The F1 team is named collectively — no individual owns
 * archiving infrastructure, so naming one would be wrong.
 *
 * When the reader is the owner, the row says so instead of repeating their own
 * name back at them.
 */
export function responsibleParty(
  r: ArchiveReadinessResponsibility,
  opts: { componentOwner?: string | null; currentUsername?: string | null } = {},
): ResponsibleParty {
  if (r === 'F1_TEAM') return { name: 'F1 team', isViewer: false }

  if (r === 'COMPONENT_OWNER') {
    const owner = opts.componentOwner?.trim()
    if (!owner) return { name: 'the component owner', isViewer: false }
    const viewer = opts.currentUsername?.trim()
    const isViewer = !!viewer && viewer.toLowerCase() === owner.toLowerCase()
    return { name: isViewer ? `you (${owner})` : owner, isViewer }
  }

  // A party this build predates — name it as reported rather than dropping the row's owner.
  return { name: r, isViewer: false }
}
