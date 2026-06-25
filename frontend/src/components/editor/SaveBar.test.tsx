import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SaveBar } from './SaveBar'
import { CANNOT_EDIT_TITLE } from './editPermission'

function setup(props: Partial<React.ComponentProps<typeof SaveBar>> = {}) {
  const onSave = vi.fn()
  const onDiscard = vi.fn()
  render(
    <SaveBar
      dirty={false}
      canEdit
      isSaving={false}
      onSave={onSave}
      onDiscard={onDiscard}
      {...props}
    />,
  )
  return { onSave, onDiscard }
}

describe('SaveBar', () => {
  it('shows "All changes saved" + disabled Save (tooltip "No changes to save") when clean', () => {
    setup({ dirty: false })
    expect(screen.getByText('All changes saved')).toBeDefined()
    const save = screen.getByRole('button', { name: /save changes/i })
    expect(save).toBeDisabled()
    expect(save.parentElement).toHaveAttribute('title', 'No changes to save')
  })

  it('shows "Unsaved changes" + enabled Save when dirty', () => {
    const { onSave } = setup({ dirty: true })
    expect(screen.getByText('Unsaved changes')).toBeDefined()
    const save = screen.getByRole('button', { name: /save changes/i })
    expect(save).not.toBeDisabled()
    fireEvent.click(save)
    expect(onSave).toHaveBeenCalledOnce()
  })

  it('Discard is enabled only when dirty and calls onDiscard', () => {
    const { onDiscard } = setup({ dirty: true })
    const discard = screen.getByRole('button', { name: /discard/i })
    expect(discard).not.toBeDisabled()
    fireEvent.click(discard)
    expect(onDiscard).toHaveBeenCalledOnce()
  })

  it('disables Save with the cannot-edit tooltip when canEdit is false', () => {
    setup({ dirty: true, canEdit: false })
    const save = screen.getByRole('button', { name: /save changes/i })
    expect(save).toBeDisabled()
    expect(save.parentElement).toHaveAttribute('title', CANNOT_EDIT_TITLE)
  })

  it('disables Save with the blockedReason tooltip when blocked despite being dirty', () => {
    setup({ dirty: true, blockedReason: 'Validating component owner…' })
    const save = screen.getByRole('button', { name: /save changes/i })
    expect(save).toBeDisabled()
    expect(save.parentElement).toHaveAttribute('title', 'Validating component owner…')
  })

  it('shows the saving label while isSaving', () => {
    setup({ dirty: true, isSaving: true })
    expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled()
  })
})
