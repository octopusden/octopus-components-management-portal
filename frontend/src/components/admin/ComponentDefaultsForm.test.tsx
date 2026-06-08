import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React, { type ReactElement } from 'react'
import { useComponentDefaults } from '@/hooks/useAdminConfig'
import { ComponentDefaultsForm } from './ComponentDefaultsForm'

function renderWithQuery(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    React.createElement(QueryClientProvider, { client: queryClient }, ui),
  )
}

// Component defaults are now code-as-config (managed in service-config). This
// view is READ-ONLY: no Save / Import-from-Git / Reset controls; values render
// disabled. Reload lives on the Admin Settings page, not here.
vi.mock('@/hooks/useAdminConfig', () => ({
  useComponentDefaults: vi.fn(),
}))

const mockUseComponentDefaults = vi.mocked(useComponentDefaults)

beforeEach(() => {
  vi.clearAllMocks()
  mockUseComponentDefaults.mockReturnValue({
    data: { buildSystem: 'GRADLE' },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useComponentDefaults>)
})

afterEach(() => {
  cleanup()
})

describe('ComponentDefaultsForm — read-only (code-as-config)', () => {
  it('renders no write controls (Save / Import from Git / Reset)', () => {
    renderWithQuery(<ComponentDefaultsForm />)
    expect(screen.queryByRole('button', { name: /^save$/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /import from git/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /^reset$/i })).toBeNull()
  })

  it('renders the loaded default value read-only', () => {
    renderWithQuery(<ComponentDefaultsForm />)
    const buildSystem = screen.getByDisplayValue('GRADLE') as HTMLInputElement
    expect(buildSystem.readOnly).toBe(true)
  })

  it('Raw JSON view is read-only', () => {
    renderWithQuery(<ComponentDefaultsForm />)
    fireEvent.click(screen.getByRole('button', { name: /raw json/i }))
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    expect(textarea.readOnly).toBe(true)
    expect(textarea.value).toContain('GRADLE')
  })
})

// SYS-039 §6: people fields (componentOwner / releaseManager / securityChampion)
// are not part of the global component-defaults surface and are stripped on load
// so a stale stored blob never renders them.
describe('ComponentDefaultsForm — people fields stripped on load (SYS-039)', () => {
  beforeEach(() => {
    mockUseComponentDefaults.mockReturnValue({
      data: {
        buildSystem: 'GRADLE',
        componentOwner: 'alice',
        releaseManager: 'bob',
        securityChampion: 'carol',
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useComponentDefaults>)
  })

  it('does not render Component Owner / Release Manager / Security Champion', () => {
    renderWithQuery(<ComponentDefaultsForm />)
    expect(screen.queryByText('Component Owner')).toBeNull()
    expect(screen.queryByText('Release Manager')).toBeNull()
    expect(screen.queryByText('Security Champion')).toBeNull()
  })

  it('strips the people keys from the Raw JSON view', () => {
    renderWithQuery(<ComponentDefaultsForm />)
    fireEvent.click(screen.getByRole('button', { name: /raw json/i }))
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    expect(textarea.value).not.toContain('componentOwner')
    expect(textarea.value).not.toContain('releaseManager')
    expect(textarea.value).not.toContain('securityChampion')
    expect(textarea.value).toContain('GRADLE')
  })
})
