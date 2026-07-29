import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ServiceEventsPanel } from './ServiceEventsPanel'
import { useServiceEvents } from '@/hooks/useServiceEvents'
import type { Page, ServiceEvent } from '@/lib/types'

vi.mock('@/hooks/useServiceEvents', () => ({ useServiceEvents: vi.fn() }))
const mockHook = vi.mocked(useServiceEvents)

function page(content: ServiceEvent[]): Page<ServiceEvent> {
  return { content, totalElements: content.length, totalPages: 1, number: 0, size: 20, first: true, last: true }
}

function hookResult(data: Page<ServiceEvent>) {
  return {
    data,
    isLoading: false,
    isError: false,
    error: null,
    isFetching: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useServiceEvents>
}

const event: ServiceEvent = {
  id: 1,
  eventType: 'TEAMCITY_RESYNC',
  status: 'FAILED',
  source: 'crs',
  triggeredBy: 'alice',
  serviceVersion: null,
  correlationId: 'job-1',
  summary: 'TeamCity resync failed',
  detail: { errorMessage: 'boom' },
  startedAt: '2026-07-06T10:00:00Z',
  finishedAt: '2026-07-06T10:00:05Z',
}

beforeEach(() => vi.clearAllMocks())

describe('ServiceEventsPanel', () => {
  it('renders an event row with its type, status and summary', () => {
    mockHook.mockReturnValue(hookResult(page([event])))
    render(<ServiceEventsPanel />)
    // Scope to table cells — the same literals also appear in the filter <select> options.
    expect(screen.getByRole('cell', { name: 'TEAMCITY_RESYNC' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'FAILED' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'TeamCity resync failed' })).toBeInTheDocument()
  })

  it('includes TEAMCITY_VALIDATION as a selectable Type filter option', () => {
    mockHook.mockReturnValue(hookResult(page([event])))
    render(<ServiceEventsPanel />)
    expect(
      screen.getByRole('option', { name: 'TEAMCITY_VALIDATION' }),
    ).toBeInTheDocument()
  })

  it('shows an empty state when there are no events', () => {
    mockHook.mockReturnValue(hookResult(page([])))
    render(<ServiceEventsPanel />)
    expect(screen.getByText(/No service events recorded/i)).toBeInTheDocument()
  })

  it('switches to the Usage view showing view stats and viewers', async () => {
    const view: ServiceEvent = {
      ...event,
      id: 9,
      eventType: 'ONBOARDING_VIDEO_VIEW',
      category: 'USER',
      status: 'COMPLETED',
      source: 'portal',
      triggeredBy: 'alice',
      summary: 'watched onboarding video',
      detail: null,
    }
    mockHook.mockReturnValue(hookResult(page([view])))
    const user = userEvent.setup()
    render(<ServiceEventsPanel />)

    await user.click(screen.getByRole('tab', { name: /usage/i }))

    expect(screen.getByTestId('events-usage-view')).toBeInTheDocument()
    expect(screen.getByText('Total views')).toBeInTheDocument()
    expect(screen.getByText('Distinct viewers')).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'alice' })).toBeInTheDocument()
    // Operational columns (Status/Version) are not part of the usage view.
    expect(screen.queryByText('Version')).not.toBeInTheDocument()
    // Not truncated (totalElements == rows) → exact distinct label.
    expect(screen.getByText('Distinct viewers')).toBeInTheDocument()
  })

  it('labels Distinct viewers as a floor when the usage set exceeds one page', async () => {
    const view: ServiceEvent = {
      ...event,
      id: 9,
      eventType: 'ONBOARDING_VIDEO_VIEW',
      category: 'USER',
      triggeredBy: 'alice',
      detail: null,
    }
    // 250 total views but only one page loaded → distinct is a lower bound over the latest page.
    mockHook.mockReturnValue(
      hookResult({ content: [view], totalElements: 250, totalPages: 2, number: 0, size: 200, first: true, last: false }),
    )
    const user = userEvent.setup()
    render(<ServiceEventsPanel />)
    await user.click(screen.getByRole('tab', { name: /usage/i }))

    expect(screen.getByText(/Distinct viewers \(latest 200\)/)).toBeInTheDocument()
    expect(screen.getByText('1+')).toBeInTheDocument()
  })
})
