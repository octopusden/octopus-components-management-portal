import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FieldOverrideInline } from './FieldOverrideInline'
import type { FieldOverride } from '../../lib/types'

// Item D: inline edits now QUEUE into the page-level override draft instead of
// firing immediate POST/PATCH/DELETE. Mock the draft hook so we can assert the
// queue calls and feed `effectiveOverrides` for the overlap-detection tests.
// (Mock-prefixed names so Vitest's hoisted vi.mock factory may reference them.)
const mockQueueCreate = vi.fn()
const mockQueueUpdate = vi.fn()
const mockQueueDelete = vi.fn()
let mockOverrides: FieldOverride[] = []

vi.mock('./overridesDraft', () => ({
  useOverridesDraft: () => ({
    serverOverrides: mockOverrides,
    effectiveOverrides: mockOverrides,
    isDirty: false,
    queueCreate: mockQueueCreate,
    queueUpdate: mockQueueUpdate,
    queueDelete: mockQueueDelete,
    reset: vi.fn(),
  }),
}))

function ov(over: Partial<FieldOverride>): FieldOverride {
  return {
    id: 'o1',
    overriddenAttribute: 'jira.releaseVersionFormat',
    versionRange: '[1.0,2.0)',
    rowType: 'SCALAR_OVERRIDE',
    value: 'x',
    markerChildren: null,
    createdAt: null,
    updatedAt: null,
    ...over,
  }
}

function renderInline(overriddenAttribute = 'jira.releaseVersionFormat', canEdit = true) {
  return render(<FieldOverrideInline overriddenAttribute={overriddenAttribute} canEdit={canEdit} />)
}

function resetAll() {
  mockQueueCreate.mockReset()
  mockQueueUpdate.mockReset()
  mockQueueDelete.mockReset()
  mockOverrides = []
}

describe('FieldOverrideInline — D5 closed-range enforcement', () => {
  beforeEach(resetAll)

  it('does not default the range input to a universal value like (,) on add', async () => {
    renderInline()
    await userEvent.click(screen.getByRole('button', { name: /add override/i }))
    const rangeInput = screen.getByLabelText(/new override version range/i) as HTMLInputElement
    expect(rangeInput.value).toBe('')
  })

  it('does not queue a create when submitting with an empty range', async () => {
    renderInline()
    await userEvent.click(screen.getByRole('button', { name: /add override/i }))
    const valueInput = screen.getByLabelText(/new override value/i)
    await userEvent.type(valueInput, 'some-value')
    const confirmBtn = screen.getByRole('button', { name: 'Confirm new override' })
    expect(confirmBtn).toBeDisabled()
    fireEvent.click(confirmBtn)
    expect(mockQueueCreate).not.toHaveBeenCalled()
  })

  it('queues a create for an open-upper range like [2.0,) (ADR-018: from-X-onward overrides are first-class)', async () => {
    renderInline()
    await userEvent.click(screen.getByRole('button', { name: /add override/i }))
    const rangeInput = screen.getByLabelText(/new override version range/i) as HTMLInputElement
    fireEvent.change(rangeInput, { target: { value: '[2.0,)' } })
    const valueInput = screen.getByLabelText(/new override value/i)
    await userEvent.type(valueInput, 'some-value')
    fireEvent.click(screen.getByRole('button', { name: 'Confirm new override' }))
    expect(mockQueueCreate).toHaveBeenCalledTimes(1)
    expect(mockQueueCreate.mock.calls[0]?.[0]).toMatchObject({ versionRange: '[2.0,)' })
  })

  it('does not queue a create for an all-versions range like (,) and surfaces a base-default error', async () => {
    renderInline()
    await userEvent.click(screen.getByRole('button', { name: /add override/i }))
    const rangeInput = screen.getByLabelText(/new override version range/i) as HTMLInputElement
    fireEvent.change(rangeInput, { target: { value: '(,)' } })
    const valueInput = screen.getByLabelText(/new override value/i)
    await userEvent.type(valueInput, 'some-value')
    fireEvent.click(screen.getByRole('button', { name: 'Confirm new override' }))
    expect(mockQueueCreate).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(screen.getByText(/base default/i)).toBeDefined()
    })
  })

  it('queues a create when submitting with a closed range like [2.0,3.0)', async () => {
    renderInline()
    await userEvent.click(screen.getByRole('button', { name: /add override/i }))
    const rangeInput = screen.getByLabelText(/new override version range/i) as HTMLInputElement
    fireEvent.change(rangeInput, { target: { value: '[2.0,3.0)' } })
    const valueInput = screen.getByLabelText(/new override value/i)
    await userEvent.type(valueInput, 'some-value')
    fireEvent.click(screen.getByRole('button', { name: 'Confirm new override' }))
    expect(mockQueueCreate).toHaveBeenCalledTimes(1)
    expect(mockQueueCreate.mock.calls[0]?.[0]).toMatchObject({
      overriddenAttribute: 'jira.releaseVersionFormat',
      versionRange: '[2.0,3.0)',
      value: 'some-value',
    })
  })
})

