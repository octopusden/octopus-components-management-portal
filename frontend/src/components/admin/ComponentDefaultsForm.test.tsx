import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React, { type ReactElement } from 'react'
import {
  useComponentDefaults,
  useUpdateComponentDefaults,
  useMigrateDefaults,
  useFieldConfig,
} from '@/hooks/useAdminConfig'
import { useAdminMode } from '@/lib/adminModeStore'
import { ComponentDefaultsForm } from './ComponentDefaultsForm'

function renderWithQuery(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    React.createElement(QueryClientProvider, { client: queryClient }, ui),
  )
}

// Regression for PR #8 P2: the new Admin-mode toggle in AppFooter is the
// portal's "without weapons" mode for destructive admin actions. The Run
// migration button on /admin → Migration tab respects it; the existing
// "Import from Git" button on /admin → Component Defaults tab did not.
//
// "Import from Git" calls useMigrateDefaults().mutate() which POSTs
// /admin/migrate-defaults — the same migration-style operation that
// rewrites component defaults from DSL on disk. Leaving it armed when
// Admin mode is OFF contradicts the gate's invariant.
//
// "Save" stays unconditional. Editing a value and clicking Save is the
// regular write path of this editor; gating the entire form on Admin
// mode would make it useless without the toggle and changes scope
// beyond what the reviewer asked for.

vi.mock('@/hooks/useAdminConfig', () => ({
  // EnumSelect inside the form pulls field-config options through
  // useFieldConfigOptions → useFieldConfig. Mock it too so the form renders
  // without reaching the network. Returning empty data is fine — the dropdown
  // just shows no options, which is irrelevant to the Admin-mode gate tests.
  useFieldConfig: vi.fn(),
  useUpdateFieldConfig: vi.fn(),
  useComponentDefaults: vi.fn(),
  useUpdateComponentDefaults: vi.fn(),
  useMigrateDefaults: vi.fn(),
}))

const mockUseFieldConfig = vi.mocked(useFieldConfig)
const mockUseComponentDefaults = vi.mocked(useComponentDefaults)
const mockUseUpdateComponentDefaults = vi.mocked(useUpdateComponentDefaults)
const mockUseMigrateDefaults = vi.mocked(useMigrateDefaults)

