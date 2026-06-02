import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { FieldOverrideInline } from './FieldOverrideInline'

// jsdom does not implement ResizeObserver but Radix Switch uses it.
if (typeof window !== 'undefined' && !('ResizeObserver' in window)) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(window as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

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

function renderInline(overriddenAttribute = 'jira.releaseVersionFormat') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <FieldOverrideInline componentId="c-1" overriddenAttribute={overriddenAttribute} />
    </QueryClientProvider>,
  )
}

describe('FieldOverrideInline — D5 closed-range enforcement', () => {
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
    // Click confirm — value present, range empty → must not POST
    const confirmBtn = screen.getAllByRole('button').find((b) => b.textContent === '' && b.querySelector('svg'))
    if (confirmBtn !== undefined) await userEvent.click(confirmBtn)
    expect(mockCreateMutate).not.toHaveBeenCalled()
  })

  it('does not POST when submitting with an open-upward range like [2.0,)', async () => {
    renderInline()
    await userEvent.click(screen.getByRole('button', { name: /add override/i }))
    const rangeInput = screen.getByLabelText(/new override version range/i) as HTMLInputElement
    fireEvent.change(rangeInput, { target: { value: '[2.0,)' } })
    const valueInput = screen.getByLabelText(/new override value/i)
    await userEvent.type(valueInput, 'some-value')
    const buttons = screen.getAllByRole('button')
    const confirm = buttons[buttons.length - 2]
    if (confirm) fireEvent.click(confirm)
    expect(mockCreateMutate).not.toHaveBeenCalled()
  })

  it('surfaces an inline error message when the entered range is open-upward', async () => {
    renderInline()
    await userEvent.click(screen.getByRole('button', { name: /add override/i }))
    const rangeInput = screen.getByLabelText(/new override version range/i) as HTMLInputElement
    fireEvent.change(rangeInput, { target: { value: '[2.0,)' } })
    await waitFor(() => {
      expect(screen.getByText(/edit (the )?base/i)).toBeDefined()
    })
  })

  it('does POST when submitting with a closed range like [2.0,3.0)', async () => {
    renderInline()
    await userEvent.click(screen.getByRole('button', { name: /add override/i }))
    const rangeInput = screen.getByLabelText(/new override version range/i) as HTMLInputElement
    fireEvent.change(rangeInput, { target: { value: '[2.0,3.0)' } })
    const valueInput = screen.getByLabelText(/new override value/i)
    await userEvent.type(valueInput, 'some-value')
    const buttons = screen.getAllByRole('button')
    const confirm = buttons[buttons.length - 2]
    if (confirm) fireEvent.click(confirm)
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
    const buttons = screen.getAllByRole('button')
    const confirm = buttons[buttons.length - 2]
    if (confirm) fireEvent.click(confirm)
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
    const buttons = screen.getAllByRole('button')
    const confirm = buttons[buttons.length - 2]
    if (confirm) fireEvent.click(confirm)
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
})
