import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ReviewChangesDialog } from './ReviewChangesDialog'
import type { DiffEntry } from '../../lib/editor/combineRequest'

const diff: DiffEntry[] = [
  { label: 'Display Name', oldValue: 'Old', newValue: 'New' },
  { label: 'Build · Java Version', oldValue: '17', newValue: '—', clearedScalarNoop: true },
  { label: 'Labels', oldValue: 'a, b', newValue: '—', clearedScalarNoop: false },
]

function setup(props: Partial<React.ComponentProps<typeof ReviewChangesDialog>> = {}) {
  const onConfirm = vi.fn()
  const onOpenChange = vi.fn()
  render(
    <ReviewChangesDialog open diff={diff} onConfirm={onConfirm} onOpenChange={onOpenChange} isSaving={false} {...props} />,
  )
  return { onConfirm, onOpenChange }
}

describe('ReviewChangesDialog', () => {
  it('lists each changed field as old → new', () => {
    setup()
    expect(screen.getByText('Display Name')).toBeDefined()
    expect(screen.getByText('Old')).toBeDefined()
    expect(screen.getAllByText('New').length).toBeGreaterThan(0)
  })

  it('annotates a cleared scalar-aspect row with "(clearing not supported)"', () => {
    setup()
    expect(screen.getByText('(clearing not supported)')).toBeDefined()
    // Exactly one note — the list clear (Labels) is NOT annotated.
    expect(screen.getAllByText('(clearing not supported)')).toHaveLength(1)
  })

  it('Confirm runs onConfirm; Cancel closes', () => {
    const { onConfirm, onOpenChange } = setup()
    fireEvent.click(screen.getByRole('button', { name: /^confirm$/i }))
    expect(onConfirm).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('omits blank metadata (undefined) when the fields are empty', () => {
    const { onConfirm } = setup()
    fireEvent.click(screen.getByRole('button', { name: /^confirm$/i }))
    expect(onConfirm).toHaveBeenCalledWith({ jiraTaskKey: undefined, changeComment: undefined })
  })

  it('passes the entered Jira key + comment (trimmed) to onConfirm', () => {
    const { onConfirm } = setup()
    fireEvent.change(screen.getByLabelText(/jira task key/i), { target: { value: '  ABC-123 ' } })
    fireEvent.change(screen.getByLabelText(/comment/i), { target: { value: ' did a thing ' } })
    fireEvent.click(screen.getByRole('button', { name: /^confirm$/i }))
    expect(onConfirm).toHaveBeenCalledWith({ jiraTaskKey: 'ABC-123', changeComment: 'did a thing' })
  })

  it('blocks Confirm on a malformed Jira key and shows an inline error', () => {
    const { onConfirm } = setup()
    fireEvent.change(screen.getByLabelText(/jira task key/i), { target: { value: 'not a key' } })
    expect(screen.getByText(/jira task key like ABC-123/i)).toBeDefined()
    const confirm = screen.getByRole('button', { name: /^confirm$/i })
    expect(confirm).toBeDisabled()
    fireEvent.click(confirm)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('disables both actions while saving', () => {
    setup({ isSaving: true })
    expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled()
  })
})
