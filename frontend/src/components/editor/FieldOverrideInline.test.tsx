import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { FieldOverrideInline } from './FieldOverrideInline'

const mockCreateMutate = vi.fn()
const mockUpdateMutate = vi.fn()
const mockDeleteMutate = vi.fn()

// Mutable list of existing field-overrides used to drive overlap-detection
// tests. Each test that needs preset overrides assigns to this array; the
// useFieldOverrides mock reads it lazily.
let mockOverrides: Array<{
  id: string
  overriddenAttribute: string
  versionRange: string
  rowType: 'SCALAR_OVERRIDE' | 'MARKER'
  value: unknown
  markerChildren: null
  createdAt: null
  updatedAt: null
}> = []

vi.mock('../../hooks/useComponent', () => ({
  useFieldOverrides: () => ({ data: mockOverrides }),
  useCreateFieldOverride: () => ({ mutate: mockCreateMutate, isPending: false }),
  useUpdateFieldOverride: () => ({ mutate: mockUpdateMutate, isPending: false }),
  useDeleteFieldOverride: () => ({ mutate: mockDeleteMutate, isPending: false }),
}))

function renderInline(overriddenAttribute = 'jira.releaseVersionFormat', canEdit = true) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <FieldOverrideInline componentId="c-1" overriddenAttribute={overriddenAttribute} canEdit={canEdit} />
    </QueryClientProvider>,
  )
}

describe('FieldOverrideInline — override range rules (ADR-018: open-upper allowed, all-versions rejected)', () => {
  beforeEach(() => {
    mockCreateMutate.mockReset()
    mockUpdateMutate.mockReset()
    mockDeleteMutate.mockReset()
    mockOverrides = []
  })

  it('does not default the range input to a universal value like (,) on add', async () => {
    renderInline()
    await userEvent.click(screen.getByRole('button', { name: /add override/i }))
    const rangeInput = screen.getByLabelText(/new override version range/i) as HTMLInputElement
    expect(rangeInput.value).toBe('')
  })

  it('does not POST when submitting with an empty range', async () => {
    renderInline()
    await userEvent.click(screen.getByRole('button', { name: /add override/i }))
    const valueInput = screen.getByLabelText(/new override value/i)
    await userEvent.type(valueInput, 'some-value')
    // Confirm button is disabled when the range is empty — the click is a no-op.
    const confirmBtn = screen.getByRole('button', { name: 'Confirm new override' })
    expect(confirmBtn).toBeDisabled()
    fireEvent.click(confirmBtn)
    expect(mockCreateMutate).not.toHaveBeenCalled()
  })

  it('DOES POST an open-upper range like [2.0,) (ADR-018: from-X-onward overrides are first-class)', async () => {
    renderInline()
    await userEvent.click(screen.getByRole('button', { name: /add override/i }))
    const rangeInput = screen.getByLabelText(/new override version range/i) as HTMLInputElement
    fireEvent.change(rangeInput, { target: { value: '[2.0,)' } })
    const valueInput = screen.getByLabelText(/new override value/i)
    await userEvent.type(valueInput, 'some-value')
    fireEvent.click(screen.getByRole('button', { name: 'Confirm new override' }))
    expect(mockCreateMutate).toHaveBeenCalledTimes(1)
    expect(mockCreateMutate.mock.calls[0]?.[0]).toMatchObject({ versionRange: '[2.0,)' })
  })

  it('does not POST an all-versions range like (,) and surfaces a base-default error', async () => {
    renderInline()
    await userEvent.click(screen.getByRole('button', { name: /add override/i }))
    const rangeInput = screen.getByLabelText(/new override version range/i) as HTMLInputElement
    fireEvent.change(rangeInput, { target: { value: '(,)' } })
    const valueInput = screen.getByLabelText(/new override value/i)
    await userEvent.type(valueInput, 'some-value')
    fireEvent.click(screen.getByRole('button', { name: 'Confirm new override' }))
    expect(mockCreateMutate).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(screen.getByText(/base default/i)).toBeDefined()
    })
  })

  it('does POST when submitting with a closed range like [2.0,3.0)', async () => {
    renderInline()
    await userEvent.click(screen.getByRole('button', { name: /add override/i }))
    const rangeInput = screen.getByLabelText(/new override version range/i) as HTMLInputElement
    fireEvent.change(rangeInput, { target: { value: '[2.0,3.0)' } })
    const valueInput = screen.getByLabelText(/new override value/i)
    await userEvent.type(valueInput, 'some-value')
    fireEvent.click(screen.getByRole('button', { name: 'Confirm new override' }))
    expect(mockCreateMutate).toHaveBeenCalledTimes(1)
    expect(mockCreateMutate.mock.calls[0]?.[0]).toMatchObject({
      overriddenAttribute: 'jira.releaseVersionFormat',
      versionRange: '[2.0,3.0)',
      value: 'some-value',
    })
  })
})

