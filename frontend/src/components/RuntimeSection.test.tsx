import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { RuntimeSection } from './RuntimeSection'
import { useAdminMode } from '@/lib/adminModeStore'
import type { SystemMetrics } from '@/lib/types'

const mockUseCurrentUser = vi.fn()
vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => mockUseCurrentUser(),
}))

const mockRefetch = vi.fn()
const mockUseSystemMetrics = vi.fn()
vi.mock('@/hooks/useSystemMetrics', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useSystemMetrics: (enabled: boolean) => mockUseSystemMetrics(enabled),
}))

vi.mock('@/hooks/useInfo', () => ({
  usePortalInfo: () => ({ data: { name: 'portal', version: '1.2.3' } }),
  useCrsInfo: () => ({ data: { name: 'crs', version: '2.0.88' } }),
}))

const ADMIN_USER = {
  username: 'admin',
  roles: [{ name: 'ADMIN', permissions: ['ACCESS_COMPONENTS', 'IMPORT_DATA'] }],
  groups: [],
}
const VIEWER_USER = {
  username: 'viewer',
  roles: [{ name: 'VIEWER', permissions: ['ACCESS_COMPONENTS'] }],
  groups: [],
}

function fullMetrics(): SystemMetrics {
  return {
    portal: {
      uptimeMillis: 3 * 86_400_000 + 4 * 3_600_000,
      startedAt: '2026-06-24T06:00:00Z',
      processId: 4821,
      javaVersion: '21.0.3',
      jvm: {
        heapUsedBytes: 536_870_912,
        heapCommittedBytes: 805_306_368,
        heapMaxBytes: 1_073_741_824,
        nonHeapUsedBytes: 134_217_728,
        nonHeapCommittedBytes: 150_000_000,
        threadsLive: 42,
        threadsPeak: 55,
        threadsDaemon: 30,
        classesLoaded: 12_345,
        classesTotalLoaded: 13_000,
        classesUnloaded: 655,
        gcCount: 12,
        gcTimeMillis: 500,
        cpuProcess: 0.12,
        cpuSystem: 0.34,
        systemLoadAverage: 2.34,
        availableProcessors: 8,
      },
      recentLogins: [{ username: 'alice', loginAt: '2026-06-27T09:58:00Z' }],
    },
    crs: {
      available: true,
      reason: null,
      status: 'UP',
      uptimeMillis: 2 * 86_400_000,
      jvm: {
        heapUsedBytes: 268_435_456,
        heapMaxBytes: 536_870_912,
        threadsLive: 30,
        threadsPeak: 40,
        gcCount: 8,
        gcTimeMillis: 300,
        cpuProcess: 0.05,
        cpuSystem: 0.2,
        availableProcessors: 4,
      },
    },
  }
}

function query(overrides: Record<string, unknown>) {
  return {
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    isFetching: false,
    dataUpdatedAt: Date.now(),
    refetch: mockRefetch,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  useAdminMode.setState({ enabled: true })
  mockUseCurrentUser.mockReturnValue({ data: ADMIN_USER })
  mockUseSystemMetrics.mockReturnValue(query({ data: fullMetrics() }))
})

