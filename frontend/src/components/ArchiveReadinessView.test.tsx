import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ArchiveReadinessView } from './ArchiveReadinessView'
import type { ArchiveReadinessEntry, ArchiveReadinessResponse } from '../lib/types'

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

function renderView(props: Partial<React.ComponentProps<typeof ArchiveReadinessView>> = {}) {
  return render(
    <ArchiveReadinessView
      isLoading={false}
      isError={false}
      data={undefined}
      onRetry={vi.fn()}
      jiraBaseUrl={undefined}
      {...props}
    />,
  )
}

describe('ArchiveReadinessView — loading and failure', () => {
  it('shows a loading state and renders no entry rows', () => {
    renderView({ isLoading: true })
    expect(screen.getByTestId('archive-readiness-loading')).toBeInTheDocument()
    expect(screen.queryAllByTestId('archive-readiness-entry')).toHaveLength(0)
  })

  it('a failed request renders as a failure, not as empty or passing', () => {
    renderView({ isError: true })
    expect(screen.getByTestId('archive-readiness-request-error')).toBeInTheDocument()
    expect(screen.queryAllByTestId('archive-readiness-entry')).toHaveLength(0)
  })
})

describe('ArchiveReadinessView — entries', () => {
  it('renders every entry in the response, one row per target', () => {
    const data: ArchiveReadinessResponse = {
      ready: false,
      entries: [
        entry({ targetKind: 'JIRA_PROJECT', targetId: 'PROJ', outcome: 'COMPLETED' }),
        entry({ targetKind: 'JIRA_ISSUES', targetId: 'PROJ', outcome: 'COMPLETED' }),
        entry({ targetKind: 'TEAMCITY_PROJECT', targetId: 'tc1', outcome: 'COMPLETED' }),
        entry({ targetKind: 'TEAMCITY_PROJECT', targetId: 'tc2', outcome: 'NOT_COMPLETED' }),
        entry({ targetKind: 'REPOSITORY', targetId: 'repo1', outcome: 'COMPLETED' }),
      ],
    }
    renderView({ data })
    expect(screen.getAllByTestId('archive-readiness-entry')).toHaveLength(5)
    expect(screen.getAllByText('PROJ')).toHaveLength(2)
    expect(screen.getByText('tc1')).toBeInTheDocument()
    expect(screen.getByText('tc2')).toBeInTheDocument()
    expect(screen.getByText('repo1')).toBeInTheDocument()
  })

  it('does not omit a passing entry when another entry blocks', () => {
    const data: ArchiveReadinessResponse = {
      ready: false,
      entries: [
        entry({ targetKind: 'REPOSITORY', targetId: 'repo-ok', outcome: 'COMPLETED' }),
        entry({ targetKind: 'REPOSITORY', targetId: 'repo-bad', outcome: 'NOT_COMPLETED' }),
      ],
    }
    renderView({ data })
    expect(screen.getByText('repo-ok')).toBeInTheDocument()
    expect(screen.getByText('repo-bad')).toBeInTheDocument()
  })

  it('a NOT_COMPLETED repository entry with no reason states it is not archived', () => {
    const data: ArchiveReadinessResponse = {
      ready: false,
      entries: [entry({ targetKind: 'REPOSITORY', targetId: 'repo-bad', outcome: 'NOT_COMPLETED', reason: null })],
    }
    renderView({ data })
    expect(screen.getByText(/repository is not archived/i)).toBeInTheDocument()
  })

  it('a NOT_COMPLETED TeamCity entry and a NOT_COMPLETED repository entry each state their own kind', () => {
    const data: ArchiveReadinessResponse = {
      ready: false,
      entries: [
        entry({ targetKind: 'TEAMCITY_PROJECT', targetId: 'tc1', outcome: 'NOT_COMPLETED', reason: null }),
        entry({ targetKind: 'REPOSITORY', targetId: 'repo1', outcome: 'NOT_COMPLETED', reason: null }),
      ],
    }
    renderView({ data })
    expect(screen.getByText(/teamcity project is not archived/i)).toBeInTheDocument()
    expect(screen.getByText(/repository is not archived/i)).toBeInTheDocument()
  })

  it('shows a supplied reason instead of the derived wording', () => {
    const data: ArchiveReadinessResponse = {
      ready: false,
      entries: [
        entry({
          targetKind: 'REPOSITORY',
          targetId: 'repo1',
          outcome: 'UNKNOWN',
          reason: 'VCS system could not be consulted: timeout',
          reasonKind: 'SYSTEM_UNAVAILABLE',
        }),
      ],
    }
    renderView({ data })
    expect(screen.getByText(/VCS system could not be consulted: timeout/)).toBeInTheDocument()
  })

  it('lists open issues and links each to the issue tracker when configured', () => {
    const data: ArchiveReadinessResponse = {
      ready: false,
      entries: [
        entry({
          targetKind: 'JIRA_ISSUES',
          targetId: 'PROJ',
          outcome: 'NOT_COMPLETED',
          openIssues: [{ key: 'PROJ-1', summary: 'Still open' }],
        }),
      ],
    }
    renderView({ data, jiraBaseUrl: 'https://jira.example.com' })
    const link = screen.getByRole('link', { name: /PROJ-1/ })
    expect(link).toHaveAttribute('href', 'https://jira.example.com/browse/PROJ-1')
    expect(screen.getByText('Still open')).toBeInTheDocument()
  })

  it('lists open issues without links when no base URL is configured', () => {
    const data: ArchiveReadinessResponse = {
      ready: false,
      entries: [
        entry({
          targetKind: 'JIRA_ISSUES',
          targetId: 'PROJ',
          outcome: 'NOT_COMPLETED',
          openIssues: [{ key: 'PROJ-1', summary: 'Still open' }],
        }),
      ],
    }
    renderView({ data, jiraBaseUrl: undefined })
    expect(screen.queryByRole('link', { name: /PROJ-1/ })).toBeNull()
    expect(screen.getByText('PROJ-1')).toBeInTheDocument()
  })
})

