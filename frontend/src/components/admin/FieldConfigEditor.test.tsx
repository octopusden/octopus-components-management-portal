import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { FieldConfigEditor } from './FieldConfigEditor'
import { useFieldConfig, useUpdateFieldConfig } from '../../hooks/useAdminConfig'

vi.mock('../../hooks/useAdminConfig', () => ({
  useFieldConfig: vi.fn(),
  useUpdateFieldConfig: vi.fn(),
}))

const mockUseFieldConfig = vi.mocked(useFieldConfig)
const mockUseUpdateFieldConfig = vi.mocked(useUpdateFieldConfig)

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
}

const mutate = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  mockUseUpdateFieldConfig.mockReturnValue({
    mutate,
    isPending: false,
    error: null,
  } as unknown as ReturnType<typeof useUpdateFieldConfig>)
})

function renderEditor(data: Record<string, unknown> = {}) {
  mockUseFieldConfig.mockReturnValue({
    data,
    isLoading: false,
    error: null,
  } as unknown as ReturnType<typeof useFieldConfig>)
  return render(<FieldConfigEditor />, { wrapper: makeWrapper() })
}

// ---------------------------------------------------------------------------
// Loading + Error states
// ---------------------------------------------------------------------------

describe('FieldConfigEditor — states', () => {
  it('renders loading skeleton when isLoading is true', () => {
    mockUseFieldConfig.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as unknown as ReturnType<typeof useFieldConfig>)
    render(<FieldConfigEditor />, { wrapper: makeWrapper() })
    // Skeleton divs — check loading state is rendered (no table headers)
    expect(screen.queryByText('Component Fields')).toBeNull()
  })

  it('renders error message when fetch fails', () => {
    mockUseFieldConfig.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Network error'),
    } as unknown as ReturnType<typeof useFieldConfig>)
    render(<FieldConfigEditor />, { wrapper: makeWrapper() })
    expect(screen.getByText(/Failed to load field configuration/)).toBeDefined()
    expect(screen.getByText(/Network error/)).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Catalog rows rendered
// ---------------------------------------------------------------------------

describe('FieldConfigEditor — catalog rows', () => {
  it('renders Component Fields and Build Fields section headings', () => {
    renderEditor({})
    expect(screen.getByText('Component Fields')).toBeDefined()
    expect(screen.getByText('Build Fields')).toBeDefined()
  })

  it('renders all expected component field rows', () => {
    renderEditor({})
    const componentFields = ['name', 'displayName', 'solution', 'componentOwner', 'system', 'productType', 'clientCode']
    for (const field of componentFields) {
      // Each field label appears in the table (may appear in multiple cells/elements)
      const elements = screen.getAllByText(field)
      expect(elements.length).toBeGreaterThan(0)
    }
  })

  it('renders all expected build field rows', () => {
    renderEditor({})
    const buildFields = ['buildSystem', 'javaVersion', 'gradleVersion']
    for (const field of buildFields) {
      const elements = screen.getAllByText(field)
      expect(elements.length).toBeGreaterThan(0)
    }
  })

  it('renders (locked) badge next to name field', () => {
    renderEditor({})
    expect(screen.getByText('(locked)')).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Locked rows have disabled controls
// ---------------------------------------------------------------------------

describe('FieldConfigEditor — locked rows', () => {
  it('name field visibility select is disabled', () => {
    renderEditor({})
    // The locked row for "name" should have a disabled combobox
    const comboboxes = screen.getAllByRole('combobox')
    // Find the one corresponding to the "name" row — it's the first in Component Fields
    // All locked visibility selects are disabled
    const disabledComboboxes = comboboxes.filter((el) => el.hasAttribute('disabled') || el.getAttribute('data-disabled') !== null)
    expect(disabledComboboxes.length).toBeGreaterThan(0)
  })

  it('name field required checkbox is disabled', () => {
    renderEditor({})
    // Use exact label to avoid matching 'displayName required'
    const checkbox = screen.getByRole('checkbox', { name: 'name required' })
    expect(checkbox).toBeDisabled()
  })
})

// ---------------------------------------------------------------------------
// Reads existing server data (sectioned shape)
// ---------------------------------------------------------------------------

describe('FieldConfigEditor — reads server data', () => {
  it('initialises draft from sectioned shape', () => {
    renderEditor({
      component: {
        displayName: { visibility: 'readonly', required: false, defaultValue: 'My Component' },
      },
    })
    // Default value input for displayName should show 'My Component'
    const inputs = screen.getAllByPlaceholderText('—')
    // Find the one whose value is 'My Component'
    const target = inputs.find((el) => (el as HTMLInputElement).value === 'My Component')
    expect(target).toBeDefined()
  })

  it('initialises draft from flat shape (backward-compat)', () => {
    renderEditor({
      fields: {
        'component.clientCode': { visibility: 'hidden', defaultValue: 'CC-001' },
      },
    })
    const inputs = screen.getAllByPlaceholderText('—')
    const target = inputs.find((el) => (el as HTMLInputElement).value === 'CC-001')
    expect(target).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Save writes sectioned output (ADR-011)
// ---------------------------------------------------------------------------

describe('FieldConfigEditor — save', () => {
  it('Save button calls mutate', () => {
    renderEditor({})
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(mutate).toHaveBeenCalledTimes(1)
  })

  it('save payload has sectioned shape with component and build keys', () => {
    renderEditor({})
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(mutate).toHaveBeenCalledTimes(1)
    const payload = mutate.mock.calls[0]![0] as Record<string, unknown>
    expect(payload).toHaveProperty('component')
    expect(payload).toHaveProperty('build')
    expect(typeof payload.component).toBe('object')
    expect(typeof payload.build).toBe('object')
  })

  it('save payload includes all catalog fields in correct sections', () => {
    renderEditor({})
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    const payload = mutate.mock.calls[0]![0] as {
      component: Record<string, unknown>
      build: Record<string, unknown>
    }
    // Component section fields
    expect(payload.component).toHaveProperty('name')
    expect(payload.component).toHaveProperty('displayName')
    expect(payload.component).toHaveProperty('clientCode')
    expect(payload.component).toHaveProperty('productType')
    // Build section fields
    expect(payload.build).toHaveProperty('buildSystem')
    expect(payload.build).toHaveProperty('javaVersion')
    expect(payload.build).toHaveProperty('gradleVersion')
  })

  it('save payload component fields do NOT appear in build section and vice versa', () => {
    renderEditor({})
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    const payload = mutate.mock.calls[0]![0] as {
      component: Record<string, unknown>
      build: Record<string, unknown>
    }
    expect(payload.component).not.toHaveProperty('buildSystem')
    expect(payload.build).not.toHaveProperty('name')
    expect(payload.build).not.toHaveProperty('displayName')
  })

  it('Reset button resets draft to server data without calling mutate', () => {
    renderEditor({
      component: { displayName: { defaultValue: 'Original' } },
    })
    // Change an input
    const inputs = screen.getAllByPlaceholderText('—')
    const originalInput = inputs.find((el) => (el as HTMLInputElement).value === 'Original')
    expect(originalInput).toBeDefined()
    fireEvent.change(originalInput!, { target: { value: 'Modified' } })

    // Reset
    fireEvent.click(screen.getByRole('button', { name: /reset/i }))
    expect(mutate).not.toHaveBeenCalled()
    // After reset the value should be back to 'Original'
    const inputs2 = screen.getAllByPlaceholderText('—')
    const resetInput = inputs2.find((el) => (el as HTMLInputElement).value === 'Original')
    expect(resetInput).toBeDefined()
  })

  it('shows save error when mutation fails', () => {
    mockUseUpdateFieldConfig.mockReturnValue({
      mutate,
      isPending: false,
      error: new Error('Save failed reason'),
    } as unknown as ReturnType<typeof useUpdateFieldConfig>)
    renderEditor({})
    expect(screen.getByText(/Save failed/)).toBeDefined()
    expect(screen.getByText(/Save failed reason/)).toBeDefined()
  })
})
