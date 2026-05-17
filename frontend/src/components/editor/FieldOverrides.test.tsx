import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { FieldOverrides } from './FieldOverrides'
import type { FieldOverride } from '../../lib/types'

// ---------------------------------------------------------------------------
// Mock hooks
// ---------------------------------------------------------------------------

const mockOverrides = vi.fn<() => { data: FieldOverride[]; isLoading: boolean }>()
const mockDeleteMutateAsync = vi.fn()

vi.mock('../../hooks/useComponent', () => ({
  useFieldOverrides: () => mockOverrides(),
  useCreateFieldOverride: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useUpdateFieldOverride: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useDeleteFieldOverride: vi.fn(() => ({
    mutateAsync: mockDeleteMutateAsync,
    isPending: false,
  })),
}))

const mockToast = vi.fn()
vi.mock('../../hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}))

// Stub OverrideRowEditor so FieldOverrides tests focus on the table/buttons,
// not on the editor internals. The stub renders a sentinel element when open
// so tests can detect modal open state.
const mockOnOpenChange = vi.fn()
vi.mock('./OverrideRowEditor', () => ({
  OverrideRowEditor: ({
    open,
    onOpenChange,
    mode,
    override,
  }: {
    open: boolean
    onOpenChange: (v: boolean) => void
    mode: string
    override?: { overriddenAttribute?: string }
  }) => {
    mockOnOpenChange.mockImplementation(onOpenChange)
    if (!open) return null
    return (
      <div data-testid="override-row-editor" data-mode={mode} data-attribute={override?.overriddenAttribute ?? ''}>
        <span>{mode === 'edit' ? 'Edit Override' : 'Add Override (modal)'}</span>
        {/* Scalar radio to assert create mode */}
        {mode === 'create' && <input type="radio" name="overrideType" aria-label="Scalar" defaultChecked />}
      </div>
    )
  },
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderComponent() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <FieldOverrides componentId="c-1" />
    </QueryClientProvider>,
  )
}

function makeScalarOverride(overrides: Partial<FieldOverride> = {}): FieldOverride {
  return {
    id: 'fo-scalar',
    overriddenAttribute: 'build.javaVersion',
    versionRange: '[11,12)',
    rowType: 'SCALAR_OVERRIDE',
    value: '11',
    markerChildren: null,
    createdAt: null,
    updatedAt: null,
    ...overrides,
  }
}

function makeMarkerOverride(overrides: Partial<FieldOverride> = {}): FieldOverride {
  return {
    id: 'fo-marker',
    overriddenAttribute: 'distribution.maven',
    versionRange: '[1,2)',
    rowType: 'MARKER',
    value: null,
    markerChildren: { mavenArtifacts: [] },
    createdAt: null,
    updatedAt: null,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FieldOverrides', () => {
  beforeEach(() => {
    mockDeleteMutateAsync.mockReset()
    mockToast.mockReset()
    mockOverrides.mockReturnValue({ data: [], isLoading: false })
  })

  it('renders Add Override button when loaded', () => {
    renderComponent()
    expect(screen.getByRole('button', { name: /add override/i })).toBeDefined()
  })

  it('shows empty state when no overrides', () => {
    mockOverrides.mockReturnValue({ data: [], isLoading: false })
    renderComponent()
    expect(screen.getByText(/no field overrides/i)).toBeDefined()
  })

  it('Add Override button opens the OverrideRowEditor modal in create mode', async () => {
    renderComponent()
    await userEvent.click(screen.getByRole('button', { name: /add override/i }))
    await waitFor(() => {
      const editor = screen.getByTestId('override-row-editor')
      expect(editor.getAttribute('data-mode')).toBe('create')
    })
  })

  it('renders override rows in a table when overrides exist', () => {
    mockOverrides.mockReturnValue({
      data: [makeScalarOverride()],
      isLoading: false,
    })
    renderComponent()
    expect(screen.getByText('build.javaVersion')).toBeDefined()
    expect(screen.getByText('SCALAR_OVERRIDE')).toBeDefined()
    expect(screen.getByText('[11,12)')).toBeDefined()
  })

  it('Edit button on SCALAR_OVERRIDE row opens editor in edit mode with correct attribute', async () => {
    mockOverrides.mockReturnValue({
      data: [makeScalarOverride()],
      isLoading: false,
    })
    renderComponent()

    await userEvent.click(screen.getByRole('button', { name: /^edit override$/i }))

    await waitFor(() => {
      const editor = screen.getByTestId('override-row-editor')
      expect(editor.getAttribute('data-mode')).toBe('edit')
      expect(editor.getAttribute('data-attribute')).toBe('build.javaVersion')
    })
  })

  it('Edit button on MARKER row is ENABLED and opens editor in edit mode', async () => {
    mockOverrides.mockReturnValue({
      data: [makeMarkerOverride()],
      isLoading: false,
    })
    renderComponent()

    const editBtn = screen.getByRole('button', { name: /^edit override$/i }) as HTMLButtonElement
    // Must NOT be disabled (Wave C-write re-enables marker edit for MARKER rows)
    expect(editBtn.disabled).toBe(false)

    await userEvent.click(editBtn)
    await waitFor(() => {
      const editor = screen.getByTestId('override-row-editor')
      expect(editor.getAttribute('data-mode')).toBe('edit')
      expect(editor.getAttribute('data-attribute')).toBe('distribution.maven')
    })
  })

  it('Delete button triggers confirm dialog', async () => {
    mockOverrides.mockReturnValue({
      data: [makeScalarOverride()],
      isLoading: false,
    })
    renderComponent()

    await userEvent.click(screen.getByRole('button', { name: /^delete override$/i }))

    await waitFor(() => {
      expect(screen.getByText('Delete Override')).toBeDefined()
    })
  })

  it('confirming Delete calls useDeleteFieldOverride.mutateAsync with the row id and shows toast', async () => {
    mockOverrides.mockReturnValue({
      data: [makeScalarOverride()],
      isLoading: false,
    })
    mockDeleteMutateAsync.mockResolvedValue(undefined)
    renderComponent()

    // Open the confirm dialog from the row trash icon
    await userEvent.click(screen.getByRole('button', { name: /^delete override$/i }))
    await waitFor(() => expect(screen.getByText('Delete Override')).toBeDefined())

    // Click the destructive "Delete" button inside the confirm dialog
    await userEvent.click(screen.getByRole('button', { name: /^delete$/i }))

    await waitFor(() => {
      expect(mockDeleteMutateAsync).toHaveBeenCalledOnce()
      expect(mockDeleteMutateAsync).toHaveBeenCalledWith('fo-scalar')
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Override deleted' }),
      )
    })
  })

  it('Delete button is enabled for MARKER rows', async () => {
    mockOverrides.mockReturnValue({
      data: [makeMarkerOverride()],
      isLoading: false,
    })
    renderComponent()

    const deleteBtn = screen.getByRole('button', { name: /^delete override$/i }) as HTMLButtonElement
    expect(deleteBtn.disabled).toBe(false)
  })

  it('shows loading skeleton when isLoading is true', () => {
    mockOverrides.mockReturnValue({ data: [], isLoading: true })
    const { container } = renderComponent()
    // SkeletonBlock renders an animated div — check for absence of the table
    expect(container.querySelector('table')).toBeNull()
  })
})