describe('ArchiveReadinessView — shared targets', () => {
  it('names the components keeping a shared target in place', () => {
    const data: ArchiveReadinessResponse = {
      ready: true,
      entries: [
        entry({ targetKind: 'TEAMCITY_PROJECT', targetId: 'tc1', outcome: 'COMPLETED', sharedWith: ['comp-a', 'comp-b'] }),
      ],
    }
    renderView({ data })
    expect(screen.getByText(/not required to be archived/i)).toBeInTheDocument()
    expect(screen.getByText(/comp-a/)).toBeInTheDocument()
    expect(screen.getByText(/comp-b/)).toBeInTheDocument()
  })

  it('does not state that the shared target is still live', () => {
    const data: ArchiveReadinessResponse = {
      ready: true,
      entries: [
        entry({ targetKind: 'TEAMCITY_PROJECT', targetId: 'tc1', outcome: 'COMPLETED', sharedWith: ['comp-a'] }),
      ],
    }
    renderView({ data })
    expect(screen.queryByText(/still live/i)).toBeNull()
    expect(screen.queryByText(/still running/i)).toBeNull()
  })

  it('opens with a summary line when two targets were not required to be archived', () => {
    const data: ArchiveReadinessResponse = {
      ready: true,
      entries: [
        entry({ targetKind: 'TEAMCITY_PROJECT', targetId: 'tc1', outcome: 'COMPLETED', sharedWith: ['comp-a'] }),
        entry({ targetKind: 'REPOSITORY', targetId: 'repo1', outcome: 'COMPLETED', sharedWith: ['comp-b'] }),
      ],
    }
    renderView({ data })
    expect(screen.getByTestId('archive-readiness-shared-summary')).toHaveTextContent('2')
  })

  it('shows no summary line for exactly one shared target', () => {
    const data: ArchiveReadinessResponse = {
      ready: true,
      entries: [entry({ targetKind: 'TEAMCITY_PROJECT', targetId: 'tc1', outcome: 'COMPLETED', sharedWith: ['comp-a'] })],
    }
    renderView({ data })
    expect(screen.queryByTestId('archive-readiness-shared-summary')).toBeNull()
  })

  it('shows no summary line when nothing was shared', () => {
    const data: ArchiveReadinessResponse = {
      ready: true,
      entries: [entry({ targetKind: 'TEAMCITY_PROJECT', targetId: 'tc1', outcome: 'COMPLETED', sharedWith: [] })],
    }
    renderView({ data })
    expect(screen.queryByTestId('archive-readiness-shared-summary')).toBeNull()
  })

  it('does not count a passing entry with an empty sharedWith towards the summary', () => {
    const data: ArchiveReadinessResponse = {
      ready: true,
      entries: [
        entry({ targetKind: 'TEAMCITY_PROJECT', targetId: 'tc1', outcome: 'COMPLETED', sharedWith: ['comp-a'] }),
        entry({ targetKind: 'REPOSITORY', targetId: 'repo1', outcome: 'COMPLETED', sharedWith: [] }),
      ],
    }
    renderView({ data })
    expect(screen.queryByTestId('archive-readiness-shared-summary')).toBeNull()
  })

  it('a shared entry reads differently from a plain passing entry', () => {
    const data: ArchiveReadinessResponse = {
      ready: true,
      entries: [
        entry({ targetKind: 'TEAMCITY_PROJECT', targetId: 'tc-shared', outcome: 'COMPLETED', sharedWith: ['comp-a'] }),
        entry({ targetKind: 'REPOSITORY', targetId: 'repo-archived', outcome: 'COMPLETED', sharedWith: [] }),
      ],
    }
    renderView({ data })
    const rows = screen.getAllByTestId('archive-readiness-entry')
    const sharedRow = rows.find((r) => within(r).queryByText('tc-shared'))!
    const archivedRow = rows.find((r) => within(r).queryByText('repo-archived'))!
    expect(within(sharedRow).getByText(/not required to be archived/i)).toBeInTheDocument()
    expect(within(archivedRow).queryByText(/not required to be archived/i)).toBeNull()
  })
})

