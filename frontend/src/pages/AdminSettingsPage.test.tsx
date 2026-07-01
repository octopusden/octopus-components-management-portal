import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { AdminSettingsPage } from './AdminSettingsPage'
import type { User } from '@/lib/auth'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useMigrationJob, useMigrationStatus, useRunMigration } from '@/hooks/useMigration'
import { useFieldConfig, useComponentDefaults, useReloadConfig } from '@/hooks/useAdminConfig'
import { useAdminMode } from '@/lib/adminModeStore'

// AdminSettingsPage is the only mount point for the Migration tab; the plan
// is explicit that the migration UI lives next to field-config and component-
// defaults, not on a separate route. This test pins:
//   1. all three tabs are present in the tablist (failure here means a
//      regression hid one of the tabs or moved Migration elsewhere),
//   2. clicking Migration mounts MigrationPanel (failure here usually means
//      the TabsContent value mismatched the TabsTrigger value — Radix
//      silently renders nothing in that case).

vi.mock('@/hooks/useCurrentUser', () => ({ useCurrentUser: vi.fn() }))
vi.mock('@/hooks/useMigration', () => {
  // idleMutation is declared below in the test file but vi.mock hoists this
  // factory, so the closure can't capture it directly. Inline the same
  // shape here — duplicated, but the factory has to be self-contained.
  const idle = {
    mutate: () => undefined,
    mutateAsync: () => Promise.resolve(),
    reset: () => undefined,
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
  }
  return {
    useMigrationStatus: vi.fn(),
    useMigrationJob: vi.fn(),
    useRunMigration: vi.fn(),
    // Mounted by MigrationPanel (cross-disable) and MigrationHistoryPanel.
    // Defaulted to idle so the tab-mount tests don't have to think about it.
    useHistoryMigrationJob: vi.fn(() => ({
      data: null,
      isLoading: false,
      isError: false,
      isSuccess: true,
      error: null,
      refetch: () => undefined,
    })),
    useRunHistoryMigration: vi.fn(() => idle),
    useForceResetHistory: vi.fn(() => idle),
  }
})
// Default-tab editors (FieldConfigEditor / ComponentDefaultsForm) read from
// these hooks; without proper mutation shapes the page crashes during render.
const idleMutation = {
  mutate: () => undefined,
  mutateAsync: () => Promise.resolve(),
  reset: () => undefined,
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
}
vi.mock('@/hooks/useAdminConfig', () => ({
  useFieldConfig: vi.fn(),
  useComponentDefaults: vi.fn(),
  useReloadConfig: vi.fn(() => idleMutation),
}))
// RuntimeSection (System tab) has its own data hooks + test coverage; stub it so
// the tab-visibility tests don't pull in a live metrics query.
vi.mock('../components/RuntimeSection', () => ({
  RuntimeSection: () => React.createElement('div', { 'data-testid': 'runtime-section-stub' }),
}))

const mockUseCurrentUser = vi.mocked(useCurrentUser)
const mockUseMigrationStatus = vi.mocked(useMigrationStatus)
const mockUseMigrationJob = vi.mocked(useMigrationJob)
const mockUseRunMigration = vi.mocked(useRunMigration)
const mockUseFieldConfig = vi.mocked(useFieldConfig)
const mockUseComponentDefaults = vi.mocked(useComponentDefaults)
const mockUseReloadConfig = vi.mocked(useReloadConfig)

