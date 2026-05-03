import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { ComponentDetailPage } from './ComponentDetailPage'
import type { User } from '@/lib/auth'
import type { ComponentDetail } from '@/lib/types'

// ── mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/hooks/useCurrentUser', () => ({ useCurrentUser: vi.fn() }))
vi.mock('../hooks/useCurrentUser', () => ({ useCurrentUser: vi.fn() }))
vi.mock('../hooks/useComponent', () => ({
  useComponent: vi.fn(),
  useUpdateComponent: vi.fn(),
  useDeleteComponent: vi.fn(),
}))
vi.mock('../hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))
// AppFooter uses its own queries; stub fetch globally.
vi.mock('../components/AppFooter', () => ({
  AppFooter: () => React.createElement('footer', null, 'footer'),
}))
// Editor tabs — stub so only the header/action-area is tested here.
vi.mock('../components/editor/GeneralTab', () => ({
  GeneralTab: () => React.createElement('div', { 'data-testid': 'general-tab' }),
}))
vi.mock('../components/editor/BuildTab', () => ({
  BuildTab: () => React.createElement('div', { 'data-testid': 'build-tab' }),
}))
vi.mock('../components/editor/VcsTab', () => ({
  VcsTab: () => React.createElement('div', { 'data-testid': 'vcs-tab' }),
}))
vi.mock('../components/editor/DistributionTab', () => ({
  DistributionTab: () => React.createElement('div', { 'data-testid': 'distribution-tab' }),
}))
vi.mock('../components/editor/JiraTab', () => ({
  JiraTab: () => React.createElement('div', { 'data-testid': 'jira-tab' }),
}))
vi.mock('../components/editor/EscrowTab', () => ({
  EscrowTab: () => React.createElement('div', { 'data-testid': 'escrow-tab' }),
}))
vi.mock('../components/editor/FieldOverrides', () => ({
  FieldOverrides: () => React.createElement('div', { 'data-testid': 'field-overrides' }),
}))
vi.mock('../components/editor/ComponentHistoryTab', () => ({
  ComponentHistoryTab: () => React.createElement('div', { 'data-testid': 'history-tab' }),
}))

import { useCurrentUser } from '../hooks/useCurrentUser'
import { useComponent, useUpdateComponent, useDeleteComponent } from '../hooks/useComponent'

const mockedUseCurrentUser = vi.mocked(useCurrentUser)
const mockedUseComponent = vi.mocked(useComponent)
const mockedUseUpdateComponent = vi.mocked(useUpdateComponent)
const mockedUseDeleteComponent = vi.mocked(useDeleteComponent)

// ── fixtures ──────────────────────────────────────────────────────────────────

const baseComponent: ComponentDetail = {
  id: 'comp-1',
  name: 'my-component',
  displayName: 'My Component',
  componentOwner: 'alice',
  productType: 'KERNEL',
  system: ['SYS1'],
  clientCode: null,
  archived: false,
  solution: false,
  parentComponentName: null,
  metadata: {},
  version: 1,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-02T00:00:00Z',
  buildConfigurations: [{ id: 'bc-1', buildSystem: 'GRADLE', buildFilePath: null, javaVersion: null, deprecated: false, metadata: {} }],
  vcsSettings: [{ id: 'vs-1', vcsType: 'GIT', externalRegistry: null, entries: [{ id: 'e-1', name: 'main', vcsPath: 'org/repo', repositoryType: 'FEATURE', tag: null, branch: null }] }],
  distributions: [],
  jiraComponentConfigs: [{ id: 'jcc-1', projectKey: 'PROJ', displayName: null, componentVersionFormat: null, technical: false, metadata: {} }],
  escrowConfigurations: [],
  versions: [],
}

const archivedComponent: ComponentDetail = { ...baseComponent, archived: true }

const idleMutation = {
  mutate: vi.fn(),
  mutateAsync: vi.fn(() => Promise.resolve()),
  reset: vi.fn(),
  isPending: false,
  isSuccess: false,
  isError: false,
  isIdle: true,
  data: undefined,
  error: null,
  status: 'idle' as const,
  variables: undefined,
  submittedAt: 0,
  failureCount: 0,
  failureReason: null,
  isPaused: false,
  context: undefined,
}

function makeUser(permissions: string[]): User {
  return {
    username: 'testuser',
    roles: [{ name: 'ROLE_TEST', permissions }],
    groups: [],
  }
}

interface RenderPageOptions {
  updateMutation?: Partial<typeof idleMutation>
  deleteMutation?: Partial<typeof idleMutation>
}

function renderPage(component: ComponentDetail, user: User | null, opts: RenderPageOptions = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('{}', { status: 200 }))))

  mockedUseCurrentUser.mockReturnValue({
    data: user ?? undefined,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useCurrentUser>)

  mockedUseComponent.mockReturnValue({
    data: component,
    isLoading: false,
    error: null,
  } as unknown as ReturnType<typeof useComponent>)

  mockedUseUpdateComponent.mockReturnValue({
    ...idleMutation,
    ...(opts.updateMutation ?? {}),
  } as unknown as ReturnType<typeof useUpdateComponent>)

  mockedUseDeleteComponent.mockReturnValue({
    ...idleMutation,
    ...(opts.deleteMutation ?? {}),
  } as unknown as ReturnType<typeof useDeleteComponent>)

  return render(
    React.createElement(
      QueryClientProvider,
      { client },
      // Add a /components route so navigate('/components') doesn't produce a "no routes matched" warning
      <MemoryRouter initialEntries={['/components/comp-1']}>
        <Routes>
          <Route path="/components" element={<div data-testid="list-page" />} />
          <Route path="/components/:id" element={<ComponentDetailPage />} />
        </Routes>
      </MemoryRouter>,
    ),
  )
}

// ── tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  // Reset env vars
  delete (import.meta.env as Record<string, unknown>).VITE_JIRA_BASE_URL
  delete (import.meta.env as Record<string, unknown>).VITE_GIT_BASE_URL
})

describe('ComponentDetailPage — Archive / Unarchive buttons', () => {
  it('(a) Archive button renders for user with DELETE_COMPONENTS, archived=false', () => {
    const user = makeUser(['ACCESS_COMPONENTS', 'DELETE_COMPONENTS'])
    renderPage(baseComponent, user)
    expect(screen.getByRole('button', { name: /archive/i })).toBeDefined()
  })

  it('(a) Archive button uses Button variant="destructive" (no inline custom classes)', () => {
    const user = makeUser(['ACCESS_COMPONENTS', 'DELETE_COMPONENTS'])
    renderPage(baseComponent, user)
    // Header Archive (not the dialog confirm button) is the only one before
    // any click; assert via data-variant attribute set by Button.
    const archiveBtn = screen.getByRole('button', { name: /^archive$/i })
    expect(archiveBtn.getAttribute('data-variant')).toBe('destructive')
  })

  it('(a) Archive button is hidden for user without DELETE_COMPONENTS', () => {
    const user = makeUser(['ACCESS_COMPONENTS'])
    renderPage(baseComponent, user)
    expect(screen.queryByRole('button', { name: /^archive$/i })).toBeNull()
  })

  it('(b) Unarchive button renders for user with ARCHIVE_COMPONENTS when archived=true', () => {
    const user = makeUser(['ACCESS_COMPONENTS', 'ARCHIVE_COMPONENTS'])
    renderPage(archivedComponent, user)
    expect(screen.getByRole('button', { name: /unarchive/i })).toBeDefined()
  })

  it('(b) Unarchive button is hidden for user without ARCHIVE_COMPONENTS when archived=true', () => {
    const user = makeUser(['ACCESS_COMPONENTS'])
    renderPage(archivedComponent, user)
    expect(screen.queryByRole('button', { name: /unarchive/i })).toBeNull()
  })

  it('(b) Archive button is hidden when component.archived=true (even with DELETE_COMPONENTS)', () => {
    const user = makeUser(['ACCESS_COMPONENTS', 'DELETE_COMPONENTS'])
    renderPage(archivedComponent, user)
    // No "Archive" button — component is already archived, show "Unarchive" instead
    expect(screen.queryByRole('button', { name: /^archive$/i })).toBeNull()
  })

  it('(c) Archive button click opens confirmation dialog and triggers DELETE call', async () => {
    const deleteMutateAsync = vi.fn(() => Promise.resolve())
    const user = makeUser(['ACCESS_COMPONENTS', 'DELETE_COMPONENTS'])
    renderPage(baseComponent, user, { deleteMutation: { mutateAsync: deleteMutateAsync } })

    fireEvent.click(screen.getByRole('button', { name: /^archive$/i }))

    // Dialog should open
    await waitFor(() => {
      expect(screen.getByText(/archive component/i)).toBeDefined()
    })

    // Click the destructive Archive button inside dialog (last Archive button is the confirm one)
    const archiveBtns = screen.getAllByRole('button', { name: /^archive$/i })
    const lastBtn = archiveBtns[archiveBtns.length - 1] as HTMLElement
    fireEvent.click(lastBtn)

    await waitFor(() => {
      expect(deleteMutateAsync).toHaveBeenCalledOnce()
    })
  })

  it('(d) Unarchive button triggers PATCH with archived:false', async () => {
    const updateMutateAsync = vi.fn(() => Promise.resolve())
    const user = makeUser(['ACCESS_COMPONENTS', 'ARCHIVE_COMPONENTS'])
    renderPage(archivedComponent, user, { updateMutation: { mutateAsync: updateMutateAsync } })

    fireEvent.click(screen.getByRole('button', { name: /unarchive/i }))

    await waitFor(() => {
      expect(updateMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ archived: false })
      )
    })
  })
})

