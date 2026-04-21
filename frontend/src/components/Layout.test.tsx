import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { Layout } from './Layout'
import type { User } from '../lib/auth'

vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: vi.fn(),
}))

import { useCurrentUser } from '@/hooks/useCurrentUser'
const mockedUseCurrentUser = vi.mocked(useCurrentUser)

function renderLayout() {
  return render(
    <MemoryRouter initialEntries={['/components']}>
      <Layout>
        <div>child content</div>
      </Layout>
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Layout nav visibility', () => {
  it('shows only Components for a user without audit/import permissions', () => {
    const viewer: User = {
      username: 'carol',
      roles: [{ name: 'ROLE_REGISTRY_VIEWER', permissions: ['ACCESS_COMPONENTS'] }],
      groups: [],
    }
    mockedUseCurrentUser.mockReturnValue({
      data: viewer,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useCurrentUser>)

    renderLayout()
    expect(screen.getByRole('link', { name: /Components/i })).toBeDefined()
    expect(screen.queryByRole('link', { name: /Audit/i })).toBeNull()
    expect(screen.queryByRole('link', { name: /Admin/i })).toBeNull()
  })

  it('shows Audit and Admin for F1_ADMIN', () => {
    const admin: User = {
      username: 'alice',
      roles: [
        {
          name: 'ROLE_F1_ADMIN',
          permissions: ['ACCESS_COMPONENTS', 'ACCESS_AUDIT', 'IMPORT_DATA'],
        },
      ],
      groups: [],
    }
    mockedUseCurrentUser.mockReturnValue({
      data: admin,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useCurrentUser>)

    renderLayout()
    expect(screen.getByRole('link', { name: /Components/i })).toBeDefined()
    expect(screen.getByRole('link', { name: /Audit/i })).toBeDefined()
    expect(screen.getByRole('link', { name: /Admin/i })).toBeDefined()
    expect(screen.getByText('alice')).toBeDefined()
  })

  it('fails open on auth backend error — shows all nav items and an auth-failed indicator', () => {
    mockedUseCurrentUser.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('500 internal'),
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useCurrentUser>)

    renderLayout()

    // All nav items visible — the server is the authoritative gate.
    expect(screen.getByRole('link', { name: /Components/i })).toBeDefined()
    expect(screen.getByRole('link', { name: /Audit/i })).toBeDefined()
    expect(screen.getByRole('link', { name: /Admin/i })).toBeDefined()
    // Explicit "auth check failed" signal so the operator sees the cause.
    expect(screen.getByText(/auth check failed/i)).toBeDefined()
  })
})