describe('ArchiveReadinessView — unreadable targets', () => {
  it('an UNKNOWN entry says the check could not be completed, not that the target is unarchived', () => {
    const data: ArchiveReadinessResponse = {
      ready: false,
      entries: [entry({ targetKind: 'REPOSITORY', targetId: 'repo1', outcome: 'UNKNOWN', reasonKind: 'SYSTEM_UNAVAILABLE' })],
    }
    renderView({ data })
    expect(screen.getByText(/could not be completed/i)).toBeInTheDocument()
    expect(screen.queryByText(/repository is not archived/i)).toBeNull()
  })

  it('an UNKNOWN entry and a NOT_COMPLETED entry are distinguishable', () => {
    const data: ArchiveReadinessResponse = {
      ready: false,
      entries: [
        entry({ targetKind: 'REPOSITORY', targetId: 'repo-failed', outcome: 'NOT_COMPLETED' }),
        entry({ targetKind: 'REPOSITORY', targetId: 'repo-unknown', outcome: 'UNKNOWN', reasonKind: 'SYSTEM_UNAVAILABLE' }),
      ],
    }
    renderView({ data })
    const rows = screen.getAllByTestId('archive-readiness-entry')
    const failedRow = rows.find((r) => within(r).queryByText('repo-failed'))!
    const unknownRow = rows.find((r) => within(r).queryByText('repo-unknown'))!
    expect(failedRow.dataset.outcome).not.toBe(unknownRow.dataset.outcome)
  })

  it('SYSTEM_UNAVAILABLE offers a retry control that requests readiness again without closing the view', async () => {
    const onRetry = vi.fn()
    const data: ArchiveReadinessResponse = {
      ready: false,
      entries: [entry({ targetKind: 'REPOSITORY', targetId: 'repo1', outcome: 'UNKNOWN', reasonKind: 'SYSTEM_UNAVAILABLE' })],
    }
    renderView({ data, onRetry })
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /retry/i }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('REGISTRY_DATA states the recorded data needs correcting and offers no retry', () => {
    const data: ArchiveReadinessResponse = {
      ready: false,
      entries: [entry({ targetKind: 'REPOSITORY', targetId: 'repo1', outcome: 'UNKNOWN', reasonKind: 'REGISTRY_DATA', reason: null })],
    }
    renderView({ data })
    expect(screen.getByText(/recorded data needs to be corrected/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull()
  })

  it('NOT_CONFIGURED states the configuration needs fixing and offers no retry', () => {
    const data: ArchiveReadinessResponse = {
      ready: false,
      entries: [entry({ targetKind: 'JIRA_PROJECT', targetId: 'PROJ', outcome: 'UNKNOWN', reasonKind: 'NOT_CONFIGURED', reason: null })],
    }
    renderView({ data })
    expect(screen.getByText(/configuration needs to be fixed/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull()
  })

  it('the three unreadable classifications are distinguishable from each other', () => {
    const data: ArchiveReadinessResponse = {
      ready: false,
      entries: [
        entry({ targetKind: 'REPOSITORY', targetId: 'r1', outcome: 'UNKNOWN', reasonKind: 'SYSTEM_UNAVAILABLE' }),
        entry({ targetKind: 'REPOSITORY', targetId: 'r2', outcome: 'UNKNOWN', reasonKind: 'REGISTRY_DATA' }),
        entry({ targetKind: 'REPOSITORY', targetId: 'r3', outcome: 'UNKNOWN', reasonKind: 'NOT_CONFIGURED' }),
      ],
    }
    renderView({ data })
    const texts = [
      screen.getByText(/can be retried/i).textContent,
      screen.getByText(/recorded data needs to be corrected/i).textContent,
      screen.getByText(/configuration needs to be fixed/i).textContent,
    ]
    expect(new Set(texts).size).toBe(3)
  })
})

describe('ArchiveReadinessView — empty answer', () => {
  it('states that no checks ran when there are no entries', () => {
    renderView({ data: { ready: true, entries: [] } })
    expect(screen.getByTestId('archive-readiness-no-checks')).toBeInTheDocument()
  })

  it('does not render a passing row or imply anything was verified', () => {
    renderView({ data: { ready: true, entries: [] } })
    expect(screen.queryAllByTestId('archive-readiness-entry')).toHaveLength(0)
    expect(screen.queryByText(/passed/i)).toBeNull()
  })
})
