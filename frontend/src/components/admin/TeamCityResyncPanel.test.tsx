import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useTeamCityResync, type TeamCityResyncResult } from '@/hooks/useTeamCityResync'
import { toast } from '@/hooks/use-toast'
import { useAdminMode } from '@/lib/adminModeStore'
import { TeamCityResyncPanel } from './TeamCityResyncPanel'

// Same shape as MigrationPanel: hook is mocked so the test focuses on panel
// behavior — admin-mode gating, confirm dialog, toast on success, banner on
// error. The hook is also covered by useTeamCityResync.test.ts.

vi.mock('@/hooks/useTeamCityResync', () => ({
  useTeamCityResync: vi.fn(),
}))
vi.mock('@/hooks/use-toast', () => ({
  toast: vi.fn(),
}))

const mockUseResync = vi.mocked(useTeamCityResync)
const mockToast = vi.mocked(toast)

const RESULT: TeamCityResyncResult = {
  scanned: 650,
  updated: 12,
  unchanged: 580,
  skipped_no_match: 50,
  skipped_ambiguous: 8,
  errors: [],
}

function buildMutation(overrides: Partial<ReturnType<typeof useTeamCityResync>> = {}) {
  const mutateAsync = vi.fn().mockResolvedValue(RESULT)
  return {
    base: {
      mutate: vi.fn(),
      mutateAsync,
      reset: vi.fn(),
      isPending: false,
      isSuccess: false,
      isError: false,
      isIdle: true,
      data: undefined,
      error: null,
      status: 'idle',
      variables: undefined,
      submittedAt: 0,
      failureCount: 0,
      failureReason: null,
      isPaused: false,
      ...overrides,
    } as unknown as ReturnType<typeof useTeamCityResync>,
    mutateAsync,
  }
}

function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return {
    client,
    ...render(
      React.createElement(QueryClientProvider, { client }, <TeamCityResyncPanel />),
    ),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  useAdminMode.setState({ enabled: false })
  mockUseResync.mockReturnValue(buildMutation().base)
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  useAdminMode.setState({ enabled: false })
})

describe('TeamCityResyncPanel — admin-mode gate', () => {
  it('disables the button when adminMode is false', () => {
    renderPanel()
    expect(screen.getByRole('button', { name: /resync tc project ids/i })).toBeDisabled()
    expect(screen.getByText(/Enable Admin mode in the footer/i)).toBeDefined()
  })

  it('enables the button once adminMode flips to true', () => {
    renderPanel()
    act(() => {
      useAdminMode.setState({ enabled: true })
    })
    expect(screen.getByRole('button', { name: /resync tc project ids/i })).not.toBeDisabled()
  })
})

describe('TeamCityResyncPanel — confirm + mutation', () => {
  it('opens confirm dialog and fires useTeamCityResync on confirm', async () => {
    const { base, mutateAsync } = buildMutation()
    mockUseResync.mockReturnValue(base)
    useAdminMode.setState({ enabled: true })

    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: /resync tc project ids/i }))

    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /confirm/i }))

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledOnce())
  })

  it('cancels without firing the mutation when Cancel is clicked', async () => {
    const { base, mutateAsync } = buildMutation()
    mockUseResync.mockReturnValue(base)
    useAdminMode.setState({ enabled: true })

    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: /resync tc project ids/i }))

    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /cancel/i }))

    expect(mutateAsync).not.toHaveBeenCalled()
  })

  it('emits a success toast with all counters on resolved mutation', async () => {
    const { base, mutateAsync } = buildMutation()
    mockUseResync.mockReturnValue(base)
    useAdminMode.setState({ enabled: true })

    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: /resync tc project ids/i }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /confirm/i }))

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledOnce())
    await waitFor(() => expect(mockToast).toHaveBeenCalledOnce())

    const call = mockToast.mock.calls[0]?.[0] as { title: string; description: string }
    expect(call.title).toMatch(/TC resync completed/i)
    // All six counters present in the description so admins can audit at a
    // glance without expanding the result tiles.
    expect(call.description).toContain('650 scanned')
    expect(call.description).toContain('12 updated')
    expect(call.description).toContain('580 unchanged')
    expect(call.description).toContain('50 no match')
    expect(call.description).toContain('8 ambiguous')
    expect(call.description).toContain('0 errors')
  })
})

describe('TeamCityResyncPanel — result rendering', () => {
  it('renders all six counter tiles when data arrives', () => {
    mockUseResync.mockReturnValue(
      buildMutation({
        data: RESULT,
        isPending: false,
        isSuccess: true,
        isIdle: false,
        status: 'success',
      }).base,
    )
    useAdminMode.setState({ enabled: true })
    renderPanel()
    expect(screen.getByText('650')).toBeDefined()
    expect(screen.getByText('12')).toBeDefined()
    expect(screen.getByText('580')).toBeDefined()
    expect(screen.getByText('50')).toBeDefined()
    expect(screen.getByText('8')).toBeDefined()
    // errors counter is 0 — match the StatCard label rather than the digit
    // (the digit '0' could collide with other zero-valued tiles in
    // pathological fixtures).
    expect(screen.getByText('Errors')).toBeDefined()
  })

  it('expands the errors disclosure with each error string when errors are present', () => {
    const result: TeamCityResyncResult = {
      ...RESULT,
      errors: ['comp-alpha: TC 500 (timeout)', 'comp-beta: ambiguous match'],
    }
    mockUseResync.mockReturnValue(
      buildMutation({
        data: result,
        isPending: false,
        isSuccess: true,
        isIdle: false,
        status: 'success',
      }).base,
    )
    useAdminMode.setState({ enabled: true })
    renderPanel()
    expect(screen.getByText(/Errors \(2\)/i)).toBeDefined()
    expect(screen.getByText(/comp-alpha: TC 500/)).toBeDefined()
    expect(screen.getByText(/comp-beta: ambiguous match/)).toBeDefined()
  })

  it('renders a destructive banner when the mutation errors', () => {
    mockUseResync.mockReturnValue(
      buildMutation({
        isError: true,
        isIdle: false,
        status: 'error',
        error: new Error('CRS 503: TC unreachable'),
      }).base,
    )
    useAdminMode.setState({ enabled: true })
    renderPanel()
    expect(screen.getByText(/CRS 503: TC unreachable/)).toBeDefined()
  })
})
