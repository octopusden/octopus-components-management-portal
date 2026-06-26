import { describe, it, expect } from 'vitest'
import { isTypingInFormField } from './keyboard'

function el(tag: string, attrs: Record<string, string> = {}): HTMLElement {
  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v)
  return node
}

describe('isTypingInFormField', () => {
  it('returns false for null / non-form targets', () => {
    expect(isTypingInFormField(null)).toBe(false)
    expect(isTypingInFormField(el('div'))).toBe(false)
    expect(isTypingInFormField(el('button'))).toBe(false)
    expect(isTypingInFormField(el('a'))).toBe(false)
  })

  it('returns true for text inputs and textareas', () => {
    expect(isTypingInFormField(el('input'))).toBe(true)
    expect(isTypingInFormField(el('input', { type: 'text' }))).toBe(true)
    expect(isTypingInFormField(el('input', { type: 'search' }))).toBe(true)
    expect(isTypingInFormField(el('textarea'))).toBe(true)
    expect(isTypingInFormField(el('select'))).toBe(true)
  })

  it('returns true for contenteditable hosts', () => {
    const node = el('div')
    // jsdom does not compute isContentEditable from the attribute, so set the
    // property the helper actually reads.
    Object.defineProperty(node, 'isContentEditable', { value: true })
    expect(isTypingInFormField(node)).toBe(true)
  })

  it('ignores non-text inputs that should still accept the shortcut', () => {
    // A checkbox / radio is "in a form" but pressing "?" there is not typing.
    expect(isTypingInFormField(el('input', { type: 'checkbox' }))).toBe(false)
    expect(isTypingInFormField(el('input', { type: 'radio' }))).toBe(false)
  })
})
