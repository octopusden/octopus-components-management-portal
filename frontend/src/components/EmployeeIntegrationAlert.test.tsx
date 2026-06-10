import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EmployeeIntegrationAlert } from './EmployeeIntegrationAlert'
import { useAdminMode } from '@/lib/adminModeStore'
import type { EmployeeIntegrationStatus } from '@/hooks/useEmployeeIntegrationHealth'

const mockUseCurrentUser = vi.fn()
vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => mockUseCurrentUser(),
}))

const mockUseEmployeeIntegrationHealth = vi.fn()
vi.mock('@/hooks/useEmployeeIntegrationHealth', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useEmployeeIntegrationHealth: (enabled: boolean) => mockUseEmployeeIntegrationHealth(enabled),
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

function healthReturn(status: EmployeeIntegrationStatus | undefined) {
  return { data: status ? { status } : undefined }
}

beforeEach(() => {
  vi.clearAllMocks()
  useAdminMode.setState({ enabled: true })
  mockUseCurrentUser.mockReturnValue({ data: ADMIN_USER })
  mockUseEmployeeIntegrationHealth.mockReturnValue(healthReturn(undefined))
})

describe('EmployeeIntegrationAlert', () => {
  it('renders a red banner when the integration is DOWN and admin mode is on', () => {
    mockUseEmployeeIntegrationHealth.mockReturnValue(healthReturn('DOWN'))
    render(<EmployeeIntegrationAlert />)
    const banner = screen.getByTestId('employee-integration-alert')
    expect(banner).toHaveAttribute('data-variant', 'destructive')
    expect(banner.textContent).toMatch(/employee.service integration/i)
  })

  it('renders nothing when the integration is UP', () => {
    mockUseEmployeeIntegrationHealth.mockReturnValue(healthReturn('UP'))
    render(<EmployeeIntegrationAlert />)
    expect(screen.queryByTestId('employee-integration-alert')).toBeNull()
  })

  it('renders nothing when the integration is intentionally DISABLED', () => {
    mockUseEmployeeIntegrationHealth.mockReturnValue(healthReturn('DISABLED'))
    render(<EmployeeIntegrationAlert />)
    expect(screen.queryByTestId('employee-integration-alert')).toBeNull()
  })

  it('renders nothing while health has not loaded yet', () => {
    render(<EmployeeIntegrationAlert />)
    expect(screen.queryByTestId('employee-integration-alert')).toBeNull()
  })

  it('renders nothing (and does not poll) when admin mode is off', () => {
    useAdminMode.setState({ enabled: false })
    mockUseEmployeeIntegrationHealth.mockReturnValue(healthReturn('DOWN'))
    render(<EmployeeIntegrationAlert />)
    expect(screen.queryByTestId('employee-integration-alert')).toBeNull()
    expect(mockUseEmployeeIntegrationHealth).toHaveBeenCalledWith(false)
  })

  it('renders nothing (and does not poll) without the IMPORT_DATA permission', () => {
    // localStorage adminMode=true must not leak the banner (or the polling)
    // to a non-admin: the permission is the real gate, the toggle is UX.
    mockUseCurrentUser.mockReturnValue({ data: VIEWER_USER })
    mockUseEmployeeIntegrationHealth.mockReturnValue(healthReturn('DOWN'))
    render(<EmployeeIntegrationAlert />)
    expect(screen.queryByTestId('employee-integration-alert')).toBeNull()
    expect(mockUseEmployeeIntegrationHealth).toHaveBeenCalledWith(false)
  })

  it('polls when admin mode is on and the user has IMPORT_DATA', () => {
    mockUseEmployeeIntegrationHealth.mockReturnValue(healthReturn('UP'))
    render(<EmployeeIntegrationAlert />)
    expect(mockUseEmployeeIntegrationHealth).toHaveBeenCalledWith(true)
  })
})
