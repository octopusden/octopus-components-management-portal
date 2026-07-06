import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
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

  it('shows an empty state when there are no events', () => {
    mockHook.mockReturnValue(hookResult(page([])))
    render(<ServiceEventsPanel />)
    expect(screen.getByText(/No service events recorded/i)).toBeInTheDocument()
  })
})