function idleMutation<TArg = unknown>() {
  return {
    mutate: vi.fn() as (arg?: TArg) => void,
    mutateAsync: vi.fn().mockResolvedValue(undefined),
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
  }
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  useAdminMode.setState({ enabled: false })

  mockUseFieldConfig.mockReturnValue({
    data: { fields: {} },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useFieldConfig>)
  mockUseComponentDefaults.mockReturnValue({
    data: { buildSystem: 'GRADLE' },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useComponentDefaults>)
  mockUseUpdateComponentDefaults.mockReturnValue(
    idleMutation() as unknown as ReturnType<typeof useUpdateComponentDefaults>,
  )
  mockUseMigrateDefaults.mockReturnValue(
    idleMutation() as unknown as ReturnType<typeof useMigrateDefaults>,
  )
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  useAdminMode.setState({ enabled: false })
})

describe('ComponentDefaultsForm — Import from Git Admin-mode gate', () => {
  it('disables the Import from Git button when Admin mode is OFF and shows the helper text', () => {
    renderWithQuery(<ComponentDefaultsForm />)
    const importBtn = screen.getByRole('button', { name: /import from git/i })
    expect(importBtn).toBeDisabled()
    expect(screen.getByText(/Enable Admin mode in the footer/i)).toBeDefined()
  })

  it('enables Import from Git once Admin mode flips ON', () => {
    renderWithQuery(<ComponentDefaultsForm />)
    expect(screen.getByRole('button', { name: /import from git/i })).toBeDisabled()

    act(() => {
      useAdminMode.setState({ enabled: true })
    })

    expect(screen.getByRole('button', { name: /import from git/i })).not.toBeDisabled()
  })

  it('clicking Import from Git triggers useMigrateDefaults().mutate when Admin mode is ON', () => {
    const migrateMutation = idleMutation()
    mockUseMigrateDefaults.mockReturnValue(
      migrateMutation as unknown as ReturnType<typeof useMigrateDefaults>,
    )
    useAdminMode.setState({ enabled: true })

    renderWithQuery(<ComponentDefaultsForm />)
    fireEvent.click(screen.getByRole('button', { name: /import from git/i }))

    expect(migrateMutation.mutate).toHaveBeenCalledOnce()
  })

  it('Save button stays available regardless of Admin mode (regular edit path is not destructive)', () => {
    renderWithQuery(<ComponentDefaultsForm />)
    // Admin mode is OFF here; the Save button must NOT be disabled by it.
    // It can still be disabled by mutation pending state, but we mocked
    // updateMutation as idle, so the only signal here is the gate.
    expect(screen.getByRole('button', { name: /^save$/i })).not.toBeDisabled()
  })
})

// SYS-039 §6: people fields (componentOwner / releaseManager / securityChampion)
// are removed from the global component-defaults surface entirely, AND any
// stale stored keys are actively stripped on load and before every save (form
// view + raw JSON) so they don't get re-persisted.
describe('ComponentDefaultsForm — people fields removed + sanitized (SYS-039)', () => {
  beforeEach(() => {
    // Stored blob still carries the legacy people keys (pre-migration data).
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

  it('does not render Component Owner / Release Manager / Security Champion inputs', () => {
    renderWithQuery(<ComponentDefaultsForm />)
    expect(screen.queryByText('Component Owner')).toBeNull()
    expect(screen.queryByText('Release Manager')).toBeNull()
    expect(screen.queryByText('Security Champion')).toBeNull()
  })

  it('strips the 3 people keys from the payload on Save (form view) but keeps the rest', () => {
    const mutate = vi.fn()
    mockUseUpdateComponentDefaults.mockReturnValue(
      { ...idleMutation(), mutate } as unknown as ReturnType<typeof useUpdateComponentDefaults>,
    )

    renderWithQuery(<ComponentDefaultsForm />)
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    expect(mutate).toHaveBeenCalledOnce()
    const payload = mutate.mock.calls[0]![0] as Record<string, unknown>
    expect(payload).not.toHaveProperty('componentOwner')
    expect(payload).not.toHaveProperty('releaseManager')
    expect(payload).not.toHaveProperty('securityChampion')
    expect(payload).toHaveProperty('buildSystem', 'GRADLE')
  })

  it('strips the 3 people keys even when saving via the Raw JSON path', async () => {
    const mutate = vi.fn()
    mockUseUpdateComponentDefaults.mockReturnValue(
      { ...idleMutation(), mutate } as unknown as ReturnType<typeof useUpdateComponentDefaults>,
    )

    renderWithQuery(<ComponentDefaultsForm />)
    // Flip to Raw JSON and inject a blob that re-adds the people keys.
    fireEvent.click(screen.getByRole('button', { name: /raw json/i }))
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    fireEvent.change(textarea, {
      target: { value: JSON.stringify({ buildSystem: 'MAVEN', componentOwner: 'x', releaseManager: 'y', securityChampion: 'z' }) },
    })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    expect(mutate).toHaveBeenCalledOnce()
    const payload = mutate.mock.calls[0]![0] as Record<string, unknown>
    expect(payload).not.toHaveProperty('componentOwner')
    expect(payload).not.toHaveProperty('releaseManager')
    expect(payload).not.toHaveProperty('securityChampion')
    expect(payload).toHaveProperty('buildSystem', 'MAVEN')
  })

  it('rejects a non-object Raw JSON payload (e.g. null) with a form error instead of crashing', () => {
    const mutate = vi.fn()
    mockUseUpdateComponentDefaults.mockReturnValue(
      { ...idleMutation(), mutate } as unknown as ReturnType<typeof useUpdateComponentDefaults>,
    )

    renderWithQuery(<ComponentDefaultsForm />)
    fireEvent.click(screen.getByRole('button', { name: /raw json/i }))
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    // Valid JSON, but `null` — would crash sanitizeDefaults' object-spread.
    fireEvent.change(textarea, { target: { value: 'null' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    // No crash, no save; a form-level parse error is surfaced instead.
    expect(mutate).not.toHaveBeenCalled()
    expect(screen.getByText(/must be a JSON object/i)).toBeDefined()
  })
})