describe('RuntimeSection', () => {
  it('renders nothing when admin mode is off and does not poll', () => {
    useAdminMode.setState({ enabled: false })
    render(<RuntimeSection />)
    expect(screen.queryByTestId('runtime-section')).toBeNull()
    expect(mockUseSystemMetrics).toHaveBeenCalledWith(false)
  })

  it('renders nothing for a non-IMPORT_DATA user even in admin mode', () => {
    mockUseCurrentUser.mockReturnValue({ data: VIEWER_USER })
    render(<RuntimeSection />)
    expect(screen.queryByTestId('runtime-section')).toBeNull()
    expect(mockUseSystemMetrics).toHaveBeenCalledWith(false)
  })

  it('Refresh button triggers a refetch', () => {
    render(<RuntimeSection />)
    expect(mockUseSystemMetrics).toHaveBeenCalledWith(true)
    fireEvent.click(screen.getByTestId('runtime-refresh'))
    expect(mockRefetch).toHaveBeenCalledTimes(1)
  })

  it('renders the status summary banner (operational)', () => {
    render(<RuntimeSection />)
    const banner = screen.getByTestId('runtime-summary')
    expect(banner).toHaveAttribute('data-status', 'operational')
    expect(banner.textContent).toContain('All systems operational')
  })

  it('shows degraded status when CRS is UP but JVM unavailable', () => {
    const m = fullMetrics()
    m.crs = { available: false, status: 'UP', reason: 'CRS metrics require authentication' }
    mockUseSystemMetrics.mockReturnValue(query({ data: m }))
    render(<RuntimeSection />)
    expect(screen.getByTestId('runtime-summary')).toHaveAttribute('data-status', 'degraded')
  })

  it('shows down status when CRS is DOWN', () => {
    const m = fullMetrics()
    m.crs = { available: false, status: 'DOWN' }
    mockUseSystemMetrics.mockReturnValue(query({ data: m }))
    render(<RuntimeSection />)
    expect(screen.getByTestId('runtime-summary')).toHaveAttribute('data-status', 'down')
  })

  it('renders the Portal card with PID/JVM/since meta and full readout', () => {
    render(<RuntimeSection />)
    const portal = screen.getByTestId('runtime-portal')
    expect(portal.textContent).toContain('PID 4821')
    expect(portal.textContent).toContain('JDK 21.0.3')
    expect(portal.textContent).toContain('since')
    expect(portal.textContent).toContain('v1.2.3')
    // gauge detail shows BOTH process and system CPU
    expect(portal.textContent).toContain('proc 12% · sys 34%')
    // 6 tiles incl. classes/load/processors
    expect(portal.textContent).toContain('Non-heap')
    expect(portal.textContent).toContain('Classes loaded')
    expect(portal.textContent).toContain('Load average')
    expect(portal.textContent).toContain('Processors')
  })

  it('renders CRS available tiles INCLUDING GC and Processors', () => {
    render(<RuntimeSection />)
    const crs = screen.getByTestId('runtime-crs')
    expect(crs.textContent).toContain('v2.0.88')
    expect(crs.textContent).toContain('UP')
    expect(crs.textContent).toContain('Uptime')
    expect(crs.textContent).toContain('Heap')
    expect(crs.textContent).toContain('Threads')
    expect(crs.textContent).toContain('GC')
    expect(crs.textContent).toContain('CPU')
    expect(crs.textContent).toContain('Processors')
  })

  it('shows the CRS unavailable panel with reason but keeps status + version', () => {
    const m = fullMetrics()
    m.crs = { available: false, status: 'UP', reason: 'CRS metrics require authentication' }
    mockUseSystemMetrics.mockReturnValue(query({ data: m }))
    render(<RuntimeSection />)
    const crs = screen.getByTestId('runtime-crs')
    expect(crs.textContent).toContain('JVM metrics unavailable')
    expect(crs.textContent).toContain('CRS metrics require authentication')
    expect(crs.textContent).toContain('UP') // status pill still shown
    expect(crs.textContent).toContain('v2.0.88') // version still shown
  })

  it('lists recent logins and the per-pod footer note', () => {
    render(<RuntimeSection />)
    const logins = screen.getByTestId('runtime-logins')
    expect(within(logins).getByText('alice')).toBeInTheDocument()
    expect(logins.textContent).toContain('Last 1 · this instance')
    expect(logins.textContent).toContain('resets on restart')
  })

  it('shows an empty state when there are no recent logins', () => {
    const m = fullMetrics()
    m.portal.recentLogins = []
    mockUseSystemMetrics.mockReturnValue(query({ data: m }))
    render(<RuntimeSection />)
    expect(screen.getByTestId('runtime-logins').textContent).toContain('No recent logins')
  })

  it('renders a skeleton while loading', () => {
    mockUseSystemMetrics.mockReturnValue(query({ isLoading: true, data: undefined }))
    render(<RuntimeSection />)
    expect(screen.getByTestId('runtime-loading')).toBeInTheDocument()
  })

  it('renders an error state when the fetch fails', () => {
    mockUseSystemMetrics.mockReturnValue(query({ isError: true, error: new Error('boom'), data: undefined }))
    render(<RuntimeSection />)
    expect(screen.getByText(/Failed to load runtime metrics/)).toBeInTheDocument()
  })
})