describe('FieldOverrideInline — edit & delete queue', () => {
  beforeEach(resetAll)

  it('queues an update (id + new range/value) on edit confirm', async () => {
    mockOverrides = [ov({ id: 'o1', versionRange: '[1.0,2.0)', value: 'old' })]
    renderInline()
    await userEvent.click(screen.getByRole('button', { name: 'Edit override [1.0,2.0)' }))
    const valueInput = screen.getByLabelText(/override value for jira.releaseVersionFormat/i)
    fireEvent.change(valueInput, { target: { value: 'new' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save override edit' }))
    expect(mockQueueUpdate).toHaveBeenCalledTimes(1)
    expect(mockQueueUpdate.mock.calls[0]?.[0]).toBe('o1')
    expect(mockQueueUpdate.mock.calls[0]?.[1]).toMatchObject({ versionRange: '[1.0,2.0)', value: 'new' })
  })

  it('queues a delete with the row id on delete click', async () => {
    mockOverrides = [ov({ id: 'o1', versionRange: '[1.0,2.0)' })]
    renderInline()
    await userEvent.click(screen.getByRole('button', { name: 'Delete override [1.0,2.0)' }))
    expect(mockQueueDelete).toHaveBeenCalledWith('o1')
  })
})

describe('FieldOverrideInline — overlap detection (pre-save, against effective draft)', () => {
  beforeEach(resetAll)

  it('rejects an overlapping range and surfaces an inline error', async () => {
    mockOverrides = [ov({ id: 'existing-1', versionRange: '[1.0.107,)', value: '$major.$minor.$service-$fix' })]
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
    expect(mockQueueCreate).not.toHaveBeenCalled()
  })

  it('rejects a range overlapping a PENDING (unsaved) create — conflict reads the effective set', async () => {
    // A queued-but-unsaved create carries a draft id; it must still block an
    // overlapping add. This proves the conflict source is effectiveOverrides,
    // not the server query.
    mockOverrides = [ov({ id: 'draft-1', versionRange: '[1.0,2.0)', value: 'pending' })]
    renderInline()
    await userEvent.click(screen.getByRole('button', { name: /add override/i }))
    const rangeInput = screen.getByLabelText(/new override version range/i) as HTMLInputElement
    fireEvent.change(rangeInput, { target: { value: '[1.5,2.5)' } })
    await waitFor(() => {
      expect(screen.getByText(/overlaps with existing override \[1\.0,2\.0\)/i)).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'Confirm new override' })).toBeDisabled()
  })

  it('accepts a disjoint range when overlap is unambiguous', async () => {
    mockOverrides = [ov({ id: 'existing-1', versionRange: '[5.0,6.0)' })]
    renderInline()
    await userEvent.click(screen.getByRole('button', { name: /add override/i }))
    const rangeInput = screen.getByLabelText(/new override version range/i) as HTMLInputElement
    fireEvent.change(rangeInput, { target: { value: '[1.0,2.0)' } })
    const valueInput = screen.getByLabelText(/new override value/i)
    await userEvent.type(valueInput, 'v')
    expect(screen.queryByText(/overlaps with existing override/i)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm new override' }))
    expect(mockQueueCreate).toHaveBeenCalledTimes(1)
  })

  it('does not surface an overlap error when the helper cannot parse (composite vs simple)', async () => {
    mockOverrides = [ov({ id: 'existing-1', versionRange: '(,1.0),[2.0,3.0)' })]
    renderInline()
    await userEvent.click(screen.getByRole('button', { name: /add override/i }))
    const rangeInput = screen.getByLabelText(/new override version range/i) as HTMLInputElement
    fireEvent.change(rangeInput, { target: { value: '[1.5,2.5)' } })
    expect(screen.queryByText(/overlaps with existing override/i)).toBeNull()
  })

  it('labels a semantically-equal duplicate distinctly from a partial overlap', async () => {
    mockOverrides = [ov({ id: 'existing-1', versionRange: '[1.0,2.0)' })]
    renderInline()
    await userEvent.click(screen.getByRole('button', { name: /add override/i }))
    const rangeInput = screen.getByLabelText(/new override version range/i) as HTMLInputElement
    fireEvent.change(rangeInput, { target: { value: '[1.0, 2.0)' } })
    await waitFor(() => {
      expect(screen.getByText(/semantically equal to existing override \[1\.0,2\.0\)/i)).toBeInTheDocument()
    })
    expect(screen.queryByText(/overlaps with existing override/i)).toBeNull()
    expect(screen.getByRole('button', { name: 'Confirm new override' })).toBeDisabled()
  })

  it('rejects a new range that fully contains an existing override', async () => {
    mockOverrides = [ov({ id: 'existing-1', overriddenAttribute: 'build.javaVersion', versionRange: '[1.0,2.0]', value: '17' })]
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
    mockOverrides = [ov({ id: 'existing-1', overriddenAttribute: 'build.javaVersion', versionRange: '[0,3.0]', value: '18' })]
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
  beforeEach(resetAll)

  it('lists overrides ordered by numeric lower bound, not lexically', () => {
    mockOverrides = [
      ov({ id: 'o-ten', versionRange: '[10.0,11.0)', value: 'ten' }),
      ov({ id: 'o-two', versionRange: '[2.0,3.0)', value: 'two' }),
    ]
    renderInline()
    const editButtons = screen.getAllByRole('button', { name: /edit override/i })
    expect(editButtons[0]?.getAttribute('aria-label')).toBe('Edit override [2.0,3.0)')
    expect(editButtons[1]?.getAttribute('aria-label')).toBe('Edit override [10.0,11.0)')
  })
})

describe('FieldOverrideInline — existing-conflict warning', () => {
  beforeEach(resetAll)

  it('flags already-saved overrides that overlap a sibling (legacy data)', () => {
    mockOverrides = [
      ov({ id: 'o-inner', overriddenAttribute: 'build.javaVersion', versionRange: '[1.0,2.0]', value: '17' }),
      ov({ id: 'o-outer', overriddenAttribute: 'build.javaVersion', versionRange: '[0,3.0]', value: '18' }),
    ]
    renderInline('build.javaVersion')
    expect(screen.getByText(/overlaps \[0,3\.0\]/i)).toBeInTheDocument()
    expect(screen.getByText(/overlaps \[1\.0,2\.0\]/i)).toBeInTheDocument()
  })

  it('does not flag disjoint existing overrides', () => {
    mockOverrides = [
      ov({ id: 'o-a', overriddenAttribute: 'build.javaVersion', versionRange: '[1.0,2.0)', value: '17' }),
      ov({ id: 'o-b', overriddenAttribute: 'build.javaVersion', versionRange: '[5.0,6.0)', value: '18' }),
    ]
    renderInline('build.javaVersion')
    expect(screen.queryByText(/overlaps \[/i)).toBeNull()
  })
})

describe('FieldOverrideInline — read-only (canEdit=false)', () => {
  beforeEach(resetAll)

  it('renders nothing when there are no overrides and the user cannot edit', () => {
    const { container } = renderInline('build.javaVersion', false)
    expect(screen.queryByText(/add override/i)).toBeNull()
    expect(container).toBeEmptyDOMElement()
  })

  it('shows existing overrides read-only: no Add, no per-row edit/delete controls', () => {
    mockOverrides = [ov({ id: 'o-ro', overriddenAttribute: 'build.javaVersion', versionRange: '[1.0,2.0)', value: '17' })]
    renderInline('build.javaVersion', false)
    expect(screen.getByText('17')).toBeInTheDocument()
    expect(screen.queryByText(/add override/i)).toBeNull()
    expect(screen.queryByLabelText(/edit override/i)).toBeNull()
    expect(screen.queryByLabelText(/delete override/i)).toBeNull()
  })
})