describe('FieldOverrideInline — overlap detection (pre-save)', () => {
  beforeEach(() => {
    mockCreateMutate.mockReset()
    mockUpdateMutate.mockReset()
    mockDeleteMutate.mockReset()
    mockOverrides = []
  })

  it('rejects an overlapping range and surfaces an inline error', async () => {
    mockOverrides = [
      {
        id: 'existing-1',
        overriddenAttribute: 'jira.releaseVersionFormat',
        versionRange: '[1.0.107,)',
        rowType: 'SCALAR_OVERRIDE',
        value: '$major.$minor.$service-$fix',
        markerChildren: null,
        createdAt: null,
        updatedAt: null,
      },
    ]
    renderInline()
    await userEvent.click(screen.getByRole('button', { name: /add override/i }))
    const rangeInput = screen.getByLabelText(/new override version range/i) as HTMLInputElement
    fireEvent.change(rangeInput, { target: { value: '[1.0,2.0]' } })
    const valueInput = screen.getByLabelText(/new override value/i)
    await userEvent.type(valueInput, '$major.$minor')
    await waitFor(() => {
      expect(screen.getByText(/overlaps with existing override/i)).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm new override' }))
    expect(mockCreateMutate).not.toHaveBeenCalled()
  })

  it('accepts a disjoint range when overlap is unambiguous', async () => {
    mockOverrides = [
      {
        id: 'existing-1',
        overriddenAttribute: 'jira.releaseVersionFormat',
        versionRange: '[5.0,6.0)',
        rowType: 'SCALAR_OVERRIDE',
        value: 'x',
        markerChildren: null,
        createdAt: null,
        updatedAt: null,
      },
    ]
    renderInline()
    await userEvent.click(screen.getByRole('button', { name: /add override/i }))
    const rangeInput = screen.getByLabelText(/new override version range/i) as HTMLInputElement
    fireEvent.change(rangeInput, { target: { value: '[1.0,2.0)' } })
    const valueInput = screen.getByLabelText(/new override value/i)
    await userEvent.type(valueInput, 'v')
    expect(screen.queryByText(/overlaps with existing override/i)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm new override' }))
    expect(mockCreateMutate).toHaveBeenCalledTimes(1)
  })

  it('does not surface an overlap error when the helper cannot parse (composite vs simple)', async () => {
    mockOverrides = [
      {
        id: 'existing-1',
        overriddenAttribute: 'jira.releaseVersionFormat',
        versionRange: '(,1.0),[2.0,3.0)',  // composite → helper returns "unknown"
        rowType: 'SCALAR_OVERRIDE',
        value: 'x',
        markerChildren: null,
        createdAt: null,
        updatedAt: null,
      },
    ]
    renderInline()
    await userEvent.click(screen.getByRole('button', { name: /add override/i }))
    const rangeInput = screen.getByLabelText(/new override version range/i) as HTMLInputElement
    fireEvent.change(rangeInput, { target: { value: '[1.5,2.5)' } })
    expect(screen.queryByText(/overlaps with existing override/i)).toBeNull()
  })

  it('labels a semantically-equal duplicate distinctly from a partial overlap', async () => {
    mockOverrides = [
      {
        id: 'existing-1',
        overriddenAttribute: 'jira.releaseVersionFormat',
        versionRange: '[1.0,2.0)',
        rowType: 'SCALAR_OVERRIDE',
        value: 'x',
        markerChildren: null,
        createdAt: null,
        updatedAt: null,
      },
    ]
    renderInline()
    await userEvent.click(screen.getByRole('button', { name: /add override/i }))
    const rangeInput = screen.getByLabelText(/new override version range/i) as HTMLInputElement
    // Whitespace-equal to the existing override — a true duplicate, not a
    // partial overlap. Copy must say "Semantically equal", not "Overlaps".
    fireEvent.change(rangeInput, { target: { value: '[1.0, 2.0)' } })
    await waitFor(() => {
      expect(screen.getByText(/semantically equal to existing override \[1\.0,2\.0\)/i)).toBeInTheDocument()
    })
    expect(screen.queryByText(/overlaps with existing override/i)).toBeNull()
    expect(screen.getByRole('button', { name: 'Confirm new override' })).toBeDisabled()
  })

  it('rejects a new range that fully contains an existing override', async () => {
    // User-reported: existing [1.0,2.0], adding [0,3.0] (which contains it).
    // Version 1.5 would match both overrides → ambiguous → must be blocked.
    mockOverrides = [
      {
        id: 'existing-1',
        overriddenAttribute: 'build.javaVersion',
        versionRange: '[1.0,2.0]',
        rowType: 'SCALAR_OVERRIDE',
        value: '17',
        markerChildren: null,
        createdAt: null,
        updatedAt: null,
      },
    ]
    renderInline('build.javaVersion')
    await userEvent.click(screen.getByRole('button', { name: /add override/i }))
    const rangeInput = screen.getByLabelText(/new override version range/i) as HTMLInputElement
    fireEvent.change(rangeInput, { target: { value: '[0,3.0]' } })
    await waitFor(() => {
      expect(screen.getByText(/overlaps with existing override \[1\.0,2\.0\]/i)).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'Confirm new override' })).toBeDisabled()
  })

  it('rejects a new range that is fully contained in an existing override', async () => {
    // Mirror direction: existing [0,3.0], adding the narrower [1.0,2.0].
    mockOverrides = [
      {
        id: 'existing-1',
        overriddenAttribute: 'build.javaVersion',
        versionRange: '[0,3.0]',
        rowType: 'SCALAR_OVERRIDE',
        value: '18',
        markerChildren: null,
        createdAt: null,
        updatedAt: null,
      },
    ]
    renderInline('build.javaVersion')
    await userEvent.click(screen.getByRole('button', { name: /add override/i }))
    const rangeInput = screen.getByLabelText(/new override version range/i) as HTMLInputElement
    fireEvent.change(rangeInput, { target: { value: '[1.0,2.0]' } })
    await waitFor(() => {
      expect(screen.getByText(/overlaps with existing override \[0,3\.0\]/i)).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'Confirm new override' })).toBeDisabled()
  })
})

describe('FieldOverrideInline — list ordering', () => {
  beforeEach(() => {
    mockCreateMutate.mockReset()
    mockUpdateMutate.mockReset()
    mockDeleteMutate.mockReset()
    mockOverrides = []
  })

  it('lists overrides ordered by numeric lower bound, not lexically', () => {
    mockOverrides = [
      {
        id: 'o-ten',
        overriddenAttribute: 'jira.releaseVersionFormat',
        versionRange: '[10.0,11.0)',
        rowType: 'SCALAR_OVERRIDE',
        value: 'ten',
        markerChildren: null,
        createdAt: null,
        updatedAt: null,
      },
      {
        id: 'o-two',
        overriddenAttribute: 'jira.releaseVersionFormat',
        versionRange: '[2.0,3.0)',
        rowType: 'SCALAR_OVERRIDE',
        value: 'two',
        markerChildren: null,
        createdAt: null,
        updatedAt: null,
      },
    ]
    renderInline()
    const editButtons = screen.getAllByRole('button', { name: /edit override/i })
    expect(editButtons[0]!.getAttribute('aria-label')).toBe('Edit override [2.0,3.0)')
    expect(editButtons[1]!.getAttribute('aria-label')).toBe('Edit override [10.0,11.0)')
  })
})

describe('FieldOverrideInline — existing-conflict warning', () => {
  beforeEach(() => {
    mockCreateMutate.mockReset()
    mockUpdateMutate.mockReset()
    mockDeleteMutate.mockReset()
    mockOverrides = []
  })

  it('flags already-saved overrides that overlap a sibling (create-time validation cannot catch legacy data)', () => {
    // The reported pair: [1.0,2.0] and [0,3.0] (containment). Both are already
    // persisted (legacy / DSL-import / pre-rule), so each row must surface a
    // conflict marker even though the add form would now block creating them.
    mockOverrides = [
      {
        id: 'o-inner',
        overriddenAttribute: 'build.javaVersion',
        versionRange: '[1.0,2.0]',
        rowType: 'SCALAR_OVERRIDE',
        value: '17',
        markerChildren: null,
        createdAt: null,
        updatedAt: null,
      },
      {
        id: 'o-outer',
        overriddenAttribute: 'build.javaVersion',
        versionRange: '[0,3.0]',
        rowType: 'SCALAR_OVERRIDE',
        value: '18',
        markerChildren: null,
        createdAt: null,
        updatedAt: null,
      },
    ]
    renderInline('build.javaVersion')
    // Each row names the sibling it clashes with.
    expect(screen.getByText(/overlaps \[0,3\.0\]/i)).toBeInTheDocument()
    expect(screen.getByText(/overlaps \[1\.0,2\.0\]/i)).toBeInTheDocument()
  })

  it('does not flag disjoint existing overrides', () => {
    mockOverrides = [
      {
        id: 'o-a',
        overriddenAttribute: 'build.javaVersion',
        versionRange: '[1.0,2.0)',
        rowType: 'SCALAR_OVERRIDE',
        value: '17',
        markerChildren: null,
        createdAt: null,
        updatedAt: null,
      },
      {
        id: 'o-b',
        overriddenAttribute: 'build.javaVersion',
        versionRange: '[5.0,6.0)',
        rowType: 'SCALAR_OVERRIDE',
        value: '18',
        markerChildren: null,
        createdAt: null,
        updatedAt: null,
      },
    ]
    renderInline('build.javaVersion')
    expect(screen.queryByText(/overlaps \[/i)).toBeNull()
  })
})

describe('FieldOverrideInline — read-only (canEdit=false)', () => {
  beforeEach(() => {
    mockCreateMutate.mockReset()
    mockUpdateMutate.mockReset()
    mockDeleteMutate.mockReset()
    mockOverrides = []
  })

  it('renders nothing when there are no overrides and the user cannot edit', () => {
    const { container } = renderInline('build.javaVersion', false)
    expect(screen.queryByText(/add override/i)).toBeNull()
    expect(container).toBeEmptyDOMElement()
  })

  it('shows existing overrides read-only: no Add, no per-row edit/delete controls', () => {
    mockOverrides = [
      {
        id: 'o-ro',
        overriddenAttribute: 'build.javaVersion',
        versionRange: '[1.0,2.0)',
        rowType: 'SCALAR_OVERRIDE',
        value: '17',
        markerChildren: null,
        createdAt: null,
        updatedAt: null,
      },
    ]
    renderInline('build.javaVersion', false)
    // The existing override value is still visible…
    expect(screen.getByText('17')).toBeInTheDocument()
    // …but every mutating affordance is gone.
    expect(screen.queryByText(/add override/i)).toBeNull()
    expect(screen.queryByLabelText(/edit override/i)).toBeNull()
    expect(screen.queryByLabelText(/delete override/i)).toBeNull()
  })
})
