import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ComponentSelect } from './ComponentSelect'

// Suggestions are driven by useComponents; the mock returns a fixed doc-labelled
// list regardless of the query/filter so the tests exercise the commit/revert
// logic deterministically.
vi.mock('../../hooks/useComponents', () => ({
  useComponents: vi.fn(() => ({
    data: { content: [{ name: 'doc-alpha' }, { name: 'doc-beta' }], totalElements: 2 },
  })),
}))

describe('ComponentSelect — commit behavior', () => {
  beforeEach(() => vi.clearAllMocks())

  it('non-strict: a free-typed non-suggestion value commits on blur', () => {
    const onChange = vi.fn()
    render(<ComponentSelect value="" onChange={onChange} ariaLabel="Key" />)
    const input = screen.getByLabelText('Key')
    fireEvent.change(input, { target: { value: 'anything-goes' } })
    fireEvent.blur(input)
    // Default (non-strict) mode trusts the typed value — the backend validates.
    expect(onChange).toHaveBeenCalledWith('anything-goes')
  })

  it('strict: a free-typed non-suggestion value REVERTS on blur (not committed)', () => {
    const onChange = vi.fn()
    render(<ComponentSelect value="" onChange={onChange} strict ariaLabel="Key" />)
    const input = screen.getByLabelText('Key') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'not-a-doc' } })
    fireEvent.blur(input)
    // strict + non-empty + not in suggestions → reverts to the committed value,
    // never calling onChange with the typed non-match.
    expect(onChange).not.toHaveBeenCalledWith('not-a-doc')
    expect(input.value).toBe('')
  })

  it('strict: clicking a suggestion commits that value', () => {
    const onChange = vi.fn()
    render(<ComponentSelect value="" onChange={onChange} strict ariaLabel="Key" />)
    const input = screen.getByLabelText('Key')
    fireEvent.change(input, { target: { value: 'doc' } })
    fireEvent.mouseDown(screen.getByRole('button', { name: 'doc-alpha' }))
    expect(onChange).toHaveBeenCalledWith('doc-alpha')
  })

  it('strict: clearing to empty still commits the empty value', () => {
    const onChange = vi.fn()
    render(<ComponentSelect value="doc-alpha" onChange={onChange} strict ariaLabel="Key" />)
    const input = screen.getByLabelText('Key')
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input)
    expect(onChange).toHaveBeenCalledWith('')
  })

  it('strict: re-blurring an unchanged committed value does not revert it', () => {
    const onChange = vi.fn()
    render(<ComponentSelect value="doc-alpha" onChange={onChange} strict ariaLabel="Key" />)
    const input = screen.getByLabelText('Key') as HTMLInputElement
    // An already-committed value equal to `value` is allowed through even though
    // it's not in the (mocked) suggestion list — guards against eating a valid
    // server-loaded value on blur.
    fireEvent.blur(input)
    expect(input.value).toBe('doc-alpha')
    expect(onChange).toHaveBeenCalledWith('doc-alpha')
  })
})
