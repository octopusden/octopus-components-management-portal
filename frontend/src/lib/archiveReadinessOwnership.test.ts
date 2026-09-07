import { describe, it, expect } from 'vitest'
import { actionFor, responsibilityFor, responsibilityLabel } from './archiveReadinessOwnership'
import type { ArchiveReadinessEntry, ArchiveReadinessTargetKind } from './types'

function entry(overrides: Partial<ArchiveReadinessEntry> = {}): ArchiveReadinessEntry {
  return {
    targetKind: 'REPOSITORY',
    targetId: 'ssh://git@example/x/y.git',
    outcome: 'NOT_COMPLETED',
    reason: null,
    reasonKind: null,
    sharedWith: [],
    openIssues: [],
    ...overrides,
  }
}

const KINDS = ['REPOSITORY', 'TEAMCITY_PROJECT', 'JIRA_PROJECT', 'JIRA_ISSUES'] as const

describe('actionFor', () => {
  it('gives a distinct instruction for every target kind', () => {
    expect(new Set(KINDS.map(actionFor)).size).toBe(4)
  })

  it('phrases each one as work to do, not a state to observe', () => {
    // The whole point of the rewording: a verb the reader can act on.
    for (const kind of KINDS) {
      expect(actionFor(kind)).toMatch(/^(Archive|Move|Close)\b/)
    }
  })

  it('names the system for an infrastructure target', () => {
    expect(actionFor('REPOSITORY')).toContain('VCS')
    expect(actionFor('TEAMCITY_PROJECT')).toContain('TeamCity')
  })
})

describe('responsibilityFor', () => {
  it('gives open issues to the component owner', () => {
    expect(responsibilityFor(entry({ targetKind: 'JIRA_ISSUES' }))).toBe('COMPONENT_OWNER')
  })

  it('gives every other outstanding target to the platform team', () => {
    for (const kind of KINDS.filter((k) => k !== 'JIRA_ISSUES')) {
      expect(responsibilityFor(entry({ targetKind: kind as ArchiveReadinessTargetKind }))).toBe('F1_TEAM')
    }
  })

  it('gives anything unreadable to the platform team, whatever kind it sits on', () => {
    for (const kind of KINDS) {
      const e = entry({ targetKind: kind as ArchiveReadinessTargetKind, outcome: 'UNKNOWN' })
      expect(responsibilityFor(e)).toBe('F1_TEAM')
    }
  })

  it('owes nobody when the entry is completed', () => {
    for (const kind of KINDS) {
      const e = entry({ targetKind: kind as ArchiveReadinessTargetKind, outcome: 'COMPLETED' })
      expect(responsibilityFor(e)).toBeNull()
    }
  })
})

describe('responsibilityLabel', () => {
  it('labels the two parties distinctly', () => {
    expect(responsibilityLabel('COMPONENT_OWNER')).not.toBe(responsibilityLabel('F1_TEAM'))
  })

  it('shows an unrecognised party as reported rather than dropping it', () => {
    // Guards the case where CRS starts reporting responsibility with a value Portal predates.
    expect(responsibilityLabel('SOMETHING_NEW' as never)).toBe('SOMETHING_NEW')
  })
})