const adminUser: User = {
  username: 'alice',
  roles: [{ name: 'ROLE_ADMIN', permissions: ['IMPORT_DATA'] }],
  groups: [],
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  // AppFooter inside Layout calls useQuery against /portal/info and /rest/api/4/info.
  // Stub fetch so they don't reach the network in jsdom.
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response('{}', { status: 200 }))),
  )
  return render(
    React.createElement(
      QueryClientProvider,
      { client },
      <MemoryRouter initialEntries={['/admin']}>
        <AdminSettingsPage />
      </MemoryRouter>,
    ),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  useAdminMode.setState({ enabled: false })
  mockUseReloadConfig.mockReturnValue(idleMutation as unknown as ReturnType<typeof useReloadConfig>)
  mockUseCurrentUser.mockReturnValue({
    data: adminUser,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useCurrentUser>)
  mockUseMigrationStatus.mockReturnValue({
    data: { git: 0, db: 0, total: 0 },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useMigrationStatus>)
  mockUseMigrationJob.mockReturnValue({
    data: null,
    isLoading: false,
    isError: false,
    isSuccess: true,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useMigrationJob>)
  mockUseRunMigration.mockReturnValue({
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    reset: vi.fn(),
    isPending: false,
    isSuccess: false,
    isError: false,
    isIdle: true,
    data: undefined,
    error: null,
    status: 'idle',
  } as unknown as ReturnType<typeof useRunMigration>)
  mockUseFieldConfig.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof useFieldConfig>)
  mockUseComponentDefaults.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof useComponentDefaults>)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('AdminSettingsPage tabs', () => {
  it('exposes Field Configuration, Component Defaults, and Migration tabs', () => {
    renderPage()
    expect(screen.getByRole('tab', { name: /Field Configuration/i })).toBeDefined()
    expect(screen.getByRole('tab', { name: /Component Defaults/i })).toBeDefined()
    expect(screen.getByRole('tab', { name: /Migration/i })).toBeDefined()
  })

  it('mounts MigrationPanel when the Migration tab is clicked', async () => {
    renderPage()
    // Radix Tabs ignore plain fireEvent.click in jsdom (the trigger uses
    // pointer-down/keyboard semantics). userEvent simulates the full
    // pointerdown → click → focus chain Radix listens for.
    const user = userEvent.setup()
    await user.click(screen.getByRole('tab', { name: /Migration/i }))

    // MigrationPanel renders a "Run migration" button whose presence proves
    // the panel mounted (no other tab content has it). The button is
    // disabled in this test because adminMode defaults to false; we only
    // need to know that the panel rendered.
    expect(screen.getByRole('button', { name: /run migration/i })).toBeDefined()
  })

  it('arming via the AdminModeArmBar enables ALL three destructive Run buttons', async () => {
    renderPage()
    const user = userEvent.setup()
    await user.click(screen.getByRole('tab', { name: /Migration/i }))

    const runMigration = screen.getByRole('button', { name: /run migration/i })
    const runHistory = screen.getByRole('button', { name: /run history migration/i })
    const resync = screen.getByRole('button', { name: /resync tc project ids/i })

    // Disarmed → all disabled.
    expect(runMigration).toBeDisabled()
    expect(runHistory).toBeDisabled()
    expect(resync).toBeDisabled()

    // Arm via the inline bar (shared useAdminMode store) → all enabled. Catches a
    // regression where a consumer desyncs from the shared toggle.
    await user.click(screen.getByTestId('admin-arm-bar').querySelector('[role="switch"]')!)
    expect(runMigration).not.toBeDisabled()
    expect(runHistory).not.toBeDisabled()
    expect(resync).not.toBeDisabled()
  })
})

describe('AdminSettingsPage — System tab visibility', () => {
  const viewerUser: User = {
    username: 'bob',
    roles: [{ name: 'ROLE_VIEWER', permissions: ['ACCESS_COMPONENTS'] }],
    groups: [],
  }

  it('hides the System tab when admin mode is OFF, even for an IMPORT_DATA user', () => {
    useAdminMode.setState({ enabled: false }) // adminUser has IMPORT_DATA (default)
    renderPage()
    expect(screen.queryByRole('tab', { name: /^System$/i })).toBeNull()
  })

  it('hides the System tab for a non-IMPORT_DATA user, even when admin mode is ON', () => {
    mockUseCurrentUser.mockReturnValue({
      data: viewerUser,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useCurrentUser>)
    useAdminMode.setState({ enabled: true })
    renderPage()
    expect(screen.queryByRole('tab', { name: /^System$/i })).toBeNull()
  })

  it('shows the System tab and mounts RuntimeSection when adminMode && IMPORT_DATA', async () => {
    useAdminMode.setState({ enabled: true })
    renderPage()
    const tab = screen.getByRole('tab', { name: /^System$/i })
    expect(tab).toBeDefined()
    await userEvent.setup().click(tab)
    expect(screen.getByTestId('runtime-section-stub')).toBeDefined()
  })
})

describe('AdminSettingsPage — ConfigReloadBar', () => {
  it('shows the managed-as-code banner with a Reload button disabled when Admin mode is OFF', () => {
    renderPage()
    expect(screen.getByText(/managed as code/i)).toBeDefined()
    expect(screen.getByRole('button', { name: /^reload$/i })).toBeDisabled()
  })

  it('clicking Reload calls useReloadConfig().mutate when Admin mode is ON', async () => {
    const mutate = vi.fn()
    mockUseReloadConfig.mockReturnValue(
      { ...idleMutation, mutate } as unknown as ReturnType<typeof useReloadConfig>,
    )
    useAdminMode.setState({ enabled: true })
    renderPage()
    const reloadBtn = screen.getByRole('button', { name: /^reload$/i })
    expect(reloadBtn).not.toBeDisabled()
    await userEvent.setup().click(reloadBtn)
    expect(mutate).toHaveBeenCalledOnce()
  })

  it('surfaces a reload error message', () => {
    mockUseReloadConfig.mockReturnValue(
      { ...idleMutation, error: new Error('config-validation') } as unknown as ReturnType<typeof useReloadConfig>,
    )
    renderPage()
    expect(screen.getByText(/config-validation/)).toBeDefined()
  })
})
