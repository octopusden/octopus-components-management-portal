import { describe, it, expect } from 'vitest'
import { actionFor, responsibilityFor, responsibleParty } from './archiveReadinessOwnership'
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

describe('responsibleParty', () => {
  it('names the F1 team collectively — no individual owns archiving infrastructure', () => {
    expect(responsibleParty('F1_TEAM', { componentOwner: 'jdoe', currentUsername: 'jdoe' })).toEqual({
      name: 'F1 team',
      isViewer: false,
    })
  })

  it('names the component owner as a person, so the reader can tell whose work it is', () => {
    expect(responsibleParty('COMPONENT_OWNER', { componentOwner: 'jdoe' })).toEqual({
      name: 'jdoe',
      isViewer: false,
    })
  })

  it('tells the reader when the work is their own instead of naming them back', () => {
    const p = responsibleParty('COMPONENT_OWNER', { componentOwner: 'jdoe', currentUsername: 'jdoe' })
    expect(p.isViewer).toBe(true)
    expect(p.name).toMatch(/^you /)
  })

  it('matches the reader against the owner case-insensitively', () => {
    expect(responsibleParty('COMPONENT_OWNER', { componentOwner: 'JDoe', currentUsername: 'jdoe' }).isViewer).toBe(true)
  })

  it('falls back to the role when the component records no owner', () => {
    expect(responsibleParty('COMPONENT_OWNER', { componentOwner: null }).name).toBe('the component owner')
    expect(responsibleParty('COMPONENT_OWNER', { componentOwner: '  ' }).name).toBe('the component owner')
  })

  it('does not claim the row is the reader when nobody is signed in', () => {
    expect(responsibleParty('COMPONENT_OWNER', { componentOwner: 'jdoe', currentUsername: null }).isViewer).toBe(false)
  })

  it('names an unrecognised party as reported rather than dropping it', () => {
    // Guards CRS starting to report a party this build predates.
    expect(responsibleParty('SOMETHING_NEW' as never).name).toBe('SOMETHING_NEW')
  })
})
