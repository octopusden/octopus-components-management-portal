import { describe, it, expect } from 'vitest'
import {
  targetKindLabel,
  failedReasonFor,
  unknownWordingFor,
  sharedTargetCount,
  issueTrackerUrl,
} from './archiveReadiness'
import type { ArchiveReadinessEntry } from './types'

function entry(overrides: Partial<ArchiveReadinessEntry>): ArchiveReadinessEntry {
  return {
    targetKind: 'REPOSITORY',
    targetId: 'https://example.com/repo.git',
    targetUrl: null,
    outcome: 'COMPLETED',
    reason: null,
    reasonKind: null,
    sharedWith: [],
    openIssues: [],
    ...overrides,
  }
}

describe('targetKindLabel / failedReasonFor', () => {
  it('covers all four target kinds distinctly', () => {
    const kinds = ['REPOSITORY', 'TEAMCITY_PROJECT', 'JIRA_PROJECT', 'JIRA_ISSUES'] as const
    const labels = kinds.map(targetKindLabel)
    const reasons = kinds.map(failedReasonFor)
    expect(new Set(labels).size).toBe(4)
    expect(new Set(reasons).size).toBe(4)
  })
})

describe('unknownWordingFor', () => {
  it('SYSTEM_UNAVAILABLE is worded as retryable', () => {
    expect(unknownWordingFor('SYSTEM_UNAVAILABLE').retryable).toBe(true)
  })

  it('REGISTRY_DATA is worded as not retryable and names the remedy', () => {
    const w = unknownWordingFor('REGISTRY_DATA')
    expect(w.retryable).toBe(false)
    expect(w.message).toMatch(/recorded data/i)
  })

  it('NOT_CONFIGURED is worded as not retryable and names the remedy', () => {
    const w = unknownWordingFor('NOT_CONFIGURED')
    expect(w.retryable).toBe(false)
    expect(w.message).toMatch(/configuration/i)
  })

  it('null reasonKind defaults to the retryable wording', () => {
    expect(unknownWordingFor(null).retryable).toBe(true)
  })
})

describe('sharedTargetCount', () => {
  it('counts only COMPLETED entries with a non-empty sharedWith', () => {
    const entries = [
      entry({ outcome: 'COMPLETED', sharedWith: ['other-a'] }),
      entry({ outcome: 'COMPLETED', sharedWith: [] }),
      entry({ outcome: 'NOT_COMPLETED', sharedWith: [] }),
      entry({ outcome: 'COMPLETED', sharedWith: ['other-b'] }),
    ]
    expect(sharedTargetCount(entries)).toBe(2)
  })

  it('is zero when nothing was shared', () => {
    expect(sharedTargetCount([entry({ outcome: 'COMPLETED', sharedWith: [] })])).toBe(0)
  })
})

describe('issueTrackerUrl', () => {
  it('builds a /browse/{key} link when a base URL is configured', () => {
    expect(issueTrackerUrl('https://jira.example.com', 'PROJ-1')).toBe(
      'https://jira.example.com/browse/PROJ-1',
    )
  })

  it('is null when no base URL is configured', () => {
    expect(issueTrackerUrl(undefined, 'PROJ-1')).toBeNull()
  })
})