describe('ComponentDetailPage — breadcrumb badges', () => {
  it('(e) System badge renders when system array is non-empty', () => {
    const user = makeUser(['ACCESS_COMPONENTS'])
    renderPage(baseComponent, user)
    expect(screen.getByText('SYS1')).toBeDefined()
  })

  it('(e) BuildSystem badge renders when buildConfigurations[0].buildSystem is present', () => {
    const user = makeUser(['ACCESS_COMPONENTS'])
    renderPage(baseComponent, user)
    expect(screen.getByText('GRADLE')).toBeDefined()
  })

  it('(e) System badge not rendered when system array is empty', () => {
    const user = makeUser(['ACCESS_COMPONENTS'])
    renderPage({ ...baseComponent, system: [] }, user)
    expect(screen.queryByText('SYS1')).toBeNull()
  })

  it('(e) BuildSystem badge not rendered when buildConfigurations is empty', () => {
    const user = makeUser(['ACCESS_COMPONENTS'])
    renderPage({ ...baseComponent, buildConfigurations: [] }, user)
    expect(screen.queryByText('GRADLE')).toBeNull()
  })
})

describe('ComponentDetailPage — Jira/Git quick-links', () => {
  it('(f) Jira link renders when VITE_JIRA_BASE_URL is set and projectKey exists', () => {
    ;(import.meta.env as Record<string, unknown>).VITE_JIRA_BASE_URL = 'https://jira.example.com'
    const user = makeUser(['ACCESS_COMPONENTS'])
    renderPage(baseComponent, user)
    const link = screen.getByTitle('Jira: PROJ') as HTMLAnchorElement
    expect(link).toBeDefined()
    expect(link.href).toContain('jira.example.com/browse/PROJ')
  })

  it('(f) Jira link does NOT render when VITE_JIRA_BASE_URL is undefined', () => {
    const user = makeUser(['ACCESS_COMPONENTS'])
    renderPage(baseComponent, user)
    expect(screen.queryByTitle(/jira/i)).toBeNull()
  })

  it('(f) Jira link does NOT render when projectKey is null', () => {
    ;(import.meta.env as Record<string, unknown>).VITE_JIRA_BASE_URL = 'https://jira.example.com'
    const user = makeUser(['ACCESS_COMPONENTS'])
    renderPage(
      { ...baseComponent, jiraComponentConfigs: [{ id: 'j1', projectKey: null, displayName: null, componentVersionFormat: null, technical: false, metadata: {} }] },
      user,
    )
    expect(screen.queryByTitle(/jira/i)).toBeNull()
  })

  it('(f) Git link renders when VITE_GIT_BASE_URL is set and vcsPath exists', () => {
    ;(import.meta.env as Record<string, unknown>).VITE_GIT_BASE_URL = 'https://git.example.com'
    const user = makeUser(['ACCESS_COMPONENTS'])
    renderPage(baseComponent, user)
    const link = screen.getByTitle('Git: org/repo') as HTMLAnchorElement
    expect(link).toBeDefined()
    expect(link.href).toContain('git.example.com/org/repo')
  })

  it('(f) Git link does NOT render when VITE_GIT_BASE_URL is undefined', () => {
    const user = makeUser(['ACCESS_COMPONENTS'])
    renderPage(baseComponent, user)
    expect(screen.queryByTitle(/git:/i)).toBeNull()
  })

  it('(f) Git link does NOT render when vcsSettings is empty', () => {
    ;(import.meta.env as Record<string, unknown>).VITE_GIT_BASE_URL = 'https://git.example.com'
    const user = makeUser(['ACCESS_COMPONENTS'])
    renderPage({ ...baseComponent, vcsSettings: [] }, user)
    expect(screen.queryByTitle(/git:/i)).toBeNull()
  })
})

describe('ComponentDetailPage — confirmation dialog text', () => {
  it('dialog says "Archive Component" and "restore it later", not "cannot be undone"', async () => {
    const user = makeUser(['ACCESS_COMPONENTS', 'DELETE_COMPONENTS'])
    renderPage(baseComponent, user)

    fireEvent.click(screen.getByRole('button', { name: /^archive$/i }))

    await waitFor(() => {
      expect(screen.getByText(/archive component/i)).toBeDefined()
      expect(screen.getByText(/restore it later/i)).toBeDefined()
      expect(screen.queryByText(/cannot be undone/i)).toBeNull()
    })
  })
})
