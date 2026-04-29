import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import {
  useComponentDefaults,
  useUpdateComponentDefaults,
  useMigrateDefaults,
  useFieldConfig,
} from '@/hooks/useAdminConfig'
import { useAdminMode } from '@/lib/adminModeStore'
import { ComponentDefaultsForm } from './ComponentDefaultsForm'

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
    render(<ComponentDefaultsForm />)
    const importBtn = screen.getByRole('button', { name: /import from git/i })
    expect(importBtn).toBeDisabled()
    expect(screen.getByText(/Enable Admin mode in the footer/i)).toBeDefined()
  })

  it('enables Import from Git once Admin mode flips ON', () => {
    render(<ComponentDefaultsForm />)
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

    render(<ComponentDefaultsForm />)
    fireEvent.click(screen.getByRole('button', { name: /import from git/i }))

    expect(migrateMutation.mutate).toHaveBeenCalledOnce()
  })

  it('Save button stays available regardless of Admin mode (regular edit path is not destructive)', () => {
    render(<ComponentDefaultsForm />)
    // Admin mode is OFF here; the Save button must NOT be disabled by it.
    // It can still be disabled by mutation pending state, but we mocked
    // updateMutation as idle, so the only signal here is the gate.
    expect(screen.getByRole('button', { name: /^save$/i })).not.toBeDisabled()
  })
})
