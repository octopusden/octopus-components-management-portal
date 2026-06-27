import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { RuntimeSection } from './RuntimeSection'
import { useAdminMode } from '@/lib/adminModeStore'
import type { SystemMetrics } from '@/lib/types'

const mockUseCurrentUser = vi.fn()
vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => mockUseCurrentUser(),
}))

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
  return { data: undefined, isLoading: false, isError: false, error: null, dataUpdatedAt: Date.now(), ...overrides }
}

beforeEach(() => {
  vi.clearAllMocks()
  useAdminMode.setState({ enabled: true })
  mockUseCurrentUser.mockReturnValue({ data: ADMIN_USER })
  mockUseSystemMetrics.mockReturnValue(query({ data: fullMetrics() }))
})

describe('RuntimeSection', () => {
  it('renders nothing when admin mode is off', () => {
    useAdminMode.setState({ enabled: false })
    render(<RuntimeSection />)
    expect(screen.queryByTestId('runtime-section')).toBeNull()
    // and it must not poll when hidden
    expect(mockUseSystemMetrics).toHaveBeenCalledWith(false)
  })

  it('renders nothing for a user without IMPORT_DATA even in admin mode', () => {
    mockUseCurrentUser.mockReturnValue({ data: VIEWER_USER })
    render(<RuntimeSection />)
    expect(screen.queryByTestId('runtime-section')).toBeNull()
    expect(mockUseSystemMetrics).toHaveBeenCalledWith(false)
  })

  it('renders the full portal readout for an admin', () => {
    render(<RuntimeSection />)
    expect(mockUseSystemMetrics).toHaveBeenCalledWith(true)
    const portal = screen.getByTestId('runtime-portal')
    expect(portal.textContent).toContain('3d 4h 0m')
    expect(portal.textContent).toContain('512 MiB / 1.00 GiB')
    expect(portal.textContent).toContain('42 (peak 55, daemon 30)')
    expect(portal.textContent).toContain('v1.2.3')
  })

  it('renders the CRS subset when available', () => {
    render(<RuntimeSection />)
    const crs = screen.getByTestId('runtime-crs')
    expect(crs.textContent).toContain('UP')
    expect(crs.textContent).toContain('2d 0h 0m')
    expect(crs.textContent).toContain('v2.0.88')
  })

  it('shows the CRS reason when metrics are unavailable but keeps status', () => {
    const metrics = fullMetrics()
    metrics.crs = { available: false, reason: 'CRS metrics require authentication', status: 'UP' }
    mockUseSystemMetrics.mockReturnValue(query({ data: metrics }))
    render(<RuntimeSection />)
    const crs = screen.getByTestId('runtime-crs')
    expect(crs.textContent).toContain('UP')
    expect(crs.textContent).toContain('CRS metrics require authentication')
  })

  it('lists recent logins, newest first', () => {
    render(<RuntimeSection />)
    const logins = screen.getByTestId('runtime-logins')
    expect(within(logins).getByText('alice')).toBeInTheDocument()
    expect(logins.textContent).toContain('this instance only')
  })

  it('shows an empty state when there are no recent logins', () => {
    const metrics = fullMetrics()
    metrics.portal.recentLogins = []
    mockUseSystemMetrics.mockReturnValue(query({ data: metrics }))
    render(<RuntimeSection />)
    expect(screen.getByTestId('runtime-logins').textContent).toContain('No logins recorded')
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
